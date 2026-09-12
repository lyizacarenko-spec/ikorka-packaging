import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireEditor } from "../auth";

const router = Router();
router.use(requireAuth);

// ---- managers ----
router.get("/managers", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM managers ORDER BY name");
  res.json(rows);
});
router.post("/managers", requireEditor, async (req, res) => {
  const { name, is_active = true } = req.body;
  if (!name) return res.status(400).json({ error: "name обов'язкове" });
  const { rows } = await pool.query(
    "INSERT INTO managers (name, is_active) VALUES ($1,$2) RETURNING *",
    [name, is_active]
  );
  res.status(201).json(rows[0]);
});
router.put("/managers/:id", requireEditor, async (req, res) => {
  const { name, is_active } = req.body;
  const { rows } = await pool.query(
    "UPDATE managers SET name = COALESCE($1, name), is_active = COALESCE($2, is_active) WHERE id = $3 RETURNING *",
    [name, is_active, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Не знайдено" });
  res.json(rows[0]);
});

// ---- sales_channels (read-only in UI, but editable via API if needed) ----
router.get("/sales-channels", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM sales_channels ORDER BY id");
  res.json(rows);
});

// ---- product_lines ----
router.get("/product-lines", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM product_lines ORDER BY id");
  res.json(rows);
});
router.post("/product-lines", requireEditor, async (req, res) => {
  const { name, is_default = false } = req.body;
  if (!name) return res.status(400).json({ error: "name обов'язкове" });
  const { rows } = await pool.query(
    "INSERT INTO product_lines (name, is_default) VALUES ($1,$2) RETURNING *",
    [name, is_default]
  );
  res.status(201).json(rows[0]);
});

// ---- box_types ----
router.get("/box-types", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM box_types ORDER BY weight_kg NULLS LAST, code");
  res.json(rows);
});
router.post("/box-types", requireEditor, async (req, res) => {
  const { code, name, weight_kg } = req.body;
  if (!code || !name) return res.status(400).json({ error: "code і name обов'язкові" });
  const { rows } = await pool.query(
    "INSERT INTO box_types (code, name, weight_kg) VALUES ($1,$2,$3) RETURNING *",
    [code, name, weight_kg ?? null]
  );
  res.status(201).json(rows[0]);
});
router.put("/box-types/:id", requireEditor, async (req, res) => {
  const { code, name, weight_kg } = req.body;
  const { rows } = await pool.query(
    "UPDATE box_types SET code = COALESCE($1, code), name = COALESCE($2, name), weight_kg = COALESCE($3, weight_kg) WHERE id = $4 RETURNING *",
    [code, name, weight_kg, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Не знайдено" });
  res.json(rows[0]);
});

// ---- materials ----
router.get("/materials", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM materials ORDER BY name");
  res.json(rows);
});
router.post("/materials", requireEditor, async (req, res) => {
  const { code, name, unit } = req.body;
  if (!code || !name || !unit) return res.status(400).json({ error: "code, name, unit обов'язкові" });
  const { rows } = await pool.query(
    "INSERT INTO materials (code, name, unit) VALUES ($1,$2,$3) RETURNING *",
    [code, name, unit]
  );
  res.status(201).json(rows[0]);
});

// ---- periods ----
router.get("/periods", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM periods ORDER BY date_from DESC");
  res.json(rows);
});
router.post("/periods", requireEditor, async (req, res) => {
  const { date_from, date_to, label } = req.body;
  if (!date_from || !date_to || !label) {
    return res.status(400).json({ error: "date_from, date_to, label обов'язкові" });
  }
  const { rows } = await pool.query(
    `INSERT INTO periods (date_from, date_to, label) VALUES ($1,$2,$3)
     ON CONFLICT (date_from, date_to) DO UPDATE SET label = EXCLUDED.label
     RETURNING *`,
    [date_from, date_to, label]
  );
  res.status(201).json(rows[0]);
});

export default router;
