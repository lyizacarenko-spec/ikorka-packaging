import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireEditor } from "../auth";

const router = Router();
router.use(requireAuth);
router.use(requireEditor);

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNpDate(isoDate: string): string {
  // "2026-09-01" -> "01.09.2026"
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

async function npCall(apiKey: string, body: Record<string, unknown>, attempt = 1): Promise<any[]> {
  const res = await fetch(NP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, ...body }),
  });
  const data = await res.json();
  if (!data.success) {
    const msg = (data.errors && data.errors.join(", ")) || JSON.stringify(data);
    if (/too many requests/i.test(msg) && attempt < 5) {
      await sleep(2500 * attempt);
      return npCall(apiKey, body, attempt + 1);
    }
    throw new Error(msg);
  }
  return data.data;
}

async function getAllDocuments(apiKey: string, dateFrom: string, dateTo: string) {
  let page = 1;
  const all: any[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await npCall(apiKey, {
      modelName: "InternetDocument",
      calledMethod: "getDocumentList",
      methodProperties: { DateTimeFrom: dateFrom, DateTimeTo: dateTo, Page: String(page), GetFullList: "1" },
    });
    if (!data.length) break;
    all.push(...data);
    if (data.length < 100) break;
    page++;
    if (page > 50) break;
    // eslint-disable-next-line no-await-in-loop
    await sleep(1200);
  }
  return all;
}

// Розсилка по кількох ФОП підряд легко впирається в ліміт НП — невеликі паузи між ними
router.post("/np-sync", async (req, res) => {
  const { period_id } = req.body;
  if (!period_id) return res.status(400).json({ error: "period_id обов'язковий" });

  const { rows: periodRows } = await pool.query("SELECT * FROM periods WHERE id = $1", [period_id]);
  if (!periodRows.length) return res.status(404).json({ error: "Період не знайдено" });
  const period = periodRows[0];
  const dateFrom = toNpDate(period.date_from);
  const dateTo = toNpDate(period.date_to);

  const { rows: boxTypes } = await pool.query(
    "SELECT id, weight_kg FROM box_types WHERE weight_kg IS NOT NULL ORDER BY weight_kg ASC"
  );
  function boxTypeForWeight(weight: number): number | null {
    for (const bt of boxTypes) {
      if (weight <= Number(bt.weight_kg)) return bt.id;
    }
    return boxTypes.length ? boxTypes[boxTypes.length - 1].id : null;
  }

  const { rows: managers } = await pool.query(
    "SELECT id, name, np_api_key FROM managers WHERE np_api_key IS NOT NULL"
  );

  const result: { synced: string[]; skipped: string[]; errors: { manager: string; error: string }[] } = {
    synced: [],
    skipped: [],
    errors: [],
  };

  if (!managers.length) {
    return res.json({ ...result, message: "Жоден ФОП не має підключеного ключа Нової Пошти." });
  }

  let first = true;
  for (const m of managers) {
    if (!first) await sleep(1500);
    first = false;
    try {
      const docs = await getAllDocuments(m.np_api_key, dateFrom, dateTo);
      if (!docs.length) {
        result.skipped.push(`${m.name} (немає відправлень за період)`);
        continue;
      }

      const byBox: Record<number, number> = {};
      for (const d of docs) {
        const btId = boxTypeForWeight(Number(d.Weight));
        if (btId == null) continue;
        byBox[btId] = (byBox[btId] || 0) + 1;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const [boxTypeId, qty] of Object.entries(byBox)) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            `INSERT INTO delivery_box_usage (period_id, manager_id, box_type_id, qty, synced_at)
             VALUES ($1,$2,$3,$4, now())
             ON CONFLICT (period_id, manager_id, box_type_id) DO UPDATE SET qty = EXCLUDED.qty, synced_at = now()`,
            [period_id, m.id, Number(boxTypeId), qty]
          );
        }
        // Оновлюємо і сам запис доставки (Упаковка / Тип коробки) — щоб таблиця "Записи" теж
        // показувала осмислені числа: разом і найходовіший тип коробки цього ФОП за декаду.
        const dominant = Object.entries(byBox).sort((a, b) => b[1] - a[1])[0];
        const totalQty = docs.length;
        if (dominant) {
          await client.query(
            `UPDATE deliveries SET qty_packaging = $1, box_type_id = $2, updated_at = now()
             WHERE period_id = $3 AND manager_id = $4`,
            [totalQty, Number(dominant[0]), period_id, m.id]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      result.synced.push(`${m.name} (${docs.length} відправлень)`);
    } catch (err) {
      result.errors.push({ manager: m.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.json(result);
});

export default router;
