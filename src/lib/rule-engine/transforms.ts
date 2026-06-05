/**
 * 共享工具函数：字段转换 + Footer 提取
 */
import type { FooterConfig, TargetField } from '@/types/rule';

type RawRow = (string | number | boolean | null)[];

/** 对字段值应用后处理转换 */
export function applyTransform(value: string, transform?: string): string {
  switch (transform) {
    case 'trim':
      return value.trim();
    case 'number':
      return String(parseFloat(value.replace(/[^\d.]/g, '')) || 0);
    case 'phone':
      // 保留数字和连字符
      return value.replace(/[^\d\-+]/g, '').trim();
    default:
      return value.trim();
  }
}

/** 从表格尾部提取收件人等信息（横向 key-value 或正则） */
export function extractFooterFields(
  rawRows: RawRow[],
  footerConfig: FooterConfig
): Partial<Record<TargetField, string>> {
  const result: Partial<Record<TargetField, string>> = {};

  // 找到 footer 起始行
  let footerStart = -1;
  for (let i = rawRows.length - 1; i >= 0; i--) {
    const rowText = rawRows[i].join('|');
    if (rowText.includes(footerConfig.startKeyword)) {
      footerStart = i;
      break;
    }
  }
  if (footerStart === -1) return result;

  // 在 footer 行及其后续行中提取字段
  const footerText = rawRows.slice(footerStart).map(r => r.join('\t')).join('\n');

  for (const pat of footerConfig.fieldPatterns) {
    const regex = new RegExp(pat.pattern);
    // 先在整体文本中搜索
    const m = footerText.match(regex);
    if (m) {
      result[pat.targetField] = (m[pat.group ?? 1] || '').trim();
      continue;
    }
    // 再逐行逐单元格搜索（处理 label-value 横向排列）
    for (let ri = footerStart; ri < rawRows.length; ri++) {
      const row = rawRows[ri];
      for (let ci = 0; ci < row.length; ci++) {
        const cell = String(row[ci] || '').trim();
        const cellMatch = cell.match(regex);
        if (cellMatch) {
          // 值在下一个非空单元格
          const nextVal = findNextNonEmpty(row, ci + 1);
          if (nextVal) {
            result[pat.targetField] = nextVal.trim();
            break;
          }
        }
      }
      if (result[pat.targetField]) break;
    }
  }

  return result;
}

function findNextNonEmpty(row: RawRow, startIdx: number): string {
  for (let i = startIdx; i < row.length; i++) {
    const v = String(row[i] || '').trim();
    if (v) return v;
  }
  return '';
}

/** 生成唯一 ID */
export function generateId(): string {
  return crypto.randomUUID();
}
