/**
 * 规则引擎核心类型定义
 * 规则 = 描述如何从特定格式文件中提取字段的 JSON 配置
 */

/** 目标字段名 */
export type TargetField =
  | '外部编码'
  | '收货门店'
  | '收件人姓名'
  | '收件人电话'
  | '收件人地址'
  | 'SKU物品编码'
  | 'SKU物品名称'
  | 'SKU发货数量'
  | 'SKU规格型号'
  | '备注';

/** 字段映射：描述如何获取某个目标字段的值 */
export interface FieldMapping {
  targetField: TargetField;
  /** column: 按列索引取值; columnName: 按列名查找; static: 固定值; regex: 正则; footer: 尾部区域; combined: 合并多列 */
  sourceType: 'column' | 'columnName' | 'static' | 'regex' | 'footer' | 'combined';
  columnIndex?: number;       // 列索引 (0-indexed)，sourceType=column 时使用
  columnName?: string;        // 列名，sourceType=columnName 时使用（优先级低于 columnIndex）
  staticValue?: string;       // 固定值，sourceType=static 时使用
  regexPattern?: string;      // 正则表达式，sourceType=regex 时在整行文本中提取
  regexGroup?: number;        // 正则捕获组索引，默认 1
  combineIndices?: number[];  // 合并多列的列索引，sourceType=combined 时使用
  combineSeparator?: string;  // 合并分隔符，默认 ''
  transform?: 'trim' | 'number' | 'phone' | 'none'; // 后处理转换
  /** AI 生成时标注此映射是否为推测（需用户确认） */
  isAIGuess?: boolean;
  confidence?: 'high' | 'medium' | 'low';  // 置信度
}

/** 数据结束条件 */
export interface DataEndCondition {
  type: 'keyword' | 'empty_row' | 'row_index';
  value?: string;     // keyword 时的关键词
  rowIndex?: number;  // row_index 时的绝对行索引（0-indexed）
}

/** 尾部信息区域配置（从表格底部纯文本区提取收件人等信息） */
export interface FooterConfig {
  enabled: boolean;
  /** 尾部区域起始关键词，如"收货人" */
  startKeyword: string;
  /** 各字段在尾部区域的提取模式 */
  fieldPatterns: {
    targetField: TargetField;
    pattern: string;  // 正则表达式
    group?: number;
  }[];
}

/** Excel 规则配置 */
export interface ExcelRuleConfig {
  /** 处理哪些 Sheet：'all' 或 Sheet 索引数组 (0-indexed) */
  sheets: 'all' | number[];
  /** 多 Sheet 模式：merge=合并所有Sheet数据, separate=每Sheet独立处理（门店信息不同） */
  sheetMode: 'merge' | 'separate';
  /** 特殊解析模式 */
  specialMode: 'normal' | 'matrix' | 'card' | 'weekly';
  /** 表头行（0-indexed） */
  headerRow: number;
  /** 数据起始行（0-indexed） */
  dataStartRow: number;
  /** 数据结束条件（不设则读到最后一行） */
  dataEndCondition?: DataEndCondition;
  /** 跳过含这些关键词的数据行（如合计行），忽略大小写 */
  skipRowPatterns?: string[];
  /** 字段映射列表 */
  fieldMappings: FieldMapping[];
  /** 聚合字段：同值的多行合并为一个出库单（如按外部编码聚合多个 SKU 行） */
  aggregationKey?: TargetField;

  /** matrix 模式：SKU×门店矩阵转置 */
  matrixConfig?: {
    skuCodeCol: number;    // SKU编码列索引
    skuNameCol: number;    // SKU名称列索引
    skuSpecCol?: number;   // SKU规格列索引
    storeStartCol: number; // 门店列起始索引（该列及其右侧均为门店列，列头为门店名）
    storeEndCol?: number;  // 门店列结束索引（含）；不设则到最后一列。用于排除右侧汇总列
    storeHeaderRow: number;// 门店名所在行索引
    /** 门店列名中若含这些关键词则跳过（如"结余""合计""汇总""库存"等汇总列） */
    storeSkipKeywords?: string[];
  };

  /** card 模式：卡片式纵向堆叠布局 */
  cardConfig?: {
    cardMarker: string;     // 卡片边界标志字符串，如 "▶ 调拨记录 #"
    /** 卡片内收件人信息提取模式 */
    headerPatterns: {
      targetField: TargetField;
      pattern: string;
      group?: number;
    }[];
    /** 卡片内物品子表头行（相对卡片起始的偏移，0-indexed） */
    itemTableHeaderOffset: number;
    itemFieldMappings: FieldMapping[];
  };

  /** weekly 模式：日期列横向展开（周配送计划） */
  weeklyConfig?: {
    storeCol: number;           // 门店列索引
    dateStartCol: number;       // 日期列起始索引
    dateHeaderRow: number;      // 日期表头行索引
    cellParser: 'newline_kv';   // 复合单元格解析方式，"物品名x数量\n物品名x数量"
  };

  /** 尾部信息区（每 Sheet 底部提取收件人信息） */
  footerConfig?: FooterConfig;
}

/** Word 规则配置 */
export interface WordRuleConfig {
  mode: 'table' | 'text';
  /** text 模式：记录分隔符（如 "---" 或空行） */
  recordSeparator?: string;
  /** text 模式：行内字段解析格式（如 "编号. 编码 | 名称 | 规格 | 数量"） */
  linePattern?: string;
  /** linePattern 中各捕获组对应的目标字段 */
  lineFieldOrder?: TargetField[];
  /** 记录头部字段提取（分隔线之前） */
  headerPatterns?: {
    targetField: TargetField;
    pattern: string;
    group?: number;
  }[];
  /** table 模式使用 excelConfig 中的 headerRow/dataStartRow/fieldMappings */
  tableConfig?: Pick<ExcelRuleConfig, 'headerRow' | 'dataStartRow' | 'fieldMappings'>;
}

/** PDF 规则配置 */
export interface PDFRuleConfig {
  mode: 'table' | 'text' | 'multi';
  /** multi 模式：多订单分隔标志（如 "=====" 或页码标志） */
  recordSeparator?: string;
  /** 尾部签字区提取 */
  footerConfig?: FooterConfig;
  /** table 模式：表头关键词（用于定位表头行） */
  tableHeaderKeyword?: string;
  /** 跳过含这些关键词的行 */
  skipRowPatterns?: string[];
  /** 字段映射 */
  fieldMappings?: FieldMapping[];
  /**
   * 行级智能提取：当 PDF 制表符列不规整、表头在数据下方、编码与名称粘连时使用。
   * 引擎逐行用 skuCodePattern 识别数据行，自动抽取 编码/名称/数量，不依赖列索引和表头位置。
   * 强烈推荐用于扫描件/导出件等脏 PDF。
   */
  lineExtract?: {
    enabled: boolean;
    /** SKU 编码正则（默认 [A-Z]{2,}[0-9]{3,}），命中则该行视为数据行 */
    skuCodePattern?: string;
    /** 数量取值方式：'last_number'=行内最后一个独立数字（默认）；'after_unit'=单位词后的数字 */
    qtyFrom?: 'last_number' | 'after_unit';
    /** 单位词列表（qtyFrom=after_unit 时用），如 ["件","包","桶","瓶","个"] */
    unitWords?: string[];
  };
}

/** 完整解析规则 */
export interface ParseRule {
  id: string;
  name: string;
  description?: string;
  fileType: 'excel' | 'word' | 'pdf';
  excelConfig?: ExcelRuleConfig;
  wordConfig?: WordRuleConfig;
  pdfConfig?: PDFRuleConfig;
  /** 所有文件类型通用：静态值（直接写入所有行） */
  staticValues?: Partial<Record<TargetField, string>>;
  /** 所有文件类型通用：字段缺失时的默认值 */
  defaultValues?: Partial<Record<TargetField, string>>;
  createdAt: string;
  updatedAt: string;
}

/** AI 分析文件后返回的推荐规则（含置信度标注） */
export interface AIRecommendedRule extends Omit<ParseRule, 'id' | 'createdAt' | 'updatedAt'> {
  aiAnalysis: {
    summary: string;           // AI 对文件结构的分析摘要
    guessedFields: TargetField[];  // 标注哪些字段映射是推测的
    warnings: string[];        // 警告提示
    confidence: 'high' | 'medium' | 'low';
  };
}
