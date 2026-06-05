'use client';

import { useState, useEffect, useRef } from 'react';
import { Order, ImportBatch } from '@/types';

export default function Home() {
  // Tabs: 'import' | 'orders' | 'logs'
  const [activeTab, setActiveTab] = useState<'import' | 'orders' | 'logs'>('import');
  
  // State for parsing process
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStep, setParseStep] = useState(0);
  const [parseBatchId, setParseBatchId] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  
  // Parsed orders in review
  const [parsedOrders, setParsedOrders] = useState<Omit<Order, 'id' | 'order_no' | 'status' | 'created_at'>[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Orders history
  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Batches history
  const [batchesList, setBatchesList] = useState<ImportBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  
  // Configuration Settings Modal
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [model, setModel] = useState('deepseek-chat');
  
  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load LLM configuration from LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiKey(localStorage.getItem('jt_llm_api_key') || '');
      setBaseUrl(localStorage.getItem('jt_llm_base_url') || 'https://api.deepseek.com/v1');
      setModel(localStorage.getItem('jt_llm_model') || 'deepseek-chat');
    }
    fetchOrders();
    fetchBatches();
  }, []);

  // Save Settings
  const saveSettings = () => {
    localStorage.setItem('jt_llm_api_key', apiKey);
    localStorage.setItem('jt_llm_base_url', baseUrl);
    localStorage.setItem('jt_llm_model', model);
    showToast('配置已保存！', 'success');
    setShowSettings(false);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch orders from DB
  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrdersList(data.orders || []);
      }
    } catch (e) {
      showToast('获取订单列表失败', 'error');
    } finally {
      setOrdersLoading(false);
    }
  };

  // Fetch batches from DB
  const fetchBatches = async () => {
    setBatchesLoading(true);
    try {
      const res = await fetch('/api/orders?type=batches');
      if (res.ok) {
        const data = await res.json();
        setBatchesList(data.batches || []);
      }
    } catch (e) {
      showToast('获取解析日志失败', 'error');
    } finally {
      setBatchesLoading(false);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = (selectedFile: File) => {
    const allowedExtensions = ['xlsx', 'xls', 'csv', 'docx', 'doc', 'pdf', 'txt'];
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    
    if (!allowedExtensions.includes(ext)) {
      showToast('仅支持 Excel, Word, PDF 或 TXT 格式文件', 'error');
      return;
    }
    
    setFile(selectedFile);
  };

  // Parse File via LLM API Route
  const handleStartParse = async () => {
    if (!file) return;
    
    setIsParsing(true);
    setParseStep(1);
    setWarningMessage(null);

    // Simulate parsing steps for visual feedback
    const stepsTimer1 = setTimeout(() => setParseStep(2), 1500);
    const stepsTimer2 = setTimeout(() => setParseStep(3), 3200);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: {
          'x-llm-api-key': apiKey,
          'x-llm-base-url': baseUrl,
          'x-llm-model': model,
        },
        body: formData
      });

      clearTimeout(stepsTimer1);
      clearTimeout(stepsTimer2);
      setParseStep(4);

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '解析文件失败');
      }

      setParseBatchId(data.batchId);
      setParsedOrders(data.orders || []);
      
      if (data.warning) {
        setWarningMessage(data.warning);
        showToast('解析成功，但有一些提示信息', 'warning');
      } else {
        showToast(`文件解析成功！识别到 ${data.orders.length} 条订单`, 'success');
      }
    } catch (e: any) {
      showToast(e.message || '文件解析服务出错', 'error');
      setFile(null);
    } finally {
      setIsParsing(false);
      setParseStep(0);
    }
  };

  // Editable Grid Cell Handlers
  const handleCellChange = (index: number, field: string, value: any) => {
    const updated = [...parsedOrders];
    (updated[index] as any)[field] = value;
    setParsedOrders(updated);
  };

  const handleAddRow = () => {
    const newRow = {
      sender_name: parsedOrders[0]?.sender_name || '',
      sender_phone: parsedOrders[0]?.sender_phone || '',
      sender_address: parsedOrders[0]?.sender_address || '',
      receiver_name: '',
      receiver_phone: '',
      receiver_address: '',
      goods_name: '普通包裹',
      quantity: 1,
      weight: 1.0,
      volume: 0.01,
      remark: ''
    };
    setParsedOrders([...parsedOrders, newRow]);
  };

  const handleDeleteRow = (index: number) => {
    const updated = parsedOrders.filter((_, i) => i !== index);
    setParsedOrders(updated);
  };

  // Bulk fill sender from row 1
  const handleBatchFillSender = () => {
    if (parsedOrders.length === 0) return;
    const firstSenderName = parsedOrders[0].sender_name;
    const firstSenderPhone = parsedOrders[0].sender_phone;
    const firstSenderAddr = parsedOrders[0].sender_address;

    const updated = parsedOrders.map(order => ({
      ...order,
      sender_name: firstSenderName,
      sender_phone: firstSenderPhone,
      sender_address: firstSenderAddr
    }));
    setParsedOrders(updated);
    showToast('已批量将第一行的寄件人信息填充到所有订单！', 'success');
  };

  // Submit parsed orders
  const handleSubmitOrders = async () => {
    if (parsedOrders.length === 0) return;
    
    // Check validation errors before submit
    const hasErrors = parsedOrders.some(o => 
      !o.sender_name || !o.sender_phone || !o.sender_address || 
      !o.receiver_name || !o.receiver_phone || !o.receiver_address
    );

    if (hasErrors) {
      showToast('部分订单仍存在未填写项，请补充完整后再提交', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orders: parsedOrders,
          batchId: parseBatchId
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '提交订单失败');
      }

      showToast(`已成功导入 ${parsedOrders.length} 条订单到系统！`, 'success');
      // Reset Import Tab
      setFile(null);
      setParsedOrders([]);
      setParseBatchId(null);
      setWarningMessage(null);
      
      // Refresh database states
      fetchOrders();
      fetchBatches();
      
      // Redirect to Order Management
      setActiveTab('orders');
    } catch (e: any) {
      showToast(e.message || '订单提交失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete individual order from database
  const handleDeleteOrder = async (id: string) => {
    if (!confirm('确认删除该订单记录吗？此操作无法撤销。')) return;

    try {
      const res = await fetch(`/api/orders?id=${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showToast('订单已成功删除！', 'success');
        fetchOrders();
      } else {
        const data = await res.json();
        showToast(data.error || '删除订单失败', 'error');
      }
    } catch (e) {
      showToast('删除订单失败', 'error');
    }
  };

  const handleCancelImport = () => {
    if (confirm('确认取消本次解析导入吗？未保存的数据将丢失。')) {
      setFile(null);
      setParsedOrders([]);
      setParseBatchId(null);
      setWarningMessage(null);
    }
  };

  // Statistics calculation
  const totalOrdersCount = ordersList.length;
  const pendingCount = ordersList.filter(o => o.status === 'pending').length;
  const processedBatchesCount = batchesList.length;
  const totalImportCount = batchesList.reduce((acc, b) => acc + (b.order_count || 0), 0);

  // Filtered orders list by search term
  const filteredOrders = ordersList.filter(order => {
    const s = searchTerm.toLowerCase();
    return (
      order.order_no.toLowerCase().includes(s) ||
      order.receiver_name.toLowerCase().includes(s) ||
      order.receiver_phone.includes(s) ||
      order.goods_name.toLowerCase().includes(s)
    );
  });

  return (
    <>
      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'float 3s ease-in-out infinite',
          backgroundColor: toast.type === 'success' ? '#f6ffed' : toast.type === 'error' ? '#fff2f0' : '#fffbe6',
          border: `1px solid ${toast.type === 'success' ? '#b7eb8f' : toast.type === 'error' ? '#ffccc7' : '#ffe58f'}`,
          color: toast.type === 'success' ? '#52c41a' : toast.type === 'error' ? '#ff4d4f' : '#faad14',
          fontWeight: 500
        }}>
          {toast.type === 'success' && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.41 5.93l-4.24 4.24a1 1 0 01-1.41 0L3.71 8.12a1 1 0 011.41-1.41l1.35 1.34 3.53-3.53a1 1 0 011.42 1.41z"/>
            </svg>
          )}
          {toast.type === 'error' && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm2.93 10.93a1 1 0 11-1.41 1.41L8 9.41l-1.52 1.52a1 1 0 11-1.41-1.41L6.59 8 5.07 6.48a1 1 0 011.41-1.41L8 6.59l1.52-1.52a1 1 0 111.41 1.41L9.41 8l1.52 1.52z"/>
            </svg>
          )}
          {toast.type === 'warning' && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 11h-1.5v-1.5h1.5V11zm0-3h-1.5V4h1.5v4z"/>
            </svg>
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header bar */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-icon">J</div>
          <span className="logo-text">鲸天系统</span>
          <span className="logo-badge">智能批量下单</span>
        </div>
        
        <div className="header-actions">
          {/* Navigation Tab Links */}
          <button 
            className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-default'}`} 
            onClick={() => setActiveTab('import')}
          >
            智能文件解析
          </button>
          <button 
            className={`btn ${activeTab === 'orders' ? 'btn-primary' : 'btn-default'}`} 
            onClick={() => setActiveTab('orders')}
          >
            系统订单管理
          </button>
          <button 
            className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-default'}`} 
            onClick={() => setActiveTab('logs')}
          >
            解析导入日志
          </button>
          
          <span style={{ borderLeft: '1px solid var(--color-border)', height: '24px', margin: '0 8px' }}></span>

          {/* Settings cog button */}
          <button 
            className="btn btn-default btn-icon" 
            title="大模型接口配置"
            onClick={() => setShowSettings(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="main-content">
        
        {/* Statistics Metric Banner (Always visible at the top) */}
        <section className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              📦
            </div>
            <div className="stat-info">
              <span className="stat-value">{totalOrdersCount}</span>
              <span className="stat-label">总订单量</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e6f7ff', color: '#1890ff' }}>
              ⏳
            </div>
            <div className="stat-info">
              <span className="stat-value">{pendingCount}</span>
              <span className="stat-label">待发货订单</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#f9f0ff', color: '#722ed1' }}>
              📁
            </div>
            <div className="stat-info">
              <span className="stat-value">{processedBatchesCount}</span>
              <span className="stat-label">处理批次数</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
              ✨
            </div>
            <div className="stat-info">
              <span className="stat-value">{totalImportCount}</span>
              <span className="stat-label">累计解析导入</span>
            </div>
          </div>
        </section>

        {/* Tab 1: Smart File Import Panel */}
        {activeTab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* If there are NO parsed orders yet, show the file uploader */}
            {parsedOrders.length === 0 ? (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <span>📄</span>
                    <span>智能文件导入解析</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    支持带有干扰性复杂表格、合并单元格的各种文件直接上传
                  </span>
                </div>
                
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Drag and Drop Zone */}
                  <div 
                    className={`upload-zone ${isDragOver ? 'dragover' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }}
                      accept=".xlsx,.xls,.csv,.docx,.doc,.pdf,.txt"
                      onChange={handleFileChange}
                      disabled={isParsing}
                    />
                    
                    {isParsing ? (
                      <div className="spinner spinner-primary" style={{ width: '48px', height: '48px', borderWidth: '4px' }}></div>
                    ) : (
                      <div className="upload-icon">📥</div>
                    )}
                    
                    <div className="upload-text">
                      {file ? `已选择: ${file.name} (${(file.size / 1024).toFixed(1)} KB)` : '点击或拖拽文件到此处上传'}
                    </div>
                    
                    <div className="upload-hint">
                      支持 Excel (.xlsx, .xls), Word (.docx), PDF (.pdf), CSV, TXT 格式文件，单文件最大 10MB
                    </div>
                  </div>

                  {/* Settings status check */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: '#fafbfc',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: apiKey ? 'var(--color-success)' : 'var(--color-warning)' }}>●</span>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        大模型 API Key 状态: <strong>{apiKey ? '已配置 (使用 LLM 引擎)' : '未配置 (将采用智能规则解析)'}</strong>
                      </span>
                    </div>
                    <button 
                      className="btn btn-default" 
                      style={{ fontSize: '12px', height: '30px' }}
                      onClick={() => setShowSettings(true)}
                    >
                      修改接口配置
                    </button>
                  </div>

                  {/* Parse Progress panel (Step by step) */}
                  {isParsing && (
                    <div style={{
                      padding: '20px',
                      backgroundColor: 'var(--color-primary-light)',
                      borderRadius: '8px',
                      border: '1px solid #c2f0ee',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-primary-hover)', fontSize: '15px' }}>
                        系统正在处理文件，请稍候...
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: parseStep >= 1 ? 'var(--color-text-main)' : 'var(--color-text-secondary)' }}>
                          <span style={{ color: parseStep > 1 ? 'var(--color-success)' : 'var(--color-primary)' }}>
                            {parseStep > 1 ? '✓' : '🔄'}
                          </span>
                          <span>1. 读取上传的二进制文件字节流...</span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: parseStep >= 2 ? 'var(--color-text-main)' : 'var(--color-text-secondary)' }}>
                          <span style={{ color: parseStep > 2 ? 'var(--color-success)' : parseStep === 2 ? 'var(--color-primary)' : '⚪' }}>
                            {parseStep > 2 ? '✓' : parseStep === 2 ? '🔄' : '○'}
                          </span>
                          <span>2. 清洗表格、提炼文档干扰段落为文本序列...</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: parseStep >= 3 ? 'var(--color-text-main)' : 'var(--color-text-secondary)' }}>
                          <span style={{ color: parseStep > 3 ? 'var(--color-success)' : parseStep === 3 ? 'var(--color-primary)' : '⚪' }}>
                            {parseStep > 3 ? '✓' : parseStep === 3 ? '🔄' : '○'}
                          </span>
                          <span>3. 调用大模型对结构化表格、多对一寄收件人进行智能分类和纠错...</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: parseStep >= 4 ? 'var(--color-text-main)' : 'var(--color-text-secondary)' }}>
                          <span style={{ color: parseStep >= 4 ? 'var(--color-success)' : '⚪' }}>
                            {parseStep >= 4 ? '✓' : '○'}
                          </span>
                          <span>4. 完成 JSON 校验，正在渲染交互式订单列表...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirm start parsing buttons */}
                  {file && !isParsing && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button className="btn btn-default btn-lg" onClick={() => setFile(null)}>
                        取消
                      </button>
                      <button className="btn btn-primary btn-lg" onClick={handleStartParse}>
                        🚀 开始智能解析
                      </button>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              
              /* Else: Show Parsed Orders Interactive Grid */
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <span>✏️</span>
                    <span>待核对订单详情预览</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-default" onClick={handleBatchFillSender}>
                      📋 批量填充寄件人
                    </button>
                    <button className="btn btn-default" onClick={handleAddRow}>
                      ➕ 增加订单行
                    </button>
                  </div>
                </div>

                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                  
                  {/* Heuristic parsed warning notice if LLM API not provided or failed */}
                  {warningMessage && (
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: 'var(--color-warning-bg)',
                      border: '1px solid var(--color-warning-border)',
                      color: '#ad7e14',
                      borderRadius: '8px',
                      fontSize: '13px',
                      lineHeight: 1.5
                    }}>
                      ⚠️ {warningMessage}
                    </div>
                  )}

                  {/* Main Grid View */}
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                          <th style={{ width: '130px' }}>寄件人姓名 *</th>
                          <th style={{ width: '130px' }}>寄件人电话 *</th>
                          <th style={{ minWidth: '180px' }}>寄件人地址 *</th>
                          <th style={{ width: '130px' }}>收件人姓名 *</th>
                          <th style={{ width: '130px' }}>收件人电话 *</th>
                          <th style={{ minWidth: '180px' }}>收件人地址 *</th>
                          <th style={{ width: '130px' }}>品名</th>
                          <th style={{ width: '70px' }}>数量</th>
                          <th style={{ width: '85px' }}>重量(kg)</th>
                          <th style={{ width: '85px' }}>体积(m³)</th>
                          <th style={{ width: '120px' }}>备注</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedOrders.map((order, idx) => {
                          // Real-time cell validations
                          const isSenderInvalid = !order.sender_name || !order.sender_phone || !order.sender_address;
                          const isReceiverInvalid = !order.receiver_name || !order.receiver_phone || !order.receiver_address;

                          return (
                            <tr key={idx} style={{ 
                              backgroundColor: (isSenderInvalid || isReceiverInvalid) ? '#fffefe' : undefined 
                            }}>
                              <td style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                {idx + 1}
                              </td>
                              
                              {/* Sender Name */}
                              <td style={{ backgroundColor: !order.sender_name ? 'var(--color-error-bg)' : undefined }}>
                                <input 
                                  value={order.sender_name}
                                  placeholder="寄件人姓名"
                                  onChange={(e) => handleCellChange(idx, 'sender_name', e.target.value)}
                                />
                              </td>
                              
                              {/* Sender Phone */}
                              <td style={{ backgroundColor: !order.sender_phone ? 'var(--color-error-bg)' : undefined }}>
                                <input 
                                  value={order.sender_phone}
                                  placeholder="寄件电话"
                                  onChange={(e) => handleCellChange(idx, 'sender_phone', e.target.value)}
                                />
                              </td>
                              
                              {/* Sender Address */}
                              <td style={{ backgroundColor: !order.sender_address ? 'var(--color-error-bg)' : undefined }}>
                                <input 
                                  value={order.sender_address}
                                  placeholder="发货地址"
                                  onChange={(e) => handleCellChange(idx, 'sender_address', e.target.value)}
                                />
                              </td>

                              {/* Receiver Name */}
                              <td style={{ backgroundColor: !order.receiver_name ? 'var(--color-error-bg)' : undefined }}>
                                <input 
                                  value={order.receiver_name}
                                  placeholder="收件人姓名"
                                  style={{ fontWeight: 500 }}
                                  onChange={(e) => handleCellChange(idx, 'receiver_name', e.target.value)}
                                />
                              </td>
                              
                              {/* Receiver Phone */}
                              <td style={{ backgroundColor: !order.receiver_phone ? 'var(--color-error-bg)' : undefined }}>
                                <input 
                                  value={order.receiver_phone}
                                  placeholder="收件人手机"
                                  onChange={(e) => handleCellChange(idx, 'receiver_phone', e.target.value)}
                                />
                              </td>
                              
                              {/* Receiver Address */}
                              <td style={{ backgroundColor: !order.receiver_address ? 'var(--color-error-bg)' : undefined }}>
                                <input 
                                  value={order.receiver_address}
                                  placeholder="收货地址"
                                  onChange={(e) => handleCellChange(idx, 'receiver_address', e.target.value)}
                                />
                              </td>

                              {/* Cargo Name */}
                              <td>
                                <input 
                                  value={order.goods_name}
                                  placeholder="货物名称"
                                  onChange={(e) => handleCellChange(idx, 'goods_name', e.target.value)}
                                />
                              </td>

                              {/* Quantity */}
                              <td>
                                <input 
                                  type="number"
                                  value={order.quantity}
                                  onChange={(e) => handleCellChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                                />
                              </td>

                              {/* Weight */}
                              <td>
                                <input 
                                  type="number"
                                  step="0.1"
                                  value={order.weight}
                                  onChange={(e) => handleCellChange(idx, 'weight', parseFloat(e.target.value) || 0)}
                                />
                              </td>

                              {/* Volume */}
                              <td>
                                <input 
                                  type="number"
                                  step="0.001"
                                  value={order.volume}
                                  onChange={(e) => handleCellChange(idx, 'volume', parseFloat(e.target.value) || 0)}
                                />
                              </td>

                              {/* Remark */}
                              <td>
                                <input 
                                  value={order.remark}
                                  placeholder="选填"
                                  onChange={(e) => handleCellChange(idx, 'remark', e.target.value)}
                                />
                              </td>

                              {/* Actions */}
                              <td style={{ textAlign: 'center' }}>
                                <button 
                                  className="btn" 
                                  style={{ padding: '4px 8px', color: 'var(--color-error)', height: '24px' }}
                                  onClick={() => handleDeleteRow(idx)}
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Submission Confirmation Row */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--color-border)'
                  }}>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      共计 <strong>{parsedOrders.length}</strong> 条下单项目
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button 
                        className="btn btn-default btn-lg" 
                        onClick={handleCancelImport}
                        disabled={isSubmitting}
                      >
                        清空取消
                      </button>
                      <button 
                        className="btn btn-primary btn-lg" 
                        onClick={handleSubmitOrders}
                        disabled={isSubmitting || parsedOrders.length === 0}
                      >
                        {isSubmitting ? (
                          <>
                            <div className="spinner"></div>
                            <span>正在导入系统...</span>
                          </>
                        ) : (
                          '确认导入系统下单'
                        )}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: System Order Management */}
        {activeTab === 'orders' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span>📦</span>
                <span>已下发快递订单列表</span>
              </div>
              
              {/* Search filter */}
              <div style={{ display: 'flex', gap: '12px', width: '300px' }}>
                <input 
                  className="form-input" 
                  style={{ width: '100%' }}
                  placeholder="搜索单号、收件人、品名..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="card-body" style={{ padding: '0' }}>
              {ordersLoading ? (
                <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner spinner-primary" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div style={{ padding: '60px 20px', textLight: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '48px', color: 'var(--color-text-placeholder)' }}>📭</span>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    暂无符合条件的订单记录，请上传文件导入新单
                  </div>
                </div>
              ) : (
                <div className="table-wrapper" style={{ border: 'none' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>系统快递单号</th>
                        <th>寄件人姓名</th>
                        <th>寄件人联系方式</th>
                        <th>寄件人地址</th>
                        <th>收件人姓名</th>
                        <th>收件人联系方式</th>
                        <th>收件人地址</th>
                        <th>货物品名</th>
                        <th style={{ width: '50px' }}>数量</th>
                        <th style={{ width: '80px' }}>重量</th>
                        <th style={{ width: '120px' }}>导入时间</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>状态</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#131313' }}>
                            {order.order_no}
                          </td>
                          <td>{order.sender_name}</td>
                          <td>{order.sender_phone}</td>
                          <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }} title={order.sender_address}>
                            {order.sender_address.length > 25 ? order.sender_address.slice(0, 25) + '...' : order.sender_address}
                          </td>
                          <td style={{ fontWeight: 500 }}>{order.receiver_name}</td>
                          <td>{order.receiver_phone}</td>
                          <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }} title={order.receiver_address}>
                            {order.receiver_address.length > 25 ? order.receiver_address.slice(0, 25) + '...' : order.receiver_address}
                          </td>
                          <td>{order.goods_name}</td>
                          <td>{order.quantity} 件</td>
                          <td>{order.weight} kg</td>
                          <td style={{ fontSize: '11px', color: 'var(--color-text-placeholder)' }}>
                            {order.created_at ? new Date(order.created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="tag tag-success">待下发</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="btn" 
                              style={{ color: 'var(--color-error)', height: '24px', padding: '0 4px' }}
                              onClick={() => order.id && handleDeleteOrder(order.id)}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Historical Ingestion Logs */}
        {activeTab === 'logs' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span>📁</span>
                <span>文件解析历史导入日志</span>
              </div>
              
              <button className="btn btn-default" onClick={fetchBatches}>
                🔄 刷新日志
              </button>
            </div>

            <div className="card-body" style={{ padding: '0' }}>
              {batchesLoading ? (
                <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner spinner-primary" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div>
                </div>
              ) : batchesList.length === 0 ? (
                <div style={{ padding: '60px 20px', textLight: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '48px', color: 'var(--color-text-placeholder)' }}>📁</span>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    暂无任何文件上传日志
                  </div>
                </div>
              ) : (
                <div className="table-wrapper" style={{ border: 'none' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>批次 ID</th>
                        <th>上传文件名</th>
                        <th>文件大小</th>
                        <th>解析成功订单数</th>
                        <th>上传时间</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchesList.map((batch) => (
                        <tr key={batch.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {batch.id}
                          </td>
                          <td style={{ fontWeight: 500, color: 'var(--color-text-main)' }}>
                            {batch.file_name}
                          </td>
                          <td>{(batch.file_size / 1024).toFixed(1)} KB</td>
                          <td style={{ fontWeight: 600, color: batch.order_count > 0 ? 'var(--color-primary-hover)' : 'inherit' }}>
                            {batch.order_count} 单
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {batch.created_at ? new Date(batch.created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`tag ${
                              batch.status === 'success' ? 'tag-success' : 
                              batch.status === 'failed' ? 'tag-error' : 'tag-info'
                            }`}>
                              {batch.status === 'success' ? '成功' : 
                               batch.status === 'failed' ? '失败' : '进行中'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Settings Modal Dialog */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">⚙️ 大模型 API 接口参数设置</span>
              <button className="modal-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div style={{
                fontSize: '12px', 
                color: 'var(--color-text-secondary)',
                backgroundColor: 'var(--color-primary-light)',
                border: '1px solid #c2f0ee',
                padding: '10px 14px',
                borderRadius: '6px',
                lineHeight: 1.5
              }}>
                💬 配置后，文件在解析时将调用配置的大模型接口。如果不配置 API Key，系统默认降级到<strong>本地高鲁棒性启发式表格匹配算法</strong>，提取数据。
              </div>

              <div className="form-group">
                <label className="form-label">API Key (秘钥) *</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="sk-..." 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">API Endpoint (请求端点) *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="https://api.deepseek.com/v1" 
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Model Name (模型名称) *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="deepseek-chat" 
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-default" onClick={() => setShowSettings(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={saveSettings}>
                保存更改
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
