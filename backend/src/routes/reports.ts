import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";

const router = Router();
router.use(requireAuth);

router.get("/reports/monthly", async (req, res) => {
  const { from, to, channel, product_line } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    conditions.push(`month >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`month <= $${params.length}`);
  }
  if (channel) {
    params.push(channel);
    conditions.push(`channel = $${params.length}`);
  }
  if (product_line) {
    params.push(product_line);
    conditions.push(`product_line = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM v_monthly_summary ${where} ORDER BY month, channel, product_line`, params);
  res.json(rows);
});

router.get("/reports/annual", async (req, res) => {
  const { channel, product_line } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (channel) {
    params.push(channel);
    conditions.push(`channel = $${params.length}`);
  }
  if (product_line) {
    params.push(product_line);
    conditions.push(`product_line = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM v_annual_summary ${where} ORDER BY year, channel, product_line`, params);
  res.json(rows);
});

// Місячна собівартість упаковки за даними «Склад» (щоденний розхід,
// кожен рух за своєю ціною на дату) у перерахунку на 1 замовлення
// (загальна к-сть відправлень компанії за місяць, qty_shipped).
router.get("/reports/packaging-cost-per-order", async (_req, res) => {
  const { rows } = await pool.query(`
    WITH priced AS (
      SELECT
        sm.movement_date,
        sm.qty,
        COALESCE(
          (SELECT bp.price FROM box_prices bp
             WHERE bp.box_type_id = sm.box_type_id AND bp.valid_from <= sm.movement_date
             ORDER BY bp.valid_from DESC LIMIT 1),
          (SELECT mp.price FROM material_prices mp
             WHERE mp.material_id = sm.material_id AND mp.valid_from <= sm.movement_date
             ORDER BY mp.valid_from DESC LIMIT 1)
        ) AS price
      FROM stock_movements sm
      WHERE sm.operation = 'расход'
    ),
    monthly_cost AS (
      SELECT date_trunc('month', movement_date)::date AS month,
             ROUND(SUM(qty * COALESCE(price, 0)), 2) AS packaging_cost_uah,
             SUM(CASE WHEN price IS NULL THEN qty ELSE 0 END) AS qty_without_price
      FROM priced
      GROUP BY 1
    ),
    monthly_orders AS (
      SELECT date_trunc('month', p.date_from)::date AS month, SUM(d.qty_shipped) AS qty_shipped
      FROM deliveries d JOIN periods p ON p.id = d.period_id
      GROUP BY 1
    )
    SELECT
      COALESCE(mc.month, mo.month) AS month,
      COALESCE(mc.packaging_cost_uah, 0) AS packaging_cost_uah,
      COALESCE(mc.qty_without_price, 0) AS qty_without_price,
      COALESCE(mo.qty_shipped, 0) AS qty_shipped,
      ROUND(COALESCE(mc.packaging_cost_uah, 0) / NULLIF(mo.qty_shipped, 0), 2) AS cost_per_order
    FROM monthly_cost mc
    FULL OUTER JOIN monthly_orders mo ON mo.month = mc.month
    ORDER BY 1
  `);
  res.json(rows);
});

// Місячний розхід коробок по типах (з автосинку НП, delivery_box_usage) -
// по відправлених замовленнях, без б/у коробок.
router.get("/reports/box-usage-monthly", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      date_trunc('month', p.date_from)::date AS month,
      bt.id AS box_type_id,
      bt.name AS box_type_name,
      SUM(u.qty) AS qty
    FROM delivery_box_usage u
    JOIN periods p ON p.id = u.period_id
    JOIN box_types bt ON bt.id = u.box_type_id
    WHERE bt.name NOT ILIKE '%б/у%' AND bt.code <> 'used'
    GROUP BY 1, 2, 3
    ORDER BY 1, bt.weight_kg NULLS LAST
  `);
  res.json(rows);
});

// Small dashboard summary: current month totals + YTD savings
router.get("/reports/summary", async (_req, res) => {
  const { rows: monthRows } = await pool.query(
    `SELECT * FROM v_monthly_summary WHERE month = date_trunc('month', CURRENT_DATE)`
  );
  const { rows: ytdRows } = await pool.query(
    `SELECT
       ROUND(SUM(amount_uah),2) AS amount_uah,
       SUM(qty_shipped) AS qty_shipped,
       SUM(qty_returned) AS qty_returned,
       SUM(qty_damaged) AS qty_damaged,
       ROUND(SUM(packaging_cost_uah),2) AS packaging_cost_uah,
       ROUND(SUM(savings_uah),2) AS savings_uah
     FROM v_monthly_summary
     WHERE month >= date_trunc('year', CURRENT_DATE)`
  );
  res.json({ current_month: monthRows, ytd: ytdRows[0] });
});

export default router;
