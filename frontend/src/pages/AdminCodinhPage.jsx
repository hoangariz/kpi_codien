import React, { useState, useEffect } from 'react';
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
  Filter,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Database,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';
import { importsApi } from '../api/importsApi';

export default function AdminCodinhPage({ onNavigateToCodinh }) {
  const queryClient = useQueryClient();

  // Active navigation tab inside admin: 'reports' | 'upload_cabinets' | 'upload_wo'
  const [activeTab, setActiveTab] = useState('reports');

  // Modal create/edit category state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catFilterMode, setCatFilterMode] = useState('by_loai'); // 'by_loai' | 'by_system'
  const [catSelectedValues, setCatSelectedValues] = useState([]);
  const [catExcludeClosedPrior, setCatExcludeClosedPrior] = useState(true);
  const [catSearchFilter, setCatSearchFilter] = useState('');

  // Cabinet upload state
  const [cabinetFile, setCabinetFile] = useState(null);
  const [selectedTargetCatId, setSelectedTargetCatId] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploadingCabinet, setIsUploadingCabinet] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Queries
  const { data: categories = [], isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['codinh-categories'],
    queryFn: () => codinhApi.getCategories(null, true),
  });

  const { data: metaOptions = { task_types: [], systems: [] } } = useQuery({
    queryKey: ['codinh-meta-options'],
    queryFn: codinhApi.getMetaOptions,
  });

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

  // Toggle selection in modal
  const handleToggleValue = (val) => {
    if (catSelectedValues.includes(val)) {
      setCatSelectedValues(catSelectedValues.filter(x => x !== val));
    } else {
      setCatSelectedValues([...catSelectedValues, val]);
    }
  };

  // Cabinet File Upload
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

  const selectableList = catFilterMode === 'by_loai' ? (metaOptions.task_types || []) : (metaOptions.systems || []);
  const filteredSelectableList = selectableList.filter(item => 
    !catSearchFilter.trim() || item.toLowerCase().includes(catSearchFilter.trim().toLowerCase())
  );

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header & Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
              <Cable size={13} /> QUẢN TRỊ CỐ ĐỊNH BĂNG RỘNG
            </span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Quản Trị Báo Cáo & Nạp Dữ Liệu Tủ Cáp
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Tạo bảng theo đầu việc / hệ thống và nạp file đối chiếu chi tiết tủ cáp theo mã WO
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

      {/* Tabs navigation inside Admin */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('reports')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0' }}
        >
          <Layers size={16} /> Danh Mục Báo Cáo CĐBR ({categories.length})
        </button>

        <button
          className={`btn ${activeTab === 'upload_cabinets' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_cabinets')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'upload_cabinets' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'upload_cabinets' ? '#8b5cf6' : 'var(--border-color)' }}
        >
          <Upload size={16} /> Nạp File Chi Tiết Tủ Cáp (THC)
        </button>
      </div>

      {/* ================= TAB 1: DANH MỤC BÁO CÁO CĐBR ================= */}
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

                    <div style={{ background: 'var(--bg-tertiary)', padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Chế độ lọc:</span>
                        <strong style={{ color: cat.filter_mode === 'by_system' ? '#8b5cf6' : 'var(--brand-primary)' }}>
                          {cat.filter_mode === 'by_system' ? 'Theo Hệ Thống' : 'Theo Đầu Việc'}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Giá trị:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(cat.filter_values || []).map((val, idx) => (
                            <span key={idx} className="badge badge-neutral" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                              {val}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
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
              {/* Target Report Category */}
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

              {/* File Dropzone */}
              <div
                style={{
                  border: '2px dashed #8b5cf6',
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px 24px',
                  textAlign: 'center',
                  background: 'rgba(139, 92, 246, 0.03)',
                  cursor: 'pointer',
                  marginBottom: '18px',
                  transition: 'background 0.2s ease'
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

              {/* Upload Button */}
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
                  style={{ padding: '9px 24px', fontSize: '0.88rem', gap: '8px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  {isUploadingCabinet ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px' }} />
                      Đang xử lý dữ liệu...
                    </>
                  ) : (
                    <>
                      <Upload size={16} /> Nạp Dữ Liệu Tủ Cáp
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Error Message */}
            {uploadError && (
              <div style={{ marginTop: '18px', padding: '14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger-dark)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Success Result Breakdown */}
            {uploadResult && (
              <div style={{ marginTop: '20px', padding: '18px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid var(--success)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <CheckCircle2 size={20} style={{ color: 'var(--success-dark)' }} />
                  <strong style={{ color: 'var(--success-dark)', fontSize: '0.98rem' }}>
                    {uploadResult.message}
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', fontSize: '0.82rem' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Tổng Tủ Cáp</span>
                    <strong style={{ fontSize: '1.1rem', color: '#8b5cf6' }}>{uploadResult.total_cabinets?.toLocaleString()}</strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Số Mã WO Khớp</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--brand-primary)' }}>{uploadResult.unique_wos?.toLocaleString()}</strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Tủ Đã Hoàn Thành</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--success-dark)' }}>{uploadResult.completed_cabinets?.toLocaleString()}</strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Tủ Đang Làm / Tồn</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--warning-dark)' }}>{uploadResult.pending_cabinets?.toLocaleString()}</strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Tỉ Lệ Hoàn Thành</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--success-dark)' }}>{uploadResult.completion_rate}%</strong>
                  </div>
                </div>

                <div style={{ marginTop: '14px', textAlign: 'right' }}>
                  <button
                    onClick={onNavigateToCodinh}
                    className="btn btn-primary"
                    style={{ fontSize: '0.82rem', padding: '6px 14px', gap: '5px' }}
                  >
                    Xem kết quả trên bảng CĐBR <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL TẠO / SỬA BÁO CÁO CĐBR ================= */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px', width: '92vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={18} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  {editingCategory ? 'Chỉnh Sửa Bảng Báo Cáo CĐBR' : 'Tạo Bảng Báo Cáo CĐBR Mới'}
                </h3>
              </div>
              <button className="btn btn-outline btn-icon" onClick={() => setShowCategoryModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCategorySubmit}>
              {/* Tên bảng báo cáo */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Tên Bảng Báo Cáo <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Bảo Dưỡng Tủ Hộp Cáp (THC), Bảo Dưỡng Thuê Bao GPON..."
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  required
                />
              </div>

              {/* Mô tả */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Mô Tả Ngắn:
                </label>
                <input
                  type="text"
                  placeholder="Mô tả tóm tắt mục đích bảng báo cáo..."
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Chế độ lọc: Theo Đầu Việc hay Theo Hệ Thống */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
                  Cơ Chế Lọc Dữ Liệu:
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="filterMode"
                      checked={catFilterMode === 'by_loai'}
                      onChange={() => {
                        setCatFilterMode('by_loai');
                        setCatSelectedValues([]);
                      }}
                    />
                    <span>Theo Đầu Việc (Loại công việc)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="filterMode"
                      checked={catFilterMode === 'by_system'}
                      onChange={() => {
                        setCatFilterMode('by_system');
                        setCatSelectedValues([]);
                      }}
                    />
                    <span>Theo Hệ Thống</span>
                  </label>
                </div>
              </div>

              {/* Danh sách lựa chọn có ô tìm kiếm */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    Chọn {catFilterMode === 'by_loai' ? 'Loại Công Việc' : 'Hệ Thống'} Cần Đưa Vào Báo Cáo <span style={{ color: 'var(--danger)' }}>*</span>
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

              {/* Tùy chọn exclude closed prior months */}
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

              {/* Buttons */}
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
