import React, { useState } from 'react';
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
  Database
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';

export default function AdminCodinhPage({ onNavigateToCodinh }) {
  const queryClient = useQueryClient();

  // Active navigation tab inside admin: 'upload_base_wo' | 'upload_cabinets' | 'reports'
  const [activeTab, setActiveTab] = useState('upload_base_wo');

  // Base WO file upload state
  const [baseWoFile, setBaseWoFile] = useState(null);
  const [isUploadingWo, setIsUploadingWo] = useState(false);
  const [uploadWoResult, setUploadWoResult] = useState(null);
  const [uploadWoError, setUploadWoError] = useState(null);

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

  // Base WO Upload Submit
  const handleBaseWoUploadSubmit = async (e) => {
    e.preventDefault();
    if (!baseWoFile) {
      alert('Vui lòng chọn file Excel công việc CĐBR (.xlsx, .xls)');
      return;
    }

    setIsUploadingWo(true);
    setUploadWoError(null);
    setUploadWoResult(null);

    try {
      const res = await codinhApi.uploadWoFile(baseWoFile);
      setUploadWoResult(res);
      setBaseWoFile(null);
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-categories'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-meta-options'] });
    } catch (err) {
      setUploadWoError(err.response?.data?.detail || err.message);
    } finally {
      setIsUploadingWo(false);
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
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
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
                  File này lưu trữ <strong>hoàn toàn riêng biệt</strong> cho CĐBR, <strong>KHÔNG</strong> ghi đè hay ảnh hưởng đến dữ liệu bên Tổng Quan (Cơ điện).
                </p>
              </div>
            </div>

            <form onSubmit={handleBaseWoUploadSubmit}>
              {/* Dropzone */}
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
                onClick={() => document.getElementById('base-wo-file-input').click()}
              >
                <FileSpreadsheet size={44} style={{ color: '#8b5cf6', margin: '0 auto 12px auto' }} />
                <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                  {baseWoFile ? baseWoFile.name : 'Nhấp hoặc kéo thả file Excel công việc CĐBR vào đây'}
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Định dạng hỗ trợ: .xlsx, .xls • Nhận diện cột Mã công việc, Loại công việc, Nhân viên, Nhóm, Trạng thái...
                </p>
                {baseWoFile && (
                  <div style={{ marginTop: '10px' }}>
                    <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                      ✓ Đã chọn file: {(baseWoFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                )}
                <input
                  id="base-wo-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setBaseWoFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Upload Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                {baseWoFile && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setBaseWoFile(null)}
                    style={{ fontSize: '0.82rem', padding: '8px 16px' }}
                  >
                    Hủy chọn
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!baseWoFile || isUploadingWo}
                  style={{ fontSize: '0.85rem', padding: '8px 24px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  {isUploadingWo ? 'Đang nạp file WO CĐBR...' : 'Bắt Đầu Nạp File Gốc CĐBR'}
                </button>
              </div>
            </form>

            {/* Error Message */}
            {uploadWoError && (
              <div style={{ marginTop: '20px', padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--danger-light)', color: 'var(--danger-dark)', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Lỗi nạp file WO CĐBR:</strong> {uploadWoError}
                </div>
              </div>
            )}

            {/* Success Result */}
            {uploadWoResult && (
              <div style={{ marginTop: '24px', padding: '20px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      Nạp Thành Công File Gốc CĐBR!
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Dữ liệu đã được nạp riêng vào bảng Cố Định Băng Rộng lúc {uploadWoResult.imported_at_vn}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>TỔNG WO CĐBR</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                      {uploadWoResult.total_wos?.toLocaleString()}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--success-dark)', display: 'block' }}>WO ĐÃ ĐÓNG</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                      {uploadWoResult.closed_wos?.toLocaleString()}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--warning-dark)', display: 'block' }}>WO ĐANG TỒN</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {uploadWoResult.pending_wos?.toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>
            )}
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
