/**
 * Створює або оновлює користувача з PIN-кодом.
 * Використання: npm run seed:user -- "Ім'я" 1234 owner
 */
import "dotenv/config";
import { pool, ensureSchema } from "../db";
import { hashPin } from "../auth";

async function main() {
  const [name, pin, role] = process.argv.slice(2);
  if (!name || !pin || !role) {
    console.error('Використання: npm run seed:user -- "Ім\'я" 1234 owner|editor|viewer');
    process.exit(1);
  }
  if (!["owner", "editor", "viewer"].includes(role)) {
    console.error("role має бути owner, editor або viewer");
    process.exit(1);
  }
  await ensureSchema();
  const pin_hash = await hashPin(pin);
  const existing = await pool.query("SELECT id FROM users WHERE name = $1", [name]);
  if (existing.rows.length) {
    await pool.query("UPDATE users SET pin_hash = $1, role = $2 WHERE name = $3", [pin_hash, role, name]);
    console.log(`Оновлено користувача "${name}" (${role}).`);
  } else {
    await pool.query("INSERT INTO users (name, pin_hash, role) VALUES ($1, $2, $3)", [name, pin_hash, role]);
    console.log(`Створено користувача "${name}" (${role}).`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
