import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireEditor } from "../auth";

const router = Router();
router.use(requireAuth);

// List deliveries, optionally filtered by period/channel/product line
router.get("/deliveries", async (req, res) => {
  const { period_id, channel_id, product_line_id } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (period_id) {
    params.push(period_id);
    conditions.push(`d.period_id = $${params.length}`);
  }
  if (channel_id) {
    params.push(channel_id);
    conditions.push(`d.channel_id = $${params.length}`);
  }
  if (product_line_id) {
    params.push(product_line_id);
    conditions.push(`d.product_line_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT d.*, p.label AS period_label, m.name AS manager_name,
            sc.code AS channel_code, pl.name AS product_line_name,
            vc.own_packaging_cost, vc.np_equivalent_cost, vc.savings_uah
     FROM deliveries d
     JOIN periods p ON p.id = d.period_id
     JOIN managers m ON m.id = d.manager_id
     JOIN sales_channels sc ON sc.id = d.channel_id
     JOIN product_lines pl ON pl.id = d.product_line_id
     LEFT JOIN v_delivery_cost vc ON vc.delivery_id = d.id
     ${where}
     ORDER BY p.date_from DESC, m.name`,
    params
  );
  res.json(rows);
});

// Upsert one delivery record (period × manager × channel × product_line is unique)
router.post("/deliveries", requireEditor, async (req, res) => {
  const {
    period_id,
    manager_id,
    channel_id,
    product_line_id,
    qty_shipped = 0,
    amount_uah = 0,
    qty_returned = 0,
    qty_damaged = 0,
    qty_packaging = 0,
    box_type_id = null,
    qty_packaging_free = 0,
  } = req.body;

  if (!period_id || !manager_id || !channel_id || !product_line_id) {
    return res.status(400).json({ error: "period_id, manager_id, channel_id, product_line_id обов'язкові" });
  }

  const { rows } = await pool.query(
    `INSERT INTO deliveries
       (period_id, manager_id, channel_id, product_line_id,
        qty_shipped, amount_uah, qty_returned, qty_damaged, qty_packaging, box_type_id, qty_packaging_free, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (period_id, manager_id, channel_id, product_line_id)
     DO UPDATE SET
        qty_shipped = EXCLUDED.qty_shipped,
        amount_uah = EXCLUDED.amount_uah,
        qty_returned = EXCLUDED.qty_returned,
        qty_damaged = EXCLUDED.qty_damaged,
        qty_packaging = EXCLUDED.qty_packaging,
        box_type_id = EXCLUDED.box_type_id,
        qty_packaging_free = EXCLUDED.qty_packaging_free,
        updated_at = now()
     RETURNING *`,
    [period_id, manager_id, channel_id, product_line_id, qty_shipped, amount_uah, qty_returned, qty_damaged, qty_packaging, box_type_id, qty_packaging_free]
  );
  res.status(201).json(rows[0]);
});

router.delete("/deliveries/:id", requireEditor, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM deliveries WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Не знайдено" });
  res.status(204).end();
});

export default router;
