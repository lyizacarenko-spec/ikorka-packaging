import { useState } from "react";
import type { ClipboardEvent } from "react";
import { api } from "../api";
import type { BoxType, Material } from "../types";

type ItemType = "box" | "material";

interface DateQty {
  date: string;
  qty: string;
}
interface Purchase {
  date: string;
  supplier: string;
  qty: string;
  amount: string;
}
interface ImportRow {
  key: string;
  item_type: ItemType;
  existingId: string; // '' = нова позиція
  newName: string;
  carryover: string;
  carryoverDate: string;
  incoming: DateQty[];
  returns: DateQty[];
  daily: string[]; // довжина = днів у місяці
  purchases: Purchase[];
  expectedTotalOut: string;
  expectedRemainder: string;
}
interface PreviewItem {
  item_type: ItemType;
  name: string;
  created_new: boolean;
  carryover: number;
  total_incoming: number;
  total_returns: number;
  total_out: number;
  final_balance: number;
  expected_total_out: number | null;
  diff_total_out: number | null;
  expected_remainder: number | null;
  diff_remainder: number | null;
  purchases_total_qty: number;
  purchases_total_amount: number;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function daysInMonth(monthStr: string): number {
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function blankRow(itemType: ItemType, days: number): ImportRow {
  return {
    key: uid(),
    item_type: itemType,
    existingId: "",
    newName: "",
    carryover: "",
    carryoverDate: "",
    incoming: [],
    returns: [],
    daily: Array(days).fill(""),
    purchases: [],
    expectedTotalOut: "",
    expectedRemainder: "",
  };
}

export default function StockBulkImport({
  boxTypes,
  materials,
  onDone,
}: {
  boxTypes: BoxType[];
  materials: Material[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branch, setBranch] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [committedNote, setCommittedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = daysInMonth(month);
  const noteBase = `Імпорт складу: ${month}${branch ? " (" + branch + ")" : ""}`;

  function addRow(itemType: ItemType) {
    setRows((r) => [...r, blankRow(itemType, days)]);
    setPreview(null);
  }
  function removeRow(key: string) {
    setRows((r) => r.filter((x) => x.key !== key));
    setPreview(null);
  }
  function updateRow(key: string, patch: Partial<ImportRow>) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    setPreview(null);
  }
  function addEvent(key: string, field: "incoming" | "returns") {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: [...x[field], { date: "", qty: "" }] } : x)));
  }
  function updateEvent(key: string, field: "incoming" | "returns", idx: number, patch: Partial<DateQty>) {
    setRows((r) =>
      r.map((x) => {
        if (x.key !== key) return x;
        const list = x[field].slice();
        list[idx] = { ...list[idx], ...patch };
        return { ...x, [field]: list };
      })
    );
  }
  function removeEvent(key: string, field: "incoming" | "returns", idx: number) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: x[field].filter((_, i) => i !== idx) } : x)));
  }
  function addPurchase(key: string) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, purchases: [...x.purchases, { date: "", supplier: "", qty: "", amount: "" }] } : x)));
  }
  function updatePurchase(key: string, idx: number, patch: Partial<Purchase>) {
    setRows((r) =>
      r.map((x) => {
        if (x.key !== key) return x;
        const list = x.purchases.slice();
        list[idx] = { ...list[idx], ...patch };
        return { ...x, purchases: list };
      })
    );
  }
  function removePurchase(key: string, idx: number) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, purchases: x.purchases.filter((_, i) => i !== idx) } : x)));
  }
  function updateDaily(key: string, idx: number, value: string) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, daily: x.daily.map((v, i) => (i === idx ? value : v)) } : x)));
  }
  function handleDailyPaste(key: string, startIdx: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    // Розбиваємо і по рядках, і по табах, зберігаючи порожні клітинки (щоб не зсунути дні) -
    // саме так виглядає діапазон, скопійований з Google Таблиць у буфер обміну.
    let flat = text
      .split(/\r?\n/)
      .flatMap((line) => line.split("\t"))
      .map((v) => v.trim());
    // Якщо це не табличний вставка (наприклад, просто рядок чисел через кому/пробіл,
    // скопійований з чату) - пробуємо розібрати і так; порожні дні тут пропустити не можна,
    // тому позиції з такого рядка йдуть підряд від startIdx без пропусків.
    if (flat.length <= 1 && /[,\s]/.test(text.trim())) {
      flat = text
        .trim()
        .split(/[,\s]+/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
    if (flat.length <= 1) return; // одне число - нехай вставиться звичайним чином
    e.preventDefault();
    setRows((r) =>
      r.map((x) => {
        if (x.key !== key) return x;
        const daily = x.daily.slice();
        flat.forEach((v, i) => {
          if (startIdx + i < daily.length) daily[startIdx + i] = v.replace(",", ".");
        });
        return { ...x, daily };
      })
    );
    setPreview(null);
  }

  function dayDate(dayNum: number): string {
    return `${month}-${String(dayNum).padStart(2, "0")}`;
  }

  function buildPayload(commit: boolean) {
    const items = rows.map((r) => {
      const base: Record<string, unknown> = {
        item_type: r.item_type,
        carryover: r.carryover ? Number(r.carryover) : 0,
        carryover_date: r.carryoverDate || undefined,
        incoming: r.incoming.filter((e) => e.date && e.qty).map((e) => ({ date: e.date, qty: Number(e.qty) })),
        returns: r.returns.filter((e) => e.date && e.qty).map((e) => ({ date: e.date, qty: Number(e.qty) })),
        daily: r.daily.map((v, i) => ({ date: dayDate(i + 1), qty: v ? Number(v) : 0 })).filter((e) => e.qty),
        expected_total_out: r.expectedTotalOut ? Number(r.expectedTotalOut) : undefined,
        expected_remainder: r.expectedRemainder ? Number(r.expectedRemainder) : undefined,
      };
      if (r.existingId) {
        if (r.item_type === "box") base.box_type_id = Number(r.existingId);
        else base.material_id = Number(r.existingId);
      } else {
        base.new_name = r.newName.trim();
      }
      if (r.item_type === "material") {
        base.purchases = r.purchases
          .filter((p) => p.date && p.qty && p.amount)
          .map((p) => ({ date: p.date, supplier: p.supplier || undefined, qty: Number(p.qty), amount: Number(p.amount) }));
      }
      return base;
    });
    return { commit, note: noteBase, items };
  }

  async function runPreview() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ committed: boolean; note: string; items: PreviewItem[] }>("/stock/bulk-import", buildPayload(false));
      setPreview(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Помилка перевірки");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ committed: boolean; note: string; items: PreviewItem[] }>("/stock/bulk-import", buildPayload(true));
      setPreview(res.items);
      setCommittedNote(res.note);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setBusy(false);
    }
  }

  async function runUndo() {
    if (!committedNote) return;
    if (!window.confirm(`Скасувати імпорт «${committedNote}»? Всі рухи цієї партії буде видалено.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/stock/bulk-import/undo", { note: committedNote });
      setCommittedNote(null);
      setPreview(null);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Помилка скасування");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Масовий імпорт складу за місяць</h3>
        <button type="button" className="btn secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Згорнути" : "Імпортувати за місяць"}
        </button>
      </div>

      {open && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Раз на місяць: перенос залишку, дати приходу/повернення і щоденна витрата. Для щоденної витрати постав
            курсор у клітинку 1-го дня і встав (Ctrl+V) увесь рядок чисел з Google Таблиці одразу — решта днів
            заповниться сама. Кожен день зберігається окремим рухом, щоб усе збігалось один в один.
          </p>
          <div className="form-grid" style={{ alignItems: "end", marginBottom: 12 }}>
            <label>
              Місяць
              <input className="input" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPreview(null); }} />
            </label>
            <label>
              Філія / примітка (необов&rsquo;язково)
              <input className="input" value={branch} onChange={(e) => { setBranch(e.target.value); setPreview(null); }} placeholder="напр. Дніпро" />
            </label>
          </div>

          {rows.map((r) => (
            <RowEditor
              key={r.key}
              row={r}
              boxTypes={boxTypes}
              materials={materials}
              onChange={(patch) => updateRow(r.key, patch)}
              onRemove={() => removeRow(r.key)}
              onAddIncoming={() => addEvent(r.key, "incoming")}
              onUpdateIncoming={(i, patch) => updateEvent(r.key, "incoming", i, patch)}
              onRemoveIncoming={(i) => removeEvent(r.key, "incoming", i)}
              onAddReturn={() => addEvent(r.key, "returns")}
              onUpdateReturn={(i, patch) => updateEvent(r.key, "returns", i, patch)}
              onRemoveReturn={(i) => removeEvent(r.key, "returns", i)}
              onAddPurchase={() => addPurchase(r.key)}
              onUpdatePurchase={(i, patch) => updatePurchase(r.key, i, patch)}
              onRemovePurchase={(i) => removePurchase(r.key, i)}
              onUpdateDaily={(i, v) => updateDaily(r.key, i, v)}
              onPasteDaily={(i, e) => handleDailyPaste(r.key, i, e)}
            />
          ))}

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="button" className="btn secondary" onClick={() => addRow("box")}>
              + Коробка
            </button>
            <button type="button" className="btn secondary" onClick={() => addRow("material")}>
              + Матеріал
            </button>
          </div>

          {error && <p style={{ color: "crimson" }}>{error}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn secondary" disabled={busy || !rows.length} onClick={runPreview}>
              Перевірити
            </button>
            <button type="button" className="btn" disabled={busy || !rows.length} onClick={runCommit}>
              Зберегти в базу
            </button>
            {committedNote && (
              <button type="button" className="btn secondary" disabled={busy} onClick={runUndo}>
                Скасувати останній імпорт
              </button>
            )}
          </div>

          {preview && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Позиція</th>
                    <th>Нова?</th>
                    <th>Перенос</th>
                    <th>Прихід</th>
                    <th>Повернення</th>
                    <th>Розхід (пораховано)</th>
                    <th>Розхід (за таблицею)</th>
                    <th>Δ розхід</th>
                    <th>Залишок (пораховано)</th>
                    <th>Залишок (за таблицею)</th>
                    <th>Δ залишок</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => {
                    const mismatch = (p.diff_total_out && Math.abs(p.diff_total_out) > 0.01) || (p.diff_remainder && Math.abs(p.diff_remainder) > 0.01);
                    return (
                      <tr key={i} style={{ background: mismatch ? "#fff3cd" : undefined }}>
                        <td>{p.name}</td>
                        <td>{p.created_new ? "так" : ""}</td>
                        <td>{p.carryover}</td>
                        <td>{p.total_incoming}</td>
                        <td>{p.total_returns}</td>
                        <td>{p.total_out}</td>
                        <td>{p.expected_total_out ?? "—"}</td>
                        <td>{p.diff_total_out ?? "—"}</td>
                        <td>{p.final_balance}</td>
                        <td>{p.expected_remainder ?? "—"}</td>
                        <td>{p.diff_remainder ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {committedNote
                  ? `Збережено як партію: «${committedNote}». Якщо щось не так — натисни «Скасувати останній імпорт».`
                  : "Це перевірка (нічого ще не збережено) — жовтим підсвічені позиції, де є розбіжність із таблицею."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RowEditor(props: {
  row: ImportRow;
  boxTypes: BoxType[];
  materials: Material[];
  onChange: (patch: Partial<ImportRow>) => void;
  onRemove: () => void;
  onAddIncoming: () => void;
  onUpdateIncoming: (i: number, patch: Partial<DateQty>) => void;
  onRemoveIncoming: (i: number) => void;
  onAddReturn: () => void;
  onUpdateReturn: (i: number, patch: Partial<DateQty>) => void;
  onRemoveReturn: (i: number) => void;
  onAddPurchase: () => void;
  onUpdatePurchase: (i: number, patch: Partial<Purchase>) => void;
  onRemovePurchase: (i: number) => void;
  onUpdateDaily: (i: number, v: string) => void;
  onPasteDaily: (i: number, e: ClipboardEvent<HTMLInputElement>) => void;
}) {
  const { row, boxTypes, materials } = props;
  const options: { id: number; name: string }[] = row.item_type === "box" ? boxTypes : materials;

  return (
    <div style={{ border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div className="form-grid" style={{ alignItems: "end" }}>
        <label>
          Тип
          <select
            className="input"
            value={row.item_type}
            onChange={(e) => props.onChange({ item_type: e.target.value as ItemType, existingId: "", newName: "" })}
          >
            <option value="box">Коробка</option>
            <option value="material">Матеріал</option>
          </select>
        </label>
        <label>
          Позиція
          <select className="input" value={row.existingId} onChange={(e) => props.onChange({ existingId: e.target.value })}>
            <option value="">+ нова позиція…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {!row.existingId && (
          <label>
            Назва нової позиції
            <input className="input" value={row.newName} onChange={(e) => props.onChange({ newName: e.target.value })} placeholder="напр. Б/у коробка 1 кг" />
          </label>
        )}
        <label>
          Перенос на початок місяця
          <input className="input" type="number" step="0.01" value={row.carryover} onChange={(e) => props.onChange({ carryover: e.target.value })} />
        </label>
        <button type="button" className="btn secondary" onClick={props.onRemove}>
          Видалити позицію
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Прихід</div>
          {row.incoming.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input className="input" type="date" value={e.date} onChange={(ev) => props.onUpdateIncoming(i, { date: ev.target.value })} />
              <input className="input" type="number" step="0.01" style={{ width: 80 }} value={e.qty} onChange={(ev) => props.onUpdateIncoming(i, { qty: ev.target.value })} />
              <button type="button" className="btn secondary" onClick={() => props.onRemoveIncoming(i)}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn secondary" style={{ marginTop: 4 }} onClick={props.onAddIncoming}>
            + дата приходу
          </button>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Повернення</div>
          {row.returns.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input className="input" type="date" value={e.date} onChange={(ev) => props.onUpdateReturn(i, { date: ev.target.value })} />
              <input className="input" type="number" step="0.01" style={{ width: 80 }} value={e.qty} onChange={(ev) => props.onUpdateReturn(i, { qty: ev.target.value })} />
              <button type="button" className="btn secondary" onClick={() => props.onRemoveReturn(i)}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn secondary" style={{ marginTop: 4 }} onClick={props.onAddReturn}>
            + дата повернення
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Витрата по днях (встав рядок з таблиці в перший день)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
          {row.daily.map((v, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{i + 1}</div>
              <input
                className="input"
                style={{ width: 40, padding: "2px 4px", textAlign: "center" }}
                value={v}
                onChange={(e) => props.onUpdateDaily(i, e.target.value)}
                onPaste={(e) => props.onPasteDaily(i, e)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="form-grid" style={{ marginTop: 8 }}>
        <label>
          Розхід всього за таблицею (для звірки)
          <input className="input" type="number" step="0.01" value={row.expectedTotalOut} onChange={(e) => props.onChange({ expectedTotalOut: e.target.value })} />
        </label>
        <label>
          Залишок на кінець за таблицею (для звірки)
          <input className="input" type="number" step="0.01" value={row.expectedRemainder} onChange={(e) => props.onChange({ expectedRemainder: e.target.value })} />
        </label>
      </div>

      {row.item_type === "material" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Закупівлі (для середньої ціни)</div>
          {row.purchases.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              <input className="input" type="date" value={p.date} onChange={(e) => props.onUpdatePurchase(i, { date: e.target.value })} />
              <input className="input" placeholder="постачальник" style={{ width: 140 }} value={p.supplier} onChange={(e) => props.onUpdatePurchase(i, { supplier: e.target.value })} />
              <input className="input" type="number" step="0.01" placeholder="к-сть" style={{ width: 80 }} value={p.qty} onChange={(e) => props.onUpdatePurchase(i, { qty: e.target.value })} />
              <input className="input" type="number" step="0.01" placeholder="сума" style={{ width: 90 }} value={p.amount} onChange={(e) => props.onUpdatePurchase(i, { amount: e.target.value })} />
              <button type="button" className="btn secondary" onClick={() => props.onRemovePurchase(i)}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn secondary" style={{ marginTop: 4 }} onClick={props.onAddPurchase}>
            + закупівля
          </button>
        </div>
      )}
    </div>
  );
}
