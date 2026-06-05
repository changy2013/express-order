'use client';

/** 受控分页器：总数 + 上一页/下一页 + 当前页/总页数 */
export function Pagination({
  page, pageSize, total, onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="pagination">
      <span>共 {total} 条，第 {from}–{to} 条</span>
      <div className="pagination-controls">
        <button className="btn btn-default" disabled={page <= 1} onClick={() => onChange(page - 1)}>← 上一页</button>
        <span style={{ minWidth: 70, textAlign: 'center' }}>{page} / {totalPages}</span>
        <button className="btn btn-default" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页 →</button>
      </div>
    </div>
  );
}
