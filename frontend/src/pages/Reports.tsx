import { useEffect, useState } from "react";
import { api } from "../api";
import type { MonthlySummary, AnnualSummary, PackagingCostPerOrder, BoxUsageMonthly } from "../types";
import { Pager, paginate } from "../Pager";

function fmtMonth(m: string) {
  const d = new Date(m);
  return d.toLocaleDateString("uk-UA", { year: "numeric", month: "long" });
}
function fmtYear(y: string) {
  return new Date(y).getFullYear();
}

export default function Reports() {
  const [tab, setTab] = useState<"monthly" | "annual" | "cost-per-order" | "box-usage">("monthly");
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [annual, setAnnual] = useState<AnnualSummary[]>([]);
  const [costPerOrder, setCostPerOrder] = useState<PackagingCostPerOrder[]>([]);
  const [boxUsage, setBoxUsage] = useState<BoxUsageMonthly[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    Promise.all([
      api.get<MonthlySummary[]>("/reports/monthly"),
      api.get<AnnualSummary[]>("/reports/annual"),
      api.get<PackagingCostPerOrder[]>("/reports/packaging-cost-per-order"),
      api.get<BoxUsageMonthly[]>("/reports/box-usage-monthly"),
    ]).then(([m, a, c, b]) => {
      setMonthly(m);
      setAnnual(a);
      setCostPerOrder(c);
      setBoxUsage(b);
      setLoading(false);
    });
  }, []);

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
    </div>
  );
}
