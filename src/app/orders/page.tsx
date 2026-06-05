'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrderGroup } from '@/types';
import { Pagination } from '../_components/Pagination';

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [qCode, setQCode] = useState('');
  const [qName, setQName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [applied, setApplied] = useState({ qCode: '', qName: '', dateFrom: '', dateTo: '' });

  const [groups, setGroups] = useState<OrderGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      setGroups(d.groups || []);
      setTotal(d.total ?? 0);
    } catch (e: any) {
      setError(e.message || '查询失败');
      setGroups([]);
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

  const toggle = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  return <OrdersView {...{ qCode, setQCode, qName, setQName, dateFrom, setDateFrom, dateTo, setDateTo, search, reset, groups, total, page, setPage, loading, error, expanded, toggle }} />;
}

interface ViewProps {
  qCode: string; setQCode: (v: string) => void;
  qName: string; setQName: (v: string) => void;
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  search: () => void; reset: () => void;
  groups: OrderGroup[];
  total: number; page: number; setPage: (p: number) => void;
  loading: boolean; error: string;
  expanded: Set<string>; toggle: (code: string) => void;
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
              <button className="btn btn-primary" onClick={p.search}>查询</button>
              <button className="btn btn-default" onClick={p.reset}>重置</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {p.error && (
              <div className="tag tag-error" style={{ margin: 16, display: 'block', padding: '10px 14px' }}>{p.error}</div>
            )}
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th style={{ width: 56 }}>#</th>
                    <th>外部编码</th>
                    <th>收货门店</th>
                    <th>收件人</th>
                    <th>电话</th>
                    <th style={{ minWidth: 180 }}>收货地址</th>
                    <th style={{ width: 60 }}>SKU数</th>
                    <th style={{ width: 160 }}>提交时间</th>
                  </tr>
                </thead>
                <tbody>
                  {p.groups.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-placeholder)' }}>
                      {p.loading ? '加载中…' : '暂无数据'}
                    </td></tr>
                  ) : p.groups.map((g, i) => (
                    <GroupRow key={g.外部编码 || i} group={g} idx={i} page={p.page} expanded={p.expanded.has(g.外部编码)} onToggle={() => p.toggle(g.外部编码)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={p.page} pageSize={PAGE_SIZE} total={p.total} onChange={p.setPage} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function GroupRow({ group: g, idx, page, expanded, onToggle }: { group: OrderGroup; idx: number; page: number; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr style={{ cursor: 'pointer', borderBottom: expanded ? 'none' : undefined }} onClick={onToggle}>
        <td style={{ textAlign: 'center', color: 'var(--color-text-placeholder)', fontSize: 12 }}>
          {expanded ? '▼' : '▶'}
        </td>
        <td style={{ color: 'var(--color-text-secondary)' }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
        <td style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{g.外部编码 || ''}</td>
        <td>{g.收货门店 || ''}</td>
        <td>{g.收件人姓名 || ''}</td>
        <td>{g.收件人电话 || ''}</td>
        <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{g.收件人地址 || ''}</td>
        <td><span className="tag tag-info">{g.sku_count}</span></td>
        <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
          {g.created_at ? new Date(g.created_at).toLocaleString('zh-CN') : ''}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--color-border-light)' }}>
            <div style={{ padding: '0 16px 0 92px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-th)' }}>
                    <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid var(--color-border-light)', fontWeight: 600 }}>SKU编码</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid var(--color-border-light)', fontWeight: 600 }}>SKU名称</th>
                    <th style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid var(--color-border-light)', fontWeight: 600 }}>数量</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left', borderBottom: '1px solid var(--color-border-light)', fontWeight: 600 }}>规格</th>
                  </tr>
                </thead>
                <tbody>
                  {(g.sku_items || []).map((sku, si) => (
                    <tr key={si}>
                      <td style={{ padding: '5px 12px', borderBottom: '1px solid #f5f5f5' }}>{sku.sku_code || ''}</td>
                      <td style={{ padding: '5px 12px', borderBottom: '1px solid #f5f5f5' }}>{sku.sku_name || ''}</td>
                      <td style={{ padding: '5px 12px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>{sku.sku_quantity ?? ''}</td>
                      <td style={{ padding: '5px 12px', borderBottom: '1px solid #f5f5f5', color: 'var(--color-text-secondary)' }}>{sku.sku_spec || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
