import { useEffect, useState } from "react";
import { api } from "../api";
import type { BoxPriceCurrent, MaterialPriceCurrent, NpTariff } from "../types";
import { useReferenceData } from "../useReferenceData";
import { useAuth } from "../AuthContext";

export default function Prices() {
  const { boxTypes, materials, loading: refLoading } = useReferenceData();
  const { user } = useAuth();
  const canEdit = user?.role === "owner" || user?.role === "editor";

  const [boxPrices, setBoxPrices] = useState<BoxPriceCurrent[]>([]);
  const [materialPrices, setMaterialPrices] = useState<MaterialPriceCurrent[]>([]);
  const [npTariffs, setNpTariffs] = useState<NpTariff[]>([]);
  const [busy, setBusy] = useState(false);

  const [boxForm, setBoxForm] = useState({ box_type_id: "", price: "", valid_from: "" });
  const [matForm, setMatForm] = useState({ material_id: "", price: "", valid_from: "" });
  const [npForm, setNpForm] = useState({ weight_from: "", weight_to: "", price: "", valid_from: "" });

  async function loadAll() {
    const [bp, mp, np] = await Promise.all([
      api.get<BoxPriceCurrent[]>("/box-prices/current"),
      api.get<MaterialPriceCurrent[]>("/material-prices/current"),
      api.get<NpTariff[]>("/np-tariffs"),
    ]);
    setBoxPrices(bp);
    setMaterialPrices(mp);
    setNpTariffs(np);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addBoxPrice(e: React.FormEvent) {
    e.preventDefault();
    if (!boxForm.box_type_id || !boxForm.price || !boxForm.valid_from) return;
    setBusy(true);
    try {
      await api.post("/box-prices", {
        box_type_id: Number(boxForm.box_type_id),
        price: Number(boxForm.price),
        valid_from: boxForm.valid_from,
      });
      setBoxForm({ box_type_id: "", price: "", valid_from: "" });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function addMaterialPrice(e: React.FormEvent) {
    e.preventDefault();
    if (!matForm.material_id || !matForm.price || !matForm.valid_from) return;
    setBusy(true);
    try {
      await api.post("/material-prices", {
        material_id: Number(matForm.material_id),
        price: Number(matForm.price),
        valid_from: matForm.valid_from,
      });
      setMatForm({ material_id: "", price: "", valid_from: "" });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function addNpTariff(e: React.FormEvent) {
    e.preventDefault();
    if (!npForm.weight_from || !npForm.weight_to || !npForm.price || !npForm.valid_from) return;
    setBusy(true);
    try {
      await api.post("/np-tariffs", {
        weight_from: Number(npForm.weight_from),
        weight_to: Number(npForm.weight_to),
        price: Number(npForm.price),
        valid_from: npForm.valid_from,
      });
      setNpForm({ weight_from: "", weight_to: "", price: "", valid_from: "" });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  if (refLoading) return <p>Завантаження…</p>;

  return (
    <div>
      <h2>Ціни</h2>

      <div className="card">
        <h3>Ціни на коробки (чинні)</h3>
        {canEdit && (
          <form onSubmit={addBoxPrice} className="form-grid" style={{ alignItems: "end" }}>
            <label>
              Тип коробки
              <select className="input" value={boxForm.box_type_id} onChange={(e) => setBoxForm((f) => ({ ...f, box_type_id: e.target.value }))}>
                <option value="">—</option>
                {boxTypes.map((bt) => (
                  <option key={bt.id} value={bt.id}>{bt.name}</option>
                ))}
              </select>
            </label>
            <label>Ціна, грн<input className="input" type="number" step="0.01" value={boxForm.price} onChange={(e) => setBoxForm((f) => ({ ...f, price: e.target.value }))} /></label>
            <label>Діє з<input className="input" type="date" value={boxForm.valid_from} onChange={(e) => setBoxForm((f) => ({ ...f, valid_from: e.target.value }))} /></label>
            <button className="btn" disabled={busy}>Додати ціну</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Коробка</th><th>Ціна, грн</th><th>Діє з</th></tr></thead>
            <tbody>
              {boxPrices.map((bp) => (
                <tr key={bp.box_type_id}>
                  <td>{bp.name}</td>
                  <td>{bp.price ?? "не задана"}</td>
                  <td>{bp.valid_from ? bp.valid_from.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Ціни на матеріали (чинні)</h3>
        {canEdit && (
          <form onSubmit={addMaterialPrice} className="form-grid" style={{ alignItems: "end" }}>
            <label>
              Матеріал
              <select className="input" value={matForm.material_id} onChange={(e) => setMatForm((f) => ({ ...f, material_id: e.target.value }))}>
                <option value="">—</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <label>Ціна, грн<input className="input" type="number" step="0.01" value={matForm.price} onChange={(e) => setMatForm((f) => ({ ...f, price: e.target.value }))} /></label>
            <label>Діє з<input className="input" type="date" value={matForm.valid_from} onChange={(e) => setMatForm((f) => ({ ...f, valid_from: e.target.value }))} /></label>
            <button className="btn" disabled={busy}>Додати ціну</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Матеріал</th><th>Одиниця</th><th>Ціна, грн</th><th>Діє з</th></tr></thead>
            <tbody>
              {materialPrices.map((mp) => (
                <tr key={mp.material_id}>
                  <td>{mp.name}</td>
                  <td>{mp.unit}</td>
                  <td>{mp.price ?? "не задана"}</td>
                  <td>{mp.valid_from ? mp.valid_from.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Тарифи Нової Пошти</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Використовуються для розрахунку економії: вага типу коробки має потрапляти в діапазон (з, по].
        </p>
        {canEdit && (
          <form onSubmit={addNpTariff} className="form-grid" style={{ alignItems: "end" }}>
            <label>Вага від, кг<input className="input" type="number" step="0.01" value={npForm.weight_from} onChange={(e) => setNpForm((f) => ({ ...f, weight_from: e.target.value }))} /></label>
            <label>Вага до, кг<input className="input" type="number" step="0.01" value={npForm.weight_to} onChange={(e) => setNpForm((f) => ({ ...f, weight_to: e.target.value }))} /></label>
            <label>Тариф, грн<input className="input" type="number" step="0.01" value={npForm.price} onChange={(e) => setNpForm((f) => ({ ...f, price: e.target.value }))} /></label>
            <label>Діє з<input className="input" type="date" value={npForm.valid_from} onChange={(e) => setNpForm((f) => ({ ...f, valid_from: e.target.value }))} /></label>
            <button className="btn" disabled={busy}>Додати тариф</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Вага від</th><th>Вага до</th><th>Тариф, грн</th><th>Діє з</th></tr></thead>
            <tbody>
              {npTariffs.map((t) => (
                <tr key={t.id}>
                  <td>{t.weight_from}</td>
                  <td>{t.weight_to}</td>
                  <td>{t.price}</td>
                  <td>{t.valid_from.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
