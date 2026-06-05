/**
 * 导出 Excel —— 把 OrderRow[] 生成 .xlsx 下载
 * POST { rows: OrderRow[], fileName?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import type { OrderRow } from '@/types';

export const runtime = 'nodejs';

const COLUMNS: { header: string; key: keyof OrderRow; width: number }[] = [
  { header: '外部编码', key: '外部编码', width: 18 },
  { header: '收货门店', key: '收货门店', width: 24 },
  { header: '收件人姓名', key: '收件人姓名', width: 12 },
  { header: '收件人电话', key: '收件人电话', width: 16 },
  { header: '收件人地址', key: '收件人地址', width: 40 },
  { header: 'SKU物品编码', key: 'SKU物品编码', width: 16 },
  { header: 'SKU物品名称', key: 'SKU物品名称', width: 30 },
  { header: 'SKU发货数量', key: 'SKU发货数量', width: 12 },
  { header: 'SKU规格型号', key: 'SKU规格型号', width: 18 },
  { header: '备注', key: '备注', width: 20 },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = body.rows as OrderRow[];
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: '缺少 rows' }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('出库单');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));

    // 表头样式（鲸天主色）
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0FC6C2' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const row of rows) {
      ws.addRow({
        外部编码: row.外部编码 || '',
        收货门店: row.收货门店 || '',
        收件人姓名: row.收件人姓名 || '',
        收件人电话: row.收件人电话 || '',
        收件人地址: row.收件人地址 || '',
        SKU物品编码: row.SKU物品编码 || '',
        SKU物品名称: row.SKU物品名称 || '',
        SKU发货数量: Number(row.SKU发货数量) || 0,
        SKU规格型号: row.SKU规格型号 || '',
        备注: row.备注 || '',
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const fileName = encodeURIComponent(body.fileName || '出库单导出.xlsx');

    return new NextResponse(buf as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      },
    });
  } catch (error: any) {
    console.error('export failed:', error);
    return NextResponse.json({ error: error.message || '导出失败' }, { status: 500 });
  }
}
