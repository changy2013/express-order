/**
 * 文件结构摘要提取
 * 把上传的文件转成紧凑的文本摘要（含行列坐标），喂给 AI 用于生成解析规则。
 * 关键：不是把全部数据丢给 AI，而是给「结构样本」——前若干行 + 列索引 + 合并单元格提示。
 */
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { extractPdfText } from '../pdf-text';

export interface FileStructure {
  fileType: 'excel' | 'word' | 'pdf';
  summary: string; // 给 AI 的纯文本结构摘要
}

const MAX_PREVIEW_ROWS = 30; // 每个 sheet 预览行数
const MAX_CELL_LEN = 50;
const MAX_COLS = 40;

function clip(v: unknown): string {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_CELL_LEN ? s.slice(0, MAX_CELL_LEN) + '…' : s;
}

/** 根据扩展名/mime 判断文件类型 */
export function detectFileType(fileName: string, mimeType?: string): 'excel' | 'word' | 'pdf' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
  if (['docx', 'doc'].includes(ext)) return 'word';
  if (ext === 'pdf') return 'pdf';
  if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return 'excel';
  if (mimeType?.includes('word')) return 'word';
  if (mimeType?.includes('pdf')) return 'pdf';
  return 'excel';
}

export async function extractFileStructure(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<FileStructure> {
  const fileType = detectFileType(fileName, mimeType);
  if (fileType === 'excel') return { fileType, summary: extractExcelStructure(buffer) };
  if (fileType === 'word') return { fileType, summary: await extractWordStructure(buffer) };
  return { fileType, summary: await extractPdfStructure(buffer) };
}

/** Excel：列出每个 sheet 的名称、合并单元格、前 N 行（带行号、列索引） */
function extractExcelStructure(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const parts: string[] = [];
  parts.push(`【文件类型】Excel，共 ${wb.SheetNames.length} 个工作表`);
  parts.push(`【工作表名称】${JSON.stringify(wb.SheetNames)}`);

  wb.SheetNames.forEach((sn, si) => {
    const ws = wb.Sheets[sn];
    parts.push(`\n===== 工作表[${si}] "${sn}" =====`);
    if (ws['!merges']?.length) {
      const merges = ws['!merges'].slice(0, 20).map((m) => XLSX.utils.encode_range(m));
      parts.push(`合并单元格: ${JSON.stringify(merges)}`);
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
    parts.push(`总行数: ${rows.length}`);
    rows.slice(0, MAX_PREVIEW_ROWS).forEach((r, ri) => {
      const cells = (r as unknown[]).slice(0, MAX_COLS).map((c, ci) => `[${ci}]${clip(c)}`);
      parts.push(`R${ri}: ${cells.join(' | ')}`);
    });
    if (rows.length > MAX_PREVIEW_ROWS) parts.push(`... (还有 ${rows.length - MAX_PREVIEW_ROWS} 行)`);
  });

  return parts.join('\n');
}

/** Word：原始文本 + 表格 HTML 结构提示 */
async function extractWordStructure(buffer: Buffer): Promise<string> {
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const parts: string[] = [];
  parts.push('【文件类型】Word');
  const hasTable = /<table/i.test(html);
  parts.push(`【是否含表格】${hasTable ? '是' : '否'}`);

  if (hasTable) {
    // 提取首个表格的前若干行，给列结构提示
    const tableRows = extractHtmlTableRows(html).slice(0, MAX_PREVIEW_ROWS);
    parts.push('【表格预览】');
    tableRows.forEach((r, ri) => {
      const cells = r.slice(0, MAX_COLS).map((c, ci) => `[${ci}]${clip(c)}`);
      parts.push(`R${ri}: ${cells.join(' | ')}`);
    });
  }

  parts.push('\n【纯文本预览（前 60 行）】');
  rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 60)
    .forEach((l, i) => parts.push(`L${i}: ${clip(l)}`));

  return parts.join('\n');
}

function extractHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    rows.push(cells);
  }
  return rows;
}

/** PDF：提取文本前 80 行，保留 \t 制表符（列分隔提示） */
async function extractPdfStructure(buffer: Buffer): Promise<string> {
  const text = await extractPdfText(buffer);
  const parts: string[] = [];
  parts.push('【文件类型】PDF');
  parts.push('【说明】下方每行保留 \\t 制表符作为列分隔提示，行内可能有 SKU 编码+名称粘连或跨行折断');
  parts.push('【文本预览（前 80 行）】');
  text
    .split('\n')
    .slice(0, 80)
    .forEach((l: string, i: number) => parts.push(`L${i}: ${JSON.stringify(l.slice(0, 90))}`));
  return parts.join('\n');
}
