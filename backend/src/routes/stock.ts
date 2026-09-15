import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireEditor } from "../auth";

const router = Router();
router.use(requireAuth);

// ---- material_purchases ----
router.get("/material-purchases", async (req, res) => {
  const { material_id } = req.query;
  const params: unknown[] = [];
  let where = "";
  if (material_id) {
    params.push(material_id);
    where = "WHERE mp.material_id = $1";
  }
  const { rows } = await pool.query(
    `SELECT mp.*, m.name AS material_name, m.unit
     FROM material_purchases mp JOIN materials m ON m.id = mp.material_id
     ${where}
     ORDER BY purchase_date DESC`,
    params
  );
  res.json(rows);
});
router.post("/material-purchases", requireEditor, async (req, res) => {
  const { material_id, purchase_date, supplier, price, qty } = req.body;
  if (!material_id || !purchase_date || price == null || qty == null) {
    return res.status(400).json({ error: "material_id, purchase_date, price, qty обов'язкові" });
  }
  const amount = Number(price) * Number(qty);
  const { rows } = await pool.query(
    `INSERT INTO material_purchases (material_id, purchase_date, supplier, price, qty, amount)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [material_id, purchase_date, supplier ?? null, price, qty, amount]
  );
  res.status(201).json(rows[0]);
});

// ---- stock_movements ----
// Current balance per box type / material
router.get("/stock/balance", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT sb.item_type, sb.box_type_id, bt.name AS box_type_name,
            sb.material_id, mt.name AS material_name,
            sb.current_balance, sb.as_of
     FROM v_stock_balance sb
     LEFT JOIN box_types bt ON bt.id = sb.box_type_id
     LEFT JOIN materials mt ON mt.id = sb.material_id
     ORDER BY sb.item_type, COALESCE(bt.name, mt.name)`
  );
  res.json(rows);
});

router.get("/stock/movements", async (req, res) => {
  const { item_type, box_type_id, material_id } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (item_type) {
    params.push(item_type);
    conditions.push(`item_type = $${params.length}`);
  }
  if (box_type_id) {
    params.push(box_type_id);
    conditions.push(`box_type_id = $${params.length}`);
  }
  if (material_id) {
    params.push(material_id);
    conditions.push(`material_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM stock_movements ${where} ORDER BY movement_date DESC, id DESC LIMIT 5000`,
    params
  );
  res.json(rows);
});

// Records a movement and computes balance_after = previous balance +/- qty
router.post("/stock/movements", requireEditor, async (req, res) => {
  const { item_type, box_type_id, material_id, movement_date, operation, qty, note } = req.body;
  if (!item_type || !movement_date || !operation || qty == null) {
    return res.status(400).json({ error: "item_type, movement_date, operation, qty обов'язкові" });
  }
  if (item_type === "box" && !box_type_id) return res.status(400).json({ error: "box_type_id обов'язковий для item_type=box" });
  if (item_type === "material" && !material_id) return res.status(400).json({ error: "material_id обов'язковий для item_type=material" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: balRows } = await client.query(
      `SELECT balance_after FROM stock_movements
       WHERE item_type = $1 AND COALESCE(box_type_id,-1) = COALESCE($2,-1) AND COALESCE(material_id,-1) = COALESCE($3,-1)
       ORDER BY movement_date DESC, id DESC LIMIT 1`,
      [item_type, box_type_id ?? null, material_id ?? null]
    );
    const prevBalance = balRows.length ? Number(balRows[0].balance_after) : 0;
    const delta = operation === "расход" ? -Number(qty) : Number(qty);
    const balance_after = prevBalance + delta;

    const { rows } = await client.query(
      `INSERT INTO stock_movements (item_type, box_type_id, material_id, movement_date, operation, qty, balance_after, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [item_type, box_type_id ?? null, material_id ?? null, movement_date, operation, qty, balance_after, note ?? null]
    );
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Видалити рух — дозволено лише останній по цій позиції (інакше зіб'ється залишок)
router.delete("/stock/movements/:id", requireEditor, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM stock_movements WHERE id = $1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Не знайдено" });
  const m = rows[0];
  const { rows: latestRows } = await pool.query(
    `SELECT id FROM stock_movements
     WHERE item_type = $1 AND COALESCE(box_type_id,-1) = COALESCE($2,-1) AND COALESCE(material_id,-1) = COALESCE($3,-1)
     ORDER BY movement_date DESC, id DESC LIMIT 1`,
    [m.item_type, m.box_type_id, m.material_id]
  );
  if (!latestRows.length || latestRows[0].id !== m.id) {
    return res.status(400).json({ error: "Можна видалити лише останній рух по цій позиції (інакше зіб'ється залишок)" });
  }
  await pool.query("DELETE FROM stock_movements WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

export default router;
