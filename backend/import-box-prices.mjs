// Заносить ціни на коробки, які надіслала Луіза.
// Запуск:
//   API_URL=https://ikorka-packaging-production.up.railway.app/api PIN=1234 node import-box-prices.mjs

const API_URL = process.env.API_URL;
const PIN = process.env.PIN;
if (!API_URL || !PIN) {
  console.error("Потрібні змінні: API_URL та PIN");
  process.exit(1);
}

const VALID_FROM = new Date().toISOString().slice(0, 10);
const PRICES = {
  "1kg": 6.90,
  "2kg": 7.42,
  "3kg": 10.23,
  "5kg": 14.60,
  "10kg": 26.67,
};

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
  const boxTypes = await api("/box-types", {}, token);
  for (const [code, price] of Object.entries(PRICES)) {
    const bt = boxTypes.find((b) => b.code === code);
    if (!bt) {
      console.warn(`  немає типу коробки з кодом ${code}`);
      continue;
    }
    await api("/box-prices", { method: "POST", body: JSON.stringify({ box_type_id: bt.id, price, valid_from: VALID_FROM }) }, token);
    console.log(`  ${bt.name}: ${price} грн (діє з ${VALID_FROM})`);
  }
  console.log("Готово.");
}

main().catch((e) => { console.error("ПОМИЛКА:", e.message); process.exit(1); });
