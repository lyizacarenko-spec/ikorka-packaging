import { useState } from "react";
import { api } from "../api";
import { useReferenceData } from "../useReferenceData";
import { useAuth } from "../AuthContext";
import { Pager, paginate } from "../Pager";

export default function Reference() {
  const { managers, channels, boxTypes, materials, productLines, periods, loading, reload } = useReferenceData();
  const { user } = useAuth();
  const canEdit = user?.role === "owner" || user?.role === "editor";

  const [newManager, setNewManager] = useState("");
  const [newBox, setNewBox] = useState({ code: "", name: "", weight_kg: "" });
  const [newMaterial, setNewMaterial] = useState({ code: "", name: "", unit: "" });
  const [newLine, setNewLine] = useState("");
  const [newPeriod, setNewPeriod] = useState({ date_from: "", date_to: "", label: "" });
  const [busy, setBusy] = useState(false);
  const PAGE_SIZE = 20;
  const [periodPage, setPeriodPage] = useState(1);
  const [managerPage, setManagerPage] = useState(1);
  const [linePage, setLinePage] = useState(1);
  const [boxPage, setBoxPage] = useState(1);
  const [materialPage, setMaterialPage] = useState(1);

  async function addManager(e: React.FormEvent) {
    e.preventDefault();
    if (!newManager.trim()) return;
    setBusy(true);
    try {
      await api.post("/managers", { name: newManager.trim() });
      setNewManager("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function setManagerChannel(managerId: number, channelId: string) {
    setBusy(true);
    try {
      await api.put(`/managers/${managerId}`, { default_channel_id: channelId ? Number(channelId) : null });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function addBoxType(e: React.FormEvent) {
    e.preventDefault();
    if (!newBox.code || !newBox.name) return;
    setBusy(true);
    try {
      await api.post("/box-types", {
        code: newBox.code,
        name: newBox.name,
        weight_kg: newBox.weight_kg ? Number(newBox.weight_kg) : null,
      });
      setNewBox({ code: "", name: "", weight_kg: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function addMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!newMaterial.code || !newMaterial.name || !newMaterial.unit) return;
    setBusy(true);
    try {
      await api.post("/materials", newMaterial);
      setNewMaterial({ code: "", name: "", unit: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!newLine.trim()) return;
    setBusy(true);
    try {
      await api.post("/product-lines", { name: newLine.trim() });
      setNewLine("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function addPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!newPeriod.date_from || !newPeriod.date_to || !newPeriod.label) return;
    setBusy(true);
    try {
      await api.post("/periods", newPeriod);
      setNewPeriod({ date_from: "", date_to: "", label: "" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Завантаження…</p>;

  const periodsPaged = paginate(periods, periodPage, PAGE_SIZE);
  const managersPaged = paginate(managers, managerPage, PAGE_SIZE);
  const linesPaged = paginate(productLines, linePage, PAGE_SIZE);
  const boxesPaged = paginate(boxTypes, boxPage, PAGE_SIZE);
  const materialsPaged = paginate(materials, materialPage, PAGE_SIZE);

  return (
    <div>
      <h2>Довідники</h2>

      <div className="card">
        <h3>Періоди (декади)</h3>
        {canEdit && (
          <form onSubmit={addPeriod} className="form-grid" style={{ alignItems: "end" }}>
            <label>
              З дати
              <input className="input" type="date" value={newPeriod.date_from} onChange={(e) => setNewPeriod((p) => ({ ...p, date_from: e.target.value }))} />
            </label>
            <label>
              По дату
              <input className="input" type="date" value={newPeriod.date_to} onChange={(e) => setNewPeriod((p) => ({ ...p, date_to: e.target.value }))} />
            </label>
            <label>
              Назва (мітка)
              <input className="input" placeholder="01.05.-10.05.2026" value={newPeriod.label} onChange={(e) => setNewPeriod((p) => ({ ...p, label: e.target.value }))} />
            </label>
            <button className="btn" disabled={busy}>Додати</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Мітка</th><th>З</th><th>По</th></tr></thead>
            <tbody>
              {periodsPaged.pageItems.map((p) => (
                <tr key={p.id}><td>{p.label}</td><td>{p.date_from.slice(0, 10)}</td><td>{p.date_to.slice(0, 10)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={periodPage} pageCount={periodsPaged.pageCount} setPage={setPeriodPage} />
      </div>

      <div className="card">
        <h3>ФОП</h3>
        {canEdit && (
          <form onSubmit={addManager} className="toolbar">
            <input className="input" placeholder="Ім'я ФОП" value={newManager} onChange={(e) => setNewManager(e.target.value)} />
            <button className="btn" disabled={busy}>Додати</button>
          </form>
        )}
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Канал за замовчуванням — щоб при вводі даних сегмент (ХБ/ГБ) підставлявся сам, коли обираєш ФОП.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ім'я</th><th>Активний</th><th>Канал за замовч.</th></tr></thead>
            <tbody>
              {managersPaged.pageItems.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.is_active ? "так" : "ні"}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="input"
                        value={m.default_channel_id ?? ""}
                        disabled={busy}
                        onChange={(e) => setManagerChannel(m.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.id}>{c.code}</option>
                        ))}
                      </select>
                    ) : (
                      channels.find((c) => c.id === m.default_channel_id)?.code ?? "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={managerPage} pageCount={managersPaged.pageCount} setPage={setManagerPage} />
      </div>

      <div className="card">
        <h3>Товарні лінії</h3>
        {canEdit && (
          <form onSubmit={addLine} className="toolbar">
            <input className="input" placeholder="Назва лінії" value={newLine} onChange={(e) => setNewLine(e.target.value)} />
            <button className="btn" disabled={busy}>Додати</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Назва</th><th>За замовч.</th></tr></thead>
            <tbody>
              {linesPaged.pageItems.map((pl) => (
                <tr key={pl.id}><td>{pl.name}</td><td>{pl.is_default ? "так" : ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={linePage} pageCount={linesPaged.pageCount} setPage={setLinePage} />
      </div>

      <div className="card">
        <h3>Типи коробок</h3>
        {canEdit && (
          <form onSubmit={addBoxType} className="form-grid" style={{ alignItems: "end" }}>
            <label>Код<input className="input" value={newBox.code} onChange={(e) => setNewBox((b) => ({ ...b, code: e.target.value }))} /></label>
            <label>Назва<input className="input" value={newBox.name} onChange={(e) => setNewBox((b) => ({ ...b, name: e.target.value }))} /></label>
            <label>Вага, кг<input className="input" type="number" step="0.01" value={newBox.weight_kg} onChange={(e) => setNewBox((b) => ({ ...b, weight_kg: e.target.value }))} /></label>
            <button className="btn" disabled={busy}>Додати</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Код</th><th>Назва</th><th>Вага, кг</th></tr></thead>
            <tbody>
              {boxesPaged.pageItems.map((bt) => (
                <tr key={bt.id}><td>{bt.code}</td><td>{bt.name}</td><td>{bt.weight_kg ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={boxPage} pageCount={boxesPaged.pageCount} setPage={setBoxPage} />
      </div>

      <div className="card">
        <h3>Матеріали</h3>
        {canEdit && (
          <form onSubmit={addMaterial} className="form-grid" style={{ alignItems: "end" }}>
            <label>Код<input className="input" value={newMaterial.code} onChange={(e) => setNewMaterial((m) => ({ ...m, code: e.target.value }))} /></label>
            <label>Назва<input className="input" value={newMaterial.name} onChange={(e) => setNewMaterial((m) => ({ ...m, name: e.target.value }))} /></label>
            <label>Одиниця<input className="input" placeholder="шт / м / кг" value={newMaterial.unit} onChange={(e) => setNewMaterial((m) => ({ ...m, unit: e.target.value }))} /></label>
            <button className="btn" disabled={busy}>Додати</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Код</th><th>Назва</th><th>Одиниця</th></tr></thead>
            <tbody>
              {materialsPaged.pageItems.map((m) => (
                <tr key={m.id}><td>{m.code}</td><td>{m.name}</td><td>{m.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={materialPage} pageCount={materialsPaged.pageCount} setPage={setMaterialPage} />
      </div>
    </div>
  );
}
