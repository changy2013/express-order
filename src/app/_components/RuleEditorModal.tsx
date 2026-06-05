'use client';

import { useMemo, useState } from 'react';
import type { OrderRow, ParseRule, AIRecommendedRule, FieldMapping, TargetField } from '@/types';
import { MappingRows, getMappings, setMappings } from './RuleEditorMappings';

const TARGET_FIELDS: TargetField[] = [
  '外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址',
  'SKU物品编码', 'SKU物品名称', 'SKU发货数量', 'SKU规格型号', '备注',
];

/**
 * 编辑器工作态：一份规则草稿。
 * - 可选 id：有=编辑已存规则(PUT)，无=新建(POST)
 * - 可选 aiAnalysis：来自 AI 推荐规则时携带，用于高亮推测字段
 * 不强制 createdAt/updatedAt（新建时尚无）。
 */
export type EditorRule = Omit<ParseRule, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  aiAnalysis?: AIRecommendedRule['aiAnalysis'];
};

export interface RuleEditorProps {
  rule: EditorRule;
  file: File | null;
  onClose: () => void;
  onSaved: (saved: ParseRule) => void;
  toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void;
}

export function RuleEditorModal({ rule, file, onClose, onSaved, toast }: RuleEditorProps) {
  const [draft, setDraft] = useState<EditorRule>(() => structuredClone(rule));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRows, setTestRows] = useState<OrderRow[] | null>(null);
  const [testWarnings, setTestWarnings] = useState<string[]>([]);

  const ai = 'aiAnalysis' in draft ? draft.aiAnalysis : undefined;
  const guessed = useMemo<Set<string>>(
    () => new Set(ai?.guessedFields || []),
    [ai],
  );
  const mappings = getMappings(draft);

  const patch = (p: Partial<EditorRule>) => setDraft((d) => ({ ...d, ...p }));

  const updateMappings = (next: FieldMapping[]) => {
    setDraft((d) => setMappings(structuredClone(d), next));
  };

  const setStatic = (field: TargetField, value: string) => {
    setDraft((d) => {
      const sv = { ...(d.staticValues || {}) };
      if (value) sv[field] = value; else delete sv[field];
      return { ...d, staticValues: sv };
    });
  };

  /** 用当前文件 + 当前草稿规则做真实试解析（不落库） */
  const runTest = async () => {
    if (!file) { toast('没有可用于试解析的文件', 'warning'); return; }
    setTesting(true);
    setTestRows(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('rule', JSON.stringify(draft));
      const r = await fetch('/api/parse', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '试解析失败');
      setTestRows(d.rows || []);
      setTestWarnings(d.warnings || []);
      toast(`试解析成功，共 ${d.rows?.length || 0} 条`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '试解析失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!draft.name?.trim()) { toast('请填写规则名称', 'warning'); return; }
    setSaving(true);
    try {
      const isUpdate = !!draft.id;
      const body = {
        id: draft.id,
        name: draft.name,
        description: draft.description || '',
        fileType: draft.fileType,
        excelConfig: draft.excelConfig,
        wordConfig: draft.wordConfig,
        pdfConfig: draft.pdfConfig,
        staticValues: draft.staticValues || {},
        defaultValues: draft.defaultValues || {},
      };
      const r = await fetch('/api/rules', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '保存失败');
      toast(isUpdate ? '规则已更新' : '规则已保存到规则库', 'success');
      onSaved(d.rule);
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 880, maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{draft.id ? '编辑规则' : '新建 / 确认规则'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', gap: 18 }}>
          {/* AI 分析摘要 */}
          {ai && (
            <div className="tag tag-info" style={{ display: 'block', padding: '10px 14px', lineHeight: 1.7 }}>
              <strong>AI 分析（置信度 {ai.confidence}）：</strong>{ai.summary}
              {ai.guessedFields.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  ⚠️ 以下字段为 AI 推测，请重点确认：
                  {ai.guessedFields.map((f) => (
                    <span key={f} className="tag tag-warning" style={{ marginLeft: 6 }}>{f}</span>
                  ))}
                </div>
              )}
              {ai.warnings.map((w, i) => (
                <div key={i} style={{ color: 'var(--color-warning)', marginTop: 4 }}>· {w}</div>
              ))}
            </div>
          )}

          {/* 基本信息 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">规则名称</label>
              <input className="form-input" value={draft.name || ''}
                onChange={(e) => patch({ name: e.target.value })} placeholder="如：尹三顺出库单" />
            </div>
            <div className="form-group">
              <label className="form-label">适用文件类型</label>
              <input className="form-input" value={draft.fileType} disabled />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">说明</label>
            <input className="form-input" value={draft.description || ''}
              onChange={(e) => patch({ description: e.target.value })} placeholder="一句话描述这类文件" />
          </div>

          {/* 字段映射编辑 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: 14 }}>字段映射（如何提取每个字段）</label>
              <button className="btn btn-default" onClick={() => updateMappings([...mappings, { targetField: 'SKU物品名称', sourceType: 'column', columnIndex: 0 }])}>
                ＋ 添加映射
              </button>
            </div>
            {mappings.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-placeholder)', padding: '12px 0' }}>
                该规则用特殊模式（matrix/card/lineExtract 等）解析，无逐列映射。可直接试解析查看结果。
              </div>
            ) : (
              <MappingRows mappings={mappings} guessed={guessed} targetFields={TARGET_FIELDS} onChange={updateMappings} />
            )}
          </div>

          {/* 静态值（写死给所有行，如门店名） */}
          <div>
            <label className="form-label" style={{ fontSize: 14 }}>静态值（写入所有行，可选）</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              {(['收货门店', '收件人姓名', '收件人电话', '收件人地址'] as TargetField[]).map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, width: 76, color: 'var(--color-text-secondary)' }}>{f}</span>
                  <input className="form-input" style={{ flex: 1 }}
                    value={draft.staticValues?.[f] || ''} onChange={(e) => setStatic(f, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          {/* 试解析预览结果 */}
          {testRows && <TestResult rows={testRows} warnings={testWarnings} />}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-default" disabled={testing || !file} onClick={runTest}>
            {testing ? <><span className="spinner spinner-primary" /> 试解析中…</> : '🧪 用当前文件试解析'}
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-default" onClick={onClose}>取消</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? <><span className="spinner" /> 保存中…</> : (draft.id ? '更新规则' : '保存到规则库')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 试解析结果小表（前 50 行） */
function TestResult({ rows, warnings }: { rows: OrderRow[]; warnings: string[] }) {
  const cols: { k: keyof OrderRow; l: string }[] = [
    { k: '收货门店', l: '门店' }, { k: 'SKU物品编码', l: 'SKU编码' },
    { k: 'SKU物品名称', l: 'SKU名称' }, { k: 'SKU发货数量', l: '数量' },
  ];
  return (
    <div>
      <div className="form-label" style={{ fontSize: 14, marginBottom: 6 }}>
        试解析结果：<span style={{ color: 'var(--color-primary)' }}>{rows.length}</span> 条（展示前 50）
      </div>
      {warnings.map((w, i) => (
        <div key={i} className="tag tag-warning" style={{ display: 'block', padding: '6px 10px', marginBottom: 4 }}>· {w}</div>
      ))}
      <div className="table-wrapper" style={{ maxHeight: 240, overflow: 'auto' }}>
        <table className="data-table">
          <thead><tr>{cols.map((c) => <th key={String(c.k)}>{c.l}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i}>{cols.map((c) => <td key={String(c.k)}>{String(r[c.k] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
