/**
 * 执行解析 —— 用规则引擎把上传文件转成结构化 OrderRow[]
 * POST multipart/form-data:
 *   file    (必填) 上传文件
 *   ruleId  (可选) 使用已保存规则；与 rule 二选一
 *   rule    (可选) 内联规则 JSON 字符串（AI 推荐规则 / 临时规则）
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { executeRule } from '@/lib/rule-engine';
import type { ParseRule } from '@/types/rule';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

/** 补全内联规则的元数据字段 */
function normalizeInlineRule(raw: any): ParseRule {
  return {
    id: raw.id || 'inline',
    name: raw.name || '临时规则',
    description: raw.description || '',
    fileType: raw.fileType,
    excelConfig: raw.excelConfig,
    wordConfig: raw.wordConfig,
    pdfConfig: raw.pdfConfig,
    staticValues: raw.staticValues || {},
    defaultValues: raw.defaultValues || {},
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
    }

    const ruleId = form.get('ruleId');
    const ruleJson = form.get('rule');

    let rule: ParseRule | null = null;

    if (ruleId && typeof ruleId === 'string') {
      const r = await query('SELECT * FROM parse_rules WHERE id = $1', [ruleId]);
      if (!r.rows.length) {
        return NextResponse.json({ error: '指定的规则不存在' }, { status: 404 });
      }
      rule = rowToRule(r.rows[0]);
    } else if (ruleJson && typeof ruleJson === 'string') {
      try {
        rule = normalizeInlineRule(JSON.parse(ruleJson));
      } catch {
        return NextResponse.json({ error: '内联规则不是合法 JSON' }, { status: 400 });
      }
    }

    if (!rule) {
      return NextResponse.json({ error: '需提供 ruleId 或 rule' }, { status: 400 });
    }

    const blob = file as File;
    const buffer = Buffer.from(await blob.arrayBuffer());

    const { rows, warnings } = await executeRule(rule, buffer, blob.type, blob.name);

    return NextResponse.json({
      rows,
      warnings,
      count: rows.length,
      ruleName: rule.name,
    });
  } catch (error: any) {
    console.error('parse failed:', error);
    return NextResponse.json({ error: error.message || '解析失败' }, { status: 500 });
  }
}
