'use client';

import { useState } from 'react';
import type { ViewState, ViewActions } from './PageView';

export function SettingsModal({ state, actions }: { state: ViewState; actions: ViewActions }) {
  const [form, setForm] = useState(state.llm);

  const save = () => {
    actions.setLlm(form);
    try { localStorage.setItem('llm_config', JSON.stringify(form)); } catch { /* ignore */ }
    actions.setShowSettings(false);
    actions.toast('大模型设置已保存', 'success');
  };

  return (
    <div className="modal-overlay" onClick={() => actions.setShowSettings(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">大模型设置</div>
          <button className="modal-close" onClick={() => actions.setShowSettings(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
            留空则使用服务端环境变量（已配置 DeepSeek）。如需覆盖可在此填写，仅保存在本地浏览器。
          </div>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <input className="form-input" type="password" placeholder="sk-..."
              value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Base URL</label>
            <input className="form-input" placeholder="https://api.deepseek.com/v1"
              value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">模型</label>
            <input className="form-input" placeholder="deepseek-chat"
              value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-default" onClick={() => actions.setShowSettings(false)}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
