'use client';

import type { RefObject } from 'react';
import type { OrderRow, ParseRule, AIRecommendedRule, ImportBatch, ToastMessage } from '@/types';
import { UploadStep } from './UploadStep';
import { RuleStep } from './RuleStep';
import { PreviewStep } from './PreviewStep';
import { SettingsModal } from './SettingsModal';

export type Step = 'upload' | 'rule' | 'preview';
export type TargetKey =
  | '外部编码' | '收货门店' | '收件人姓名' | '收件人电话' | '收件人地址'
  | 'SKU物品编码' | 'SKU物品名称' | 'SKU发货数量' | 'SKU规格型号' | '备注';

export interface ViewState {
  step: Step;
  file: File | null;
  dragOver: boolean;
  rules: ParseRule[];
  selectedRuleId: string;
  aiRule: AIRecommendedRule | null;
  aiLoading: boolean;
  parsing: boolean;
  rows: OrderRow[];
  warnings: string[];
  submitting: boolean;
  batches: ImportBatch[];
  showSettings: boolean;
  llm: { apiKey: string; baseUrl: string; model: string };
  toasts: ToastMessage[];
  errorCount: number;
  dupCount: number;
}

export interface ViewActions {
  setStep: (s: Step) => void;
  setDragOver: (b: boolean) => void;
  setSelectedRuleId: (s: string) => void;
  setShowSettings: (b: boolean) => void;
  setLlm: (v: { apiKey: string; baseUrl: string; model: string }) => void;
  onPickFile: (f: File | null) => void;
  runAiAnalyze: () => void;
  runParse: () => void;
  saveAiRule: () => void;
  submitOrders: () => void;
  exportExcel: () => void;
  resetAll: () => void;
  updateCell: (id: string, key: TargetKey, value: string) => void;
  deleteRow: (id: string) => void;
  toast: (m: string, t?: ToastMessage['type']) => void;
  loadRules: () => void;
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: '1 上传文件' },
  { key: 'rule', label: '2 选择规则' },
  { key: 'preview', label: '3 预览导入' },
];

export function PageView({
  state, actions, fileInputRef,
}: {
  state: ViewState;
  actions: ViewActions;
  fileInputRef: RefObject<HTMLInputElement | null>;
}) {
  const stepIdx = STEPS.findIndex((s) => s.key === state.step);

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-section">
          <div className="logo-badge"><span className="logo-icon">鲸</span></div>
          <div>
            <div className="logo-text">鲸天智能订单解析导入系统</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              AI 驱动 · 任意格式批量下单
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-default" onClick={() => actions.setShowSettings(true)}>⚙ 大模型设置</button>
          {state.step !== 'upload' && (
            <button className="btn btn-default" onClick={actions.resetAll}>＋ 新建导入</button>
          )}
        </div>
      </header>

      <main className="main-content">
        {/* 步骤指示 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <div key={s.key}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 'var(--radius-md)',
                textAlign: 'center', fontWeight: 600, fontSize: 14,
                background: i <= stepIdx ? 'var(--color-primary)' : 'var(--color-bg-container)',
                color: i <= stepIdx ? '#fff' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                transition: 'var(--transition-fast)',
              }}>
              {s.label}
            </div>
          ))}
        </div>

        {state.step === 'upload' && <UploadStep state={state} actions={actions} fileInputRef={fileInputRef} />}
        {state.step === 'rule' && <RuleStep state={state} actions={actions} />}
        {state.step === 'preview' && <PreviewStep state={state} actions={actions} />}
      </main>

      {state.showSettings && <SettingsModal state={state} actions={actions} />}

      {/* Toasts */}
      <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state.toasts.map((t) => (
          <div key={t.id} className={`tag tag-${t.type === 'error' ? 'error' : t.type === 'success' ? 'success' : t.type === 'warning' ? 'warning' : 'info'}`}
            style={{ padding: '10px 16px', boxShadow: 'var(--shadow-md)', fontSize: 14 }}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
