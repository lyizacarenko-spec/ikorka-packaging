import { Router } from "express";
import type express from "express";
import { pool } from "../db";
import { requireAuth, requireEditor } from "../auth";

const router = Router();
router.use(requireAuth);
router.use(requireEditor);

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNpDate(isoDate: string | Date): string {
  // pg повертає DATE-колонки як об'єкт Date, а не рядок — обробляємо обидва випадки.
  // "2026-09-01" / Date(2026-09-01) -> "01.09.2026"
  const iso = isoDate instanceof Date ? isoDate.toISOString() : String(isoDate);
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

// НП, схоже, тримає ліміт швидкості не лише по ключу, а й сумарно з нашого сервера -
// при 10+ ФОП, які синхронізуються паралельно, окремим ключам іноді не вистачало
// колишніх 5 спроб (макс. очікування ~12.5с), тож збільшили запас спроб і
// обмежили одну паузу згори, щоб довге очікування не приходилось одним стрибком.
async function npCall(apiKey: string, body: Record<string, unknown>, attempt = 1): Promise<any[]> {
  const res = await fetch(NP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, ...body }),
  });
  const data = await res.json();
  if (!data.success) {
    const msg = (data.errors && data.errors.join(", ")) || JSON.stringify(data);
    if (/too many requests/i.test(msg) && attempt < 9) {
      await sleep(Math.min(2500 * attempt, 15000));
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

// Кожен ФОП має свій окремий ключ НП, тож паузи потрібні лише всередині
// сторінкування одного ключа (ліміт НП per-ключ) — між різними ФОП можна
// синхронізувати паралельно, інакше при 5-10+ ФОП запит не вкладається в час
// і фронтенд отримує "Failed to fetch" (з'єднання обривається раніше, ніж
// бекенд встигає все обробити).
router.post("/np-sync", async (req, res) => {
  try {
    await runNpSync(req, res);
  } catch (err) {
    // Будь-яка неочікувана помилка тут раніше валила ввесь процес (Express 4 не ловить
    // винятки з async-обробників сам) — Railway перезапускав контейнер посеред запиту,
    // і фронтенд бачив "Failed to fetch". Тепер повертаємо звичайну помилку.
    // eslint-disable-next-line no-console
    console.error("np-sync failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Помилка синхронізації з Новою Поштою" });
    }
  }
});

async function runNpSync(req: express.Request, res: express.Response) {
  const { period_id } = req.body;
  if (!period_id) return res.status(400).json({ error: "period_id обов'язковий" });

  const { rows: periodRows } = await pool.query("SELECT * FROM periods WHERE id = $1", [period_id]);
  if (!periodRows.length) return res.status(404).json({ error: "Період не знайдено" });
  const period = periodRows[0];
  const dateFrom = toNpDate(period.date_from);
  const dateTo = toNpDate(period.date_to);

  // Беремо до уваги ЛИШЕ типи коробок, у яких є актуальна ціна на дату періоду.
  // Без цього автосинк міг випадково потрапити на непроцінені довідникові
  // записи (напр. "Б/у коробка 1 кг" — той самий ваговий діапазон, що й
  // звичайна "Коробка 1 кг", але без ціни) і порахувати собівартість як 0.
  // Автосинк взагалі не повинен обирати "б/у" типи — це визначається вручну
  // (поле "з них б/у" на записі), НП не знає, чи коробка була вже використана.
  const { rows: boxTypes } = await pool.query(
    `SELECT bt.id, bt.weight_kg
     FROM box_types bt
     JOIN LATERAL (
       SELECT price FROM box_prices WHERE box_type_id = bt.id AND valid_from <= $1 ORDER BY valid_from DESC LIMIT 1
     ) bp ON TRUE
     WHERE bt.weight_kg IS NOT NULL
     ORDER BY bt.weight_kg ASC`,
    [period.date_to]
  );
  function boxTypeForWeight(weight: number): number | null {
    for (const bt of boxTypes) {
      if (weight <= Number(bt.weight_kg)) return bt.id;
    }
    return boxTypes.length ? boxTypes[boxTypes.length - 1].id : null;
  }

  const { rows: managers } = await pool.query(
    "SELECT id, name, np_api_key, default_channel_id FROM managers WHERE np_api_key IS NOT NULL"
  );

  // Дефолтна товарна лінія — потрібна, якщо для цього ФОП+періоду ще НЕМАЄ
  // жодного запису доставки (напр. щойно обраний новий період) і синхронізації
  // нема куди писати: доведеться створити запис самій.
  const { rows: defaultProductLineRows } = await pool.query(
    "SELECT id FROM product_lines WHERE is_default = TRUE ORDER BY id LIMIT 1"
  );
  const defaultProductLineId: number | null =
    defaultProductLineRows[0]?.id ?? (await pool.query("SELECT id FROM product_lines ORDER BY id LIMIT 1")).rows[0]?.id ?? null;

  const result: { synced: string[]; skipped: string[]; errors: { manager: string; error: string }[] } = {
    synced: [],
    skipped: [],
    errors: [],
  };

  if (!managers.length) {
    return res.json({ ...result, message: "Жоден ФОП не має підключеного ключа Нової Пошти." });
  }

  async function syncOneManager(m: { id: number; name: string; np_api_key: string; default_channel_id: number | null }) {
    const docs = await getAllDocuments(m.np_api_key, dateFrom, dateTo);
    if (!docs.length) {
      result.skipped.push(`${m.name} (немає відправлень за період)`);
      return;
    }

    const byBox: Record<number, number> = {};
    for (const d of docs) {
      const btId = boxTypeForWeight(Number(d.Weight));
      if (btId == null) continue;
      byBox[btId] = (byBox[btId] || 0) + 1;
    }
    const returnedCount = docs.filter((d) => d.StateName === "Відмова від отримання").length;
    // PayerType з НП: "Sender" - за доставку платимо ми (бізнес), "Recipient" - платить клієнт
    // (накладений платіж/наложка). Рахуємо, скільки відправлень кожного типу за період.
    const senderPaidCount = docs.filter((d) => d.PayerType === "Sender").length;
    const recipientPaidCount = docs.filter((d) => d.PayerType === "Recipient").length;

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
      // Оновлюємо сам запис доставки (Упаковка / Тип коробки / Повернень) — щоб таблиця
      // "Записи" теж показувала осмислені числа. Пишемо ТІЛЬКИ в один (найперший) запис
      // цього ФОП за період, бо саме на нього орієнтується v_delivery_cost при розбивці
      // по коробках з delivery_box_usage — якщо писати в усі рядки (напр. і ХБ, і ГБ),
      // собівартість задвоїться.
      const dominant = Object.entries(byBox).sort((a, b) => b[1] - a[1])[0];
      const totalQty = docs.length;
      if (dominant) {
        // qty_shipped теж підтягуємо з НП (загальна к-сть відправлень за декаду) -
        // раніше це поле лишалося ручним і "розʼїжджалося" з синхронізованою Упаковкою.
        const { rowCount } = await client.query(
          `UPDATE deliveries SET qty_packaging = $1, box_type_id = $2, qty_returned = $3,
              qty_shipped = $6, qty_np_sender_paid = $7, qty_np_recipient_paid = $8, updated_at = now()
           WHERE id = (SELECT MIN(id) FROM deliveries WHERE period_id = $4 AND manager_id = $5)`,
          [totalQty, Number(dominant[0]), returnedCount, period_id, m.id, totalQty, senderPaidCount, recipientPaidCount]
        );
        // Немає жодного запису доставки для цього ФОП+періоду (напр. щойно обраний
        // новий період, куди ще ніхто нічого не вносив вручну) — створюємо сам.
        if (!rowCount) {
          if (!m.default_channel_id || !defaultProductLineId) {
            throw new Error(
              !m.default_channel_id
                ? "немає каналу за замовчуванням у Довідниках — не можу створити новий запис"
                : "немає жодної товарної лінії в Довідниках — не можу створити новий запис"
            );
          }
          await client.query(
            `INSERT INTO deliveries
               (period_id, manager_id, channel_id, product_line_id, qty_packaging, box_type_id, qty_returned,
                qty_shipped, qty_np_sender_paid, qty_np_recipient_paid, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
             ON CONFLICT (period_id, manager_id, channel_id, product_line_id) DO UPDATE SET
                qty_packaging = EXCLUDED.qty_packaging,
                box_type_id = EXCLUDED.box_type_id,
                qty_returned = EXCLUDED.qty_returned,
                qty_shipped = EXCLUDED.qty_shipped,
                qty_np_sender_paid = EXCLUDED.qty_np_sender_paid,
                qty_np_recipient_paid = EXCLUDED.qty_np_recipient_paid,
                updated_at = now()`,
            [period_id, m.id, m.default_channel_id, defaultProductLineId, totalQty, Number(dominant[0]), returnedCount, totalQty, senderPaidCount, recipientPaidCount]
          );
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    result.synced.push(
      `${m.name} (${docs.length} відправлень: за наш рахунок ${senderPaidCount}, за рахунок клієнта ${recipientPaidCount}; повернень: ${returnedCount})`
    );
  }

  // Легкий "стагер" старту кожного ФОП (замість усіх одночасно) - зменшує сплеск
  // запитів у першу секунду, який і провокував "too many requests" при 10+ ФОП.
  const outcomes = await Promise.allSettled(
    managers.map(async (m, i) => {
      await sleep(i * 400);
      return syncOneManager(m);
    })
  );
  outcomes.forEach((outcome, i) => {
    if (outcome.status === "rejected") {
      const m = managers[i];
      const err = outcome.reason;
      result.errors.push({ manager: m.name, error: err instanceof Error ? err.message : String(err) });
    }
  });

  res.json(result);
}

export default router;
