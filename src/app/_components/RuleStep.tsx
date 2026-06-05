'use client';

import type { ViewState, ViewActions } from './PageView';

export function RuleStep({ state, actions }: { state: ViewState; actions: ViewActions }) {
  const { file, rules, selectedRuleId, aiRule, aiLoading, parsing } = state;
  const canParse = !!selectedRuleId || !!aiRule;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">当前文件</div>
        </div>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>📄</span>
            <div>
              <div style={{ fontWeight: 600 }}>{file?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : ''}
              </div>
            </div>
          </div>
          <button className="btn btn-default" onClick={actions.resetAll}>重新上传</button>
        </div>
      </div>

      <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 方式一：已有规则 */}
        <div className="card">
          <div className="card-header"><div className="card-title">方式一 · 选择已有规则</div></div>
          <div className="card-body">
            {rules.length === 0 ? (
              <div style={{ color: 'var(--color-text-placeholder)', padding: '20px 0', textAlign: 'center' }}>
                规则库为空，请用右侧 AI 分析生成首个规则
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {rules.map((r) => (
                  <label key={r.id}
                    className="stat-card"
                    style={{
                      padding: 12, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                      borderColor: selectedRuleId === r.id ? 'var(--color-primary)' : undefined,
                      borderWidth: selectedRuleId === r.id ? 2 : 1,
                    }}>
                    <input type="radio" name="rule" checked={selectedRuleId === r.id}
                      onChange={() => { actions.setSelectedRuleId(r.id); }} style={{ marginTop: 4 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        <span className="tag tag-info" style={{ marginRight: 6 }}>{r.fileType}</span>
                        {r.description || '—'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 方式二：AI 生成 */}
        <div className="card">
          <div className="card-header"><div className="card-title">方式二 · AI 智能生成规则</div></div>
          <div className="card-body">
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
              disabled={aiLoading} onClick={actions.runAiAnalyze}>
              {aiLoading ? <><span className="spinner spinner-primary" /> AI 分析中…</> : '🤖 让 AI 分析文件结构'}
            </button>

            {aiRule && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {aiRule.name}
                  <span className={`tag tag-${aiRule.aiAnalysis.confidence === 'high' ? 'success' : aiRule.aiAnalysis.confidence === 'low' ? 'error' : 'warning'}`}
                    style={{ marginLeft: 8 }}>
                    置信度 {aiRule.aiAnalysis.confidence}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                  {aiRule.aiAnalysis.summary}
                </div>
                {aiRule.aiAnalysis.warnings.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--color-warning)' }}>
                    {aiRule.aiAnalysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
                <button className="btn btn-default" style={{ marginTop: 10 }} onClick={actions.saveAiRule}>
                  💾 保存此规则到规则库
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button className="btn btn-primary btn-lg" disabled={!canParse || parsing} onClick={actions.runParse}>
          {parsing ? <><span className="spinner" /> 解析中…</> : '开始解析 →'}
        </button>
      </div>
    </div>
  );
}
