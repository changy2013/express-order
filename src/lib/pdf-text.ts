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
  const mod = require('pdf-parse') as { PDFParse: PDFParseCtor };
  const parser = new mod.PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text || '';
}
