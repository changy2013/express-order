'use client';

import type { FieldMapping, TargetField } from '@/types';
import type { EditorRule } from './RuleEditorModal';

const SOURCE_TYPES: FieldMapping['sourceType'][] = ['column', 'columnName', 'static', 'regex', 'combined', 'footer'];
const TRANSFORMS: NonNullable<FieldMapping['transform']>[] = ['none', 'trim', 'number', 'phone'];

/** 从规则草稿里取出主字段映射数组（兼容 excel/word.table/pdf 三种存放位置） */
export function getMappings(rule: EditorRule): FieldMapping[] {
  if (rule.fileType === 'excel') return rule.excelConfig?.fieldMappings || [];
  if (rule.fileType === 'pdf') return rule.pdfConfig?.fieldMappings || [];
  if (rule.fileType === 'word') return rule.wordConfig?.tableConfig?.fieldMappings || [];
  return [];
}

/** 把编辑后的映射数组写回对应配置位置，返回同一 rule 引用 */
export function setMappings(rule: EditorRule, next: FieldMapping[]): EditorRule {
  if (rule.fileType === 'excel' && rule.excelConfig) rule.excelConfig.fieldMappings = next;
  else if (rule.fileType === 'pdf' && rule.pdfConfig) rule.pdfConfig.fieldMappings = next;
  else if (rule.fileType === 'word' && rule.wordConfig?.tableConfig) rule.wordConfig.tableConfig.fieldMappings = next;
  return rule;
}

interface Props {
  mappings: FieldMapping[];
  guessed: Set<string>;
  targetFields: TargetField[];
  onChange: (next: FieldMapping[]) => void;
}

export function MappingRows({ mappings, guessed, targetFields, onChange }: Props) {
  const update = (i: number, p: Partial<FieldMapping>) => {
    onChange(mappings.map((m, idx) => (idx === i ? { ...m, ...p } : m)));
  };
  const remove = (i: number) => onChange(mappings.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {mappings.map((m, i) => {
        const isGuess = guessed.has(m.targetField) || m.isAIGuess;
        return (
          <div key={i}
            style={{
              display: 'grid', gridTemplateColumns: '150px 120px 1fr 96px 32px', gap: 8, alignItems: 'center',
              padding: '6px 8px', borderRadius: 'var(--radius-md)',
              background: isGuess ? 'var(--color-warning-bg)' : 'transparent',
              border: isGuess ? '1px solid var(--color-warning-border)' : '1px solid var(--color-border-light)',
            }}>
            <select className="form-input" value={m.targetField}
              onChange={(e) => update(i, { targetField: e.target.value as TargetField })}>
              {targetFields.map((f) => <option key={f} value={f}>{f}{guessed.has(f) ? ' ⚠️' : ''}</option>)}
            </select>

            <select className="form-input" value={m.sourceType}
              onChange={(e) => update(i, { sourceType: e.target.value as FieldMapping['sourceType'] })}>
              {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <SourceValue mapping={m} onChange={(p) => update(i, p)} />

            <select className="form-input" value={m.transform || 'none'}
              onChange={(e) => update(i, { transform: e.target.value as FieldMapping['transform'] })}>
              {TRANSFORMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <button className="btn-icon" title="删除映射" onClick={() => remove(i)}
              style={{ color: 'var(--color-error)' }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

/** 根据 sourceType 渲染对应的取值输入 */
function SourceValue({ mapping, onChange }: { mapping: FieldMapping; onChange: (p: Partial<FieldMapping>) => void }) {
  switch (mapping.sourceType) {
    case 'column':
      return (
        <input className="form-input" type="number" placeholder="列索引 (0 起)"
          value={mapping.columnIndex ?? ''} onChange={(e) => onChange({ columnIndex: Number(e.target.value) })} />
      );
    case 'columnName':
      return (
        <input className="form-input" placeholder="按表头列名匹配，如 物品编码"
          value={mapping.columnName || ''} onChange={(e) => onChange({ columnName: e.target.value })} />
      );
    case 'static':
      return (
        <input className="form-input" placeholder="固定值"
          value={mapping.staticValue || ''} onChange={(e) => onChange({ staticValue: e.target.value })} />
      );
    case 'regex':
      return (
        <input className="form-input" placeholder="正则，如 收货人[:：]\s*(\S+)"
          value={mapping.regexPattern || ''} onChange={(e) => onChange({ regexPattern: e.target.value })} />
      );
    case 'combined':
      return (
        <input className="form-input" placeholder="合并列索引，逗号分隔，如 2,3"
          value={(mapping.combineIndices || []).join(',')}
          onChange={(e) => onChange({ combineIndices: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) })} />
      );
    case 'footer':
      return (
        <input className="form-input" placeholder="尾部区正则提取"
          value={mapping.regexPattern || ''} onChange={(e) => onChange({ regexPattern: e.target.value })} />
      );
    default:
      return <span />;
  }
}
