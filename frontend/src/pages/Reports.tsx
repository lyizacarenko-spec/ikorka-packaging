import { useEffect, useState } from "react";
import { api } from "../api";
import type { MonthlySummary, AnnualSummary, PackagingCostPerOrder, BoxUsageMonthly, ProcurementForecast } from "../types";
import { Pager, paginate } from "../Pager";

function fmtMonth(m: string) {
  const d = new Date(m);
  return d.toLocaleDateString("uk-UA", { year: "numeric", month: "long" });
}
function fmtYear(y: string) {
  return new Date(y).getFullYear();
}

export default function Reports() {
  const [tab, setTab] = useState<"monthly" | "annual" | "cost-per-order" | "box-usage" | "forecast">("monthly");
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary[]>([]);
  const [costPerOrder, setCostPerOrder] = useState<PackagingCostPerOrder[]>([]);
  const [boxUsage, setBoxUsage] = useState<BoxUsageMonthly[]>([]);
  const [forecast, setForecast] = useState<ProcurementForecast | null>(null);
  const [forecastMonth, setForecastMonth] = useState<string>("");
  const [forecastLoading, setForecastLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    Promise.all([
      api.get<MonthlySummary[]>("/reports/monthly"),
      api.get<AnnualSummary[]>("/reports/annual"),
      api.get<PackagingCostPerOrder[]>("/reports/packaging-cost-per-order"),
      api.get<BoxUsageMonthly[]>("/reports/box-usage-monthly"),
      api.get<ProcurementForecast>("/reports/procurement-forecast"),
    ]).then(([m, a, c, b, f]) => {
      setMonthly(m);
      setAnnual(a);
      setCostPerOrder(c);
      setBoxUsage(b);
      setForecast(f);
      setForecastMonth(f.target_month);
      setLoading(false);
    });
  }, []);

  async function loadForecast(month: string) {
    setForecastLoading(true);
    try {
      const f = await api.get<ProcurementForecast>(`/reports/procurement-forecast?month=${month}`);
      setForecast(f);
    } finally {
      setForecastLoading(false);
    }
  }

  if (loading) return <p>Завантаження…</p>;

  const rows: (MonthlySummary | AnnualSummary)[] = tab === "monthly" ? monthly : tab === "annual" ? annual : [];
  const totalSavings = rows.reduce((s, r) => s + Number(r.savings_uah || 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.packaging_cost_uah || 0), 0);
  const { pageCount, pageItems: pagedRows } = paginate(rows, page, PAGE_SIZE);

  // Розхід коробок по типах зводимо в таблицю місяць × тип коробки
  const boxTypeNames = Array.from(new Set(boxUsage.map((r) => r.box_type_name)));
  const boxMonths = Array.from(new Set(boxUsage.map((r) => r.month))).sort();
  const boxGrid: Record<string, Record<string, number>> = {};
  for (const r of boxUsage) {
    boxGrid[r.month] = boxGrid[r.month] || {};
    boxGrid[r.month][r.box_type_name] = Number(r.qty);
  }

  return (
    <div>
      <h2>Звіти</h2>

      <div className="toolbar">
        <button className={`btn ${tab === "monthly" ? "" : "secondary"}`} onClick={() => { setTab("monthly"); setPage(1); }}>
          Місячний
        </button>
        <button className={`btn ${tab === "annual" ? "" : "secondary"}`} onClick={() => { setTab("annual"); setPage(1); }}>
          Річний
        </button>
        <button className={`btn ${tab === "cost-per-order" ? "" : "secondary"}`} onClick={() => setTab("cost-per-order")}>
          Собівартість на 1 замовлення
        </button>
        <button className={`btn ${tab === "box-usage" ? "" : "secondary"}`} onClick={() => setTab("box-usage")}>
          Коробки по типах
        </button>
        <button className={`btn ${tab === "forecast" ? "" : "secondary"}`} onClick={() => setTab("forecast")}>
          Прогноз закупівлі
        </button>
      </div>

      {(tab === "monthly" || tab === "annual") && (
        <>
          <div className="card" style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Собівартість упаковки, грн</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{totalCost.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Економія проти Нової Пошти, грн</div>
              <div className={totalSavings >= 0 ? "positive" : "negative"} style={{ fontSize: 22 }}>
                {totalSavings.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tab === "monthly" ? "Місяць" : "Рік"}</th>
                    <th>Сегмент</th>
                    <th>Лінія</th>
                    <th>Відправлено</th>
                    <th>Сума, грн</th>
                    <th>% повернень</th>
                    <th>% утилю з повернень</th>
                    <th>Собівартість упак., грн</th>
                    <th>Економія, грн</th>
                  </tr>
                </thead>
                <tbody>
                  {tab === "monthly"
                    ? (pagedRows as MonthlySummary[]).map((r, i) => (
                        <tr key={i}>
                          <td>{fmtMonth(r.month)}</td>
                          <td>{r.channel}</td>
                          <td>{r.product_line}</td>
                          <td>{r.qty_shipped}</td>
                          <td>{r.amount_uah}</td>
                          <td>{r.pct_returns ?? "—"}%</td>
                          <td>{r.pct_damaged_of_returns ?? "—"}%</td>
                          <td>{r.packaging_cost_uah}</td>
                          <td className={Number(r.savings_uah) >= 0 ? "positive" : "negative"}>{r.savings_uah}</td>
                        </tr>
                      ))
                    : (pagedRows as AnnualSummary[]).map((r, i) => (
                        <tr key={i}>
                          <td>{fmtYear(r.year)}</td>
                          <td>{r.channel}</td>
                          <td>{r.product_line}</td>
                          <td>{r.qty_shipped}</td>
                          <td>{r.amount_uah}</td>
                          <td>{r.pct_returns ?? "—"}%</td>
                          <td>{r.pct_damaged_of_returns ?? "—"}%</td>
                          <td>{r.packaging_cost_uah}</td>
                          <td className={Number(r.savings_uah) >= 0 ? "positive" : "negative"}>{r.savings_uah}</td>
                        </tr>
                      ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={9} style={{ color: "var(--text-muted)" }}>
                        Ще немає даних — заповніть розділ «Ввід даних».
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageCount={pageCount} setPage={setPage} />
          </div>
        </>
      )}

      {tab === "cost-per-order" && (
        <div className="card">
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Собівартість упаковки по даних «Склад» (щоденний розхід, кожен рух за ціною, що діяла на той день) ÷
            загальна к-сть відправлених замовлень за місяць (по всій компанії — «Склад» поки веде лише Дніпро,
            тож це наближення, доки немає розбивки по філіях).
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Місяць</th>
                  <th>Собівартість упаковки, грн</th>
                  <th>Відправлень (к-сть замовлень)</th>
                  <th>Собівартість на 1 замовлення, грн</th>
                  <th>К-сть без ціни (попередж.)</th>
                </tr>
              </thead>
              <tbody>
                {costPerOrder.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtMonth(r.month)}</td>
                    <td>{r.packaging_cost_uah}</td>
                    <td>{r.qty_shipped}</td>
                    <td>{r.cost_per_order ?? "—"}</td>
                    <td style={{ color: Number(r.qty_without_price) > 0 ? "#b45309" : undefined }}>
                      {Number(r.qty_without_price) > 0 ? `${r.qty_without_price} шт без ціни` : "—"}
                    </td>
                  </tr>
                ))}
                {!costPerOrder.length && (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                      Ще немає рухів «розхід» на сторінці «Склад».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "box-usage" && (
        <div className="card">
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Розхід коробок по типах за відправленими замовленнями (автосинк з Нової Пошти), без б/у коробок.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Місяць</th>
                  {boxTypeNames.map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boxMonths.map((month) => (
                  <tr key={month}>
                    <td>{fmtMonth(month)}</td>
                    {boxTypeNames.map((name) => (
                      <td key={name}>{boxGrid[month]?.[name] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
                {!boxMonths.length && (
                  <tr>
                    <td colSpan={1 + boxTypeNames.length} style={{ color: "var(--text-muted)" }}>
                      Ще немає синхронізованих даних по коробках.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "forecast" && (
        <div className="card">
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Скільки коробок/матеріалів треба докупити на обраний місяць і скільки це коштуватиме — виходячи із
            середнього денного розходу зі «Складу» за весь наявний період, за вирахуванням поточного залишку.
            Чим більше місяців даних у Складі — тим точніший прогноз.
          </p>
          <div className="form-grid" style={{ alignItems: "end", marginBottom: 12, maxWidth: 260 }}>
            <label>
              Місяць прогнозу
              <input
                className="input"
                type="month"
                value={forecastMonth}
                onChange={(e) => {
                  setForecastMonth(e.target.value);
                  loadForecast(e.target.value);
                }}
              />
            </label>
          </div>

          {forecastLoading && <p>Рахую…</p>}

          {forecast && !forecastLoading && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                Днів у місяці: {forecast.days_in_target_month}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
                Разом треба підготувати: {forecast.total_cost_uah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} грн
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Позиція</th>
                      <th>Серед. розхід/день</th>
                      <th>Потреба на місяць</th>
                      <th>Поточний залишок</th>
                      <th>Треба докупити</th>
                      <th>Ціна, грн</th>
                      <th>Сума, грн</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.items.map((it, i) => (
                      <tr key={i} style={{ background: it.price_missing ? "#fff3cd" : undefined }}>
                        <td>{it.name}</td>
                        <td>{it.daily_rate}</td>
                        <td>{it.projected_need}</td>
                        <td>{it.current_balance}</td>
                        <td>{it.to_buy}</td>
                        <td>{it.price_missing ? "немає ціни" : it.price}</td>
                        <td>{it.cost_uah}</td>
                      </tr>
                    ))}
                    {!forecast.items.length && (
                      <tr>
                        <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                          Ще немає рухів «розхід» на сторінці «Склад» — прогнозувати нема з чого.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
