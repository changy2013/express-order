/**
 * 规则引擎 - PDF 解析器
 * 支持 table / text / multi 模式
 */
import { extractPdfText } from '../pdf-text';
import type { PDFRuleConfig, TargetField } from '@/types/rule';
import type { OrderRow } from '@/types';
import { applyTransform } from './transforms';

export async function parsePdfWithRule(
  buffer: Buffer,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>> = {},
  defaultValues: Partial<Record<TargetField, string>> = {}
): Promise<OrderRow[]> {
  const text = await extractPdfText(buffer);

  // 行级智能提取优先（适配脏 PDF：表头在下方、编码名称粘连、制表符不规整）
  if (config.lineExtract?.enabled) {
    return extractByLine(text, config, staticValues, defaultValues);
  }

  switch (config.mode) {
    case 'multi':
      return parsePdfMulti(text, config, staticValues, defaultValues);
    case 'text':
      return parsePdfText(text, config, staticValues, defaultValues);
    default: // 'table'
      return parsePdfTable(text, config, staticValues, defaultValues);
  }
}

/**
 * 行级智能提取：逐行用 skuCodePattern 识别数据行，从行内自动抽取 编码/名称/数量。
 * 不依赖列索引和表头位置，对脏 PDF 鲁棒。
 */
function extractByLine(
  text: string,
  config: PDFRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  const le = config.lineExtract!;
  const footerValues = extractPdfFooter(text, config);
  const baseValues = { ...defaultValues, ...staticValues, ...footerValues };
  const skipPatterns = config.skipRowPatterns || [];
  const codeRe = new RegExp(le.skuCodePattern || '[A-Z]{2,}[0-9]{3,}');
  const unitWords = le.unitWords && le.unitWords.length
    ? le.unitWords
    : ['件', '包', '桶', '瓶', '个', '袋', '盒', '箱', '顶', '条', '套', '只', '块', '张'];

  const lines = text.split('\n');
  const result: OrderRow[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (skipPatterns.some(kw => line.includes(kw))) continue;

    const codeMatch = line.match(codeRe);
    if (!codeMatch) continue;
    const code = codeMatch[0];

    // 数量：单位词后的数字，或行内最后一个独立数字
    let qty = 0;
    if (le.qtyFrom === 'after_unit' || !le.qtyFrom) {
      const unitRe = new RegExp(`(?:${unitWords.join('|')})\\s*([0-9]+(?:\\.[0-9]+)?)`);
      const um = line.match(unitRe);
      if (um) qty = Number(um[1]);
    }
    if (!qty) {
      const nums = line.match(/[0-9]+(?:\.[0-9]+)?/g);
      if (nums && nums.length) qty = Number(nums[nums.length - 1]);
    }

    // 名称：编码之后、单位词/数量之前的中文片段
    let name = '';
    const afterCode = line.slice(line.indexOf(code) + code.length);
    // 去掉规格（如 1kg*10袋/件）、单位、数量，保留主名称
    const nameMatch = afterCode.match(/^[\s:：]*([一-龥A-Za-z0-9（）()]+(?:[一-龥A-Za-z（）()]+)*)/);
    if (nameMatch) name = nameMatch[1].trim();
    // 规格：名称后第一个含 数字+单位/乘号 的片段
    let spec = '';
    const specMatch = afterCode.match(/([0-9]+(?:\.[0-9]+)?\s*[a-zA-Z]+(?:\s*[*×][0-9]+[一-龥a-zA-Z]+)?(?:\/[一-龥a-zA-Z]+)?)/);
    if (specMatch) spec = specMatch[1].trim();

    if (!code && !name) continue;
    if (!(qty > 0)) continue;

    result.push(buildFromValues({
      ...baseValues,
      SKU物品编码: code,
      SKU物品名称: name || code,
      SKU发货数量: String(qty),
      ...(spec ? { SKU规格型号: spec } : {}),
    }));
  }

  return result;
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

/** 拆分 PDF 行：优先按制表符分列（pdf-parse 用 \t 分隔单元格），否则按 2+ 空格 */
function splitPdfLine(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map(s => s.trim()).filter(s => s !== '');
  }
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
