/**
 * 规则引擎 - Excel 解析器
 * 支持 normal / matrix / card / weekly / multi-sheet 模式
 */
import * as XLSX from 'xlsx';
import type { ExcelRuleConfig, FieldMapping, TargetField } from '@/types/rule';
import type { OrderRow } from '@/types';
import { applyTransform, extractFooterFields } from './transforms';

type RawRow = (string | number | boolean | null)[];

/** 用规则解析 Excel buffer，返回 OrderRow 数组 */
export async function parseExcelWithRule(
  buffer: Buffer,
  config: ExcelRuleConfig,
  staticValues: Partial<Record<TargetField, string>> = {},
  defaultValues: Partial<Record<TargetField, string>> = {}
): Promise<OrderRow[]> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const allRows: OrderRow[] = [];

  // 决定处理哪些 Sheet
  const sheetIndices: number[] =
    config.sheets === 'all'
      ? workbook.SheetNames.map((_, i) => i)
      : (config.sheets as number[]);

  for (const si of sheetIndices) {
    const sheetName = workbook.SheetNames[si];
    if (!sheetName) continue;
    const ws = workbook.Sheets[sheetName];
    const rawRows: RawRow[] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false, // 保持字符串格式，避免日期被转换
    }) as RawRow[];

    let sheetRows: OrderRow[] = [];

    switch (config.specialMode) {
      case 'matrix':
        sheetRows = parseMatrix(rawRows, config, staticValues, defaultValues, sheetName);
        break;
      case 'card':
        sheetRows = parseCard(rawRows, config, staticValues, defaultValues);
        break;
      case 'weekly':
        sheetRows = parseWeekly(rawRows, config, staticValues, defaultValues);
        break;
      default: // 'normal'
        sheetRows = parseNormal(rawRows, config, staticValues, defaultValues, sheetName);
        break;
    }

    allRows.push(...sheetRows);
  }

  return allRows;
}

/** Normal 模式：标准行列表格，支持 footer 提取、聚合 */
function parseNormal(
  rawRows: RawRow[],
  config: ExcelRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>,
  sheetName: string
): OrderRow[] {
  const { headerRow, dataStartRow, fieldMappings, skipRowPatterns = [], dataEndCondition, footerConfig, aggregationKey } = config;

  // 提取 footer 信息（如 收货人、地址等）
  let footerValues: Partial<Record<TargetField, string>> = {};
  if (footerConfig?.enabled) {
    footerValues = extractFooterFields(rawRows, footerConfig);
  }

  // 获取表头行（用于 columnName 匹配）
  const headerRowData = rawRows[headerRow] || [];

  // 确定数据结束行
  let endRow = rawRows.length;
  if (dataEndCondition) {
    if (dataEndCondition.type === 'row_index' && dataEndCondition.rowIndex !== undefined) {
      endRow = dataEndCondition.rowIndex;
    } else if (dataEndCondition.type === 'keyword' && dataEndCondition.value) {
      for (let i = dataStartRow; i < rawRows.length; i++) {
        if (rowContainsKeyword(rawRows[i], dataEndCondition.value)) {
          endRow = i;
          break;
        }
      }
    } else if (dataEndCondition.type === 'empty_row') {
      for (let i = dataStartRow; i < rawRows.length; i++) {
        if (isEmptyRow(rawRows[i])) {
          endRow = i;
          break;
        }
      }
    }
  }

  const rawResultRows: OrderRow[] = [];

  for (let i = dataStartRow; i < endRow; i++) {
    const row = rawRows[i];
    if (!row) continue;
    if (isEmptyRow(row)) continue;

    // 跳过含特定关键词的行（如"合计"行）
    if (skipRowPatterns.some(kw => rowContainsKeyword(row, kw))) continue;

    const orderRow = buildOrderRow(row, fieldMappings, headerRowData, staticValues, defaultValues, footerValues);
    rawResultRows.push(orderRow);
  }

  // 聚合处理（同一 aggregationKey 的多行 SKU 合并）
  if (aggregationKey && rawResultRows.length > 0) {
    return aggregateRows(rawResultRows, aggregationKey);
  }

  return rawResultRows;
}

/** Matrix 模式：SKU × 门店矩阵转置 */
function parseMatrix(
  rawRows: RawRow[],
  config: ExcelRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>,
  _sheetName: string
): OrderRow[] {
  const mc = config.matrixConfig!;
  const { headerRow, dataStartRow, dataEndCondition, skipRowPatterns = [] } = config;

  // 获取门店名列表（从 storeHeaderRow 的 storeStartCol 开始）
  const storeHeaderRowData = rawRows[mc.storeHeaderRow] || [];
  const storeEndCol = mc.storeEndCol !== undefined ? mc.storeEndCol : storeHeaderRowData.length - 1;
  // 默认跳过明显的汇总/库存类列
  const skipKw = mc.storeSkipKeywords && mc.storeSkipKeywords.length
    ? mc.storeSkipKeywords
    : ['结余', '合计', '小计', '汇总', '总和', '库存', '数量', '可用', '冻结', '分配', '待'];
  const storeNames: string[] = [];
  for (let c = mc.storeStartCol; c <= storeEndCol && c < storeHeaderRowData.length; c++) {
    const storeName = String(storeHeaderRowData[c] || '').trim();
    if (storeName && skipKw.some((kw) => storeName.includes(kw))) {
      storeNames.push(''); // 命中汇总关键词，占位但不解析
    } else {
      storeNames.push(storeName);
    }
  }

  // 确定数据结束行
  let endRow = rawRows.length;
  if (dataEndCondition?.type === 'keyword' && dataEndCondition.value) {
    for (let i = dataStartRow; i < rawRows.length; i++) {
      if (rowContainsKeyword(rawRows[i], dataEndCondition.value)) { endRow = i; break; }
    }
  } else if (dataEndCondition?.type === 'empty_row') {
    for (let i = dataStartRow; i < rawRows.length; i++) {
      if (isEmptyRow(rawRows[i])) { endRow = i; break; }
    }
  }

  void headerRow; // suppress unused warning

  const result: OrderRow[] = [];

  for (let ri = dataStartRow; ri < endRow; ri++) {
    const row = rawRows[ri];
    if (!row || isEmptyRow(row)) continue;
    if (skipRowPatterns.some(kw => rowContainsKeyword(row, kw))) continue;

    const skuCode = String(row[mc.skuCodeCol] || '').trim();
    const skuName = String(row[mc.skuNameCol] || '').trim();
    const skuSpec = mc.skuSpecCol !== undefined ? String(row[mc.skuSpecCol] || '').trim() : '';

    if (!skuCode && !skuName) continue;

    // 遍历每个门店列
    for (let ci = 0; ci < storeNames.length; ci++) {
      const storeName = storeNames[ci];
      if (!storeName) continue;
      const colIdx = mc.storeStartCol + ci;
      const qtyRaw = row[colIdx];
      const qty = Number(qtyRaw);
      if (!qty || qty <= 0) continue; // 数量为 0 或空则跳过

      const orderRow: OrderRow = finalizeRow({
        ...buildStaticAndDefault(staticValues, defaultValues),
        收货门店: storeName,
        SKU物品编码: skuCode,
        SKU物品名称: skuName,
        SKU发货数量: qty,
        ...(skuSpec ? { SKU规格型号: skuSpec } : {}),
      });
      result.push(orderRow);
    }
  }

  return result;
}

/** Card 模式：卡片式纵向堆叠布局 */
function parseCard(
  rawRows: RawRow[],
  config: ExcelRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  const cc = config.cardConfig!;
  const result: OrderRow[] = [];

  // 找到所有卡片起始行
  const cardStarts: number[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const firstCell = String(rawRows[i]?.[0] || '').trim();
    if (firstCell.includes(cc.cardMarker)) {
      cardStarts.push(i);
    }
  }

  for (let ci = 0; ci < cardStarts.length; ci++) {
    const startRow = cardStarts[ci];
    const endRow = ci + 1 < cardStarts.length ? cardStarts[ci + 1] : rawRows.length;

    // 提取卡片头部信息（收件人、门店等）
    const cardHeader: Partial<Record<TargetField, string>> = {};
    for (let ri = startRow + 1; ri < endRow; ri++) {
      const row = rawRows[ri];
      if (!row) continue;
      // 用 headerPatterns 从行中提取字段
      for (const pat of cc.headerPatterns) {
        if (cardHeader[pat.targetField]) continue;
        const rowText = row.join('\t');
        // 也尝试逐单元格匹配
        const regex = new RegExp(pat.pattern);
        const m = rowText.match(regex);
        if (m) {
          cardHeader[pat.targetField] = (m[pat.group ?? 1] || '').trim();
          continue;
        }
        // 按列对匹配（如 row[1] 是值，row[0] 是标签）
        for (let col = 0; col < row.length - 1; col++) {
          const label = String(row[col] || '').trim();
          const value = String(row[col + 1] || '').trim();
          const labelMatch = label.match(regex);
          if (labelMatch && value) {
            cardHeader[pat.targetField] = value;
          }
        }
      }
    }

    // 找到物品子表头行
    let itemHeaderRow = -1;
    for (let ri = startRow + 1; ri < endRow; ri++) {
      const row = rawRows[ri];
      if (!row) continue;
      // 判断是否为物品表头（含 SKU/物品编码 之类的词）
      const rowStr = row.join('|');
      if (/物品编码|SKU|编码/.test(rowStr)) {
        itemHeaderRow = ri;
        break;
      }
    }
    // 也支持 offset 方式
    if (itemHeaderRow === -1) {
      itemHeaderRow = startRow + 1 + cc.itemTableHeaderOffset;
    }

    const itemDataStart = itemHeaderRow + 1;
    const itemHeaderData = rawRows[itemHeaderRow] || [];

    for (let ri = itemDataStart; ri < endRow; ri++) {
      const row = rawRows[ri];
      if (!row || isEmptyRow(row)) continue;

      const itemRow = buildOrderRow(row, cc.itemFieldMappings, itemHeaderData, {}, {}, {});
      if (!itemRow.SKU物品编码 && !itemRow.SKU物品名称) continue;

      const finalRow: OrderRow = finalizeRow({
        ...buildStaticAndDefault(staticValues, defaultValues),
        ...cardHeader,
        ...itemRow,
      });
      result.push(finalRow);
    }
  }

  return result;
}

/** Weekly 模式：日期列横向展开（周配送计划） */
function parseWeekly(
  rawRows: RawRow[],
  config: ExcelRuleConfig,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): OrderRow[] {
  const wc = config.weeklyConfig!;
  const { dataStartRow, dataEndCondition, skipRowPatterns = [] } = config;
  const result: OrderRow[] = [];

  // 获取日期表头
  const dateHeaderRow = rawRows[wc.dateHeaderRow] || [];
  const dates: string[] = [];
  for (let c = wc.dateStartCol; c < dateHeaderRow.length; c++) {
    dates.push(String(dateHeaderRow[c] || '').trim());
  }

  let endRow = rawRows.length;
  if (dataEndCondition?.type === 'keyword' && dataEndCondition.value) {
    for (let i = dataStartRow; i < rawRows.length; i++) {
      if (rowContainsKeyword(rawRows[i], dataEndCondition.value)) { endRow = i; break; }
    }
  }

  for (let ri = dataStartRow; ri < endRow; ri++) {
    const row = rawRows[ri];
    if (!row || isEmptyRow(row)) continue;
    if (skipRowPatterns.some(kw => rowContainsKeyword(row, kw))) continue;

    const storeName = String(row[wc.storeCol] || '').trim();
    if (!storeName) continue;

    // 遍历每个日期列
    for (let di = 0; di < dates.length; di++) {
      const colIdx = wc.dateStartCol + di;
      const cellValue = String(row[colIdx] || '').trim();
      if (!cellValue) continue;

      // 解析复合单元格，格式："物品名x数量\n物品名x数量" 或 "物品名*数量"
      const entries = cellValue.split(/[\n\r]+/).filter(Boolean);
      for (const entry of entries) {
        // 匹配 "物品名 x数量" 或 "物品名*数量" 或 "物品名 数量"
        const m = entry.match(/^(.+?)[×xX\*]\s*(\d+)\s*$/);
        if (m) {
          result.push(finalizeRow({
            ...buildStaticAndDefault(staticValues, defaultValues),
            收货门店: storeName,
            SKU物品名称: m[1].trim(),
            SKU物品编码: '',
            SKU发货数量: parseInt(m[2]) || 1,
            备注: dates[di] || '',
          }));
        } else if (/\d/.test(entry)) {
          // 尝试最后一个数字作为数量
          const numMatch = entry.match(/(.+?)\s+(\d+)\s*$/);
          if (numMatch) {
            result.push(finalizeRow({
              ...buildStaticAndDefault(staticValues, defaultValues),
              收货门店: storeName,
              SKU物品名称: numMatch[1].trim(),
              SKU物品编码: '',
              SKU发货数量: parseInt(numMatch[2]) || 1,
              备注: dates[di] || '',
            }));
          }
        }
      }
    }
  }

  return result;
}

/** 从行数据和字段映射构建 OrderRow */
function buildOrderRow(
  row: RawRow,
  mappings: FieldMapping[],
  headerRow: RawRow,
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>,
  extraValues: Partial<Record<TargetField, string>>
): OrderRow {
  const base = buildStaticAndDefault(staticValues, defaultValues);
  const result: Partial<Record<TargetField, string | number>> = { ...base, ...extraValues };

  for (const mapping of mappings) {
    let value: string | number = '';

    switch (mapping.sourceType) {
      case 'column':
        value = mapping.columnIndex !== undefined ? String(row[mapping.columnIndex] ?? '') : '';
        break;
      case 'columnName': {
        const colIdx = headerRow.findIndex(
          h => String(h).trim() === mapping.columnName?.trim()
        );
        value = colIdx >= 0 ? String(row[colIdx] ?? '') : '';
        break;
      }
      case 'static':
        value = mapping.staticValue ?? '';
        break;
      case 'regex': {
        const rowText = row.join('\t');
        if (mapping.regexPattern) {
          const m = rowText.match(new RegExp(mapping.regexPattern));
          value = m ? (m[mapping.regexGroup ?? 1] ?? '') : '';
        }
        break;
      }
      case 'combined': {
        const parts = (mapping.combineIndices || []).map(idx => String(row[idx] ?? '').trim());
        value = parts.join(mapping.combineSeparator ?? '');
        break;
      }
      case 'footer':
        // footer 值已在 extraValues 中
        continue;
    }

    value = applyTransform(String(value), mapping.transform);
    if (value !== '' || !(mapping.targetField in result)) {
      (result as any)[mapping.targetField] = value;
    }
  }

  // 确保必填字段存在（即使为空字符串）
  return finalizeRow({
    SKU物品编码: String((result as any)['SKU物品编码'] ?? ''),
    SKU物品名称: String((result as any)['SKU物品名称'] ?? ''),
    SKU发货数量: Number((result as any)['SKU发货数量']) || 0,
    ...result,
  });
}

/** 收尾：把引擎内部的字符串值转成 OrderRow 的强类型（目前 重量 需 string→number；空值→undefined） */
function finalizeRow(r: Record<string, unknown>): OrderRow {
  const w = r['重量'];
  const weight = (w === undefined || w === null || String(w).trim() === '') ? undefined : Number(w);
  return { ...r, 重量: weight } as OrderRow;
}

/** 构建静态值和默认值的基础对象 */
function buildStaticAndDefault(
  staticValues: Partial<Record<TargetField, string>>,
  defaultValues: Partial<Record<TargetField, string>>
): Partial<Record<TargetField, string>> {
  return { ...defaultValues, ...staticValues };
}

/** 按 aggregationKey 聚合行（收货信息共享，SKU 各行独立保留） */
function aggregateRows(rows: OrderRow[], aggregationKey: TargetField): OrderRow[] {
  // 聚合：同 key 的第一行的收货信息作为代表，所有 SKU 行独立保留
  const keyMap = new Map<string, OrderRow>();
  const result: OrderRow[] = [];

  for (const row of rows) {
    const keyVal = String((row as any)[aggregationKey] || '');
    if (!keyMap.has(keyVal)) {
      keyMap.set(keyVal, row);
    } else {
      // 继承第一行的收货信息到后续行
      const first = keyMap.get(keyVal)!;
      const merged: OrderRow = {
        ...row,
        收货门店: row.收货门店 || first.收货门店,
        收件人姓名: row.收件人姓名 || first.收件人姓名,
        收件人电话: row.收件人电话 || first.收件人电话,
        收件人地址: row.收件人地址 || first.收件人地址,
      };
      result.push(merged);
      continue;
    }
    result.push(row);
  }

  // 还需要把第一次出现的也加上收货信息（若后续行有而第一行没有）
  // 简化：直接返回 result（已包含第一行）
  return result;
}

function rowContainsKeyword(row: RawRow, keyword: string): boolean {
  return row.some(cell => String(cell).includes(keyword));
}

function isEmptyRow(row: RawRow): boolean {
  return row.every(cell => String(cell).trim() === '');
}
