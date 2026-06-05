/**
 * AI 分析文件 → 生成推荐解析规则
 * 调用 DeepSeek（OpenAI 兼容 /chat/completions, response_format json_object）
 */
import type { AIRecommendedRule } from '@/types/rule';
import { extractFileStructure } from './file-structure';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';

export interface LLMOverride {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function resolveLLMConfig(override?: LLMOverride) {
  const apiKey = override?.apiKey || process.env.LLM_API_KEY || '';
  const baseUrl = (override?.baseUrl || process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  const model = override?.model || process.env.LLM_MODEL || 'deepseek-chat';
  return { apiKey, baseUrl, model };
}

/** 从 AI 文本响应中稳健地抽取 JSON 对象 */
function parseJsonFromText(text: string): any {
  let t = text.trim();
  // 去掉 ```json ... ``` 包裹
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    // 退一步：截取第一个 { 到最后一个 }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error('AI 返回内容不是合法 JSON');
  }
}

export async function analyzeFileToRule(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
  override?: LLMOverride
): Promise<AIRecommendedRule> {
  const { apiKey, baseUrl, model } = resolveLLMConfig(override);
  if (!apiKey) throw new Error('未配置 LLM API Key（设置 LLM_API_KEY 环境变量或在设置中填写）');

  const { fileType, summary } = await extractFileStructure(buffer, fileName, mimeType);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(summary) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 调用失败 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('LLM 返回为空');

  const parsed = parseJsonFromText(content);

  // 规整：确保 fileType 与检测一致，补全 aiAnalysis
  const rule: AIRecommendedRule = {
    name: parsed.name || `${fileName} 解析规则`,
    description: parsed.description || '',
    fileType: parsed.fileType || fileType,
    excelConfig: parsed.excelConfig,
    wordConfig: parsed.wordConfig,
    pdfConfig: parsed.pdfConfig,
    staticValues: parsed.staticValues || {},
    defaultValues: parsed.defaultValues || {},
    aiAnalysis: {
      summary: parsed.aiAnalysis?.summary || '',
      guessedFields: parsed.aiAnalysis?.guessedFields || [],
      warnings: parsed.aiAnalysis?.warnings || [],
      confidence: parsed.aiAnalysis?.confidence || 'medium',
    },
  };

  return rule;
}
