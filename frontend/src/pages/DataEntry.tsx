import { useEffect, useState } from "react";
import { api } from "../api";
import { useReferenceData } from "../useReferenceData";
import type { Delivery } from "../types";
import { useAuth } from "../AuthContext";

const emptyForm = {
  period_id: "",
  manager_id: "",
  channel_id: "",
  product_line_id: "",
  qty_shipped: "",
  amount_uah: "",
  qty_returned: "",
  qty_damaged: "",
  qty_packaging: "",
  box_type_id: "",
};

export default function DataEntry() {
  const { managers, channels, productLines, boxTypes, periods, loading } = useReferenceData();
  const { user } = useAuth();
  const canEdit = user?.role === "owner" || user?.role === "editor";
  const [form, setForm] = useState(emptyForm);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filterPeriod, setFilterPeriod] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDeliveries() {
    const q = filterPeriod ? `?period_id=${filterPeriod}` : "";
    setDeliveries(await api.get<Delivery[]>(`/deliveries${q}`));
  }

  useEffect(() => {
    loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPeriod]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.post("/deliveries", {
        period_id: Number(form.period_id),
        manager_id: Number(form.manager_id),
        channel_id: Number(form.channel_id),
        product_line_id: Number(form.product_line_id),
        qty_shipped: Number(form.qty_shipped || 0),
        amount_uah: Number(form.amount_uah || 0),
        qty_returned: Number(form.qty_returned || 0),
        qty_damaged: Number(form.qty_damaged || 0),
        qty_packaging: Number(form.qty_packaging || 0),
        box_type_id: form.box_type_id ? Number(form.box_type_id) : null,
      });
      setMessage("Збережено.");
      setForm((f) => ({ ...emptyForm, period_id: f.period_id, channel_id: f.channel_id, box_type_id: f.box_type_id }));
      await loadDeliveries();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Завантаження…</p>;

  return (
    <div>
      <h2>Ввід даних — доставки / повернення</h2>

      {canEdit && (
        <div className="card">
          <h3>Новий запис (за декаду)</h3>
          <form onSubmit={submit}>
            <div className="form-grid">
              <label>
                Період
                <select className="input" required value={form.period_id} onChange={(e) => update("period_id", e.target.value)}>
                  <option value="">—</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Менеджер
                <select className="input" required value={form.manager_id} onChange={(e) => update("manager_id", e.target.value)}>
                  <option value="">—</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сегмент
                <select className="input" required value={form.channel_id} onChange={(e) => update("channel_id", e.target.value)}>
                  <option value="">—</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Товарна лінія
                <select className="input" required value={form.product_line_id} onChange={(e) => update("product_line_id", e.target.value)}>
                  <option value="">—</option>
                  {productLines.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                К-сть відправлень
                <input className="input" type="number" min={0} value={form.qty_shipped} onChange={(e) => update("qty_shipped", e.target.value)} />
              </label>
              <label>
                Сума, грн
                <input className="input" type="number" min={0} step="0.01" value={form.amount_uah} onChange={(e) => update("amount_uah", e.target.value)} />
              </label>
              <label>
                Повернення (забрані апп)
                <input className="input" type="number" min={0} value={form.qty_returned} onChange={(e) => update("qty_returned", e.target.value)} />
              </label>
              <label>
                Утиль (розбиті банки)
                <input className="input" type="number" min={0} value={form.qty_damaged} onChange={(e) => update("qty_damaged", e.target.value)} />
              </label>
              <label>
                Упаковка (к-сть коробок)
                <input className="input" type="number" min={0} value={form.qty_packaging} onChange={(e) => update("qty_packaging", e.target.value)} />
              </label>
              <label>
                Тип коробки
                <select className="input" value={form.box_type_id} onChange={(e) => update("box_type_id", e.target.value)}>
                  <option value="">—</option>
                  {boxTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Збереження…" : "Зберегти"}
            </button>
            {message && <span style={{ marginLeft: 12, fontSize: 13, color: "var(--text-muted)" }}>{message}</span>}
          </form>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Записи</h3>
          <label>
            Фільтр за періодом
            <select className="input" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
              <option value="">Всі</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Період</th>
                <th>Менеджер</th>
                <th>Сегмент</th>
                <th>Лінія</th>
                <th>Відправлено</th>
                <th>Сума, грн</th>
                <th>Повернень</th>
                <th>Утиль</th>
                <th>Упаковка</th>
                <th>Собівартість упак., грн</th>
                <th>Тариф НП, грн</th>
                <th>Економія, грн</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{d.period_label}</td>
                  <td>{d.manager_name}</td>
                  <td>{d.channel_code}</td>
                  <td>{d.product_line_name}</td>
                  <td>{d.qty_shipped}</td>
                  <td>{d.amount_uah}</td>
                  <td>{d.qty_returned}</td>
                  <td>{d.qty_damaged}</td>
                  <td>{d.qty_packaging}</td>
                  <td>{d.own_packaging_cost ?? "—"}</td>
                  <td>{d.np_equivalent_cost ?? "—"}</td>
                  <td className={d.savings_uah && Number(d.savings_uah) >= 0 ? "positive" : "negative"}>
                    {d.savings_uah ?? "—"}
                  </td>
                </tr>
              ))}
              {!deliveries.length && (
                <tr>
                  <td colSpan={12} style={{ color: "var(--text-muted)" }}>
                    Немає записів.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
