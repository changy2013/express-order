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

    if (batchId) {
      const r = await query('SELECT * FROM outbound_orders WHERE batch_id = $1 ORDER BY created_at DESC LIMIT 2000', [batchId]);
      return NextResponse.json({ orders: r.rows });
    }

    // 已导入运单列表：按外部编码聚合分组，按 外部编码 / 收件人姓名 / 提交时间 筛选 + 分页
    const qCode = (searchParams.get('q_code') || '').trim();
    const qName = (searchParams.get('q_name') || '').trim();
    const dateFrom = (searchParams.get('date_from') || '').trim();
    const dateTo = (searchParams.get('date_to') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20));

    const where: string[] = [];
    const params: any[] = [];
    if (qCode) { params.push(`%${qCode}%`); where.push(`external_code ILIKE $${params.length}`); }
    if (qName) { params.push(`%${qName}%`); where.push(`receiver_name ILIKE $${params.length}`); }
    if (dateFrom) { params.push(dateFrom); where.push(`created_at >= $${params.length}`); }
    if (dateTo) { params.push(dateTo); where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // 按外部编码聚合：空值行用 row id 各自独立成组
    const groupExpr = `CASE WHEN external_code IS NOT NULL AND TRIM(external_code) != '' THEN external_code ELSE id::varchar END`;

    const countRes = await query<{ total: string }>(
      `SELECT COUNT(DISTINCT ${groupExpr})::int AS total FROM outbound_orders ${whereSql}`,
      params
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const offset = (page - 1) * pageSize;
    const listParams = [...params, pageSize, offset];
    const r = await query(
      `SELECT
         ${groupExpr} AS "外部编码",
         MAX(store_name) as "收货门店",
         MAX(receiver_name) as "收件人姓名",
         MAX(receiver_phone) as "收件人电话",
         MAX(receiver_address) as "收件人地址",
         MAX(remark) as "备注",
         COUNT(*)::int as sku_count,
         MAX(created_at) as created_at,
         json_agg(json_build_object(
           'sku_code', sku_code,
           'sku_name', sku_name,
           'sku_quantity', sku_quantity,
           'sku_spec', sku_spec
         ) ORDER BY sku_code) as sku_items
       FROM outbound_orders ${whereSql}
       GROUP BY ${groupExpr}
       ORDER BY MAX(created_at) DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return NextResponse.json({ groups: r.rows, total, page, pageSize });
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

    // 外部编码级重复检测：先查库找出已存在的 (external_code, sku_code) 对，同时收集已存在的外部编码
    const keyOf = (code: string, sku: string) => `${code} ${sku}`;
    const existingKeys = new Set<string>();
    const existingCodes = new Set<string>(); // 已入库的外部编码集合
    const codes = Array.from(
      new Set(rows.map((r) => String(r.外部编码 || '').trim()).filter(Boolean))
    );
    const EXIST_CHUNK = 5000;
    for (let i = 0; i < codes.length; i += EXIST_CHUNK) {
      const slice = codes.slice(i, i + EXIST_CHUNK);
      const ph = slice.map((_, idx) => `$${idx + 1}`).join(',');
      const er = await query<{ external_code: string; sku_code: string }>(
        `SELECT external_code, sku_code FROM outbound_orders WHERE external_code IN (${ph})`,
        slice
      );
      for (const x of er.rows) {
        existingKeys.add(keyOf(x.external_code ?? '', x.sku_code));
        existingCodes.add(x.external_code ?? '');
      }
    }

    // 区分要插入的行 vs 与已入库重复要跳过的行
    const toInsert: OrderRow[] = [];
    const skippedSeen = new Set<string>();
    const skipped: { 外部编码: string; SKU物品编码: string }[] = [];
    for (const row of rows) {
      const code = String(row.外部编码 || '').trim();
      const sku = String(row.SKU物品编码 || '');
      if (code && existingKeys.has(keyOf(code, sku))) {
        const k = keyOf(code, sku);
        if (!skippedSeen.has(k)) { skippedSeen.add(k); skipped.push({ 外部编码: code, SKU物品编码: sku }); }
        continue;
      }
      toInsert.push(row);
    }

    // 提交数据中，与已入库数据存在相同外部编码的集合
    const duplicateCodes = Array.from(existingCodes).filter((c) => codes.includes(c));

    // 批量插入（分批多值 INSERT）。已去掉 ON CONFLICT，重复行在上面已过滤。
    // CHUNK 取 4000：12 参数/行 × 4000 = 48000 < PG 上限 65535，1000 单一次 INSERT 即可，
    // 把远程 DB 的往返次数压到最低（每次往返 ~250ms 是主要耗时来源）。
    const CHUNK = 4000;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
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
      const res = await query(
        `INSERT INTO outbound_orders(
          id, batch_id, external_code, store_name, receiver_name, receiver_phone, receiver_address,
          sku_code, sku_name, sku_quantity, sku_spec, remark
        ) VALUES ${placeholders.join(',')}`,
        values
      );
      inserted += res.rowCount;
    }

    const skippedUniq = skipped;

    // 批次实际入库数回填（去掉重复后的真实条数）
    if (inserted !== rows.length) {
      await query('UPDATE import_batches SET order_count = $1 WHERE id = $2', [inserted, batchId]);
    }

    return NextResponse.json({
      success: true,
      batchId,
      count: inserted,
      submitted: rows.length,
      skippedCount: rows.length - inserted,
      skipped: skippedUniq,
      duplicateCodes,
    });
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
