import * as xlsx from 'xlsx';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';

/**
 * Extracts data representation from an Excel buffer
 */
export async function parseExcel(buffer: Buffer): Promise<string> {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    let resultText = '';

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = xlsx.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        resultText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
      }
    });

    return resultText || 'Excel file is empty.';
  } catch (error: any) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
}

/**
 * Extracts raw text from a Word (docx) buffer
 */
export async function parseWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || 'Word file is empty.';
  } catch (error: any) {
    throw new Error(`Word parsing failed: ${error.message}`);
  }
}

/**
 * Extracts text from a PDF buffer
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text || 'PDF file is empty.';
  } catch (error: any) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

/**
 * Main function to extract text content based on file mime type
 */
export async function extractTextFromFile(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || ['xlsx', 'xls', 'csv'].includes(extension || '')) {
    return parseExcel(buffer);
  } else if (mimeType.includes('wordprocessingml') || mimeType.includes('msword') || ['docx', 'doc'].includes(extension || '')) {
    return parseWord(buffer);
  } else if (mimeType.includes('pdf') || extension === 'pdf') {
    return parsePdf(buffer);
  } else {
    // Treat as plain text fallback
    return buffer.toString('utf-8');
  }
}
