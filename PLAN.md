# 智能多格式批量下单系统 V2 — 实施计划

## 项目现状分析

现有代码已有基本骨架（Next.js App Router + TypeScript），但核心能力缺失：
- ❌ 无规则引擎（硬编码 LLM 直接解析）
- ❌ 无规则持久化（无数据库表）
- ❌ 无 AI 辅助生成规则流程
- ❌ 字段定义与需求不符（现在是寄/收件人模型，需要改为 SKU/门店模型）
- ❌ 无虚拟列表（大量数据会卡顿）
- ❌ 缺少 9 种文件格式兼容能力

---

## 核心架构决策

### 规则引擎设计思路

**关键理念**：AI 生成"规则"而非直接生成"数据"。规则是一份 JSON 配置，描述如何从特定结构的文件中提取字段。

```
文件上传 → 前端提取文件结构摘要 → 发给 AI → AI 返回规则 JSON
→ 用户微调确认 → 保存规则 → 用规则引擎执行解析 → 得到结构化数据
```

#### 规则 Schema 设计

```typescript
interface ParseRule {
  id: string;
  name: string;               // 规则名称
  fileType: 'excel' | 'word' | 'pdf';
  description?: string;
  
  // Excel 专用
  excelConfig?: {
    sheets: 'all' | number[];  // 处理哪些 Sheet（索引）
    sheetMode: 'merge' | 'separate';  // 多 Sheet 合并 or 分别处理
    headerRow: number;         // 表头行（0-indexed）
    dataStartRow: number;      // 数据起始行
    dataEndCondition?: {       // 数据结束条件
      type: 'keyword' | 'empty' | 'row';
      value?: string;          // 关键词如"合计"
      rowIndex?: number;
    };
    specialMode?: 'normal' | 'matrix' | 'card' | 'weekly';
    // matrix: SKU×门店矩阵转置
    // card: 卡片式布局
    // weekly: 日期列横向展开
    matrixConfig?: {
      skuStartRow: number;
      storeStartCol: number;   // 门店列从第几列开始
    };
    cardConfig?: {
      cardMarker: string;      // 卡片边界标志如"▶ 调拨记录"
    };
    footerConfig?: {           // 尾部信息提取
      enabled: boolean;
      startKeyword: string;    // 如"收货人"
      patterns: FooterPattern[];
    };
    aggregationKey?: string;   // 聚合依据字段（如外部编码）
    fieldMappings: FieldMapping[];
    skipRowPatterns?: string[];  // 跳过含这些关键词的行，如["合计","小计"]
  };
  
  // Word 专用
  wordConfig?: {
    mode: 'table' | 'text';
    recordSeparator?: string;  // 记录分隔符，如"---"
    fieldPatterns?: TextFieldPattern[];  // 正则提取模式
    linePattern?: string;      // 行格式，如"编号. 编码 | 名称 | 规格 | 数量"
  };
  
  // PDF 专用  
  pdfConfig?: {
    mode: 'table' | 'text' | 'multi';
    recordSeparator?: string;
    footerEnabled?: boolean;
  };
  
  // 静态默认值（所有文件类型通用）
  staticValues?: Record<string, string>;
  defaultValues?: Record<string, string>;
  
  createdAt: string;
  updatedAt: string;
}

interface FieldMapping {
  targetField: keyof OrderRow;  // 目标字段（如 "外部编码"）
  sourceType: 'column' | 'static' | 'regex' | 'footer' | 'combined';
  columnIndex?: number;         // 列索引（0-indexed）
  columnName?: string;          // 列名（备用识别）
  staticValue?: string;
  regexPattern?: string;
  combineFields?: string[];     // 合并多列
  transform?: 'trim' | 'number' | 'phone';
}
```

#### 9 种文件格式 → 规则配置映射

| 文件 | `specialMode` | 关键配置 |
|------|--------------|----------|
| 1. 黎明屯 | `normal` | `headerRow:3, dataEndCondition:{keyword:"合计"}, footerConfig:{收货人区域}` |
| 2. 湖南仓 | `normal` | `headerRow:1, aggregationKey:"外部编码"` |
| 3. 欢乐牧场 | `matrix` | `matrixConfig:{storeStartCol:X}` |
| 4. 黔寨寨 | `pdf/table` | `footerConfig:{签字区}` |
| 5. 多门店 | `normal` | `sheets:"all", sheetMode:"separate", footerConfig` |
| 6. 卡片式 | `card` | `cardConfig:{marker:"▶ 调拨记录 #"}` |
| 7. Word文本 | `word/text` | `recordSeparator:"---", linePattern:"编号. 编码 \| 名称"` |
| 8. 周配送 | `weekly` | 日期列横向展开 + 复合单元格拆分 |
| 9. 多单PDF | `pdf/multi` | `recordSeparator:"===", 配对收货人+物品表` |

---

## 字段定义变更（关键）

按照需求，字段需从"寄收件人模型"改为"SKU/门店模型"：

```typescript
interface OrderRow {
  外部编码?: string;
  收货门店?: string;
  收件人姓名?: string;
  收件人电话?: string;
  收件人地址?: string;
  SKU物品编码: string;      // 必填
  SKU物品名称: string;      // 必填
  SKU发货数量: number;      // 必填，正数
  SKU规格型号?: string;
  备注?: string;
  // 内部字段
  _rowIndex?: number;
  _errors?: ValidationError[];
  _isDuplicate?: boolean;
}
```

---

## 数据库 Schema（新增规则表）

```sql
-- 已有表保留，新增：
CREATE TABLE parse_rules (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_type VARCHAR(20) NOT NULL,
  config JSONB NOT NULL,        -- 完整规则 JSON
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 出库单表（重新设计字段）
CREATE TABLE outbound_orders (
  id VARCHAR(36) PRIMARY KEY,
  batch_id VARCHAR(36) REFERENCES import_batches(id),
  外部编码 VARCHAR(100),
  收货门店 VARCHAR(255),
  收件人姓名 VARCHAR(100),
  收件人电话 VARCHAR(50),
  收件人地址 TEXT,
  sku_编码 VARCHAR(100) NOT NULL,
  sku_名称 VARCHAR(255) NOT NULL,
  sku_数量 INTEGER NOT NULL,
  sku_规格 VARCHAR(255),
  备注 TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 模块拆分与文件结构

```
src/
├── app/
│   ├── page.tsx                     # 主页（导入 + 预览流程）
│   ├── rules/page.tsx               # 规则管理页
│   ├── orders/page.tsx              # 历史运单列表
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── parse/route.ts           # 执行解析（用规则引擎）
│       ├── rules/route.ts           # CRUD 规则
│       ├── ai-analyze/route.ts      # AI 分析文件生成推荐规则
│       ├── orders/route.ts          # 提交/查询运单
│       └── export/route.ts          # 导出 Excel
├── lib/
│   ├── db.ts                        # 数据库连接
│   ├── rule-engine/
│   │   ├── index.ts                 # 规则引擎入口
│   │   ├── excel-parser.ts          # Excel 规则执行器
│   │   ├── word-parser.ts           # Word 规则执行器
│   │   ├── pdf-parser.ts            # PDF 规则执行器
│   │   └── transforms.ts            # 字段转换工具
│   ├── ai/
│   │   ├── analyze-file.ts          # AI 分析文件结构
│   │   └── prompts.ts               # Prompt 模板
│   └── validators.ts                # 数据校验
├── components/
│   ├── RuleEditor/                  # 规则编辑器组件
│   ├── DataGrid/                    # 虚拟化数据表格
│   ├── FileUpload/                  # 文件上传区
│   ├── ProgressBar/
│   └── Toast/
└── types/
    ├── rule.ts                      # ParseRule 类型
    ├── order.ts                     # OrderRow 类型
    └── index.ts
```

---

## 各模块实施计划

### 阶段 1：基础重构（类型 + DB + API）
1. 重新定义 TypeScript 类型（`OrderRow`, `ParseRule`）
2. 更新 DB Schema（新增 `parse_rules`, `outbound_orders` 表）
3. 实现规则 CRUD API（`/api/rules`）

### 阶段 2：规则引擎核心
1. 实现 `excel-parser.ts`：支持 normal/matrix/card/weekly 四种 specialMode
2. 实现 `word-parser.ts`：支持 table/text 两种模式
3. 实现 `pdf-parser.ts`：支持 table/text/multi 三种模式
4. 更新 `/api/parse` 路由使用规则引擎

### 阶段 3：AI 辅助生成规则
1. 实现 `/api/ai-analyze` 路由（分析文件结构，返回推荐规则）
2. 设计 AI Prompt（分析文件结构 → 输出规则 JSON，而非直接输出数据）
3. 前端 AI 分析结果展示 + 规则编辑器

### 阶段 4：UI 全面重构
1. 鲸天系统风格 CSS（主色 `#0fc6c2`，圆角卡片，清爽蓝绿色调）
2. 规则管理页面
3. 虚拟化数据表格（支持 1000+ 行不卡顿）
4. 文件上传流程（上传 → 选规则 or 新建规则 → 解析 → 预览）

### 阶段 5：测试与验收
1. 用 9 份样本文件逐一测试
2. 性能测试（1000 单 10 秒内）
3. 部署到 Vercel

---

## 性能方案

| 问题 | 方案 |
|------|------|
| 1000+ 行表格渲染 | `react-virtual` 或手写虚拟滚动（行高固定 40px） |
| Excel 解析阻塞 UI | Web Worker 解析（或 Server-side 解析） |
| 大文件上传 | 前端读取为 ArrayBuffer，Server 端解析 |
| 重复检测性能 | `Map<string, number>` 建立索引，O(n) 完成 |

---

## 开放问题（需你确认）

> [!IMPORTANT]
> **问题 1：演示文件是否已有？**
> 需求中提到"随题附多份真实出库单文件"，但我在项目目录中没有找到这 9 份文件。你现在有这些文件吗？
> - 如有，请放到 `public/samples/` 或告知路径，我将以这些文件为基准设计规则
> - 如无，我将基于需求描述模拟这些文件的结构进行规则引擎设计

> [!IMPORTANT]
> **问题 2：LLM API Key 配置方式**
> 现有代码支持前端通过 LocalStorage 传 Key。需求要求 Vercel 部署后可用，建议改为：
> - **方案 A**：Key 存在 Vercel 环境变量，后端统一调用（安全，但需你提供 Key 给我配置）
> - **方案 B**：前端配置页填写 Key，通过 Header 传给 API（已有基础，灵活但不安全）
> - **方案 C**：两者兼容（环境变量优先，无则走前端配置）—— **推荐**

> [!WARNING]
> **问题 3：数据库**
> 你是否已经在 Vercel 上集成了 Neon/Supabase？如果有，`DATABASE_URL` 应填入 `.env.local`。
> 如果没有，我将保留现有的本地 JSON 文件 fallback，并提供 Neon 接入指引。

> [!NOTE]
> **问题 4：是否要重构现有 `page.tsx`**
> 现有代码是一个大的单文件（1081行）。我建议全面重构为多组件架构，
> 但这会导致现有功能暂时失效。是否可以接受全量重写？

---

## 评分关键路径

| 考点 | 分值 | 我的应对 |
|------|------|---------|
| Vercel 部署 | 10 | 保证构建通过，提供 URL |
| UI 风格 | 30 | 全面重构为鲸天系统风格 |
| 规则引擎 + AI | 50 | 核心工作，设计通用规则 JSON Schema |
| 性能 | 20 | 虚拟列表 + Worker 解析 |
