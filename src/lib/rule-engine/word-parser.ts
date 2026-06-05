/**
 * 规则引擎 - Word 解析器
 * 支持 table 模式（读取 Word 表格）和 text 模式（纯文本段落）
 */
import mammoth from 'mammoth';
import type { WordRuleConfig, TargetField } from '@/types/rule';
import type { OrderRow } from '@/types';
import { applyTransform } from './transforms';

export async function parseWordWithRule(
  buffer: Buffer,
  config: WordRuleConfig,
  staticValues: Partial<Record<TargetField, string>> = {},
  defaultValues: Partial<Record<TargetField, string>> = {}
): Promise<OrderRow[]> {
  if (config.mode === 'text') {
    return parseWordText(buffer, config, staticValues, defaultValues);
  }
  // table 模式：提取 Word 表格
  return parseWordTable(buffer, config, staticValues, defaultValues);
}

/** 纯文本段落模式 */
async function parseWordText(
  buffer: Buffer,
  config: WordRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): Promise<OrderRow[]> {
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const separator = config.recordSeparator || '\n\n';
  const result: OrderRow[] = [];

  // 按分隔符分割记录
  const records = rawText.split(separator).map(s => s.trim()).filter(Boolean);

  for (const record of records) {
    const lines = record.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 提取记录头部字段（收件人信息等）
    const headerValues: Partial<Record<TargetField, string>> = {
      ...defaultValues,
      ...staticValues,
    };

    if (config.headerPatterns) {
      for (const pat of config.headerPatterns) {
        for (const line of lines) {
          const m = line.match(new RegExp(pat.pattern));
          if (m) {
            headerValues[pat.targetField] = (m[pat.group ?? 1] || '').trim();
            break;
          }
        }
      }
    }

    // 提取物品行（用 linePattern 解析）
    if (config.linePattern && config.lineFieldOrder) {
      const lineRegex = new RegExp(config.linePattern);
      for (const line of lines) {
        const m = line.match(lineRegex);
        if (!m) continue;

        const rowValues: Partial<Record<TargetField, string>> = { ...headerValues };
        config.lineFieldOrder.forEach((field, idx) => {
          rowValues[field] = applyTransform(m[idx + 1] || '', 'trim');
        });

        const orderRow = buildFromValues(rowValues);
        if (orderRow.SKU物品编码 || orderRow.SKU物品名称) {
          result.push(orderRow);
        }
      }
    } else {
      // 无 linePattern，整个记录作为一条
      result.push(buildFromValues(headerValues));
    }
  }

  return result;
}

/** Word 表格模式 */
async function parseWordTable(
  buffer: Buffer,
  config: WordRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): Promise<OrderRow[]> {
  // mammoth 转 HTML 再解析表格
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const rows = extractTableRowsFromHtml(html);
  if (!rows.length) return [];

  const tc = config.tableConfig!;
  const headerRowData = rows[tc.headerRow] || [];
  const result: OrderRow[] = [];

  for (let i = tc.dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c.trim())) continue;
    const rowValues: Partial<Record<TargetField, string>> = { ...defaultValues, ...staticValues };
    for (const mapping of tc.fieldMappings) {
      let value = '';
      if (mapping.sourceType === 'column' && mapping.columnIndex !== undefined) {
        value = row[mapping.columnIndex] || '';
      } else if (mapping.sourceType === 'columnName') {
        const idx = headerRowData.findIndex(h => h.trim() === mapping.columnName?.trim());
        value = idx >= 0 ? row[idx] || '' : '';
      } else if (mapping.sourceType === 'static') {
        value = mapping.staticValue || '';
      }
      rowValues[mapping.targetField] = applyTransform(value, mapping.transform);
    }
    result.push(buildFromValues(rowValues));
  }
  return result;
}

function extractTableRowsFromHtml(html: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    rows.push(cells);
  }
  return rows;
}

function buildFromValues(values: Partial<Record<TargetField, string>>): OrderRow {
  return {
    外部编码: values['外部编码'] || '',
    收货门店: values['收货门店'] || '',
    收件人姓名: values['收件人姓名'] || '',
    收件人电话: values['收件人电话'] || '',
    收件人地址: values['收件人地址'] || '',
    SKU物品编码: values['SKU物品编码'] || '',
    SKU物品名称: values['SKU物品名称'] || '',
    SKU发货数量: Number(values['SKU发货数量']) || 0,
    SKU规格型号: values['SKU规格型号'] || '',
    备注: values['备注'] || '',
  };
}
