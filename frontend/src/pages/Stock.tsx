import { useEffect, useState } from "react";
import { api } from "../api";
import type { StockBalance, StockMovement } from "../types";
import { useReferenceData } from "../useReferenceData";
import { useAuth } from "../AuthContext";
import { Pager, paginate } from "../Pager";

export default function Stock() {
  const { boxTypes, materials, loading: refLoading } = useReferenceData();
  const { user } = useAuth();
  const canEdit = user?.role === "owner" || user?.role === "editor";

  const [balance, setBalance] = useState<StockBalance[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;
  const [form, setForm] = useState({
    item_type: "box" as "box" | "material",
    box_type_id: "",
    material_id: "",
    movement_date: "",
    operation: "приход" as "приход" | "возврат" | "расход",
    qty: "",
    amount: "",
    note: "",
  });
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    const [b, m] = await Promise.all([
      api.get<StockBalance[]>("/stock/balance"),
      api.get<StockMovement[]>("/stock/movements"),
    ]);
    setBalance(b);
    setMovements(m);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.movement_date || !form.qty) return;
    if (form.item_type === "box" && !form.box_type_id) return;
    if (form.item_type === "material" && !form.material_id) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/stock/movements", {
        item_type: form.item_type,
        box_type_id: form.item_type === "box" ? Number(form.box_type_id) : null,
        material_id: form.item_type === "material" ? Number(form.material_id) : null,
        movement_date: form.movement_date,
        operation: form.operation,
        qty: Number(form.qty),
        note: form.note || null,
      });

      // Якщо це прихід і вказана сума накладної — рахуємо ціну за одиницю самі
      // (сума ÷ кількість) і одразу зберігаємо її в "Ціни", щоб не рахувати на калькуляторі.
      if (form.operation === "приход" && form.amount && Number(form.amount) > 0 && Number(form.qty) > 0) {
        const price = Math.round((Number(form.amount) / Number(form.qty)) * 100) / 100;
        if (form.item_type === "box") {
          await api.post("/box-prices", { box_type_id: Number(form.box_type_id), price, valid_from: form.movement_date });
        } else {
          await api.post("/material-prices", { material_id: Number(form.material_id), price, valid_from: form.movement_date });
        }
        setMessage(`Збережено. Ціна за одиницю порахована сама: ${form.amount} грн ÷ ${form.qty} = ${price} грн.`);
      } else {
        setMessage("Збережено.");
      }

      setForm((f) => ({ ...f, qty: "", amount: "", note: "" }));
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  function itemLabel(row: { box_type_name: string | null; material_name: string | null } | { box_type_id: number | null; material_id: number | null }) {
    if ("box_type_name" in row) return row.box_type_name ?? row.material_name ?? "—";
    const bt = boxTypes.find((b) => b.id === row.box_type_id);
    const mt = materials.find((m) => m.id === row.material_id);
    return bt?.name ?? mt?.name ?? "—";
  }

  if (refLoading) return <p>Завантаження…</p>;

  const { pageCount, pageItems: pagedMovements } = paginate(movements, page, PAGE_SIZE);

  return (
    <div>
      <h2>Склад — коробки та матеріали</h2>

      <div className="card">
        <h3>Поточний залишок</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Тип</th><th>Позиція</th><th>Залишок</th><th>Станом на</th></tr></thead>
            <tbody>
              {balance.map((b, i) => (
                <tr key={i}>
                  <td>{b.item_type === "box" ? "Коробка" : "Матеріал"}</td>
                  <td>{itemLabel(b)}</td>
                  <td>{b.current_balance}</td>
                  <td>{b.as_of.slice(0, 10)}</td>
                </tr>
              ))}
              {!balance.length && <tr><td colSpan={4} style={{ color: "var(--text-muted)" }}>Ще немає рухів.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <div className="card">
          <h3>Новий рух</h3>
          <form onSubmit={submit} className="form-grid" style={{ alignItems: "end" }}>
            <label>
              Тип позиції
              <select className="input" value={form.item_type} onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value as "box" | "material" }))}>
                <option value="box">Коробка</option>
                <option value="material">Матеріал</option>
              </select>
            </label>
            {form.item_type === "box" ? (
              <label>
                Тип коробки
                <select className="input" value={form.box_type_id} onChange={(e) => setForm((f) => ({ ...f, box_type_id: e.target.value }))}>
                  <option value="">—</option>
                  {boxTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>{bt.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Матеріал
                <select className="input" value={form.material_id} onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                  <option value="">—</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Операція
              <select className="input" value={form.operation} onChange={(e) => setForm((f) => ({ ...f, operation: e.target.value as typeof f.operation }))}>
                <option value="приход">Прихід</option>
                <option value="возврат">Повернення</option>
                <option value="расход">Витрата</option>
              </select>
            </label>
            <label>Кількість<input className="input" type="number" step="0.01" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} /></label>
            {form.operation === "приход" && (
              <label>
                Сума накладної, грн (необов&rsquo;язково)
                <input className="input" type="number" step="0.01" placeholder="напр. 34567" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              </label>
            )}
            <label>Дата<input className="input" type="date" value={form.movement_date} onChange={(e) => setForm((f) => ({ ...f, movement_date: e.target.value }))} /></label>
            <label>Примітка<input className="input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></label>
            <button className="btn" disabled={busy}>Зберегти</button>
            {message && <span style={{ marginLeft: 12, fontSize: 13, color: "var(--text-muted)" }}>{message}</span>}
          </form>
        </div>
      )}

      <div className="card">
        <h3>Історія рухів ({movements.length})</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Дата</th><th>Тип</th><th>Позиція</th><th>Операція</th><th>К-сть</th><th>Залишок після</th><th>Примітка</th></tr></thead>
            <tbody>
              {pagedMovements.map((m) => (
                <tr key={m.id}>
                  <td>{m.movement_date.slice(0, 10)}</td>
                  <td>{m.item_type === "box" ? "Коробка" : "Матеріал"}</td>
                  <td>{itemLabel(m)}</td>
                  <td>{m.operation}</td>
                  <td>{m.qty}</td>
                  <td>{m.balance_after}</td>
                  <td>{m.note ?? ""}</td>
                </tr>
              ))}
              {!movements.length && <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Немає записів.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageCount={pageCount} setPage={setPage} />
      </div>
    </div>
  );
}
