import { Pool } from "pg";
import fs from "fs";
import path from "path";

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("DATABASE_URL is not set — the backend will fail to connect to Postgres.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") || process.env.PGSSL === "true"
    ? { rejectUnauthorized: false }
    : undefined,
});

/** Applies schema.sql on startup. Safe to run on every boot — every
 * statement in schema.sql is idempotent (IF NOT EXISTS / ON CONFLICT). */
export async function ensureSchema(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    // eslint-disable-next-line no-console
    console.log("Schema ensured.");
  } finally {
    client.release();
  }
}
