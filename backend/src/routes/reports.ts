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
