/**
 * AI 分析文件结构 → 返回推荐解析规则
 * POST multipart/form-data: file（必填）
 * 可选 header: x-llm-key / x-llm-base / x-llm-model 覆盖环境变量
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyzeFileToRule } from '@/lib/ai/analyze-file';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
    }

    const blob = file as File;
    const buffer = Buffer.from(await blob.arrayBuffer());

    const override = {
      apiKey: req.headers.get('x-llm-key') || undefined,
      baseUrl: req.headers.get('x-llm-base') || undefined,
      model: req.headers.get('x-llm-model') || undefined,
    };

    const rule = await analyzeFileToRule(buffer, blob.name, blob.type, override);
    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error('ai-analyze failed:', error);
    return NextResponse.json({ error: error.message || 'AI 分析失败' }, { status: 500 });
  }
}
