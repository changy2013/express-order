import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 这些是纯 Node 端解析库，标记为 external 避免被打包进 server bundle
  // （pdf-parse/pdfjs-dist 打包后会缺少 DOMMatrix 等浏览器全局而报错）
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas', 'xlsx', 'exceljs', 'mammoth', 'pg'],
  // 强制把 pdf-parse 的 worker(.mjs) 及 pdfjs 资源打进用到它的 serverless function
  // （否则 Vercel 报 "Cannot find module pdf.worker.mjs"）
  outputFileTracingIncludes: {
    '/api/parse': ['./node_modules/pdf-parse/dist/**/*', './node_modules/pdfjs-dist/**/*'],
    '/api/ai-analyze': ['./node_modules/pdf-parse/dist/**/*', './node_modules/pdfjs-dist/**/*'],
  },
};

export default nextConfig;
