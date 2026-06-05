export type { ParseRule, AIRecommendedRule, FieldMapping, ExcelRuleConfig, WordRuleConfig, PDFRuleConfig, TargetField } from './rule';

/** 出库单行（解析结果 + 校验状态） */
export interface OrderRow {
  外部编码?: string;
  收货门店?: string;
  收件人姓名?: string;
  收件人电话?: string;
  收件人地址?: string;
  SKU物品编码: string;
  SKU物品名称: string;
  SKU发货数量: number;
  SKU规格型号?: string;
  备注?: string;
  // 内部字段
  _id?: string;
  _errors?: ValidationError[];
  _isDuplicate?: boolean;
  _duplicateWithBatch?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
}

/** 导入批次 */
export interface ImportBatch {
  id: string;
  file_name: string;
  file_size: number;
  rule_id?: string;
  rule_name?: string;
  status: 'processing' | 'success' | 'failed';
  order_count: number;
  created_at?: string;
}

/** 已提交运单（数据库记录） */
export interface SubmittedOrder {
  id: string;
  batch_id?: string;
  外部编码?: string;
  收货门店?: string;
  收件人姓名?: string;
  收件人电话?: string;
  收件人地址?: string;
  sku_编码: string;
  sku_名称: string;
  sku_数量: number;
  sku_规格?: string;
  备注?: string;
  status: 'draft' | 'pending' | 'submitted';
  created_at?: string;
}

/** LLM 配置 */
export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Toast 消息 */
export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

/** 提交结果汇总：成功入库 / 重复跳过 / 失败 */
export interface SubmitResult {
  total: number;      // 本次提交的有效行数
  success: number;    // 实际入库条数
  skipped: number;    // 与已入库数据重复、被 DB 跳过的条数
  failed: number;     // 其它原因未入库的条数（异常等）
  batchId?: string;
}
