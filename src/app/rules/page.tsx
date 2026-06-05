'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ParseRule, ToastMessage } from '@/types';
import { RuleEditorModal, type EditorRule } from '../_components/RuleEditorModal';
import { blankRule } from '@/lib/blank-rule';

export default function RulesPage() {
  const [rules, setRules] = useState<ParseRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorRule, setEditorRule] = useState<EditorRule | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/rules');
      const d = await r.json();
      if (r.ok) setRules(d.rules || []);
      else toast(d.error || '加载规则失败', 'error');
    } catch { toast('加载规则失败', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const newRule = () => setEditorRule(blankRule('excel'));
  const editRule = (r: ParseRule) => setEditorRule(structuredClone(r) as EditorRule);
  const copyRule = (r: ParseRule) => {
    const copy = structuredClone(r) as EditorRule;
    delete copy.id;
    copy.name = `${r.name} - 副本`;
    setEditorRule(copy);
  };
  const deleteRule = async (id: string, name: string) => {
    if (!confirm(`确定删除规则「${name}」？`)) return;
    try {
      const r = await fetch(`/api/rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '删除失败');
      toast('规则已删除', 'success');
      await loadRules();
    } catch (e: any) { toast(e.message || '删除失败', 'error'); }
  };
  const onSaved = () => { setEditorRule(null); loadRules(); };

  return (
    <RulesView {...{ rules, loading, newRule, editRule, copyRule, deleteRule }}>
      {editorRule && (
        <RuleEditorModal rule={editorRule} file={null}
          onClose={() => setEditorRule(null)} onSaved={onSaved} toast={toast} />
      )}
      <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`tag tag-${t.type === 'error' ? 'error' : t.type === 'success' ? 'success' : t.type === 'warning' ? 'warning' : 'info'}`}
            style={{ padding: '10px 16px', boxShadow: 'var(--shadow-md)', fontSize: 14 }}>{t.message}</div>
        ))}
      </div>
    </RulesView>
  );
}

interface RulesViewProps {
  rules: ParseRule[];
  loading: boolean;
  newRule: () => void;
  editRule: (r: ParseRule) => void;
  copyRule: (r: ParseRule) => void;
  deleteRule: (id: string, name: string) => void;
  children?: React.ReactNode;
}

function RulesView({ rules, loading, newRule, editRule, copyRule, deleteRule, children }: RulesViewProps) {
  return (
    <div className="app-container" style={{ display: 'block' }}>
      <main className="main-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="logo-text">解析规则管理</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              维护所有解析规则，供导入时复用
            </div>
          </div>
          <button className="btn btn-primary" onClick={newRule}>＋ 新建规则</button>
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>#</th>
                    <th>规则名称</th>
                    <th style={{ width: 90 }}>文件类型</th>
                    <th>描述</th>
                    <th style={{ width: 160 }}>更新时间</th>
                    <th style={{ width: 180 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-placeholder)' }}>
                      {loading ? '加载中…' : '暂无规则，点右上「新建规则」创建'}
                    </td></tr>
                  ) : rules.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td><span className="tag tag-info">{r.fileType}</span></td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{r.description || '—'}</td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                        {r.updatedAt ? new Date(r.updatedAt).toLocaleString('zh-CN') : ''}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-default btn-icon" title="编辑" onClick={() => editRule(r)}>✏️</button>
                          <button className="btn btn-default btn-icon" title="复制" onClick={() => copyRule(r)}>📋</button>
                          <button className="btn btn-default btn-icon" title="删除"
                            onClick={() => deleteRule(r.id, r.name)} style={{ color: 'var(--color-error)' }}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      {children}
    </div>
  );
}
