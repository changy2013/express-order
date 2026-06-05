declare module 'pdf-parse' {
  interface PDFParseOptions {
    pagerender?: (pageData: any) => string;
    max?: number;
    version?: string;
  }

  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  function pdf(dataBuffer: Buffer, options?: PDFParseOptions): Promise<PDFParseResult>;
  export = pdf;
}
