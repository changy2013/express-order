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

    // 第一遍：仅在 footer 区域搜索（footerStart → 末尾）
    let m = footerText.match(regex);
    if (m) { result[pat.targetField] = (m[pat.group ?? 1] || '').trim(); continue; }
    let found = false;
    for (let ri = footerStart; ri < rawRows.length; ri++) {
      if (tryCellMatch(regex, rawRows[ri], pat.targetField, result)) { found = true; break; }
    }
    if (found) continue;

    // 第二遍：向上扩展（如"单据号"在"收货人"上方时也能命中）
    const scanUpStart = Math.max(0, footerStart - 10);
    const expandedText = rawRows.slice(scanUpStart, footerStart).map(r => r.join('\t')).join('\n');
    m = expandedText.match(regex);
    if (m) { result[pat.targetField] = (m[pat.group ?? 1] || '').trim(); continue; }
    for (let ri = scanUpStart; ri < footerStart; ri++) {
      if (tryCellMatch(regex, rawRows[ri], pat.targetField, result)) break;
    }
  }

  return result;
}

function tryCellMatch(regex: RegExp, row: RawRow, targetField: string, result: Partial<Record<string, string>>): boolean {
  for (let ci = 0; ci < row.length; ci++) {
    const cell = String(row[ci] || '').trim();
    if (regex.test(cell)) {
      const nextVal = findNextNonEmpty(row, ci + 1);
      if (nextVal) { result[targetField] = nextVal.trim(); return true; }
    }
  }
  return false;
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
