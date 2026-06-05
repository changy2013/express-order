'use client';

import { List, type RowComponentProps } from 'react-window';
import type { OrderRow } from '@/types';
import type { ViewState, ViewActions, TargetKey } from './PageView';

const COLUMNS: { key: TargetKey; label: string; width: number; required?: boolean }[] = [
  { key: '外部编码', label: '外部编码', width: 130 },
  { key: '收货门店', label: '收货门店', width: 180 },
  { key: '收件人姓名', label: '收件人', width: 90 },
  { key: '收件人电话', label: '电话', width: 120 },
  { key: '收件人地址', label: '收货地址', width: 240 },
  { key: 'SKU物品编码', label: 'SKU编码', width: 120, required: true },
  { key: 'SKU物品名称', label: 'SKU名称', width: 220, required: true },
  { key: 'SKU发货数量', label: '数量', width: 80, required: true },
  { key: 'SKU规格型号', label: '规格型号', width: 140 },
  { key: '备注', label: '备注', width: 140 },
];

const ROW_HEIGHT = 40;
const ACTION_W = 60;
const INNER_WIDTH = COLUMNS.reduce((s, c) => s + c.width, 0) + ACTION_W;

interface RowData {
  rows: OrderRow[];
  updateCell: (id: string, key: TargetKey, value: string) => void;
  deleteRow: (id: string) => void;
}

function RowRenderer({ index, style, rows, updateCell, deleteRow }: RowComponentProps<RowData>) {
  const row = rows[index];
  const hasError = !!(row._errors && row._errors.length);
  const bg = hasError ? 'var(--color-error-bg)' : row._isDuplicate ? 'var(--color-warning-bg)' : index % 2 ? 'var(--color-bg-base)' : 'transparent';

  return (
    <div style={{ ...style, display: 'flex', width: INNER_WIDTH, background: bg, borderBottom: '1px solid var(--color-border)' }}>
      {COLUMNS.map((c) => (
        <div key={c.key} style={{ width: c.width, padding: '0 4px', display: 'flex', alignItems: 'center' }}>
          <input
            value={c.key === 'SKU发货数量' ? String(row.SKU发货数量 ?? '') : ((row[c.key] as string) ?? '')}
            onChange={(e) => updateCell(row._id!, c.key, e.target.value)}
            type={c.key === 'SKU发货数量' ? 'number' : 'text'}
            style={{
              width: '100%', height: 30, border: '1px solid transparent', borderRadius: 4,
              padding: '0 6px', fontSize: 13, background: 'transparent', color: 'var(--color-text-main)',
              outline: 'none',
            }}
            onFocus={(e) => { e.target.style.border = '1px solid var(--color-primary)'; e.target.style.background = '#fff'; }}
            onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
          />
        </div>
      ))}
      <div style={{ width: ACTION_W, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button className="btn-icon" title="删除" onClick={() => deleteRow(row._id!)}
          style={{ color: 'var(--color-error)' }}>✕</button>
      </div>
    </div>
  );
}

export function PreviewStep({ state, actions }: { state: ViewState; actions: ViewActions }) {
  const { rows, warnings, errorCount, dupCount, submitting } = state;
  const validCount = rows.length - errorCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 统计 */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <Stat icon="📦" label="解析总数" value={rows.length} />
        <Stat icon="✅" label="有效" value={validCount} color="var(--color-success)" />
        <Stat icon="⚠️" label="错误" value={errorCount} color="var(--color-error)" />
        <Stat icon="🔁" label="疑似重复" value={dupCount} color="var(--color-warning)" />
      </div>

      {warnings.length > 0 && (
        <div className="tag tag-warning" style={{ padding: '10px 14px', display: 'block' }}>
          {warnings.map((w, i) => <div key={i}>· {w}</div>)}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">数据预览（可直接编辑单元格）</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-default" onClick={actions.exportExcel}>⬇ 导出 Excel</button>
            <button className="btn btn-primary" disabled={submitting || validCount === 0} onClick={actions.submitOrders}>
              {submitting ? <><span className="spinner" /> 提交中…</> : `提交入库（${validCount}）`}
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            {/* 表头 */}
            <div style={{ display: 'flex', width: INNER_WIDTH, background: 'var(--color-bg-header)', borderBottom: '2px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>
              {COLUMNS.map((c) => (
                <div key={c.key} style={{ width: c.width, padding: '10px 8px', color: 'var(--color-text-main)' }}>
                  {c.label}{c.required && <span style={{ color: 'var(--color-error)' }}> *</span>}
                </div>
              ))}
              <div style={{ width: ACTION_W, padding: '10px 8px', textAlign: 'center' }}>操作</div>
            </div>
            {/* 虚拟列表 */}
            {rows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>无数据</div>
            ) : (
              <List
                style={{ height: Math.min(560, rows.length * ROW_HEIGHT + 4), width: INNER_WIDTH }}
                rowCount={rows.length}
                rowHeight={ROW_HEIGHT}
                rowComponent={RowRenderer}
                rowProps={{ rows, updateCell: actions.updateCell, deleteRow: actions.deleteRow } as RowData}
              />
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-default" onClick={() => actions.setStep('rule')}>← 返回规则</button>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
          {errorCount > 0 ? `有 ${errorCount} 条数据存在错误，提交时将自动跳过` : '全部数据校验通过'}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
