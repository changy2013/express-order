'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { OrderRow, ParseRule, AIRecommendedRule, ImportBatch, ToastMessage } from '@/types';
import { PageView } from './_components/PageView';

type Step = 'upload' | 'rule' | 'preview';
type TargetKey =
  | '外部编码' | '收货门店' | '收件人姓名' | '收件人电话' | '收件人地址'
  | 'SKU物品编码' | 'SKU物品名称' | 'SKU发货数量' | 'SKU规格型号' | '备注';

/** 校验单行 */
function validateRow(r: OrderRow): OrderRow['_errors'] {
  const errs: NonNullable<OrderRow['_errors']> = [];
  if (!r.SKU物品编码 && !r.SKU物品名称) errs.push({ field: 'SKU', message: 'SKU编码与名称不能同时为空' });
  if (!(Number(r.SKU发货数量) > 0)) errs.push({ field: 'SKU发货数量', message: '数量必须为正数' });
  return errs;
}

/** 全量校验 + 重复检测（同 门店+SKU编码+SKU名称 视为重复） */
function validateAll(rows: OrderRow[]): OrderRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.收货门店 || ''}|${r.SKU物品编码 || ''}|${r.SKU物品名称 || ''}`;
    const isDup = seen.has(key);
    if (!isDup) seen.set(key, 1);
    return { ...r, _errors: validateRow(r), _isDuplicate: isDup };
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

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [llm, setLlm] = useState({ apiKey: '', baseUrl: '', model: '' });

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

  const onPickFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setAiRule(null);
    setSelectedRuleId('');
    setRows([]);
    setWarnings([]);
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
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (selectedRuleId) fd.append('ruleId', selectedRuleId);
      else if (aiRule) fd.append('rule', JSON.stringify(aiRule));
      const r = await fetch('/api/parse', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '解析失败');
      const parsed: OrderRow[] = (d.rows || []).map((row: OrderRow, i: number) => ({ ...row, _id: row._id || `row_${i}` }));
      setRows(validateAll(parsed));
      setWarnings(d.warnings || []);
      setStep('preview');
      toast(`解析完成，共 ${parsed.length} 条`, 'success');
    } catch (e: any) {
      toast(e.message || '解析失败', 'error');
    } finally {
      setParsing(false);
    }
  };

  const saveAiRule = async () => {
    if (!aiRule) return;
    try {
      const r = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiRule),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '保存失败');
      toast('规则已保存到规则库', 'success');
      await loadRules();
      setSelectedRuleId(d.rule.id);
      setAiRule(null);
    } catch (e: any) {
      toast(e.message || '保存失败', 'error');
    }
  };

  const submitOrders = async () => {
    const valid = rows.filter((r) => !(r._errors && r._errors.length));
    if (!valid.length) {
      toast('没有可提交的有效数据', 'warning');
      return;
    }
    setSubmitting(true);
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
      toast(`成功入库 ${d.count} 条出库单`, 'success');
      await loadBatches();
      resetAll();
    } catch (e: any) {
      toast(e.message || '提交失败', 'error');
    } finally {
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
        else (updated as any)[key] = value;
        return updated;
      });
      return validateAll(next);
    });
  };

  const deleteRow = (id: string) => {
    setRows((prev) => validateAll(prev.filter((r) => r._id !== id)));
  };

  const errorCount = useMemo(() => rows.filter((r) => r._errors && r._errors.length).length, [rows]);
  const dupCount = useMemo(() => rows.filter((r) => r._isDuplicate).length, [rows]);

  return (
    <PageView
      state={{ step, file, dragOver, rules, selectedRuleId, aiRule, aiLoading, parsing, rows, warnings, submitting, batches, showSettings, llm, toasts, errorCount, dupCount }}
      actions={{ setStep, setDragOver, setSelectedRuleId, setShowSettings, setLlm, onPickFile, runAiAnalyze, runParse, saveAiRule, submitOrders, exportExcel, resetAll, updateCell, deleteRow, toast, loadRules }}
      fileInputRef={fileInputRef}
    />
  );
}
