// Одноразовий перенос реальних даних з "Доставки_Возвраты.xlsx"
// (декади 01.12.2025 - 31.08.2026, по менеджерах, канали ХБ/ГБ) у
// продакшн-базу ikorka-packaging.
//
// Запуск (можна запускати повторно — це безпечний upsert):
//   API_URL=https://ikorka-packaging-production.up.railway.app/api PIN=1234 node import-deliveries-data.mjs
//
// Файл deliveries-import-data.json має лежати поруч із цим скриптом.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL;
const PIN = process.env.PIN;

if (!API_URL || !PIN) {
  console.error("Потрібні змінні: API_URL=<адреса бекенду>/api  PIN=<ваш PIN>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(path.join(__dirname, "deliveries-import-data.json"), "utf8"));

async function api(pathname, options = {}, token) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${options.method || "GET"} ${pathname} -> ${res.status} ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  console.log("Логін...");
  const { token } = await api("/login", { method: "POST", body: JSON.stringify({ pin: PIN }) });
  console.log("OK.");

  console.log(`Періодів: ${data.periods.length} — завантажую (upsert)...`);
  const periodIdByKey = {};
  for (const p of data.periods) {
    const created = await api("/periods", {
      method: "POST",
      body: JSON.stringify({ date_from: p.date_from, date_to: p.date_to, label: p.label }),
    }, token);
    periodIdByKey[`${p.date_from}|${p.date_to}`] = created.id;
  }

  console.log("Довантажую менеджерів/канали/лінії товарів...");
  let managers = await api("/managers", {}, token);
  const channels = await api("/sales-channels", {}, token);
  const productLines = await api("/product-lines", {}, token);
  const defaultLine = productLines.find((pl) => pl.is_default) || productLines[0];
  const channelIdByCode = Object.fromEntries(channels.map((c) => [c.code, c.id]));

  for (const name of data.managers) {
    if (!managers.find((m) => m.name === name)) {
      console.log(`Створюю менеджера: ${name}`);
      const created = await api("/managers", { method: "POST", body: JSON.stringify({ name }) }, token);
      managers.push(created);
    }
  }
  const managerIdByName = Object.fromEntries(managers.map((m) => [m.name, m.id]));

  // синтетичний "менеджер" для агрегованих (не по менеджерах) повернень/упаковки
  const AGG_NAME = "Агреговані дані (імпорт)";
  let aggManager = managers.find((m) => m.name === AGG_NAME);
  if (!aggManager && data.aggregates.length) {
    console.log(`Створюю службового "менеджера" для агрегованих даних: ${AGG_NAME}`);
    aggManager = await api("/managers", { method: "POST", body: JSON.stringify({ name: AGG_NAME, is_active: false }) }, token);
  }

  console.log(`Записів доставок до завантаження: ${data.deliveries.length}`);
  let done = 0, failed = 0;
  for (const row of data.deliveries) {
    const period_id = periodIdByKey[`${row.date_from}|${row.date_to}`];
    const manager_id = managerIdByName[row.manager];
    const channel_id = channelIdByCode[row.channel];
    try {
      await api("/deliveries", {
        method: "POST",
        body: JSON.stringify({
          period_id, manager_id, channel_id, product_line_id: defaultLine.id,
          qty_shipped: row.qty_shipped, amount_uah: row.amount_uah,
        }),
      }, token);
      done++;
      if (done % 100 === 0) console.log(`  ...${done}/${data.deliveries.length}`);
    } catch (e) {
      failed++;
      console.warn(`  помилка ${row.manager} ${row.date_from} ${row.channel}: ${e.message}`);
    }
  }
  console.log(`Доставки: завантажено ${done}, помилок ${failed}`);

  if (data.aggregates.length) {
    console.log(`Агрегованих рядків (повернення/упаковка): ${data.aggregates.length}`);
    for (const row of data.aggregates) {
      const period_id = periodIdByKey[`${row.date_from}|${row.date_to}`];
      const channel_id = channelIdByCode[row.channel];
      try {
        await api("/deliveries", {
          method: "POST",
          body: JSON.stringify({
            period_id, manager_id: aggManager.id, channel_id, product_line_id: defaultLine.id,
            qty_shipped: 0, amount_uah: 0,
            qty_returned: row.qty_returned, qty_packaging: row.qty_packaging,
          }),
        }, token);
      } catch (e) {
        console.warn(`  помилка агрегату ${row.date_from} ${row.channel}: ${e.message}`);
      }
    }
  }

  console.log("\nГотово. Перевірте розділ «Звіти» / «Ввід даних» у застосунку.");
}

main().catch((e) => {
  console.error("ПОМИЛКА:", e.message);
  process.exit(1);
});
