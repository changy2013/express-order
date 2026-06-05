'use client';

import type { RefObject } from 'react';
import type { OrderRow, ParseRule, AIRecommendedRule, ImportBatch, ToastMessage, SubmitResult } from '@/types';
import { UploadStep } from './UploadStep';
import { RuleStep } from './RuleStep';
import { PreviewStep } from './PreviewStep';
import { SettingsModal } from './SettingsModal';
import { RuleEditorModal, type EditorRule } from './RuleEditorModal';

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
  editorRule: EditorRule | null;
  progress: { active: boolean; percent: number; label: string; current: number; total: number };
  parseError: { message: string; fileName: string; fileSize: number } | null;
  submitProgress: { active: boolean; percent: number; label: string };
  submitResult: SubmitResult | null;
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
  submitOrders: () => void;
  exportExcel: () => void;
  resetAll: () => void;
  updateCell: (id: string, key: TargetKey, value: string) => void;
  deleteRow: (id: string) => void;
  addRow: () => void;
  toast: (m: string, t?: ToastMessage['type']) => void;
  loadRules: () => void;
  openAiRuleEditor: () => void;
  newRule: () => void;
  editRule: (r: ParseRule) => void;
  copyRule: (r: ParseRule) => void;
  deleteRule: (id: string) => void;
  closeRuleEditor: () => void;
  onRuleSaved: (saved: ParseRule) => void;
  dismissParseError: () => void;
  dismissSubmitResult: () => void;
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
        <div>
          <div className="logo-text">智能订单解析导入</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            AI 驱动 · 任意格式批量下单
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

      {state.editorRule && (
        <RuleEditorModal
          rule={state.editorRule}
          file={state.file}
          onClose={actions.closeRuleEditor}
          onSaved={actions.onRuleSaved}
          toast={actions.toast}
        />
      )}

      {state.progress.active && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-body" style={{ padding: 28, alignItems: 'center', gap: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{state.progress.label || '解析中…'}</div>
              <div style={{ width: '100%', height: 10, background: 'var(--color-bg-base)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--color-border-light)' }}>
                <div style={{
                  width: `${Math.min(100, Math.round(state.progress.percent))}%`, height: '100%',
                  background: 'linear-gradient(90deg, var(--color-primary), #00e0db)',
                  borderRadius: 999, transition: 'width 0.2s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <span>{Math.min(100, Math.round(state.progress.percent))}%</span>
                <span>{state.progress.total > 0 ? `${state.progress.current} / ${state.progress.total} 条` : '正在处理…'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 提交进度条 */}
      {state.submitProgress.active && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-body" style={{ padding: 28, alignItems: 'center', gap: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{state.submitProgress.label || '提交中…'}</div>
              <div style={{ width: '100%', height: 10, background: 'var(--color-bg-base)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--color-border-light)' }}>
                <div style={{
                  width: `${Math.min(100, Math.round(state.submitProgress.percent))}%`, height: '100%',
                  background: 'linear-gradient(90deg, var(--color-primary), #00e0db)',
                  borderRadius: 999, transition: 'width 0.2s ease',
                }} />
              </div>
              <div style={{ width: '100%', textAlign: 'right', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {Math.min(100, Math.round(state.submitProgress.percent))}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 提交结果汇总 */}
      {state.submitResult && !state.submitProgress.active && (
        <div className="modal-overlay" onClick={actions.dismissSubmitResult}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {state.submitResult.success === state.submitResult.total ? '✅ 提交完成' : '⚠️ 提交完成（部分未入库）'}
              </div>
            </div>
            <div className="modal-body" style={{ padding: 24, gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                <SummaryStat label="成功入库" value={state.submitResult.success} color="var(--color-success)" />
                <SummaryStat label="重复跳过" value={state.submitResult.skipped} color="var(--color-warning)" />
                <SummaryStat label="失败" value={state.submitResult.failed} color="var(--color-error)" />
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                本次提交 {state.submitResult.total} 条
                {state.submitResult.skipped > 0 && '，重复行已在表格中标红保留'}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={actions.dismissSubmitResult}>知道了</button>
            </div>
          </div>
        </div>
      )}

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

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '14px 8px', borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg-base)', border: '1px solid var(--color-border-light)',
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}
