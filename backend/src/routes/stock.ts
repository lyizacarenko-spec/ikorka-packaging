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

router.delete("/material-purchases/:id", requireEditor, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM material_purchases WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Не знайдено" });
  res.status(204).end();
});

// ============================================================
// МАСОВИЙ ІМПОРТ СКЛАДУ (щомісячна таблиця з Google Таблиць):
// одним запитом заводимо перенос залишку, прихід/повернення/щоденний
// розхід (кожен день окремим рухом для точності) + закупівлі матеріалів.
// commit=false — «суха прогонка»: усе рахується і відкочується (ROLLBACK),
// повертається лише звіт для звірки з таблицею перед реальним збереженням.
// ============================================================

function slugifyCode(name: string): string {
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
    и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ь: "", ю: "iu", я: "ia", ъ: "", ы: "y", э: "e",
  };
  let out = "";
  for (const ch of name.toLowerCase()) {
    if (translit[ch] !== undefined) out += translit[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^_|_$/g, "");
  return out || "item";
}

interface BulkImportEvent {
  date: string;
  operation: "приход" | "возврат" | "расход";
  qty: number;
}

interface BulkImportItem {
  item_type: "box" | "material";
  box_type_id?: number | null;
  material_id?: number | null;
  new_name?: string;
  carryover?: number;
  carryover_date?: string;
  incoming?: { date: string; qty: number }[];
  returns?: { date: string; qty: number }[];
  daily?: { date: string; qty: number }[];
  purchases?: { date: string; supplier?: string; qty: number; amount: number }[];
  expected_total_out?: number;
  expected_remainder?: number;
}

router.post("/stock/bulk-import", requireEditor, async (req, res) => {
  const { commit, note, items } = req.body as { commit?: boolean; note?: string; items?: BulkImportItem[] };
  if (!note || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "note та items обов'язкові" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const summary: Record<string, unknown>[] = [];

    for (const item of items) {
      if (item.item_type !== "box" && item.item_type !== "material") {
        throw Object.assign(new Error("item_type має бути box або material"), { status: 400 });
      }

      let boxTypeId: number | null = item.item_type === "box" ? item.box_type_id ?? null : null;
      let materialId: number | null = item.item_type === "material" ? item.material_id ?? null : null;
      let createdNew = false;
      let resolvedName = "";

      const table = item.item_type === "box" ? "box_types" : "materials";
      const idVar = item.item_type === "box" ? boxTypeId : materialId;

      if (!idVar) {
        if (!item.new_name || !item.new_name.trim()) {
          throw Object.assign(new Error(`Вкажіть ${item.item_type === "box" ? "box_type_id" : "material_id"} або new_name`), { status: 400 });
        }
        const { rows: existing } = await client.query(`SELECT id, name FROM ${table} WHERE lower(name) = lower($1)`, [item.new_name.trim()]);
        if (existing.length) {
          if (item.item_type === "box") boxTypeId = existing[0].id;
          else materialId = existing[0].id;
          resolvedName = existing[0].name;
        } else {
          let code = slugifyCode(item.new_name);
          let suffix = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const c = suffix ? `${code}_${suffix}` : code;
            const { rows: clash } = await client.query(`SELECT 1 FROM ${table} WHERE code = $1`, [c]);
            if (!clash.length) { code = c; break; }
            suffix++;
          }
          const insertSql =
            item.item_type === "box"
              ? `INSERT INTO box_types (code, name, weight_kg) VALUES ($1,$2,NULL) RETURNING id, name`
              : `INSERT INTO materials (code, name, unit) VALUES ($1,$2,'шт') RETURNING id, name`;
          const { rows: created } = await client.query(insertSql, [code, item.new_name.trim()]);
          if (item.item_type === "box") boxTypeId = created[0].id;
          else materialId = created[0].id;
          resolvedName = created[0].name;
          createdNew = true;
        }
      } else {
        const { rows } = await client.query(`SELECT name FROM ${table} WHERE id = $1`, [idVar]);
        resolvedName = rows[0]?.name ?? `#${idVar}`;
      }

      const events: BulkImportEvent[] = [];
      const fallbackDate = item.incoming?.[0]?.date || item.daily?.[0]?.date || item.returns?.[0]?.date;
      if (item.carryover != null && Number(item.carryover) !== 0) {
        if (!item.carryover_date && !fallbackDate) {
          throw Object.assign(new Error(`Позиція "${item.new_name || resolvedName}": для переносу залишку потрібна дата (carryover_date) або хоча б одна інша подія`), { status: 400 });
        }
        events.push({ date: item.carryover_date || fallbackDate!, operation: "приход", qty: Number(item.carryover) });
      }
      for (const e of item.incoming ?? []) if (Number(e.qty)) events.push({ date: e.date, operation: "приход", qty: Number(e.qty) });
      for (const e of item.returns ?? []) if (Number(e.qty)) events.push({ date: e.date, operation: "возврат", qty: Number(e.qty) });
      for (const e of item.daily ?? []) if (Number(e.qty)) events.push({ date: e.date, operation: "расход", qty: Number(e.qty) });

      const opRank: Record<string, number> = { "приход": 0, "возврат": 0, "расход": 1 };
      events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : opRank[a.operation] - opRank[b.operation]));

      let totalIncoming = 0, totalReturns = 0, totalOut = 0, movementsCount = 0;

      for (const ev of events) {
        const { rows: balRows } = await client.query(
          `SELECT balance_after FROM stock_movements
           WHERE item_type = $1 AND COALESCE(box_type_id,-1) = COALESCE($2,-1) AND COALESCE(material_id,-1) = COALESCE($3,-1)
           ORDER BY movement_date DESC, id DESC LIMIT 1`,
          [item.item_type, boxTypeId, materialId]
        );
        const prevBalance = balRows.length ? Number(balRows[0].balance_after) : 0;
        const delta = ev.operation === "расход" ? -ev.qty : ev.qty;
        const balance_after = prevBalance + delta;
        await client.query(
          `INSERT INTO stock_movements (item_type, box_type_id, material_id, movement_date, operation, qty, balance_after, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [item.item_type, boxTypeId, materialId, ev.date, ev.operation, ev.qty, balance_after, note]
        );
        movementsCount++;
        if (ev.operation === "приход") totalIncoming += ev.qty;
        else if (ev.operation === "возврат") totalReturns += ev.qty;
        else totalOut += ev.qty;
      }

      const { rows: finalRows } = await client.query(
        `SELECT balance_after FROM stock_movements
         WHERE item_type = $1 AND COALESCE(box_type_id,-1) = COALESCE($2,-1) AND COALESCE(material_id,-1) = COALESCE($3,-1)
         ORDER BY movement_date DESC, id DESC LIMIT 1`,
        [item.item_type, boxTypeId, materialId]
      );
      const finalBalance = finalRows.length ? Number(finalRows[0].balance_after) : 0;

      let purchasesTotalQty = 0, purchasesTotalAmount = 0;
      if (item.item_type === "material" && item.purchases?.length) {
        for (const p of item.purchases) {
          if (!p.qty || !p.amount) continue;
          const price = Math.round((Number(p.amount) / Number(p.qty)) * 100) / 100;
          await client.query(
            `INSERT INTO material_purchases (material_id, purchase_date, supplier, price, qty, amount, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [materialId, p.date, p.supplier ?? null, price, p.qty, p.amount, note]
          );
          purchasesTotalQty += Number(p.qty);
          purchasesTotalAmount += Number(p.amount);
        }
      }

      summary.push({
        item_type: item.item_type,
        box_type_id: boxTypeId,
        material_id: materialId,
        name: resolvedName,
        created_new: createdNew,
        movements_count: movementsCount,
        carryover: item.carryover ?? 0,
        total_incoming: totalIncoming,
        total_returns: totalReturns,
        total_out: totalOut,
        final_balance: finalBalance,
        expected_total_out: item.expected_total_out ?? null,
        diff_total_out: item.expected_total_out != null ? Math.round((totalOut - Number(item.expected_total_out)) * 100) / 100 : null,
        expected_remainder: item.expected_remainder ?? null,
        diff_remainder: item.expected_remainder != null ? Math.round((finalBalance - Number(item.expected_remainder)) * 100) / 100 : null,
        purchases_total_qty: purchasesTotalQty,
        purchases_total_amount: purchasesTotalAmount,
      });
    }

    if (commit) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    res.json({ committed: !!commit, note, items: summary });
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

// Відкат партії масового імпорту складу (за точним текстом примітки/тегу)
router.post("/stock/bulk-import/undo", requireEditor, async (req, res) => {
  const { note } = req.body as { note?: string };
  if (!note) return res.status(400).json({ error: "note обов'язковий" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: batchMovements } = await client.query(
      `SELECT * FROM stock_movements WHERE note = $1`,
      [note]
    );

    let deletedCount = 0;
    const affectedKeys = new Set<string>();
    if (batchMovements.length) {
      for (const m of batchMovements) {
        affectedKeys.add(`${m.item_type}:${m.box_type_id ?? "-"}:${m.material_id ?? "-"}`);
      }

      // Видаляємо рухи цієї партії (у будь-якій позиції в хронології позиції,
      // не лише останні) і одразу перераховуємо залишки для решти рухів
      // по кожній зачепленій позиції - так коректно, навіть якщо після імпорту
      // по цій позиції вже були інші, реальні рухи (напр. вересневі).
      await client.query("DELETE FROM stock_movements WHERE note = $1", [note]);
      deletedCount = batchMovements.length;

      for (const key of affectedKeys) {
        const [item_type, boxRaw, matRaw] = key.split(":");
        const box_type_id = boxRaw === "-" ? null : Number(boxRaw);
        const material_id = matRaw === "-" ? null : Number(matRaw);
        const { rows: remaining } = await client.query(
          `SELECT id, operation, qty FROM stock_movements
           WHERE item_type = $1 AND COALESCE(box_type_id,-1) = COALESCE($2,-1) AND COALESCE(material_id,-1) = COALESCE($3,-1)
           ORDER BY movement_date ASC, id ASC`,
          [item_type, box_type_id, material_id]
        );
        let running = 0;
        for (const r of remaining) {
          running += r.operation === "расход" ? -Number(r.qty) : Number(r.qty);
          await client.query(`UPDATE stock_movements SET balance_after = $1 WHERE id = $2`, [running, r.id]);
        }
      }
    }

    const { rowCount: purchRowCount } = await client.query("DELETE FROM material_purchases WHERE note = $1", [note]);

    await client.query("COMMIT");
    res.json({ deleted_movements: deletedCount, deleted_purchases: purchRowCount ?? 0, recomputed_positions: affectedKeys.size });
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

export default router;
