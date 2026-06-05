/**
 * 规则引擎 - PDF 解析器
 * 支持 table / text / multi 模式
 */
import { PDFParse } from 'pdf-parse';
import type { PDFRuleConfig, TargetField, FieldMapping } from '@/types/rule';
import type { OrderRow } from '@/types';
import { applyTransform } from './transforms';

export async function parsePdfWithRule(
  buffer: Buffer,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>> = {},
  defaultValues: Partial<Record<TargetField, string>> = {}
): Promise<OrderRow[]> {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const text = data.text || '';

  switch (config.mode) {
    case 'multi':
      return parsePdfMulti(text, config, staticValues, defaultValues);
    case 'text':
      return parsePdfText(text, config, staticValues, defaultValues);
    default: // 'table'
      return parsePdfTable(text, config, staticValues, defaultValues);
  }
}

/** multi 模式：一个 PDF 内含多个独立订单，用分隔符区分 */
function parsePdfMulti(
  text: string,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  const separator = config.recordSeparator || '=====';
  const sections = text.split(separator).map(s => s.trim()).filter(Boolean);
  const result: OrderRow[] = [];

  for (const section of sections) {
    // 每个 section 作为一个独立的 table 模式解析
    const rows = parsePdfTableFromText(section, config, staticValues, defaultValues);
    result.push(...rows);
  }

  return result;
}

/** text 模式：纯文本按行解析 */
function parsePdfText(
  text: string,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  // 提取 footer 信息
  const footerValues = extractPdfFooter(text, config);
  const baseValues = { ...defaultValues, ...staticValues, ...footerValues };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result: OrderRow[] = [];
  const skipPatterns = config.skipRowPatterns || [];

  for (const line of lines) {
    if (skipPatterns.some(kw => line.includes(kw))) continue;
    if (!config.fieldMappings) continue;

    const rowValues: Partial<Record<TargetField, string>> = { ...baseValues };
    for (const mapping of config.fieldMappings) {
      if (mapping.sourceType === 'regex' && mapping.regexPattern) {
        const m = line.match(new RegExp(mapping.regexPattern));
        if (m) rowValues[mapping.targetField] = applyTransform(m[mapping.regexGroup ?? 1] || '', mapping.transform);
      }
    }

    if (rowValues['SKU物品编码'] || rowValues['SKU物品名称']) {
      result.push(buildFromValues(rowValues));
    }
  }

  return result;
}

/** table 模式：从 PDF 文本中识别表格区域 */
function parsePdfTable(
  text: string,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  return parsePdfTableFromText(text, config, staticValues, defaultValues);
}

function parsePdfTableFromText(
  text: string,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  const footerValues = extractPdfFooter(text, config);
  const baseValues = { ...defaultValues, ...staticValues, ...footerValues };
  const skipPatterns = config.skipRowPatterns || [];

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result: OrderRow[] = [];

  // 找表头行
  let headerLineIdx = -1;
  if (config.tableHeaderKeyword) {
    headerLineIdx = lines.findIndex(l => l.includes(config.tableHeaderKeyword!));
  }

  // 如果没有 fieldMappings，用 AI 提取（基本的关键词匹配）
  if (!config.fieldMappings || config.fieldMappings.length === 0) {
    return extractOrdersFromPdfText(text, baseValues, skipPatterns);
  }

  const dataStartIdx = headerLineIdx >= 0 ? headerLineIdx + 1 : 0;
  const headerCells = headerLineIdx >= 0
    ? splitPdfLine(lines[headerLineIdx])
    : [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    if (skipPatterns.some(kw => line.includes(kw))) continue;

    const cells = splitPdfLine(line);
    if (cells.length < 2) continue;

    const rowValues: Partial<Record<TargetField, string>> = { ...baseValues };
    for (const mapping of config.fieldMappings) {
      let value = '';
      if (mapping.sourceType === 'column' && mapping.columnIndex !== undefined) {
        value = cells[mapping.columnIndex] || '';
      } else if (mapping.sourceType === 'columnName' && headerCells.length > 0) {
        const idx = headerCells.findIndex(h => h.trim() === mapping.columnName?.trim());
        value = idx >= 0 ? cells[idx] || '' : '';
      } else if (mapping.sourceType === 'regex' && mapping.regexPattern) {
        const m = line.match(new RegExp(mapping.regexPattern));
        value = m ? (m[mapping.regexGroup ?? 1] || '') : '';
      } else if (mapping.sourceType === 'static') {
        value = mapping.staticValue || '';
      }
      rowValues[mapping.targetField] = applyTransform(value, mapping.transform);
    }

    if (rowValues['SKU物品编码'] || rowValues['SKU物品名称']) {
      result.push(buildFromValues(rowValues));
    }
  }

  return result;
}

/** 从 PDF 文本中提取 footer 信息 */
function extractPdfFooter(
  text: string,
  config: PDFRuleConfig
): Partial<Record<TargetField, string>> {
  const result: Partial<Record<TargetField, string>> = {};
  if (!config.footerConfig?.enabled) return result;

  const fc = config.footerConfig;
  const startIdx = text.indexOf(fc.startKeyword);
  if (startIdx < 0) return result;

  const footerText = text.slice(startIdx);
  for (const pat of fc.fieldPatterns) {
    const m = footerText.match(new RegExp(pat.pattern));
    if (m) result[pat.targetField] = (m[pat.group ?? 1] || '').trim();
  }

  return result;
}

/** 通用 PDF 表格文本提取（无字段映射时的 fallback） */
function extractOrdersFromPdfText(
  text: string,
  baseValues: Partial<Record<TargetField, string>>,
  skipPatterns: string[]
): OrderRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result: OrderRow[] = [];

  for (const line of lines) {
    if (skipPatterns.some(kw => line.includes(kw))) continue;
    // 检测行中是否有数字（可能是数量）
    const cells = splitPdfLine(line);
    if (cells.length < 3) continue;
    const qty = Number(cells[cells.length - 1]);
    if (!qty || qty <= 0) continue;

    // 简单启发：最后一列为数量，倒数第二列为名称
    result.push(buildFromValues({
      ...baseValues,
      SKU物品编码: cells[0] || '',
      SKU物品名称: cells[1] || cells[0] || '',
      SKU发货数量: String(qty),
    }));
  }

  return result;
}

/** 拆分 PDF 行（按多空格分隔） */
function splitPdfLine(line: string): string[] {
  return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
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
