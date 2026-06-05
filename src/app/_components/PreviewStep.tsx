'use client';

import { useMemo, useRef } from 'react';
import { List, type RowComponentProps, type ListImperativeAPI } from 'react-window';
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
  const errFields = new Set((row._errors || []).map((e) => e.field));
  const hasError = errFields.size > 0;
  // 行底色优先级：错误 > 与已入库重复 > 同批次重复 > 斑马纹
  const bg = hasError
    ? 'var(--color-error-bg)'
    : row._duplicateWithBatch
      ? 'rgba(255,77,79,0.08)'
      : row._isDuplicate
        ? 'var(--color-warning-bg)'
        : index % 2 ? 'var(--color-bg-base)' : 'transparent';

  return (
    <div style={{ ...style, display: 'flex', width: INNER_WIDTH, background: bg, borderBottom: '1px solid var(--color-border)' }}>
      {COLUMNS.map((c) => {
        const cellErr = errFields.has(c.key);
        const val = c.key === 'SKU发货数量'
          ? String(row.SKU发货数量 ?? '')
          : ((row[c.key] as string) ?? '');
        return (
          <div key={c.key} style={{ width: c.width, padding: '0 4px', display: 'flex', alignItems: 'center' }}>
            <input
              value={val}
              onChange={(e) => updateCell(row._id!, c.key, e.target.value)}
              type={c.key === 'SKU发货数量' ? 'number' : 'text'}
              title={cellErr ? (row._errors || []).find((e) => e.field === c.key)?.message : undefined}
              style={{
                width: '100%', height: 30, borderRadius: 4, padding: '0 6px', fontSize: 13,
                color: cellErr ? 'var(--color-error)' : 'var(--color-text-main)', outline: 'none',
                border: cellErr ? '1px solid var(--color-error)' : '1px solid transparent',
                background: cellErr ? 'var(--color-error-bg)' : 'transparent',
                fontWeight: cellErr ? 600 : 400,
              }}
              onFocus={(e) => { e.target.style.border = '1px solid var(--color-primary)'; e.target.style.background = '#fff'; }}
              onBlur={(e) => {
                e.target.style.border = cellErr ? '1px solid var(--color-error)' : '1px solid transparent';
                e.target.style.background = cellErr ? 'var(--color-error-bg)' : 'transparent';
              }}
            />
          </div>
        );
      })}
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
  const listRef = useRef<ListImperativeAPI>(null);

  // 全部错误一次性汇总：逐条「第N行 · 字段 · 原因」，点击定位到对应行
  const errorList = useMemo(() => {
    const out: { rowNo: number; index: number; field: string; message: string }[] = [];
    rows.forEach((r, i) => {
      (r._errors || []).forEach((e) => out.push({ rowNo: i + 1, index: i, field: e.field, message: e.message }));
    });
    return out;
  }, [rows]);

  const dupWithExistingCount = useMemo(() => rows.filter((r) => r._duplicateWithBatch).length, [rows]);
  const dupInBatchCount = useMemo(() => rows.filter((r) => r._isDuplicate).length, [rows]);

  const jumpToRow = (index: number) => listRef.current?.scrollToRow({ index, align: 'center', behavior: 'smooth' });

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

      {/* 全部错误一次性展示：行号 + 字段名 + 原因，点击定位 */}
      {errorList.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--color-error-border)' }}>
          <div className="card-header" style={{ background: 'var(--color-error-bg)' }}>
            <div className="card-title" style={{ color: 'var(--color-error)' }}>
              校验未通过：共 {errorList.length} 处错误，分布在 {errorCount} 行（点击可定位）
            </div>
          </div>
          <div className="card-body" style={{ maxHeight: 180, overflowY: 'auto', padding: '8px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {errorList.map((e, i) => (
                <button key={i} onClick={() => jumpToRow(e.index)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left',
                    padding: '6px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 13, color: 'var(--color-text-main)',
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--color-bg-base)')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}>
                  <span style={{ color: 'var(--color-error)', fontWeight: 600, minWidth: 56 }}>第 {e.rowNo} 行</span>
                  <span className="tag tag-error" style={{ fontSize: 12 }}>{e.field}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{e.message}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 重复检测图例 */}
      {(dupInBatchCount > 0 || dupWithExistingCount > 0) && (
        <div style={{ display: 'flex', gap: 16, fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>外部编码重复：</span>
          {dupInBatchCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)' }} />
              同批次内重复 {dupInBatchCount} 行
            </span>
          )}
          {dupWithExistingCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(255,77,79,0.08)', border: '1px solid var(--color-error)' }} />
              与已入库数据重复 {dupWithExistingCount} 行
            </span>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">数据预览（可直接编辑单元格）</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-default" onClick={actions.addRow}>＋ 新增空行</button>
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
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-placeholder)' }}>
                无数据，点「＋ 新增空行」手动录入
              </div>
            ) : (
              <List
                listRef={listRef}
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
