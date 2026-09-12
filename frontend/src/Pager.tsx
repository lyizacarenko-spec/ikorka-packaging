/** Просте перемикання сторінок для довгих таблиць. Показується тільки коли сторінок більше однієї. */
export function Pager({ page, pageCount, setPage }: { page: number; pageCount: number; setPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="toolbar" style={{ justifyContent: "center", marginTop: 12 }}>
      <button className="btn secondary" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        ← Назад
      </button>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Сторінка {page} з {pageCount}
      </span>
      <button className="btn secondary" type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
        Вперед →
      </button>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), pageCount);
  const start = (clampedPage - 1) * pageSize;
  return { pageCount, pageItems: items.slice(start, start + pageSize) };
}
