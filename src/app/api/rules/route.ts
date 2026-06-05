/**
 * 解析规则 CRUD —— parse_rules 表
 * GET    /api/rules            列出全部规则（可选 ?fileType=excel 过滤）
 * GET    /api/rules?id=xxx     取单条
 * POST   /api/rules            创建（body: {name, description, fileType, config}）
 * PUT    /api/rules            更新（body: {id, ...}）
 * DELETE /api/rules?id=xxx     删除
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { ParseRule } from '@/types/rule';

export const runtime = 'nodejs';

/** DB 行 → ParseRule（config 列含各 fileType 子配置 + static/default） */
function rowToRule(row: any): ParseRule {
  const cfg = typeof row.config === 'string' ? JSON.parse(row.config) : row.config || {};
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    fileType: row.file_type,
    excelConfig: cfg.excelConfig,
    wordConfig: cfg.wordConfig,
    pdfConfig: cfg.pdfConfig,
    staticValues: cfg.staticValues || {},
    defaultValues: cfg.defaultValues || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** ParseRule 中除元数据外的部分 → config JSONB */
function ruleToConfig(body: any) {
  return {
    excelConfig: body.excelConfig,
    wordConfig: body.wordConfig,
    pdfConfig: body.pdfConfig,
    staticValues: body.staticValues || {},
    defaultValues: body.defaultValues || {},
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const fileType = searchParams.get('fileType');

    if (id) {
      const r = await query('SELECT * FROM parse_rules WHERE id = $1', [id]);
      if (!r.rows.length) return NextResponse.json({ error: '规则不存在' }, { status: 404 });
      return NextResponse.json({ rule: rowToRule(r.rows[0]) });
    }

    const r = fileType
      ? await query('SELECT * FROM parse_rules WHERE file_type = $1 ORDER BY updated_at DESC', [fileType])
      : await query('SELECT * FROM parse_rules ORDER BY updated_at DESC');
    return NextResponse.json({ rules: r.rows.map(rowToRule) });
  } catch (error: any) {
    console.error('list rules failed:', error);
    return NextResponse.json({ error: error.message || '查询规则失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.fileType) {
      return NextResponse.json({ error: '缺少 name 或 fileType' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const config = ruleToConfig(body);
    await query(
      `INSERT INTO parse_rules(id, name, description, file_type, config)
       VALUES($1, $2, $3, $4, $5)`,
      [id, body.name, body.description || '', body.fileType, JSON.stringify(config)]
    );
    const r = await query('SELECT * FROM parse_rules WHERE id = $1', [id]);
    return NextResponse.json({ rule: rowToRule(r.rows[0]) });
  } catch (error: any) {
    console.error('create rule failed:', error);
    return NextResponse.json({ error: error.message || '创建规则失败' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    const config = ruleToConfig(body);
    await query(
      `UPDATE parse_rules SET name=$2, description=$3, file_type=$4, config=$5, updated_at=NOW()
       WHERE id=$1`,
      [body.id, body.name, body.description || '', body.fileType, JSON.stringify(config)]
    );
    const r = await query('SELECT * FROM parse_rules WHERE id = $1', [body.id]);
    if (!r.rows.length) return NextResponse.json({ error: '规则不存在' }, { status: 404 });
    return NextResponse.json({ rule: rowToRule(r.rows[0]) });
  } catch (error: any) {
    console.error('update rule failed:', error);
    return NextResponse.json({ error: error.message || '更新规则失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    await query('DELETE FROM parse_rules WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('delete rule failed:', error);
    return NextResponse.json({ error: error.message || '删除规则失败' }, { status: 500 });
  }
}
