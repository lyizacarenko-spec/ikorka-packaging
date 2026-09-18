import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { useReferenceData } from "../useReferenceData";
import type { Delivery, DeliveryBoxUsage } from "../types";
import { useAuth } from "../AuthContext";
import { Pager, paginate } from "../Pager";

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
  qty_packaging_free: "",
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
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [boxUsageByDelivery, setBoxUsageByDelivery] = useState<Record<number, DeliveryBoxUsage[] | "loading">>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    message?: string;
    synced: string[];
    skipped: string[];
    errors: { manager: string; error: string }[];
  } | null>(null);
  const PAGE_SIZE = 30;

  async function loadDeliveries() {
    const q = filterPeriod ? `?period_id=${filterPeriod}` : "";
    setDeliveries(await api.get<Delivery[]>(`/deliveries${q}`));
  }

  useEffect(() => {
    loadDeliveries();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPeriod]);

  const { pageCount, pageItems: pagedDeliveries } = paginate(deliveries, page, PAGE_SIZE);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function syncWithNp() {
    if (!filterPeriod) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncResult(null);
    try {
      const result = await api.post<{ synced: string[]; skipped: string[]; errors: { manager: string; error: string }[]; message?: string }>(
        "/np-sync",
        { period_id: Number(filterPeriod) }
      );
      setSyncResult(result);
      if (!result.message && !result.synced.length && !result.skipped.length && !result.errors.length) {
        setSyncMessage("Готово, але змін немає.");
      }
      await loadDeliveries();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Помилка синхронізації");
    } finally {
      setSyncing(false);
    }
  }

  async function toggleBoxUsage(d: Delivery) {
    if (expandedRow === d.id) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(d.id);
    if (!boxUsageByDelivery[d.id]) {
      setBoxUsageByDelivery((prev) => ({ ...prev, [d.id]: "loading" }));
      try {
        const rows = await api.get<DeliveryBoxUsage[]>(
          `/delivery-box-usage?period_id=${d.period_id}&manager_id=${d.manager_id}`
        );
        setBoxUsageByDelivery((prev) => ({ ...prev, [d.id]: rows }));
      } catch {
        setBoxUsageByDelivery((prev) => ({ ...prev, [d.id]: [] }));
      }
    }
  }

  function startEdit(d: Delivery) {
    setEditingId(d.id);
    setMessage(null);
    setForm({
      period_id: String(d.period_id),
      manager_id: String(d.manager_id),
      channel_id: String(d.channel_id),
      product_line_id: String(d.product_line_id),
      qty_shipped: String(d.qty_shipped ?? 0),
      amount_uah: String(d.amount_uah ?? 0),
      qty_returned: String(d.qty_returned ?? 0),
      qty_damaged: String(d.qty_damaged ?? 0),
      qty_packaging: String(d.qty_packaging ?? 0),
      box_type_id: d.box_type_id ? String(d.box_type_id) : "",
      qty_packaging_free: String(d.qty_packaging_free ?? 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
  }

  async function deleteDelivery(id: number) {
    if (!window.confirm("Видалити цей запис? Дію не можна скасувати.")) return;
    try {
      await api.del(`/deliveries/${id}`);
      await loadDeliveries();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Помилка видалення");
    }
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
        qty_packaging_free: Number(form.qty_packaging_free || 0),
      });
      setMessage(editingId ? "Зміни збережено." : "Збережено.");
      setEditingId(null);
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
          <h3>{editingId ? "Редагування запису" : "Новий запис (за декаду)"}</h3>
          {editingId && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Редагуєте вже існуючий запис — поля нижче підвантажені з нього. Змініть потрібне (наприклад, «з них б/у») і натисніть «Зберегти зміни».
            </p>
          )}
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
                ФОП
                <select
                  className="input"
                  required
                  value={form.manager_id}
                  onChange={(e) => {
                    const managerId = e.target.value;
                    const mgr = managers.find((m) => String(m.id) === managerId);
                    setForm((f) => ({
                      ...f,
                      manager_id: managerId,
                      // якщо у менеджера є канал за замовчуванням (ХБ/ГБ) — підставляємо сам, Наташі не треба знати, хто до якого ФОП належить
                      channel_id: mgr?.default_channel_id ? String(mgr.default_channel_id) : f.channel_id,
                    }));
                  }}
                >
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
              <label>
                З них б/у, шт (безкоштовні — не входять у собівартість)
                <input className="input" type="number" min={0} value={form.qty_packaging_free} onChange={(e) => update("qty_packaging_free", e.target.value)} />
              </label>
            </div>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Збереження…" : editingId ? "Зберегти зміни" : "Зберегти"}
            </button>
            {editingId && (
              <button type="button" className="btn secondary" style={{ marginLeft: 8 }} onClick={cancelEdit}>
                Скасувати
              </button>
            )}
            {message && <span style={{ marginLeft: 12, fontSize: 13, color: "var(--text-muted)" }}>{message}</span>}
          </form>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Записи ({deliveries.length})</h3>
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
          {canEdit && (
            <button type="button" className="btn secondary" disabled={!filterPeriod || syncing} onClick={syncWithNp} title={!filterPeriod ? "Спочатку виберіть конкретний період вище" : undefined}>
              {syncing ? "Синхронізую…" : "Синхронізувати з Новою Поштою"}
            </button>
          )}
        </div>
        {syncMessage && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{syncMessage}</p>}
        {syncResult && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            {syncResult.message && <p>{syncResult.message}</p>}
            {syncResult.synced.length > 0 && (
              <>
                <strong>Оновлено:</strong>
                <ul style={{ margin: "4px 0 8px", paddingLeft: 20 }}>
                  {syncResult.synced.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {syncResult.skipped.length > 0 && (
              <>
                <strong>Пропущено:</strong>
                <ul style={{ margin: "4px 0 8px", paddingLeft: 20 }}>
                  {syncResult.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {syncResult.errors.length > 0 && (
              <>
                <strong style={{ color: "var(--danger, #c0392b)" }}>Помилки:</strong>
                <ul style={{ margin: "4px 0 8px", paddingLeft: 20 }}>
                  {syncResult.errors.map((e, i) => (
                    <li key={i}>
                      {e.manager} — {e.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Період</th>
                <th>ФОП</th>
                <th>Сегмент</th>
                <th>Лінія</th>
                <th>Відправлено</th>
                <th>Сума, грн</th>
                <th>Повернень</th>
                <th>Утиль</th>
                <th>Упаковка</th>
                <th>З них б/у</th>
                <th>Собівартість упак., грн</th>
                <th>Тариф НП, грн</th>
                <th>Економія, грн</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {pagedDeliveries.map((d) => (
                <Fragment key={d.id}>
                  <tr>
                    <td>{d.period_label}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleBoxUsage(d)}
                        style={{ background: "none", border: "none", padding: 0, color: "var(--link, #2563eb)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                        title="Показати розбивку по типах коробок (з автосинку НП)"
                      >
                        {d.manager_name}
                      </button>
                    </td>
                    <td>{d.channel_code}</td>
                    <td>{d.product_line_name}</td>
                    <td>{d.qty_shipped}</td>
                    <td>{d.amount_uah}</td>
                    <td>{d.qty_returned}</td>
                    <td>{d.qty_damaged}</td>
                    <td>{d.qty_packaging}</td>
                    <td>{d.qty_packaging_free || 0}</td>
                    <td>{d.own_packaging_cost ?? "—"}</td>
                    <td>{d.np_equivalent_cost ?? "—"}</td>
                    <td className={d.savings_uah && Number(d.savings_uah) >= 0 ? "positive" : "negative"}>
                      {d.savings_uah ?? "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canEdit && (
                        <>
                          <button type="button" className="btn secondary" onClick={() => startEdit(d)}>
                            Редагувати
                          </button>{" "}
                          <button type="button" className="btn secondary" onClick={() => deleteDelivery(d.id)}>
                            Видалити
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {expandedRow === d.id && (
                    <tr>
                      <td colSpan={14} style={{ background: "var(--bg-muted, #f7f7f9)" }}>
                        {boxUsageByDelivery[d.id] === "loading" && "Завантаження…"}
                        {boxUsageByDelivery[d.id] && boxUsageByDelivery[d.id] !== "loading" && (
                          (boxUsageByDelivery[d.id] as DeliveryBoxUsage[]).length === 0 ? (
                            <span style={{ color: "var(--text-muted)" }}>
                              Немає розбивки по коробках (запис не синхронізований з Новою Поштою — введений вручну).
                            </span>
                          ) : (
                            <div>
                              <strong>{d.manager_name} — розбивка за декаду ({d.period_label}):</strong>
                              <p style={{ margin: "4px 0" }}>
                                Всього відправлень: <strong>{d.qty_shipped}</strong>
                                {" "}(за наш рахунок: {d.qty_np_sender_paid ?? 0}, за рахунок клієнта: {d.qty_np_recipient_paid ?? 0}); повернень: {d.qty_returned}
                              </p>
                              <div style={{ fontWeight: 600, marginTop: 8 }}>Коробки за типами:</div>
                              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                                {(boxUsageByDelivery[d.id] as DeliveryBoxUsage[]).map((u) => (
                                  <li key={u.box_type_id}>
                                    {u.name}: {u.qty} шт
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!deliveries.length && (
                <tr>
                  <td colSpan={13} style={{ color: "var(--text-muted)" }}>
                    Немає записів.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageCount={pageCount} setPage={setPage} />
      </div>
    </div>
  );
}
