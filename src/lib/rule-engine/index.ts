/**
 * 规则引擎入口
 * 根据规则类型分发到对应的解析器
 */
import type { ParseRule, TargetField } from '@/types/rule';
import type { OrderRow } from '@/types';
import { parseExcelWithRule } from './excel-parser';
import { parseWordWithRule } from './word-parser';
import { parsePdfWithRule } from './pdf-parser';

export interface ParseResult {
  rows: OrderRow[];
  warnings: string[];
}

export async function executeRule(
  rule: ParseRule,
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParseResult> {
  const warnings: string[] = [];
  let rows: OrderRow[] = [];

  const staticValues = (rule.staticValues || {}) as Partial<Record<TargetField, string>>;
  const defaultValues = (rule.defaultValues || {}) as Partial<Record<TargetField, string>>;

  try {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (rule.fileType === 'excel' || ['xlsx', 'xls', 'csv'].includes(ext)) {
      if (!rule.excelConfig) throw new Error('规则缺少 Excel 配置');
      rows = await parseExcelWithRule(buffer, rule.excelConfig, staticValues, defaultValues);
    } else if (rule.fileType === 'word' || ['docx', 'doc'].includes(ext)) {
      if (!rule.wordConfig) throw new Error('规则缺少 Word 配置');
      rows = await parseWordWithRule(buffer, rule.wordConfig, staticValues, defaultValues);
    } else if (rule.fileType === 'pdf' || ext === 'pdf') {
      if (!rule.pdfConfig) throw new Error('规则缺少 PDF 配置');
      rows = await parsePdfWithRule(buffer, rule.pdfConfig, staticValues, defaultValues);
    } else {
      throw new Error(`不支持的文件类型: ${ext}`);
    }

    // 过滤无效行（SKU编码和SKU名称均为空）
    const validRows = rows.filter(r => r.SKU物品编码 || r.SKU物品名称);
    const skippedCount = rows.length - validRows.length;
    if (skippedCount > 0) {
      warnings.push(`跳过了 ${skippedCount} 条无效行（SKU编码和名称均为空）`);
    }

    // 添加行ID
    const taggedRows = validRows.map((r, i) => ({ ...r, _id: `row_${i}` }));
    return { rows: taggedRows, warnings };

  } catch (err: any) {
    throw new Error(`规则执行失败: ${err.message}`);
  }
}
