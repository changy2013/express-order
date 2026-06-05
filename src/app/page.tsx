'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { OrderRow, ParseRule, AIRecommendedRule, ImportBatch, ToastMessage, SubmitResult } from '@/types';
import { TEMP_ZONES } from '@/types';
import type { EditorRule } from './_components/RuleEditorModal';
import { PageView } from './_components/PageView';
import { blankRule } from '@/lib/blank-rule';

type Step = 'upload' | 'rule' | 'preview';
type TargetKey =
  | '外部编码' | '收货门店' | '收件人姓名' | '收件人电话' | '收件人地址'
  | 'SKU物品编码' | 'SKU物品名称' | 'SKU发货数量' | 'SKU规格型号' | '重量' | '温层' | '备注';

/** 校验单行：返回精确到字段的错误列表（field 用目标字段名，便于单元格标红） */
function validateRow(r: OrderRow): OrderRow['_errors'] {
  const errs: NonNullable<OrderRow['_errors']> = [];
  // 必填：SKU 编码与名称至少其一
  if (!String(r.SKU物品编码 || '').trim() && !String(r.SKU物品名称 || '').trim()) {
    errs.push({ field: 'SKU物品编码', message: 'SKU编码与名称不能同时为空' });
    errs.push({ field: 'SKU物品名称', message: 'SKU编码与名称不能同时为空' });
  }
  // 件数（数量）必须为正数
  if (!(Number(r.SKU发货数量) > 0)) {
    errs.push({ field: 'SKU发货数量', message: '数量必须为正数' });
  }
  // 电话格式（填写了才校验）：中国大陆手机号或 7–12 位固话/带区号
  const phone = String(r.收件人电话 || '').trim();
  if (phone && !/^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(phone)) {
    errs.push({ field: '收件人电话', message: '电话格式不正确' });
  }
  // 重量（填写了才校验）：必须为正数
  const weightRaw = r.重量;
  if (weightRaw !== undefined && weightRaw !== null && String(weightRaw).trim() !== '') {
    if (!(Number(weightRaw) > 0)) {
      errs.push({ field: '重量', message: '重量必须为正数' });
    }
  }
  // 温层（填写了才校验）：必须是允许值之一
  const zone = String(r.温层 || '').trim();
  if (zone && !(TEMP_ZONES as readonly string[]).includes(zone)) {
    errs.push({ field: '温层', message: `温层须为 ${TEMP_ZONES.join('/')} 之一` });
  }
  return errs;
}

/**
 * 全量校验 + 同批次外部编码重复检测
 * - 同批次内：外部编码重复 → _isDuplicate
 * - 与已入库数据的重复不在此预判（不预拉全库编码）：改由提交时数据库唯一索引拦截，
 *   提交后用返回的 skipped 列表回填 _duplicateWithBatch。
 * 外部编码为空的行不参与重复判定。校验会清掉旧的 _duplicateWithBatch（编辑后该判定已失效）。
 */
function validateAll(rows: OrderRow[]): OrderRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const code = String(r.外部编码 || '').trim();
    const isDupInBatch = !!code && seen.has(code);
    if (code && !isDupInBatch) seen.set(code, 1);
    return {
      ...r,
      _errors: validateRow(r),
      _isDuplicate: isDupInBatch,
      _duplicateWithBatch: false,
    };
  });
}

export default function Home() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [rules, setRules] = useState<ParseRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [aiRule, setAiRule] = useState<AIRecommendedRule | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // 提交进度条（独立于解析进度），与提交结果汇总
  const [submitProgress, setSubmitProgress] = useState<{ active: boolean; percent: number; label: string }>(
    { active: false, percent: 0, label: '' }
  );
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [llm, setLlm] = useState({ apiKey: '', baseUrl: '', model: '' });

  // 规则编辑器：null=关闭；否则为正在编辑的规则草稿（新建/编辑/复制/AI确认共用）
  const [editorRule, setEditorRule] = useState<EditorRule | null>(null);

  // 解析进度（百分比 + 当前/总条数）与解析失败详情
  const [progress, setProgress] = useState<{ active: boolean; percent: number; label: string; current: number; total: number }>(
    { active: false, percent: 0, label: '', current: 0, total: 0 }
  );
  const [parseError, setParseError] = useState<{ message: string; fileName: string; fileSize: number } | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const loadRules = useCallback(async () => {
    try {
      const r = await fetch('/api/rules');
      const d = await r.json();
      if (r.ok) setRules(d.rules || []);
    } catch { /* ignore */ }
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      const r = await fetch('/api/orders?type=batches');
      const d = await r.json();
      if (r.ok) setBatches(d.batches || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadRules();
    loadBatches();
    try {
      const saved = localStorage.getItem('llm_config');
      if (saved) setLlm(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [loadRules, loadBatches]);

  const llmHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (llm.apiKey) h['x-llm-key'] = llm.apiKey;
    if (llm.baseUrl) h['x-llm-base'] = llm.baseUrl;
    if (llm.model) h['x-llm-model'] = llm.model;
    return h;
  }, [llm]);

  const ACCEPTED_EXT = ['xlsx', 'xls', 'csv', 'docx', 'doc', 'pdf'];
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB

  const onPickFile = (f: File | null) => {
    if (!f) return;
    // 文件格式 / 空文件 校验，明确提示
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!ACCEPTED_EXT.includes(ext)) {
      toast(`不支持的文件格式「.${ext}」，请上传 Excel(.xlsx/.xls) / Word(.docx) / PDF`, 'error');
      return;
    }
    if (f.size === 0) {
      toast('文件为空（0 字节），请检查后重新上传', 'error');
      return;
    }
    if (f.size > MAX_SIZE) {
      toast(`文件过大（${(f.size / 1024 / 1024).toFixed(1)}MB），上限 20MB`, 'error');
      return;
    }
    setFile(f);
    setAiRule(null);
    setSelectedRuleId('');
    setRows([]);
    setWarnings([]);
    setParseError(null);
    setStep('rule');
  };

  const runAiAnalyze = async () => {
    if (!file) return;
    setAiLoading(true);
    setAiRule(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/ai-analyze', { method: 'POST', headers: llmHeaders(), body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'AI 分析失败');
      setAiRule(d.rule);
      setSelectedRuleId('');
      setParseError(null);
      toast('AI 已生成解析规则，请确认后解析', 'success');
    } catch (e: any) {
      toast(e.message || 'AI 分析失败', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const runParse = async () => {
    if (!file) return;
    if (!selectedRuleId && !aiRule) {
      toast('请选择已有规则或用 AI 生成规则', 'warning');
      return;
    }
    setParsing(true);
    setParseError(null);
    // 进度条：解析为单次请求，前端用平滑递增动画驱动，完成时落到 100% + 真实条数
    setProgress({ active: true, percent: 8, label: '正在上传并解析文件…', current: 0, total: 0 });
    const timer = setInterval(() => {
      setProgress((p) => (p.active && p.percent < 90 ? { ...p, percent: p.percent + Math.max(1, (90 - p.percent) * 0.15) } : p));
    }, 200);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (selectedRuleId) fd.append('ruleId', selectedRuleId);
      else if (aiRule) fd.append('rule', JSON.stringify(aiRule));
      const r = await fetch('/api/parse', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '解析失败');
      const parsed: OrderRow[] = (d.rows || []).map((row: OrderRow, i: number) => ({ ...row, _id: row._id || `row_${i}` }));
      // 解析成功但 0 条：视为「无法解析」，给明确提示 + 手动配置入口
      if (parsed.length === 0) {
        throw new Error('未能从文件中解析出任何有效数据，可能是规则与文件结构不匹配。请调整规则或手动配置后重试。');
      }
      setProgress({ active: true, percent: 100, label: '解析完成', current: parsed.length, total: parsed.length });
      setRows(validateAll(parsed));
      setWarnings(d.warnings || []);
      setStep('preview');
      toast(`解析完成，共 ${parsed.length} 条`, 'success');
      setTimeout(() => setProgress((p) => ({ ...p, active: false })), 400);
    } catch (e: any) {
      const message = e?.message || '解析失败';
      // 记录失败详情：展示原始文件信息 + 提供手动配置规则入口
      setParseError({ message, fileName: file.name, fileSize: file.size });
      setProgress((p) => ({ ...p, active: false }));
      toast(message, 'error');
    } finally {
      clearInterval(timer);
      setParsing(false);
    }
  };

  // —— 规则编辑器流程：新建 / 编辑 / 复制 / AI 确认 共用一个模态 ——

  /** 打开 AI 推荐规则进行微调确认（替代旧的直接保存） */
  const openAiRuleEditor = () => {
    if (aiRule) setEditorRule(structuredClone(aiRule) as EditorRule);
  };

  /** 手动新建空白规则（按当前文件推断类型，无文件则默认 excel） */
  const newRule = () => {
    const ext = (file?.name.split('.').pop() || '').toLowerCase();
    const ft: ParseRule['fileType'] = ext === 'pdf' ? 'pdf' : (ext === 'doc' || ext === 'docx') ? 'word' : 'excel';
    setEditorRule(blankRule(ft));
  };

  /** 编辑已有规则 */
  const editRule = (r: ParseRule) => setEditorRule(structuredClone(r) as EditorRule);

  /** 复制已有规则：去掉 id 与时间戳，名称加「副本」，打开编辑器另存为新规则 */
  const copyRule = (r: ParseRule) => {
    const copy = structuredClone(r) as EditorRule;
    delete copy.id;
    copy.name = `${r.name} - 副本`;
    setEditorRule(copy);
  };

  /** 删除规则 */
  const deleteRule = async (id: string) => {
    try {
      const r = await fetch(`/api/rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '删除失败');
      toast('规则已删除', 'success');
      if (selectedRuleId === id) setSelectedRuleId('');
      await loadRules();
    } catch (e: any) {
      toast(e.message || '删除失败', 'error');
    }
  };

  /** 编辑器保存成功回调：刷新列表、选中、关闭、清空 AI 草稿 */
  const onRuleSaved = (saved: ParseRule) => {
    loadRules();
    setSelectedRuleId(saved.id);
    setAiRule(null);
    setEditorRule(null);
  };

  const submitOrders = async () => {
    // 有错误的行不允许提交：明确提示用户先修正，并把视图定位到错误汇总
    if (errorCount > 0) {
      toast(`有 ${errorCount} 行存在错误，请先修正后再提交`, 'error');
      return;
    }
    const valid = rows.filter((r) => !(r._errors && r._errors.length));
    if (!valid.length) {
      toast('没有可提交的有效数据', 'warning');
      return;
    }
    setSubmitting(true);
    setSubmitResult(null);
    // 提交进度条：单次请求，前端平滑递增驱动，响应到达后落到 100%
    setSubmitProgress({ active: true, percent: 8, label: `正在提交 ${valid.length} 条出库单…` });
    const timer = setInterval(() => {
      setSubmitProgress((p) => (p.active && p.percent < 90 ? { ...p, percent: p.percent + Math.max(1, (90 - p.percent) * 0.12) } : p));
    }, 200);
    try {
      const ruleName = selectedRuleId
        ? rules.find((x) => x.id === selectedRuleId)?.name
        : aiRule?.name;
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: valid,
          fileName: file?.name,
          fileSize: file?.size,
          ruleId: selectedRuleId || undefined,
          ruleName,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '提交失败');

      setSubmitProgress({ active: true, percent: 100, label: '提交完成' });

      const skipped: { 外部编码: string; SKU物品编码: string }[] = d.skipped || [];
      const success: number = d.count ?? 0;
      const skippedCount: number = d.skippedCount ?? (valid.length - success);
      // 失败 = 提交总数 - 成功 - 重复跳过（正常路径下为 0，异常少插时兜底体现）
      const failed = Math.max(0, valid.length - success - skippedCount);

      // 结果汇总：成功 N 条、失败/跳过 N 条
      setSubmitResult({ total: valid.length, success, skipped: skippedCount, failed, batchId: d.batchId });

      if (skipped.length > 0) {
        // DB 唯一索引拦截了与已入库数据重复的行：标红保留在预览页，提示用户
        const skipKeys = new Set(skipped.map((s) => `${s.外部编码} ${s.SKU物品编码}`));
        setRows((prev) =>
          prev.map((row) => {
            const code = String(row.外部编码 || '').trim();
            const hit = !!code && skipKeys.has(`${code} ${row.SKU物品编码 || ''}`);
            return hit ? { ...row, _duplicateWithBatch: true } : row;
          })
        );
        toast(`成功入库 ${success} 条，${skippedCount} 条与已入库数据重复已跳过`, 'warning');
        await loadBatches();
        // 不 resetAll：让用户看到被跳过的行（已标红）
        return;
      }

      toast(`成功入库 ${success} 条出库单`, 'success');
      await loadBatches();
      // 全部成功：保留结果汇总弹窗，清空表格数据，回到上传步骤准备下一批
      resetAll();
    } catch (e: any) {
      toast(e.message || '提交失败', 'error');
    } finally {
      clearInterval(timer);
      setTimeout(() => setSubmitProgress((p) => ({ ...p, active: false })), 400);
      setSubmitting(false);
    }
  };

  const exportExcel = async () => {
    if (!rows.length) return;
    try {
      const r = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, fileName: `${file?.name || '出库单'}_导出.xlsx` }),
      });
      if (!r.ok) throw new Error('导出失败');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file?.name || '出库单'}_导出.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast(e.message || '导出失败', 'error');
    }
  };

  const resetAll = () => {
    setFile(null);
    setRows([]);
    setWarnings([]);
    setAiRule(null);
    setSelectedRuleId('');
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateCell = (id: string, key: TargetKey, value: string) => {
    setRows((prev) => {
      const next = prev.map((r) => {
        if (r._id !== id) return r;
        const updated: OrderRow = { ...r };
        if (key === 'SKU发货数量') updated.SKU发货数量 = Number(value) || 0;
        else if (key === '重量') updated.重量 = value.trim() === '' ? undefined : Number(value);
        else (updated as any)[key] = value;
        return updated;
      });
      return validateAll(next);
    });
  };

  const deleteRow = (id: string) => {
    setRows((prev) => validateAll(prev.filter((r) => r._id !== id)));
  };

  /** 新增一行空白数据（追加到末尾） */
  const addRow = () => {
    setRows((prev) => {
      const blank: OrderRow = {
        _id: `row_new_${prev.length}_${prev.reduce((s, r) => s + (r._id?.length || 0), 0)}`,
        外部编码: '', 收货门店: '', 收件人姓名: '', 收件人电话: '', 收件人地址: '',
        SKU物品编码: '', SKU物品名称: '', SKU发货数量: 0, SKU规格型号: '', 重量: undefined, 温层: '', 备注: '',
      };
      return validateAll([...prev, blank]);
    });
  };

  const errorCount = useMemo(() => rows.filter((r) => r._errors && r._errors.length).length, [rows]);
  const dupCount = useMemo(() => rows.filter((r) => r._isDuplicate || r._duplicateWithBatch).length, [rows]);

  return (
    <PageView
      state={{ step, file, dragOver, rules, selectedRuleId, aiRule, aiLoading, parsing, rows, warnings, submitting, batches, showSettings, llm, toasts, errorCount, dupCount, editorRule, progress, parseError, submitProgress, submitResult }}
      actions={{ setStep, setDragOver, setSelectedRuleId, setShowSettings, setLlm, onPickFile, runAiAnalyze, runParse, submitOrders, exportExcel, resetAll, updateCell, deleteRow, addRow, toast, loadRules, openAiRuleEditor, newRule, editRule, copyRule, deleteRule, closeRuleEditor: () => setEditorRule(null), onRuleSaved, dismissParseError: () => setParseError(null), dismissSubmitResult: () => setSubmitResult(null) }}
      fileInputRef={fileInputRef}
    />
  );
}
