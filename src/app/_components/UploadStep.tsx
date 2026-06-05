'use client';

import type { RefObject } from 'react';
import type { ViewState, ViewActions } from './PageView';

const ACCEPT = '.xlsx,.xls,.csv,.docx,.doc,.pdf';

export function UploadStep({
  state, actions, fileInputRef,
}: {
  state: ViewState;
  actions: ViewActions;
  fileInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="layout-split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
      <div className="card">
        <div className="card-header"><div className="card-title">上传客户文件</div></div>
        <div className="card-body">
          <div
            className={`upload-zone${state.dragOver ? ' dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); actions.setDragOver(true); }}
            onDragLeave={() => actions.setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              actions.setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) actions.onPickFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">📄</div>
            <div className="upload-text">点击或拖拽文件到此处</div>
            <div className="upload-hint">支持 Excel / Word / PDF（.xlsx .xls .csv .docx .doc .pdf）</div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => actions.onPickFile(e.target.files?.[0] || null)}
            />
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
            <div>· 上传后可选择已有解析规则，或让 AI 自动分析文件结构生成规则</div>
            <div>· AI 生成的是「解析规则」而非数据，确认后由规则引擎执行解析</div>
            <div>· 支持复杂格式：干扰头部、合并单元格、矩阵转置、卡片式、多 Sheet 等</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">最近导入批次</div></div>
        <div className="card-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {state.batches.length === 0 ? (
            <div style={{ color: 'var(--color-text-placeholder)', textAlign: 'center', padding: '40px 0' }}>
              暂无导入记录
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {state.batches.slice(0, 20).map((b) => (
                <div key={b.id} className="stat-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {b.file_name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {b.rule_name || '—'} · {b.order_count} 条
                      </div>
                    </div>
                    <span className={`tag tag-${b.status === 'success' ? 'success' : b.status === 'failed' ? 'error' : 'info'}`}>
                      {b.status === 'success' ? '成功' : b.status === 'failed' ? '失败' : '处理中'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
