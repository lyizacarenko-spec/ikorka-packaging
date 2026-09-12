import { useEffect, useState } from "react";
import { api } from "../api";
import type { MonthlySummary, AnnualSummary } from "../types";
import { Pager, paginate } from "../Pager";

function fmtMonth(m: string) {
  const d = new Date(m);
  return d.toLocaleDateString("uk-UA", { year: "numeric", month: "long" });
}
function fmtYear(y: string) {
  return new Date(y).getFullYear();
}

export default function Reports() {
  const [tab, setTab] = useState<"monthly" | "annual">("monthly");
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    Promise.all([api.get<MonthlySummary[]>("/reports/monthly"), api.get<AnnualSummary[]>("/reports/annual")]).then(
      ([m, a]) => {
        setMonthly(m);
        setAnnual(a);
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <p>Завантаження…</p>;

  const rows: (MonthlySummary | AnnualSummary)[] = tab === "monthly" ? monthly : annual;
  const totalSavings = rows.reduce((s, r) => s + Number(r.savings_uah || 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.packaging_cost_uah || 0), 0);
  const { pageCount, pageItems: pagedRows } = paginate(rows, page, PAGE_SIZE);

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
      </div>

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
    </div>
  );
}
