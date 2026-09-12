// Одноразовий перенос реальних даних зі "Склад 2026.xlsx" (аркуші
// "закупка тмц", "расходы ТМЦ МАЙ", "расходы ТМЦ общий") в продакшн-базу
// ikorka-packaging (Railway).
//
// Запуск (один раз!):
//   API_URL=https://ikorka-packaging-production.up.railway.app/api PIN=1234 node import-sklad-data.mjs
//
// Файл sklad-import-data.json має лежати поруч із цим скриптом.
//
// Скрипт: логіниться під вашим PIN, довантажує довідники коробок/матеріалів,
// створює 4 відсутні типи б/у коробок (used_1kg..used_5kg), тоді послідовно
// шле кожен рух складу (POST /stock/movements) і кожну закупівлю матеріалу
// (POST /material-purchases) через звичайне API — так само, як робить сам
// застосунок, тому залишок (Остаток) рахується правильно.
//
// Безпечно від подвійного запуску: перед стартом скрипт питає підтвердження,
// якщо в базі вже є рухи складу.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL;
const PIN = process.env.PIN;

if (!API_URL || !PIN) {
  console.error("Потрібні змінні: API_URL=<адреса бекенду>/api  PIN=<ваш PIN>");
  console.error('Приклад: API_URL=https://ikorka-packaging-production.up.railway.app/api PIN=1234 node import-sklad-data.mjs');
  process.exit(1);
}

const data = JSON.parse(readFileSync(path.join(__dirname, "sklad-import-data.json"), "utf8"));

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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log("Логін...");
  const { token } = await api("/login", { method: "POST", body: JSON.stringify({ pin: PIN }) });
  console.log("OK, залогінено.");

  const existing = await api("/stock/movements", {}, token);
  if (existing.length > 0) {
    const ans = await ask(
      `УВАГА: у базі вже є ${existing.length}+ рухів складу. Схоже, цей скрипт вже запускали.\n` +
      `Повторний запуск задублює дані. Продовжити все одно? (yes/no): `
    );
    if (ans.trim().toLowerCase() !== "yes") {
      console.log("Скасовано.");
      process.exit(0);
    }
  }

  console.log("Довантажую довідники коробок/матеріалів...");
  let boxTypes = await api("/box-types", {}, token);
  const materials = await api("/materials", {}, token);

  for (const bt of data.new_box_types) {
    if (!boxTypes.find((b) => b.code === bt.code)) {
      console.log(`Створюю тип коробки: ${bt.name}`);
      const created = await api("/box-types", { method: "POST", body: JSON.stringify(bt) }, token);
      boxTypes.push(created);
    }
  }

  const boxIdByCode = Object.fromEntries(boxTypes.map((b) => [b.code, b.id]));
  const materialIdByCode = Object.fromEntries(materials.map((m) => [m.code, m.id]));

  console.log(`Рухів складу до завантаження: ${data.movements.length}`);
  let done = 0, failed = 0;
  for (const m of data.movements) {
    const body = {
      item_type: m.item_type,
      box_type_id: m.item_type === "box" ? boxIdByCode[m.code] : null,
      material_id: m.item_type === "material" ? materialIdByCode[m.code] : null,
      movement_date: m.date,
      operation: m.operation,
      qty: m.qty,
      note: m.note,
    };
    if (m.item_type === "box" && !body.box_type_id) {
      console.warn(`  пропуск: невідомий тип коробки "${m.code}"`);
      failed++;
      continue;
    }
    try {
      await api("/stock/movements", { method: "POST", body: JSON.stringify(body) }, token);
      done++;
      if (done % 100 === 0) console.log(`  ...${done}/${data.movements.length}`);
    } catch (e) {
      failed++;
      console.warn(`  помилка на русі ${m.item_type}/${m.code} ${m.date}: ${e.message}`);
    }
  }
  console.log(`Рухи складу: завантажено ${done}, помилок ${failed}`);

  console.log(`Закупівель матеріалів до завантаження: ${data.purchases.length}`);
  let pDone = 0, pFailed = 0;
  for (const p of data.purchases) {
    const material_id = materialIdByCode[p.material_code];
    if (!material_id) {
      console.warn(`  пропуск: невідомий матеріал "${p.material_code}"`);
      pFailed++;
      continue;
    }
    try {
      await api("/material-purchases", {
        method: "POST",
        body: JSON.stringify({
          material_id,
          purchase_date: p.date,
          supplier: p.supplier || null,
          price: p.price,
          qty: p.qty,
        }),
      }, token);
      pDone++;
    } catch (e) {
      pFailed++;
      console.warn(`  помилка на закупівлі ${p.material_code} ${p.date}: ${e.message}`);
    }
  }
  console.log(`Закупівлі матеріалів: завантажено ${pDone}, помилок ${pFailed}`);

  console.log("\nГотово. Перевірте розділ «Склад» у застосунку.");
}

main().catch((e) => {
  console.error("ПОМИЛКА:", e.message);
  process.exit(1);
});
