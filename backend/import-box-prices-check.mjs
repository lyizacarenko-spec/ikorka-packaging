// Проставляє кожному менеджеру канал за замовчуванням (ХБ/ГБ) за списком,
// який надіслала Луіза, і створює нових менеджерів, яких ще не було.
// Також виправляє одну явну помилку написання: "Варакула ЛГ" -> "Варакута ЛГ".
//
// Запуск:
//   API_URL=https://ikorka-packaging-production.up.railway.app/api PIN=1234 node assign-manager-channels.mjs

const API_URL = process.env.API_URL;
const PIN = process.env.PIN;
if (!API_URL || !PIN) {
  console.error("Потрібні змінні: API_URL та PIN");
  process.exit(1);
}

// існуюче ім'я в базі -> канал
const HB_EXISTING = [
  "Овсюченко", "Шаповалова В", "Васелец", "Киндюшенко", "Варакута ЛГ",
  "Варакута ЛО", "Бабенко", "Константинов", "Дмитрева", "Прокоф'єв", "Лунько",
];
const GB_EXISTING = [
  "Пальчун Елла", "Великий", "Щербина", "Романенко", "Пальчун Єгор",
  "Варакута ГГ", "Демидов", "Куца", "Зайченко",
];
// нові менеджери, яких ще нема в базі
const HB_NEW = [];
const GB_NEW = ["Саенко", "Довбня Н.", "Шквира", "Терещенко", "Мажара", "Горбунова"];

const RENAME = { "Варакула ЛГ": "Варакута ЛГ" };

async function api(pathname, options = {}, token) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${options.method || "GET"} ${pathname} -> ${res.status} ${await res.text().catch(() => "")}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const { token } = await api("/login", { method: "POST", body: JSON.stringify({ pin: PIN }) });
  let managers = await api("/managers", {}, token);
  const channels = await api("/sales-channels", {}, token);
  const hbId = channels.find((c) => c.code === "HB").id;
  const gbId = channels.find((c) => c.code === "GB").id;

  // виправити написання
  for (const [oldName, newName] of Object.entries(RENAME)) {
    const m = managers.find((x) => x.name === oldName);
    if (m) {
      console.log(`Перейменовую "${oldName}" -> "${newName}"`);
      await api(`/managers/${m.id}`, { method: "PUT", body: JSON.stringify({ name: newName }) }, token);
      m.name = newName;
    }
  }

  async function assign(names, channelId, channelLabel) {
    for (const name of names) {
      const m = managers.find((x) => x.name === name);
      if (!m) {
        console.warn(`  НЕ ЗНАЙДЕНО в базі: "${name}" (пропуск)`);
        continue;
      }
      await api(`/managers/${m.id}`, { method: "PUT", body: JSON.stringify({ default_channel_id: channelId }) }, token);
      console.log(`  ${name} -> ${channelLabel}`);
    }
  }

  async function createNew(names, channelId, channelLabel) {
    for (const name of names) {
      if (managers.find((x) => x.name === name)) continue;
      const created = await api("/managers", { method: "POST", body: JSON.stringify({ name, default_channel_id: channelId }) }, token);
      managers.push(created);
      console.log(`  створено: ${name} -> ${channelLabel}`);
    }
  }

  console.log("ХБ:");
  await assign(HB_EXISTING, hbId, "ХБ");
  await createNew(HB_NEW, hbId, "ХБ");

  console.log("ГБ:");
  await assign(GB_EXISTING, gbId, "ГБ");
  await createNew(GB_NEW, gbId, "ГБ");

  console.log("\nГотово.");
}

main().catch((e) => { console.error("ПОМИЛКА:", e.message); process.exit(1); });
