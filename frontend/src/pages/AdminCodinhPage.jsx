import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Upload,
  Layers,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Search,
  Check,
  X,
  RotateCcw,
  ArrowLeft,
  FileCheck,
  Database,
  Clock,
  HardDrive,
  UploadCloud,
  History,
  RefreshCw,
  ArrowRight
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';

export default function AdminCodinhPage({ onNavigateToCodinh }) {
  const queryClient = useQueryClient();

  // Active navigation tab inside admin: 'upload_base_wo' | 'upload_cabinets' | 'reports'
  const [activeTab, setActiveTab] = useState('upload_base_wo');

  // Base WO file upload & live status state
  const [baseWoFile, setBaseWoFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentImportId, setCurrentImportId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  // Cabinet upload state
  const [cabinetFile, setCabinetFile] = useState(null);
  const [selectedTargetCatId, setSelectedTargetCatId] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploadingCabinet, setIsUploadingCabinet] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Modal create/edit category state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catFilterMode, setCatFilterMode] = useState('by_loai'); // 'by_loai' | 'by_system'
  const [catSelectedValues, setCatSelectedValues] = useState([]);
  const [catExcludeClosedPrior, setCatExcludeClosedPrior] = useState(true);
  const [catSearchFilter, setCatSearchFilter] = useState('');

  // Queries
  const { data: categories = [], isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['codinh-categories'],
    queryFn: () => codinhApi.getCategories(null, true),
  });

  const { data: metaOptions = { task_types: [], systems: [] } } = useQuery({
    queryKey: ['codinh-meta-options'],
    queryFn: codinhApi.getMetaOptions,
  });

  const { data: importLogs = [], isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['codinh-import-logs'],
    queryFn: () => codinhApi.getImportLogs(50),
    refetchInterval: uploading ? 1500 : 12000,
  });

  // Poll for progress when currentImportId exists and status is PROCESSING or PENDING
  useEffect(() => {
    let timer = null;
    if (currentImportId && (!importStatus || ['PENDING', 'PROCESSING'].includes(importStatus.status))) {
      timer = setInterval(async () => {
        try {
          const status = await codinhApi.getImportStatus(currentImportId);
          setImportStatus(status);
          if (['COMPLETED', 'FAILED'].includes(status.status)) {
            clearInterval(timer);
            setUploading(false);
            queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-import-logs'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-meta-options'] });
          }
        } catch (err) {
          console.error('Error polling codinh import status:', err);
        }
      }, 1200);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentImportId, importStatus]);

  const formatDate = (d) => {
    if (!d) return '--';
    if (d instanceof Date) return isNaN(d.getTime()) ? '--' : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const str = String(d).trim();
    const iso = str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)
      ? str
      : (str.includes('T') ? str + 'Z' : str.replace(' ', 'T') + 'Z');
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? d : dt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const validateAndSetBaseWoFile = (f) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      alert('Vui lòng chọn file định dạng Excel (.xlsx, .xls) hoặc .csv');
      return;
    }
    setBaseWoFile(f);
    setImportStatus(null);
    setErrorMessage('');
    setUploadProgress(0);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetBaseWoFile(dropped);
  };

  // Base WO Upload Submit with Chunked Upload & Progress Bar
  const handleBaseWoUploadSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!baseWoFile) {
      alert('Vui lòng chọn file Excel công việc CĐBR (.xlsx, .xls, .csv)');
      return;
    }

    setUploading(true);
    setErrorMessage('');
    setImportStatus(null);
    setUploadProgress(0);

    try {
      const res = await codinhApi.uploadWoFile(baseWoFile, (progress) => {
        setUploadProgress(progress);
      });
      setCurrentImportId(res.id);
      setImportStatus(res);
      refetchLogs();
    } catch (err) {
      setUploading(false);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (err.message || 'Lỗi tải file');
      setErrorMessage(msg + '\n\nMẹo: Nếu gặp sự cố mạng hoặc timeout, hệ thống sẽ tự động chia nhỏ file (chunked) và gửi lại từng phần.');
    }
  };

  // Kích hoạt / Nạp lại file CĐBR cũ
  const handleActivateFile = async (log) => {
    const ok = window.confirm(
      `Xác nhận nạp lại dữ liệu từ file "${log.file_name}" cho Cố Định Băng Rộng?\n\nToàn bộ dữ liệu công việc CĐBR hiện tại trong database sẽ được thay thế bằng dữ liệu của file này.`
    );
    if (!ok) return;

    setUploading(true);
    setErrorMessage('');
    setCurrentImportId(log.id);
    setImportStatus({ status: 'PROCESSING', progress_percent: 5, file_name: log.file_name });

    try {
      await codinhApi.activateFile(log.id);
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-meta-options'] });
    } catch (err) {
      setUploading(false);
      alert('Lỗi kích hoạt lại file CĐBR: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Xoá file CĐBR cũ khỏi hệ thống
  const handleDeleteFile = async (log) => {
    const isAct = log.is_active === 1;
    const msg = isAct 
      ? `CẢNH BÁO: File "${log.file_name}" đang là file dữ liệu ĐANG SỬ DỤNG của CĐBR!\nNếu xoá, toàn bộ công việc CĐBR hiện tại trong hệ thống sẽ bị xoá trống.\n\nBạn có chắc chắn muốn xoá không?`
      : `Bạn có chắc chắn muốn xoá vĩnh viễn file "${log.file_name}" khỏi máy chủ và cơ sở dữ liệu?`;

    if (!window.confirm(msg)) return;

    try {
      await codinhApi.deleteFile(log.id);
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-meta-options'] });
    } catch (err) {
      alert('Lỗi xoá file: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Cabinet Upload Submit
  const handleCabinetUploadSubmit = async (e) => {
    e.preventDefault();
    if (!cabinetFile) {
      alert('Vui lòng chọn file Excel chi tiết tủ cáp (.xlsx, .xls)');
      return;
    }

    setIsUploadingCabinet(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const res = await codinhApi.uploadCabinetFile(
        cabinetFile,
        selectedTargetCatId ? Number(selectedTargetCatId) : null
      );
      setUploadResult(res);
      setCabinetFile(null);
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
    } catch (err) {
      setUploadError(err.response?.data?.detail || err.message);
    } finally {
      setIsUploadingCabinet(false);
    }
  };

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingCategory(null);
    setCatName('');
    setCatDesc('');
    setCatFilterMode('by_loai');
    setCatSelectedValues([]);
    setCatExcludeClosedPrior(true);
    setCatSearchFilter('');
    setShowCategoryModal(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (cat) => {
    setEditingCategory(cat);
    setCatName(cat.name || '');
    setCatDesc(cat.description || '');
    setCatFilterMode(cat.filter_mode || 'by_loai');
    setCatSelectedValues(cat.filter_values || []);
    setCatExcludeClosedPrior(cat.exclude_closed_prior_months !== false);
    setCatSearchFilter('');
    setShowCategoryModal(true);
  };

  // Category Save Mutation
  const saveCategoryMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingCategory) {
        return codinhApi.updateCategory(editingCategory.id, payload);
      }
      return codinhApi.createCategory(payload);
    },
    onSuccess: (data) => {
      alert(`Đã lưu bảng báo cáo "${data.name}" thành công!`);
      setShowCategoryModal(false);
      queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
    },
    onError: (err) => {
      alert('Lỗi lưu bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Category Delete Mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => codinhApi.deleteCategory(id),
    onSuccess: () => {
      alert('Đã xóa bảng báo cáo thành công!');
      queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
    },
    onError: (err) => {
      alert('Lỗi xóa bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  const handleDeleteCategory = (cat) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa bảng báo cáo "${cat.name}" khỏi Cố Định Băng Rộng không?`)) {
      deleteCategoryMutation.mutate(cat.id);
    }
  };

  const handleSaveCategorySubmit = (e) => {
    e.preventDefault();
    if (!catName.trim()) {
      alert('Vui lòng nhập tên bảng báo cáo');
      return;
    }
    if (catSelectedValues.length === 0) {
      alert('Vui lòng chọn ít nhất 1 giá trị lọc (loại công việc hoặc hệ thống)');
      return;
    }

    const payload = {
      name: catName.trim(),
      description: catDesc.trim() || null,
      filter_mode: catFilterMode,
      filter_values: catSelectedValues,
      exclude_closed_prior_months: catExcludeClosedPrior,
      domain: 'codinh',
    };

    saveCategoryMutation.mutate(payload);
  };

  const handleToggleValue = (val) => {
    if (catSelectedValues.includes(val)) {
      setCatSelectedValues(catSelectedValues.filter(x => x !== val));
    } else {
      setCatSelectedValues([...catSelectedValues, val]);
    }
  };

  const selectableList = catFilterMode === 'by_loai' ? (metaOptions.task_types || []) : (metaOptions.systems || []);
  const filteredSelectableList = selectableList.filter(item =>
    !catSearchFilter.trim() || item.toLowerCase().includes(catSearchFilter.trim().toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
              <Cable size={13} /> QUẢN TRỊ CỐ ĐỊNH BĂNG RỘNG
            </span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Quản Trị Báo Cáo & Nạp Dữ Liệu CĐBR
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Nạp file công việc riêng biệt cho CĐBR, nạp file đối chiếu tủ cáp con và cấu hình các bảng báo cáo
          </p>
        </div>

        {onNavigateToCodinh && (
          <button
            onClick={onNavigateToCodinh}
            className="btn btn-outline"
            style={{ fontSize: '0.85rem', padding: '8px 16px', gap: '8px', borderColor: '#8b5cf6', color: '#8b5cf6' }}
          >
            <ArrowLeft size={16} /> Về Trang Báo Cáo CĐBR
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'upload_base_wo' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_base_wo')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'upload_base_wo' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'upload_base_wo' ? '#8b5cf6' : 'var(--border-color)' }}
        >
          <Database size={16} /> 1. Nạp File Gốc WO CĐBR (Riêng Biệt)
        </button>

        <button
          className={`btn ${activeTab === 'upload_cabinets' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_cabinets')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'upload_cabinets' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'upload_cabinets' ? '#8b5cf6' : 'var(--border-color)' }}
        >
          <Upload size={16} /> 2. Nạp File Đối Chiếu Tủ Cáp (THC)
        </button>

        <button
          className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('reports')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0' }}
        >
          <Layers size={16} /> 3. Danh Mục Báo Cáo CĐBR ({categories.length})
        </button>
      </div>

      {/* ================= TAB 1: NẠP FILE GỐC WO CĐBR RIÊNG BIỆT ================= */}
      {activeTab === 'upload_base_wo' && (
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="table-card" style={{ padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Nạp File Gốc Công Việc (WO) Cố Định Băng Rộng
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  File này lưu trữ <strong>hoàn toàn riêng biệt</strong> cho CĐBR, <strong>KHÔNG</strong> ghi đè hay ảnh hưởng đến dữ liệu bên Tổng Quan (Cơ điện). Hệ thống hỗ trợ xử lý file lớn với cơ chế Chunked Upload, tự động quét tìm dòng tiêu đề.
                </p>
              </div>
            </div>

            {/* Drag & Drop Zone */}
            <div
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #8b5cf6',
                borderRadius: 'var(--radius-lg)',
                padding: '36px 24px',
                textAlign: 'center',
                background: isDragging ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.03)',
                cursor: 'pointer',
                marginBottom: '18px',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) validateAndSetBaseWoFile(selected);
                }}
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
              />

              <div style={{ width: '56px', height: '56px', margin: '0 auto 12px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
                <UploadCloud size={30} />
              </div>

              {baseWoFile ? (
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', border: '1px solid #8b5cf6', marginBottom: '8px' }}>
                    <FileSpreadsheet size={16} style={{ color: '#8b5cf6' }} />
                    <strong style={{ fontSize: '0.9rem' }}>{baseWoFile.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ({(baseWoFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Bấm để chọn file khác hoặc kéo thả file mới vào đây
                  </p>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Kéo và thả file Excel vào đây, hoặc <span style={{ color: '#8b5cf6', textDecoration: 'underline' }}>chọn từ máy tính</span>
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Định dạng hỗ trợ: .xlsx, .xls, .csv • Tự động quét tìm cột Mã công việc, Loại công việc, Nhân viên, Trạng thái...
                  </p>
                </div>
              )}
            </div>

            {/* Upload Button */}
            {baseWoFile && !uploading && (!importStatus || importStatus.status !== 'PROCESSING') && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setBaseWoFile(null);
                    setImportStatus(null);
                    setErrorMessage('');
                  }}
                  style={{ fontSize: '0.82rem', padding: '8px 16px' }}
                >
                  Hủy chọn
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBaseWoUploadSubmit}
                  style={{ fontSize: '0.86rem', padding: '8px 24px', background: '#8b5cf6', borderColor: '#8b5cf6', gap: '8px' }}
                >
                  <Database size={16} /> Bắt Đầu Xử Lý & Đồng Bộ Dữ Liệu CĐBR
                </button>
              </div>
            )}

            {/* Live Processing Card */}
            {uploading && (
              <div 
                style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '24px', 
                  borderRadius: 'var(--radius-lg)', 
                  border: '1px solid var(--border-color)',
                  marginBottom: '20px',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} className="spin" style={{ color: '#8b5cf6' }} />
                    <strong style={{ fontSize: '0.9rem' }}>
                      {importStatus?.status === 'PROCESSING' || importStatus?.status === 'PENDING'
                        ? 'Đang đọc và đồng bộ dữ liệu vào bảng Cố Định Băng Rộng...'
                        : uploadProgress < 100
                          ? `Đang tải lên file CĐBR (${uploadProgress}%)...`
                          : 'Đang chuẩn bị xử lý dữ liệu CĐBR...'
                      }
                    </strong>
                  </div>
                  <span style={{ fontWeight: 800, color: '#8b5cf6' }}>
                    {importStatus?.progress_percent || uploadProgress || 10}%
                  </span>
                </div>

                <div className="progress-bar-outer" style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
                  <div 
                    className="progress-bar-inner" 
                    style={{ 
                      width: `${importStatus?.progress_percent || uploadProgress || 10}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #a855f7)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease'
                    }} 
                  />
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Hệ thống đang chuẩn hóa danh mục, đọc các dòng Excel (quét tiêu đề tự động), ghi vết lịch sử. Quá trình xử lý chạy ngầm và không làm gián đoạn các thao tác khác.
                </p>
              </div>
            )}

            {/* Completion Report Card */}
            {importStatus && importStatus.status === 'COMPLETED' && (
              <div 
                style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '24px', 
                  borderRadius: 'var(--radius-lg)', 
                  border: '1px solid var(--success)',
                  marginBottom: '20px',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Đồng Bộ File CĐBR Thành Công!
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                      File: <strong>{importStatus.file_name}</strong> • Thời điểm: {formatDate(importStatus.imported_at)}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Dòng Gốc</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.total_rows || 0).toLocaleString()}</strong>
                  </div>

                  <div style={{ background: 'var(--success-light)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--success-dark)' }}>
                    <span style={{ fontSize: '0.72rem', display: 'block' }}>Thêm Mới</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.inserted_count || 0).toLocaleString()}</strong>
                  </div>

                  <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: '#8b5cf6' }}>
                    <span style={{ fontSize: '0.72rem', display: 'block' }}>Cập Nhật</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.updated_count || 0).toLocaleString()}</strong>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Giữ Nguyên</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.unchanged_count || 0).toLocaleString()}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setBaseWoFile(null);
                      setImportStatus(null);
                    }}
                    style={{ fontSize: '0.84rem' }}
                  >
                    Upload File Khác
                  </button>
                  {onNavigateToCodinh && (
                    <button
                      className="btn btn-primary"
                      onClick={onNavigateToCodinh}
                      style={{ fontSize: '0.84rem', background: '#8b5cf6', borderColor: '#8b5cf6', gap: '6px' }}
                    >
                      Xem Bảng Báo Cáo CĐBR <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {(errorMessage || (importStatus && importStatus.status === 'FAILED')) && (
              <div 
                style={{ 
                  background: 'var(--danger-light)', 
                  color: 'var(--danger-dark)', 
                  padding: '16px 20px', 
                  borderRadius: 'var(--radius-lg)', 
                  marginBottom: '20px' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <AlertCircle size={20} />
                  <strong style={{ fontSize: '0.92rem' }}>Đã xảy ra lỗi trong quá trình xử lý file CĐBR!</strong>
                </div>
                <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', margin: '0 0 12px 0' }}>
                  {importStatus?.error_message || errorMessage}
                </p>
                <div>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setErrorMessage('');
                      setImportStatus(null);
                      handleBaseWoUploadSubmit();
                    }}
                    style={{ 
                      borderColor: 'var(--danger)', 
                      color: 'var(--danger-dark)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem'
                    }}
                  >
                    <RefreshCw size={14} /> Thử Lại
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lịch Sử Các File Đã Nạp Lên CĐBR Table */}
          <div className="table-card" style={{ marginTop: '28px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HardDrive size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0 }}>
                    Lịch Sử Các File Đã Nạp Lên CĐBR (Quản Lý Lưu Trữ)
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Dữ liệu riêng biệt của CĐBR. Bạn có thể <strong>Sử dụng lại file cũ</strong> để nạp lại dữ liệu hoặc <strong>Xoá file</strong> giải phóng dung lượng.
                  </p>
                </div>
              </div>
              <button 
                className="btn btn-outline" 
                onClick={() => refetchLogs && refetchLogs()}
                style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
              >
                <RefreshCw size={13} /> Làm mới
              </button>
            </div>

            <div className="table-responsive">
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>ID</th>
                    <th>Tên File</th>
                    <th>Thời Điểm Nạp</th>
                    <th style={{ textAlign: 'center' }}>Dung Lượng</th>
                    <th style={{ textAlign: 'center' }}>Tổng Dòng</th>
                    <th style={{ textAlign: 'center' }}>Đã Nạp</th>
                    <th style={{ textAlign: 'center' }}>Trạng Thái</th>
                    <th style={{ textAlign: 'center', width: '180px' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(importLogs || []).map((log) => {
                    const isActive = log.is_active === 1;
                    const isProcessing = log.status === 'PROCESSING' || log.status === 'PENDING';

                    return (
                      <tr 
                        key={log.id}
                        style={{
                          background: isActive ? 'rgba(139, 92, 246, 0.06)' : undefined
                        }}
                      >
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>#{log.id}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileSpreadsheet size={15} style={{ color: isActive ? '#8b5cf6' : 'var(--text-muted)' }} />
                            <strong>{log.file_name}</strong>
                          </div>
                        </td>
                        <td>{formatDate(log.imported_at)}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                          {formatBytes(log.file_size_bytes)}
                        </td>
                        <td style={{ textAlign: 'center' }}>{log.total_rows?.toLocaleString() || '--'}</td>
                        <td style={{ textAlign: 'center', color: 'var(--success-dark)', fontWeight: 600 }}>
                          {log.inserted_count?.toLocaleString() || '--'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isActive ? (
                            <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.72rem' }}>
                              <CheckCircle2 size={12} /> Đang Sử Dụng
                            </span>
                          ) : isProcessing ? (
                            <span className="badge badge-info" style={{ gap: '4px', fontSize: '0.72rem' }}>
                              <Clock size={12} className="spin" /> Đang Nạp ({log.progress_percent || 0}%)
                            </span>
                          ) : log.status === 'FAILED' ? (
                            <span 
                              className="badge badge-danger" 
                              style={{ fontSize: '0.72rem', cursor: 'pointer', gap: '3px' }}
                              title={log.error_message ? `Bấm để xem chi tiết lỗi: ${log.error_message}` : 'Xử lý thất bại. Bấm để xem.'}
                              onClick={() => {
                                alert(`Chi tiết lỗi của file "${log.file_name}":\n\n${log.error_message || 'Không có mô tả lỗi cụ thể.'}`);
                              }}
                            >
                              <AlertCircle size={11} /> Thất bại ℹ️
                            </span>
                          ) : (
                            <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>Đã lưu trữ</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {/* Nút Thử lại khi file lỗi */}
                            {log.status === 'FAILED' && (
                              <button
                                className="btn btn-outline"
                                onClick={() => handleActivateFile(log)}
                                title="Thử nạp lại file này"
                                style={{ 
                                  padding: '3px 8px', 
                                  fontSize: '0.72rem', 
                                  gap: '4px', 
                                  color: 'var(--warning-dark)',
                                  borderColor: 'rgba(217, 119, 6, 0.4)'
                                }}
                              >
                                <RotateCcw size={12} /> Thử Lại
                              </button>
                            )}

                            {/* Nút Sử dụng lại file này */}
                            {!isActive && log.status === 'COMPLETED' && (
                              <button
                                className="btn btn-outline"
                                onClick={() => handleActivateFile(log)}
                                title="Nạp lại dữ liệu từ file này vào Database CĐBR"
                                style={{ 
                                  padding: '3px 8px', 
                                  fontSize: '0.72rem', 
                                  gap: '4px', 
                                  color: '#8b5cf6',
                                  borderColor: 'rgba(139, 92, 246, 0.3)'
                                }}
                              >
                                <RotateCcw size={12} /> Sử Dụng Lại
                              </button>
                            )}

                            {/* Nút Xoá file */}
                            <button
                              className="btn btn-outline"
                              onClick={() => handleDeleteFile(log)}
                              title="Xoá vĩnh viễn file này khỏi máy chủ và database CĐBR"
                              style={{ 
                                padding: '3px 8px', 
                                fontSize: '0.72rem', 
                                gap: '4px', 
                                color: 'var(--danger-dark)',
                                borderColor: 'rgba(239, 68, 68, 0.3)'
                              }}
                            >
                              <Trash2 size={12} /> Xoá
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {(!importLogs || importLogs.length === 0) && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        Chưa có file nào được tải lên cho Cố Định Băng Rộng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: NẠP FILE CHI TIẾT TỦ CÁP ================= */}
      {activeTab === 'upload_cabinets' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div className="table-card" style={{ padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cable size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Nạp File Chi Tiết Tủ Cáp (THC) Theo Mã WO
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Hỗ trợ file Excel chứa danh sách các tủ hộp cáp con kèm Mã WO (như file <code>demo_tu_theo_ma_wo_demo.xlsx</code>)
                </p>
              </div>
            </div>

            <form onSubmit={handleCabinetUploadSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Gán vào Bảng Báo Cáo CĐBR:
                </label>
                <select
                  value={selectedTargetCatId}
                  onChange={(e) => setSelectedTargetCatId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Áp dụng cho tất cả WO trùng khớp --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.loai_cong_viec})</option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  border: '2px dashed #8b5cf6',
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px 24px',
                  textAlign: 'center',
                  background: 'rgba(139, 92, 246, 0.03)',
                  cursor: 'pointer',
                  marginBottom: '18px',
                }}
                onClick={() => document.getElementById('cabinet-file-input').click()}
              >
                <FileSpreadsheet size={44} style={{ color: '#8b5cf6', margin: '0 auto 12px auto' }} />
                <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                  {cabinetFile ? cabinetFile.name : 'Nhấp hoặc kéo thả file Excel tủ cáp vào đây'}
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Định dạng hỗ trợ: .xlsx, .xls • Tự động nhận diện cột Mã đối tượng, Mã WO, Trạng thái THC
                </p>
                {cabinetFile && (
                  <div style={{ marginTop: '10px' }}>
                    <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                      ✓ Đã chọn file: {(cabinetFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
                <input
                  id="cabinet-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCabinetFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                {cabinetFile && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setCabinetFile(null)}
                    style={{ fontSize: '0.82rem', padding: '8px 16px' }}
                  >
                    Hủy chọn
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!cabinetFile || isUploadingCabinet}
                  style={{ fontSize: '0.85rem', padding: '8px 24px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  {isUploadingCabinet ? 'Đang nạp file tủ cáp...' : 'Bắt Đầu Nạp File Tủ Cáp'}
                </button>
              </div>
            </form>

            {uploadError && (
              <div style={{ marginTop: '20px', padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--danger-light)', color: 'var(--danger-dark)', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Lỗi nạp file tủ cáp:</strong> {uploadError}
                </div>
              </div>
            )}

            {uploadResult && (
              <div style={{ marginTop: '24px', padding: '20px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      Nạp Thành Công File Tủ Cáp!
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Đã lưu trữ {uploadResult.total_cabinets} tủ cáp của {uploadResult.unique_wos} WO lúc {uploadResult.imported_at_vn}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>TỔNG SỐ TỦ</span>
                    <strong style={{ fontSize: '1.25rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.total_cabinets}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--success-dark)', display: 'block' }}>TỦ HOÀN THÀNH</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.completed_cabinets}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--warning-dark)', display: 'block' }}>CHƯA XONG</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.pending_cabinets}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#8b5cf6', display: 'block' }}>TỶ LỆ XONG</span>
                    <strong style={{ fontSize: '1.25rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.completion_rate}%
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: DANH MỤC BÁO CÁO CĐBR ================= */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Các Bảng Báo Cáo Cố Định Băng Rộng
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Các bảng này sẽ hiển thị thành các thẻ chọn báo cáo trên trang <strong>/codinh</strong>
              </span>
            </div>

            <button
              onClick={handleOpenCreate}
              className="btn btn-primary"
              style={{ fontSize: '0.84rem', padding: '8px 18px', gap: '6px' }}
            >
              <Plus size={16} /> Tạo Bảng Báo Cáo Mới
            </button>
          </div>

          {loadingCategories ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Đang tải danh sách báo cáo...
            </div>
          ) : categories.length === 0 ? (
            <div className="table-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Layers size={40} style={{ opacity: 0.4, marginBottom: '10px' }} />
              <h4>Chưa có bảng báo cáo CĐBR nào</h4>
              <p style={{ fontSize: '0.85rem' }}>Bấm nút "Tạo Bảng Báo Cáo Mới" bên trên để tạo bảng theo Đầu việc hoặc Hệ thống.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="table-card"
                  style={{
                    padding: '20px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        {cat.name}
                      </h4>
                      {cat.is_default && (
                        <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                          Mặc định
                        </span>
                      )}
                    </div>

                    {cat.description && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.45 }}>
                        {cat.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '0.74rem' }}>
                        {cat.filter_mode === 'by_system' ? 'Theo Hệ Thống' : 'Theo Đầu Việc'}
                      </span>
                      <span className="badge badge-purple" style={{ fontSize: '0.74rem' }}>
                        {(cat.filter_values || []).length} mục lọc
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '0.78rem', color: 'var(--text-secondary)', maxHeight: '72px', overflowY: 'auto' }}>
                      {(cat.filter_values || []).join(' • ') || 'Chưa chọn'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <button
                      onClick={() => handleOpenEdit(cat)}
                      className="btn btn-outline"
                      style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
                    >
                      <Edit2 size={13} /> Sửa
                    </button>
                    {!cat.is_default && (
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="btn btn-outline"
                        style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      >
                        <Trash2 size={13} /> Xóa
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Tạo/Sửa Category */}
      {showCategoryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {editingCategory ? 'Chỉnh Sửa Bảng Báo Cáo CĐBR' : 'Tạo Bảng Báo Cáo CĐBR Mới'}
              </h3>
              <button className="btn-icon" onClick={() => setShowCategoryModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCategorySubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Tên Bảng Báo Cáo <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bảo Dưỡng Tuyến Cáp GPON"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Mô Tả Báo Cáo (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Mô tả ngắn gọn mục đích của bảng báo cáo..."
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Chế Độ Lọc Dữ Liệu
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="filterMode"
                      value="by_loai"
                      checked={catFilterMode === 'by_loai'}
                      onChange={() => {
                        setCatFilterMode('by_loai');
                        setCatSelectedValues([]);
                      }}
                    />
                    <span>Theo Loại Công Việc (Đầu việc)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="filterMode"
                      value="by_system"
                      checked={catFilterMode === 'by_system'}
                      onChange={() => {
                        setCatFilterMode('by_system');
                        setCatSelectedValues([]);
                      }}
                    />
                    <span>Theo Hệ Thống Quản Lý</span>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Chọn {catFilterMode === 'by_loai' ? 'Loại Công Việc' : 'Hệ Thống'} <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 700 }}>
                    Đã chọn {catSelectedValues.length} mục
                  </span>
                </div>

                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder={`Tìm kiếm ${catFilterMode === 'by_loai' ? 'loại công việc' : 'hệ thống'}...`}
                    value={catSearchFilter}
                    onChange={(e) => setCatSearchFilter(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px 6px 32px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '8px', background: 'var(--bg-tertiary)' }}>
                  {filteredSelectableList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Không tìm thấy mục nào khớp từ khóa
                    </div>
                  ) : (
                    filteredSelectableList.map((item, idx) => {
                      const isSelected = catSelectedValues.includes(item);
                      return (
                        <div
                          key={idx}
                          onClick={() => handleToggleValue(item)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(2, 132, 199, 0.12)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.82rem',
                            marginBottom: '2px',
                            color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
                            fontWeight: isSelected ? 700 : 400
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ flex: 1 }}>{item}</span>
                          {isSelected && <Check size={14} style={{ color: 'var(--brand-primary)' }} />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={catExcludeClosedPrior}
                    onChange={(e) => setCatExcludeClosedPrior(e.target.checked)}
                  />
                  <span>Tự động loại bỏ các việc đã hoàn thành/đóng từ các tháng trước</span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCategoryModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveCategoryMutation.isPending}
                >
                  {saveCategoryMutation.isPending ? 'Đang lưu...' : editingCategory ? 'Cập Nhật Báo Cáo' : 'Tạo Báo Cáo Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
