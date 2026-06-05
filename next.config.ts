import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 这些是纯 Node 端解析库，标记为 external 避免被打包进 server bundle
  // （pdf-parse/pdfjs-dist 打包后会缺少 DOMMatrix 等浏览器全局而报错）
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas', 'xlsx', 'exceljs', 'mammoth', 'pg'],
};

export default nextConfig;
