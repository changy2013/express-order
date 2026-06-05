/**
 * pdf-parse v2 文本提取封装
 *
 * pdf-parse@2 的类型声明 re-export 了 `pdfjs-dist/legacy/build/pdf.mjs`，
 * 这条 .mjs re-export 链在 Next 的 bundler 模块解析下会断裂，导致 TS 误判
 * `pdf-parse` 无具名导出。这里用 createRequire 在运行时取 PDFParse，
 * 并给出最小本地类型，绕开类型解析问题（运行时行为不变）。
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * pdfjs-dist（pdf-parse 底层）在浏览器全局缺失的 Node 环境下会因引用
 * DOMMatrix / Path2D 等而抛 "DOMMatrix is not defined"（Vercel serverless 尤甚）。
 * 用 @napi-rs/canvas 导出的几何类做最小 polyfill，注入到 globalThis。
 */
let polyfilled = false;
function ensureDomPolyfills() {
  if (polyfilled) return;
  polyfilled = true;
  try {
    const canvas = require('@napi-rs/canvas');
    const g = globalThis as Record<string, unknown>;
    for (const key of ['DOMMatrix', 'Path2D', 'ImageData', 'DOMPoint', 'DOMRect']) {
      if (g[key] === undefined && canvas[key]) g[key] = canvas[key];
    }
  } catch {
    /* 无 canvas 时忽略：简单 PDF 仍可解析 */
  }
}

interface PDFTextResult {
  text?: string;
}
interface PDFParseInstance {
  getText(): Promise<PDFTextResult>;
}
interface PDFParseCtor {
  new (opts: { data: Buffer }): PDFParseInstance;
}

/** 从 PDF buffer 提取纯文本 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  ensureDomPolyfills();
  const mod = require('pdf-parse') as { PDFParse: PDFParseCtor };
  const parser = new mod.PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text || '';
}
