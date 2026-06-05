/**
 * 出库单提交 / 查询 —— outbound_orders + import_batches
 * GET    ?type=batches            列出导入批次
 * GET    ?batchId=xxx             查某批次的出库单（默认查全部，limit 500）
 * POST   { rows, fileName, fileSize, ruleId, ruleName }  创建批次并批量写入
 * DELETE ?id=xxx | ?batchId=xxx   删除单条 / 整批
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { OrderRow } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const batchId = searchParams.get('batchId');

    if (type === 'batches') {
      const r = await query('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 200');
      return NextResponse.json({ batches: r.rows });
    }

    const r = batchId
      ? await query('SELECT * FROM outbound_orders WHERE batch_id = $1 ORDER BY created_at DESC LIMIT 2000', [batchId])
      : await query('SELECT * FROM outbound_orders ORDER BY created_at DESC LIMIT 500');
    return NextResponse.json({ orders: r.rows });
  } catch (error: any) {
    console.error('fetch orders failed:', error);
    return NextResponse.json({ error: error.message || '查询失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, fileName, fileSize, ruleId, ruleName } = body as {
      rows: OrderRow[];
      fileName?: string;
      fileSize?: number;
      ruleId?: string;
      ruleName?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可提交的出库单数据' }, { status: 400 });
    }

    // 创建批次
    const batchId = crypto.randomUUID();
    await query(
      `INSERT INTO import_batches(id, file_name, file_size, rule_id, rule_name, status, order_count)
       VALUES($1, $2, $3, $4, $5, 'success', $6)`,
      [batchId, fileName || '未命名文件', fileSize || 0, ruleId || null, ruleName || null, rows.length]
    );

    // 批量插入出库单（分批构造多值 INSERT，避免 1000+ 行逐条往返）
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: any[] = [];
      const placeholders: string[] = [];
      chunk.forEach((row, idx) => {
        const base = idx * 12;
        placeholders.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`
        );
        values.push(
          crypto.randomUUID(),
          batchId,
          row.外部编码 || null,
          row.收货门店 || null,
          row.收件人姓名 || null,
          row.收件人电话 || null,
          row.收件人地址 || null,
          row.SKU物品编码 || '',
          row.SKU物品名称 || '',
          Number(row.SKU发货数量) || 1,
          row.SKU规格型号 || null,
          row.备注 || null
        );
      });
      await query(
        `INSERT INTO outbound_orders(
          id, batch_id, external_code, store_name, receiver_name, receiver_phone, receiver_address,
          sku_code, sku_name, sku_quantity, sku_spec, remark
        ) VALUES ${placeholders.join(',')}`,
        values
      );
    }

    return NextResponse.json({ success: true, batchId, count: rows.length });
  } catch (error: any) {
    console.error('submit orders failed:', error);
    return NextResponse.json({ error: error.message || '提交失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const batchId = searchParams.get('batchId');

    if (batchId) {
      await query('DELETE FROM outbound_orders WHERE batch_id = $1', [batchId]);
      await query('DELETE FROM import_batches WHERE id = $1', [batchId]);
      return NextResponse.json({ success: true });
    }
    if (id) {
      await query('DELETE FROM outbound_orders WHERE id = $1', [id]);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: '缺少 id 或 batchId' }, { status: 400 });
  } catch (error: any) {
    console.error('delete order failed:', error);
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 });
  }
}
