<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
项目背景
物流/快递行业需要频繁批量下单，客户提供的文件格式各异（Excel / Word / PDF），且文档结构复杂（有干扰性头部信息、横向排列字段、合并单元格、非标准表格等）。现需开发一个 Web 应用，通过介入大模型（LLM）实现任意格式文件的智能解析与导入，完成批量下单流程，并部署到 Vercel 平台在线访问。

技术要求
技术栈	Next.js App Router + TypeScript
部署	Vercel，提供可访问 URL
UI 风格	与鲸天系统（见下方参考截图）保持一致的设计语言：主色 #0fc6c2、圆角卡片、清爽蓝绿色调
大模型	通过 API 调用大模型（如 DeepSeek / GPT / Claude 等），将文件内容转为结构化下单数据
数据库	Neon / Supabase / Turso 等，通过 Vercel Marketplace 集成

