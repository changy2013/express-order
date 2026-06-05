-- ============================================================
-- V2 Schema: 规则引擎 + SKU/门店模型
-- ============================================================

-- 解析规则表
CREATE TABLE IF NOT EXISTS parse_rules (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('excel', 'word', 'pdf')),
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 导入批次表（更新字段）
CREATE TABLE IF NOT EXISTS import_batches (
  id VARCHAR(36) PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER DEFAULT 0,
  rule_id VARCHAR(36) REFERENCES parse_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'processing',
  order_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 出库单表（SKU/门店模型）
CREATE TABLE IF NOT EXISTS outbound_orders (
  id VARCHAR(36) PRIMARY KEY,
  batch_id VARCHAR(36) REFERENCES import_batches(id) ON DELETE SET NULL,
  external_code VARCHAR(100),        -- 外部编码
  store_name VARCHAR(255),           -- 收货门店
  receiver_name VARCHAR(100),        -- 收件人姓名
  receiver_phone VARCHAR(50),        -- 收件人电话
  receiver_address TEXT,             -- 收件人地址
  sku_code VARCHAR(100) NOT NULL,    -- SKU物品编码
  sku_name VARCHAR(255) NOT NULL,    -- SKU物品名称
  sku_quantity INTEGER NOT NULL DEFAULT 1, -- SKU发货数量
  sku_spec VARCHAR(255),             -- SKU规格型号
  remark TEXT,                       -- 备注
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_parse_rules_file_type ON parse_rules(file_type);
CREATE INDEX IF NOT EXISTS idx_parse_rules_updated_at ON parse_rules(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_rule_id ON import_batches(rule_id);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_batch_id ON outbound_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_external_code ON outbound_orders(external_code);
-- 外部编码 + SKU编码 联合普通索引（用于查重检索）：
-- 重复检测改由应用层（预览预检 + 提交时查库）完成，不再用 DB 唯一约束拦截。
-- 外部编码允许为空；联合普通索引加速 (external_code, sku_code) 查重。
CREATE INDEX IF NOT EXISTS idx_outbound_orders_extcode_sku ON outbound_orders(external_code, sku_code);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_store_name ON outbound_orders(store_name);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_created_at ON outbound_orders(created_at DESC);

-- ============================================================
-- 迁移：为已存在的数据库补列（IF NOT EXISTS 幂等，可重复执行）
-- ============================================================
-- 去掉旧的唯一约束（重复检测改为应用层），并补上联合普通索引
DROP INDEX IF EXISTS uq_outbound_orders_extcode_sku;
CREATE INDEX IF NOT EXISTS idx_outbound_orders_extcode_sku ON outbound_orders(external_code, sku_code);
