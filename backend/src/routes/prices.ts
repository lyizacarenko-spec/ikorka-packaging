import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireEditor } from "../auth";

const router = Router();
router.use(requireAuth);

// ---- box_prices ----
// Current (latest as of today, or ?date=YYYY-MM-DD) price per box type
router.get("/box-prices/current", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (bt.id) bt.id AS box_type_id, bt.code, bt.name, bp.price, bp.valid_from
     FROM box_types bt
     LEFT JOIN box_prices bp ON bp.box_type_id = bt.id AND bp.valid_from <= $1
     ORDER BY bt.id, bp.valid_from DESC NULLS LAST`,
    [date]
  );
  res.json(rows);
});
router.get("/box-prices/history/:boxTypeId", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM box_prices WHERE box_type_id = $1 ORDER BY valid_from DESC",
    [req.params.boxTypeId]
  );
  res.json(rows);
});
router.post("/box-prices", requireEditor, async (req, res) => {
  const { box_type_id, price, valid_from } = req.body;
  if (!box_type_id || price == null || !valid_from) {
    return res.status(400).json({ error: "box_type_id, price, valid_from обов'язкові" });
  }
  const { rows } = await pool.query(
    `INSERT INTO box_prices (box_type_id, price, valid_from) VALUES ($1,$2,$3)
     ON CONFLICT (box_type_id, valid_from) DO UPDATE SET price = EXCLUDED.price
     RETURNING *`,
    [box_type_id, price, valid_from]
  );
  res.status(201).json(rows[0]);
});

// ---- material_prices ----
router.get("/material-prices/current", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (m.id) m.id AS material_id, m.code, m.name, m.unit, mp.price, mp.valid_from
     FROM materials m
     LEFT JOIN material_prices mp ON mp.material_id = m.id AND mp.valid_from <= $1
     ORDER BY m.id, mp.valid_from DESC NULLS LAST`,
    [date]
  );
  res.json(rows);
});
router.get("/material-prices/history/:materialId", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM material_prices WHERE material_id = $1 ORDER BY valid_from DESC",
    [req.params.materialId]
  );
  res.json(rows);
});
router.post("/material-prices", requireEditor, async (req, res) => {
  const { material_id, price, valid_from } = req.body;
  if (!material_id || price == null || !valid_from) {
    return res.status(400).json({ error: "material_id, price, valid_from обов'язкові" });
  }
  const { rows } = await pool.query(
    `INSERT INTO material_prices (material_id, price, valid_from) VALUES ($1,$2,$3)
     ON CONFLICT (material_id, valid_from) DO UPDATE SET price = EXCLUDED.price
     RETURNING *`,
    [material_id, price, valid_from]
  );
  res.status(201).json(rows[0]);
});

// ---- np_tariffs ----
router.get("/np-tariffs", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (weight_from, weight_to) *
     FROM np_tariffs WHERE valid_from <= $1
     ORDER BY weight_from, weight_to, valid_from DESC`,
    [date]
  );
  res.json(rows);
});
router.get("/np-tariffs/history", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM np_tariffs ORDER BY valid_from DESC, weight_from");
  res.json(rows);
});
router.post("/np-tariffs", requireEditor, async (req, res) => {
  const { weight_from, weight_to, price, valid_from } = req.body;
  if (weight_from == null || weight_to == null || price == null || !valid_from) {
    return res.status(400).json({ error: "weight_from, weight_to, price, valid_from обов'язкові" });
  }
  const { rows } = await pool.query(
    "INSERT INTO np_tariffs (weight_from, weight_to, price, valid_from) VALUES ($1,$2,$3,$4) RETURNING *",
    [weight_from, weight_to, price, valid_from]
  );
  res.status(201).json(rows[0]);
});

export default router;
