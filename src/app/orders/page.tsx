'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SubmittedOrder } from '@/types';
import { Pagination } from '../_components/Pagination';

const COLUMNS: { key: keyof SubmittedOrder; label: string; width?: number }[] = [
  { key: '外部编码', label: '外部编码' },
  { key: '收货门店', label: '收货门店' },
  { key: '收件人姓名', label: '收件人' },
  { key: '收件人电话', label: '电话' },
  { key: '收件人地址', label: '收货地址', width: 220 },
  { key: 'sku_编码', label: 'SKU编码' },
  { key: 'sku_名称', label: 'SKU名称', width: 180 },
  { key: 'sku_数量', label: '数量' },
  { key: 'sku_规格', label: '规格' },
  { key: '备注', label: '备注' },
];

const PAGE_SIZE = 20;

/** DB 列（英文蛇形）→ 展示用对象。后端返回原始 outbound_orders 行。 */
function mapRow(raw: any): Record<string, any> {
  return {
    外部编码: raw.external_code ?? '',
    收货门店: raw.store_name ?? '',
    收件人姓名: raw.receiver_name ?? '',
    收件人电话: raw.receiver_phone ?? '',
    收件人地址: raw.receiver_address ?? '',
    sku_编码: raw.sku_code ?? '',
    sku_名称: raw.sku_name ?? '',
    sku_数量: raw.sku_quantity ?? '',
    sku_规格: raw.sku_spec ?? '',
    备注: raw.remark ?? '',
    created_at: raw.created_at,
  };
}

export default function OrdersPage() {
  // 筛选输入（受控）与「已应用」的筛选条件分离：点查询才提交
  const [qCode, setQCode] = useState('');
  const [qName, setQName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [applied, setApplied] = useState({ qCode: '', qName: '', dateFrom: '', dateTo: '' });

  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      if (applied.qCode) sp.set('q_code', applied.qCode);
      if (applied.qName) sp.set('q_name', applied.qName);
      if (applied.dateFrom) sp.set('date_from', applied.dateFrom);
      if (applied.dateTo) sp.set('date_to', applied.dateTo);
      sp.set('page', String(page));
      sp.set('pageSize', String(PAGE_SIZE));
      const r = await fetch(`/api/orders?${sp.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '查询失败');
      setRows((d.orders || []).map(mapRow));
      setTotal(d.total ?? 0);
    } catch (e: any) {
      setError(e.message || '查询失败');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const search = () => {
    setApplied({ qCode: qCode.trim(), qName: qName.trim(), dateFrom, dateTo });
    setPage(1);
  };
  const reset = () => {
    setQCode(''); setQName(''); setDateFrom(''); setDateTo('');
    setApplied({ qCode: '', qName: '', dateFrom: '', dateTo: '' });
    setPage(1);
  };

  return <OrdersView {...{ qCode, setQCode, qName, setQName, dateFrom, setDateFrom, dateTo, setDateTo, search, reset, rows, total, page, setPage, loading, error }} />;
}

interface ViewProps {
  qCode: string; setQCode: (v: string) => void;
  qName: string; setQName: (v: string) => void;
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  search: () => void; reset: () => void;
  rows: Record<string, any>[];
  total: number; page: number; setPage: (p: number) => void;
  loading: boolean; error: string;
}

function OrdersView(p: ViewProps) {
  return (
    <div className="app-container" style={{ display: 'block' }}>
      <main className="main-content">
        <div>
          <div className="logo-text">已导入运单列表</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            查看全部历史运单，支持按外部编码、收件人、提交时间筛选
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="card">
          <div className="card-body">
            <div className="filter-bar">
              <div className="form-group">
                <label className="form-label">外部编码</label>
                <input className="form-input" placeholder="模糊匹配" value={p.qCode}
                  onChange={(e) => p.setQCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && p.search()} />
              </div>
              <div className="form-group">
                <label className="form-label">收件人姓名</label>
                <input className="form-input" placeholder="模糊匹配" value={p.qName}
                  onChange={(e) => p.setQName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && p.search()} />
              </div>
              <div className="form-group">
                <label className="form-label">提交开始日期</label>
                <input className="form-input" type="date" value={p.dateFrom}
                  onChange={(e) => p.setDateFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">提交结束日期</label>
                <input className="form-input" type="date" value={p.dateTo}
                  onChange={(e) => p.setDateTo(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={p.search}>🔍 查询</button>
              <button className="btn btn-default" onClick={p.reset}>重置</button>
            </div>
          </div>
        </div>

        {/* 结果表 */}
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {p.error && (
              <div className="tag tag-error" style={{ margin: 16, display: 'block', padding: '10px 14px' }}>{p.error}</div>
            )}
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>#</th>
                    {COLUMNS.map((c) => <th key={String(c.key)} style={c.width ? { minWidth: c.width } : undefined}>{c.label}</th>)}
                    <th style={{ width: 160 }}>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.length === 0 ? (
                    <tr><td colSpan={COLUMNS.length + 2} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-placeholder)' }}>
                      {p.loading ? '加载中…' : '暂无数据'}
                    </td></tr>
                  ) : p.rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{(p.page - 1) * 20 + i + 1}</td>
                      {COLUMNS.map((c) => <td key={String(c.key)}>{String(row[c.key as string] ?? '')}</td>)}
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                        {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={p.page} pageSize={20} total={p.total} onChange={p.setPage} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
