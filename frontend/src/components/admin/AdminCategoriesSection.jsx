import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Layers, 
  Search, 
  Pencil, 
  Trash2, 
  Plus, 
  X, 
  Save, 
  AlertCircle 
} from 'lucide-react';
import { reportCategoryApi } from '../../api/reportCategoryApi';
import { metaApi } from '../../api/metaApi';

export default function AdminCategoriesSection({ selectedMonth }) {
  const queryClient = useQueryClient();

  // Report Categories State
  const [newCatName, setNewCatName] = useState('');
  const [newCatTaskType, setNewCatTaskType] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatDashboardView, setNewCatDashboardView] = useState('codien');
  const [newCatSortOrder, setNewCatSortOrder] = useState(0);
  const [newCatIsPriority, setNewCatIsPriority] = useState(false);
  const [newCatExcludeClosedPrior, setNewCatExcludeClosedPrior] = useState(true);
  const [newCatFilterMode, setNewCatFilterMode] = useState('by_loai'); // 'by_loai' | 'by_system'
  const [newCatFilterValues, setNewCatFilterValues] = useState([]);
  const [newCatTypeSearch, setNewCatTypeSearch] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [catSearchFilter, setCatSearchFilter] = useState('');

  // Edit category filter state
  const [editCatFilterMode, setEditCatFilterMode] = useState('by_loai');
  const [editCatFilterValues, setEditCatFilterValues] = useState([]);
  const [editCatTypeSearch, setEditCatTypeSearch] = useState('');

  // Sub-categories State
  const [selectedCatForSub, setSelectedCatForSub] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [newSubKeyword, setNewSubKeyword] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');
  const [newSubIsStandalone, setNewSubIsStandalone] = useState(false);
  const [subKeywordError, setSubKeywordError] = useState('');
  const [editingSubCategory, setEditingSubCategory] = useState(null); // { id, name, keyword, description, is_standalone_table }
  const [editingOtherCatId, setEditingOtherCatId] = useState(null);
  const [editingOtherName, setEditingOtherName] = useState('');

  // Fetch report categories
  const { data: reportCategories, isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['report-categories', selectedMonth],
    queryFn: () => reportCategoryApi.getCategories(selectedMonth),
  });

  const filteredCategories = (reportCategories || []).filter(c => {
    if (!catSearchFilter.trim()) return true;
    const term = catSearchFilter.trim().toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.loai_cong_viec || '').toLowerCase().includes(term) ||
      (c.description || '').toLowerCase().includes(term)
    );
  });

  // Fetch filter options (for task_types dropdown)
  const { data: filterOptions } = useQuery({
    queryKey: ['meta-filters'],
    queryFn: metaApi.getFilters,
  });
  const taskTypesList = filterOptions?.task_types || [];

  // Create Category Mutation
  const createCategoryMutation = useMutation({
    mutationFn: (data) => reportCategoryApi.createCategory(data),
    onSuccess: (res) => {
      setNewCatName('');
      setNewCatTaskType('');
      setNewCatDesc('');
      setNewCatDashboardView('codien');
      setNewCatSortOrder(0);
      setNewCatIsPriority(false);
      setNewCatExcludeClosedPrior(true);
      setNewCatFilterMode('by_loai');
      setNewCatFilterValues([]);
      setNewCatTypeSearch('');
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      alert(`Đã tạo thành công bảng báo cáo "${res.name}"!`);
    },
    onError: (err) => {
      alert('Lỗi tạo bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Update Category Mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => reportCategoryApi.updateCategory(id, data),
    onSuccess: (res) => {
      setEditingCategory(null);
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert(`Đã cập nhật bảng báo cáo "${res.name}" thành công!`);
    },
    onError: (err) => {
      alert('Lỗi cập nhật bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Delete Category Mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => reportCategoryApi.deleteCategory(id),
    onSuccess: () => {
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      alert('Đã xoá bảng báo cáo thành công!');
    },
    onError: (err) => {
      alert('Lỗi xoá bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Create Sub-category Mutation
  const createSubCategoryMutation = useMutation({
    mutationFn: ({ categoryId, data }) => reportCategoryApi.createSubCategory(categoryId, data),
    onSuccess: (res) => {
      setNewSubName('');
      setNewSubKeyword('');
      setNewSubDesc('');
      setNewSubIsStandalone(false);
      setSubKeywordError('');
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert(`Đã thêm thành công đầu việc con "${res.name}" với từ khóa "${res.keyword}"!`);
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || err.message;
      setSubKeywordError(detail);
      alert('Lỗi thêm đầu việc con: ' + detail);
    }
  });

  // Update Sub-category Mutation
  const updateSubCategoryMutation = useMutation({
    mutationFn: ({ subId, data }) => reportCategoryApi.updateSubCategory(subId, data),
    onSuccess: (res) => {
      setEditingSubCategory(null);
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert(`Đã cập nhật đầu việc con "${res.name}" thành công!`);
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || err.message;
      alert('Lỗi cập nhật đầu việc con: ' + detail);
    }
  });

  // Delete Sub-category Mutation
  const deleteSubCategoryMutation = useMutation({
    mutationFn: (subId) => reportCategoryApi.deleteSubCategory(subId),
    onSuccess: () => {
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert('Đã xoá đầu việc con thành công!');
    },
    onError: (err) => {
      alert('Lỗi xoá đầu việc con: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Handler for adding sub-category with duplicate check
  const handleAddSubCategory = (cat) => {
    setSubKeywordError('');
    const cleanName = newSubName.trim();
    const cleanKw = newSubKeyword.trim();
    if (!cleanName || !cleanKw) {
      alert('Vui lòng nhập đầy đủ tên đầu việc con và từ khóa phân loại!');
      return;
    }

    const existingSubs = cat.sub_categories || [];
    const duplicate = existingSubs.find(s => (s.keyword || '').trim().toLowerCase() === cleanKw.toLowerCase());
    if (duplicate) {
      const msg = `Lỗi: Từ khóa "${cleanKw}" đã tồn tại ở đầu việc con "${duplicate.name}"! Mỗi đầu việc con phải có từ khóa riêng biệt để phân loại chính xác.`;
      setSubKeywordError(msg);
      alert(msg);
      return;
    }

    createSubCategoryMutation.mutate({
      categoryId: cat.id,
      data: {
        name: cleanName,
        keyword: cleanKw,
        description: newSubDesc.trim() || undefined,
        is_standalone_table: newSubIsStandalone
      }
    });
  };

  // Handler for saving edited sub-category
  const handleSaveSubEdit = (cat) => {
    if (!editingSubCategory) return;
    const cleanName = (editingSubCategory.name || '').trim();
    const cleanKw = (editingSubCategory.keyword || '').trim();
    if (!cleanName || !cleanKw) {
      alert('Tên đầu việc con và từ khóa không được để trống!');
      return;
    }
    const existingSubs = (cat.sub_categories || []).filter(s => s.id !== editingSubCategory.id);
    const duplicate = existingSubs.find(s => (s.keyword || '').trim().toLowerCase() === cleanKw.toLowerCase());
    if (duplicate) {
      alert(`Lỗi: Từ khóa "${cleanKw}" đã tồn tại ở đầu việc con "${duplicate.name}"!`);
      return;
    }
    updateSubCategoryMutation.mutate({
      subId: editingSubCategory.id,
      data: {
        name: cleanName,
        keyword: cleanKw,
        description: editingSubCategory.description ? editingSubCategory.description.trim() : null,
        is_standalone_table: Boolean(editingSubCategory.is_standalone_table)
      }
    });
  };

  // Handler for renaming fallback 'Còn lại / Khác' sub-category table
  const handleSaveOtherSubName = (catId) => {
    const cleanName = editingOtherName.trim();
    if (!cleanName) {
      alert('Tên bảng không được để trống!');
      return;
    }
    updateCategoryMutation.mutate({
      id: catId,
      data: { other_sub_category_name: cleanName }
    }, {
      onSuccess: () => {
        setEditingOtherCatId(null);
        setEditingOtherName('');
      }
    });
  };

  return (
    <div 
      id="admin-sec-categories"
      className="table-card" 
      style={{ 
        padding: '24px', 
        marginBottom: '28px',
        border: '1px solid rgba(2, 132, 199, 0.35)',
        background: 'var(--bg-secondary)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'rgba(2, 132, 199, 0.12)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Quản Lý Danh Mục Loại Báo Cáo (Hiển Thị Trên Dashboard)
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Cấu hình các bảng báo cáo theo loại công việc hoặc hệ thống. Hỗ trợ tách đầu việc con thành bảng độc lập.
            </p>
          </div>
        </div>
      </div>

      {/* Form tạo loại báo cáo mới */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newCatName.trim() || newCatFilterValues.length === 0) return;
          createCategoryMutation.mutate({
            name: newCatName.trim(),
            loai_cong_viec: '',
            description: newCatDesc.trim() || undefined,
            dashboard_view: newCatDashboardView,
            sort_order: Number(newCatSortOrder) || 0,
            is_priority: newCatIsPriority,
            is_all_wo: false,
            exclude_closed_prior_months: newCatExcludeClosedPrior,
            filter_mode: newCatFilterMode,
            filter_values: newCatFilterValues,
          });
        }}
        style={{
          background: 'var(--bg-tertiary)',
          padding: '20px 22px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          border: '1px solid rgba(2, 132, 199, 0.2)'
        }}
      >
        {/* Row 1: Tên bảng */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            TÊN BẢNG BÁO CÁO <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="text"
            className="select-filter"
            placeholder="VD: Báo Hỏng Hạ Tầng Mạng Lưới, Bảo Dưỡng Trạm BTS..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem' }}
            required
          />
        </div>

        {/* Row 2: Chế độ lọc — toggle */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            CHẾ ĐỘ LỌC CÔNG VIỆC <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: 'fit-content', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => { setNewCatFilterMode('by_loai'); setNewCatFilterValues([]); setNewCatTypeSearch(''); }}
              style={{
                padding: '7px 18px',
                fontSize: '0.82rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: newCatFilterMode === 'by_loai' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                color: newCatFilterMode === 'by_loai' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              📂 Theo Loại Công Việc
            </button>
            <button
              type="button"
              onClick={() => { setNewCatFilterMode('by_system'); setNewCatFilterValues([]); setNewCatTypeSearch(''); }}
              style={{
                padding: '7px 18px',
                fontSize: '0.82rem',
                fontWeight: 700,
                border: 'none',
                borderLeft: '1px solid var(--border-color)',
                cursor: 'pointer',
                background: newCatFilterMode === 'by_system' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                color: newCatFilterMode === 'by_system' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              🖥️ Theo Hệ Thống
            </button>
          </div>

          {/* Tags đã chọn */}
          {newCatFilterValues.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {newCatFilterValues.map(v => (
                <span
                  key={v}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'rgba(2, 132, 199, 0.12)',
                    color: 'var(--brand-primary)',
                    border: '1px solid rgba(2, 132, 199, 0.3)',
                    borderRadius: '999px',
                    padding: '3px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700
                  }}
                >
                  {v}
                  <button
                    type="button"
                    onClick={() => setNewCatFilterValues(prev => prev.filter(x => x !== v))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)', padding: '0 2px', lineHeight: 1, fontWeight: 900 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search box + danh sách chọn */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="select-filter"
                placeholder={newCatFilterMode === 'by_loai' ? 'Tìm loại công việc để gộp vào bảng...' : 'Tìm hệ thống...'}
                value={newCatTypeSearch}
                onChange={(e) => setNewCatTypeSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px 6px 30px', fontSize: '0.82rem' }}
              />
            </div>

            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {newCatFilterMode === 'by_loai'
                ? (taskTypesList || [])
                    .filter(tt => !newCatTypeSearch || tt.toLowerCase().includes(newCatTypeSearch.toLowerCase()))
                    .map(tt => {
                      const isSelected = newCatFilterValues.includes(tt);
                      return (
                        <button
                          key={tt}
                          type="button"
                          onClick={() => setNewCatFilterValues(prev => isSelected ? prev.filter(x => x !== tt) : [...prev, tt])}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            borderRadius: '999px',
                            cursor: 'pointer',
                            border: isSelected ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-color)',
                            background: isSelected ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-tertiary)',
                            color: isSelected ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            transition: 'all 0.1s ease',
                            maxWidth: '260px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={tt}
                        >
                          {isSelected ? '✓ ' : ''}{tt}
                        </button>
                      );
                    })
                : (filterOptions?.systems || [])
                    .filter(s => !newCatTypeSearch || s.name.toLowerCase().includes(newCatTypeSearch.toLowerCase()))
                    .map(s => {
                      const isSelected = newCatFilterValues.includes(s.name);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setNewCatFilterValues(prev => isSelected ? prev.filter(x => x !== s.name) : [...prev, s.name])}
                          style={{
                            padding: '4px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            borderRadius: '999px',
                            cursor: 'pointer',
                            border: isSelected ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-color)',
                            background: isSelected ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-tertiary)',
                            color: isSelected ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          {isSelected ? '✓ ' : ''}{s.name}
                        </button>
                      );
                    })
              }
            </div>

            {newCatFilterValues.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600, margin: '8px 0 0 0' }}>
                ⚠️ Vui lòng chọn ít nhất 1 {newCatFilterMode === 'by_loai' ? 'loại công việc' : 'hệ thống'} phía trên!
              </p>
            )}
          </div>
        </div>

        {/* Row 3: Vị trí hiển thị trên Dashboard, Thứ tự & Mô tả */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              VỊ TRÍ HIỂN THỊ TRÊN DASHBOARD <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              className="select-filter"
              value={newCatDashboardView}
              onChange={(e) => setNewCatDashboardView(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem', fontWeight: 600 }}
            >
              <option value="codien">⚡ 2. Báo Cáo Cơ Điện (Mặc định)</option>
              <option value="nhatram">🏢 3. Báo Cáo Nhà Trạm</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              THỨ TỰ SẮP XẾP CARD
            </label>
            <input
              type="number"
              className="select-filter"
              placeholder="0"
              value={newCatSortOrder}
              onChange={(e) => setNewCatSortOrder(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              MÔ TẢ BÁO CÁO (TÙY CHỌN)
            </label>
            <input
              type="text"
              className="select-filter"
              placeholder="Ghi chú mục đích của bảng báo cáo..."
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem' }}
            />
          </div>
        </div>

        {/* Checkbox Ưu Tiên */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={newCatIsPriority}
              onChange={(e) => setNewCatIsPriority(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#f59e0b', cursor: 'pointer' }}
            />
            <span>⭐ Báo Cáo Ưu Tiên (Hiển thị đầu trang Dashboard, tải trước)</span>
          </label>
        </div>

        {/* Row 4: Checkbox lọc tháng trước */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="newCatExcludeClosedPrior"
            checked={newCatExcludeClosedPrior}
            onChange={(e) => setNewCatExcludeClosedPrior(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
          />
          <label htmlFor="newCatExcludeClosedPrior" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
            Loại bỏ các công việc đã đóng của tháng trước (Mặc định: <strong>BẬT</strong>)
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createCategoryMutation.isPending || !newCatName.trim() || newCatFilterValues.length === 0}
            style={{ padding: '9px 20px', gap: '6px', fontWeight: 700 }}
          >
            <Plus size={16} />
            {createCategoryMutation.isPending ? 'Đang tạo...' : 'Tạo Bảng Báo Cáo Mới'}
          </button>
        </div>
      </form>

      {/* Danh sách các bảng báo cáo hiện có */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          DANH SÁCH BẢNG BÁO CÁO ({filteredCategories.length})
        </h4>

        <div className="search-input-box" style={{ width: '260px' }}>
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Tìm kiếm bảng báo cáo..."
            value={catSearchFilter}
            onChange={(e) => setCatSearchFilter(e.target.value)}
            style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
        <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Thứ Tự</th>
              <th style={{ minWidth: '180px', textAlign: 'left' }}>Tên Bảng Báo Cáo</th>
              <th style={{ width: '135px', textAlign: 'center' }}>Vị Trí Dashboard</th>
              <th style={{ minWidth: '220px', textAlign: 'left' }}>Quy Tắc Lọc Công Việc</th>
              <th style={{ width: '120px', textAlign: 'center' }}>Tháng Trước</th>
              <th style={{ width: '180px', textAlign: 'center' }}>Đầu Việc Con</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {loadingCategories ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Đang tải danh mục báo cáo...
                </td>
              </tr>
            ) : filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Chưa có bảng báo cáo nào. Hãy tạo bảng báo cáo đầu tiên ở trên.
                </td>
              </tr>
            ) : (
              filteredCategories.map((c, idx) => (
                <React.Fragment key={c.id}>
                  <tr className="excel-row" style={{ background: selectedCatForSub === c.id ? 'rgba(2, 132, 199, 0.05)' : undefined }}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{c.sort_order ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.name}</strong>
                          {c.is_priority && (
                            <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 800 }} title="Ưu tiên">
                              ⭐
                            </span>
                          )}
                        </div>
                        {c.description && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {c.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {c.dashboard_view === 'nhatram' ? (
                        <span className="badge badge-warning" style={{ fontSize: '0.74rem', fontWeight: 700 }}>🏢 Nhà Trạm</span>
                      ) : (
                        <span className="badge badge-info" style={{ fontSize: '0.74rem', fontWeight: 700 }}>⚡ Cơ Điện</span>
                      )}
                    </td>
                    <td>
                      {c.filter_mode === 'by_system' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6' }}>🖥️ LỌC THEO HỆ THỐNG:</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {(() => {
                              try {
                                const vals = JSON.parse(c.filter_values || '[]');
                                return vals.map((v) => (
                                  <span key={v} className="badge badge-info" style={{ fontSize: '0.72rem', padding: '1px 7px' }}>
                                    {v}
                                  </span>
                                ));
                              } catch {
                                return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.filter_values || '--'}</span>;
                              }
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {c.filter_values ? (
                            <>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--brand-primary)' }}>📂 GỘP CÁC LOẠI VIỆC:</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                {(() => {
                                  try {
                                    const vals = JSON.parse(c.filter_values);
                                    return vals.map((v) => (
                                      <span key={v} className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '1px 6px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}>
                                        {v}
                                      </span>
                                    ));
                                  } catch {
                                    return <span style={{ fontSize: '0.75rem' }}>{c.loai_cong_viec}</span>;
                                  }
                                })()}
                              </div>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                              {c.loai_cong_viec || '--'}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${c.exclude_closed_prior_months !== false ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.72rem' }}>
                        {c.exclude_closed_prior_months !== false ? 'Loại bỏ đóng' : 'Giữ lại tất cả'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={`btn ${selectedCatForSub === c.id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => {
                          setSelectedCatForSub(selectedCatForSub === c.id ? null : c.id);
                          setNewSubName('');
                          setNewSubKeyword('');
                          setNewSubDesc('');
                          setNewSubIsStandalone(false);
                          setSubKeywordError('');
                          setEditingSubCategory(null);
                          setEditingOtherCatId(null);
                        }}
                        style={{ padding: '4px 10px', fontSize: '0.76rem', gap: '5px' }}
                      >
                        📂 {c.sub_categories ? `${c.sub_categories.length} Đầu việc con` : 'Cấu hình'}
                        {c.sub_categories && c.sub_categories.some(s => s.is_standalone_table) && (
                          <span style={{ background: '#10b981', color: '#fff', borderRadius: '8px', padding: '1px 5px', fontSize: '0.66rem', fontWeight: 800 }}>
                            {c.sub_categories.filter(s => s.is_standalone_table).length} độc lập
                          </span>
                        )}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setEditingCategory({
                              ...c,
                              sort_order: c.sort_order ?? 0,
                              is_priority: Boolean(c.is_priority),
                            });
                            setEditCatFilterMode(c.filter_mode || 'by_loai');
                            try {
                              setEditCatFilterValues(JSON.parse(c.filter_values || '[]'));
                            } catch {
                              setEditCatFilterValues(c.loai_cong_viec ? [c.loai_cong_viec] : []);
                            }
                            setEditCatTypeSearch('');
                          }}
                          title="Chỉnh sửa bảng này"
                          style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            if (window.confirm(`Bạn có chắc chắn muốn xoá bảng báo cáo "${c.name}"?`)) {
                              deleteCategoryMutation.mutate(c.id);
                            }
                          }}
                          title="Xoá bảng này"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Panel mở rộng cấu hình Đầu việc con */}
                  {selectedCatForSub === c.id && (
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan={7} style={{ padding: '16px 20px', borderBottom: '2px solid var(--border-color)' }}>
                        <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(2, 132, 199, 0.3)', borderRadius: 'var(--radius-md)', padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                              <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>📂 Cấu Hình Đầu Việc Con Cho:</span>
                                <span style={{ color: 'var(--brand-primary)' }}>{c.name}</span>
                              </h4>
                              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                                Tự động gom theo từ khóa trong cột <strong>"Nội dung công việc"</strong>. Tích chọn <strong>"Tạo thành 1 Bảng Độc Lập"</strong> nếu bạn muốn đầu việc này đứng riêng thành 1 bảng ngang hàng ngoài Dashboard.
                              </p>
                            </div>

                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                setSelectedCatForSub(null);
                                setEditingSubCategory(null);
                                setEditingOtherCatId(null);
                              }}
                              style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                            >
                              Đóng
                            </button>
                          </div>

                          {/* Error banner if keyword duplicate */}
                          {subKeywordError && (
                            <div style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid var(--danger)',
                              color: 'var(--danger-dark)',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              marginBottom: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <AlertCircle size={16} />
                              <span>{subKeywordError}</span>
                            </div>
                          )}

                          {/* Danh sách đầu việc con hiện có */}
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                ĐẦU VIỆC CON ĐÃ CẤU HÌNH ({(c.sub_categories || []).length} theo từ khóa + 1 bảng còn lại/mặc định):
                              </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '10px' }}>
                              {(c.sub_categories || []).map((sub) => {
                                const isEditing = editingSubCategory?.id === sub.id;
                                if (isEditing) {
                                  return (
                                    <div
                                      key={sub.id}
                                      style={{
                                        padding: '12px 14px',
                                        background: 'var(--bg-tertiary)',
                                        border: '1.5px solid var(--brand-primary)',
                                        borderRadius: 'var(--radius-sm)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.15)'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <strong style={{ fontSize: '0.8rem', color: 'var(--brand-primary)' }}>
                                          ✏️ SỬA ĐẦU VIỆC CON #{sub.id}
                                        </strong>
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <div style={{ flex: 1 }}>
                                          <input
                                            type="text"
                                            className="select-filter"
                                            value={editingSubCategory.name}
                                            onChange={(e) => setEditingSubCategory({ ...editingSubCategory, name: e.target.value })}
                                            placeholder="Tên đầu việc con..."
                                            style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem' }}
                                          />
                                        </div>
                                        <div style={{ width: '130px' }}>
                                          <input
                                            type="text"
                                            className="select-filter"
                                            value={editingSubCategory.keyword}
                                            onChange={(e) => setEditingSubCategory({ ...editingSubCategory, keyword: e.target.value })}
                                            placeholder="Từ khóa..."
                                            style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
                                          />
                                        </div>
                                      </div>
                                      <input
                                        type="text"
                                        className="select-filter"
                                        value={editingSubCategory.description || ''}
                                        onChange={(e) => setEditingSubCategory({ ...editingSubCategory, description: e.target.value })}
                                        placeholder="Mô tả bổ sung (tùy chọn)..."
                                        style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem' }}
                                      />

                                      {/* Checkbox độc lập khi edit */}
                                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none', background: 'rgba(2, 132, 199, 0.08)', padding: '4px 8px', borderRadius: '4px' }}>
                                        <input
                                          type="checkbox"
                                          checked={Boolean(editingSubCategory.is_standalone_table)}
                                          onChange={(e) => setEditingSubCategory({ ...editingSubCategory, is_standalone_table: e.target.checked })}
                                          style={{ accentColor: 'var(--brand-primary)', width: '15px', height: '15px' }}
                                        />
                                        <span>📊 Hiển thị thành 1 Bảng Độc Lập riêng ngoài giao diện</span>
                                      </label>

                                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                        <button
                                          type="button"
                                          className="btn btn-outline"
                                          onClick={() => setEditingSubCategory(null)}
                                          style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                        >
                                          <X size={12} /> Hủy
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-primary"
                                          onClick={() => handleSaveSubEdit(c)}
                                          disabled={updateSubCategoryMutation.isPending || !editingSubCategory.name?.trim() || !editingSubCategory.keyword?.trim()}
                                          style={{ padding: '3px 12px', fontSize: '0.72rem', fontWeight: 700 }}
                                        >
                                          <Save size={12} /> {updateSubCategoryMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div 
                                    key={sub.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '10px 14px',
                                      background: 'var(--bg-tertiary)',
                                      border: sub.is_standalone_table ? '1.5px solid var(--success, #10b981)' : '1px solid var(--border-color)',
                                      borderRadius: 'var(--radius-sm)'
                                    }}
                                  >
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{sub.name}</strong>
                                        {sub.is_standalone_table && (
                                          <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 700 }}>
                                            📊 BẢNG ĐỘC LẬP
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Từ khóa:</span>
                                        <span 
                                          style={{
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            background: 'rgba(2, 132, 199, 0.15)',
                                            color: 'var(--brand-primary)',
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: '0.74rem',
                                            fontWeight: 800
                                          }}
                                        >
                                          {sub.keyword}
                                        </span>
                                      </div>
                                      {sub.description && (
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                                          {sub.description}
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => setEditingSubCategory({
                                          id: sub.id,
                                          name: sub.name,
                                          keyword: sub.keyword,
                                          description: sub.description || '',
                                          is_standalone_table: Boolean(sub.is_standalone_table)
                                        })}
                                        title="Sửa đầu việc con này"
                                        style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--brand-primary)', borderColor: 'rgba(2, 132, 199, 0.3)' }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => {
                                          if (window.confirm(`Xoá đầu việc con "${sub.name}" (từ khóa: ${sub.keyword})? Các công việc sẽ chuyển về bảng "${c.other_sub_category_name || 'Còn lại / Khác'}".`)) {
                                            deleteSubCategoryMutation.mutate(sub.id);
                                          }
                                        }}
                                        title="Xoá đầu việc con này"
                                        style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Bảng mặc định Còn lại / Khác */}
                              {editingOtherCatId === c.id ? (
                                <div
                                  style={{
                                    padding: '12px 14px',
                                    background: 'rgba(2, 132, 199, 0.06)',
                                    border: '1.5px solid var(--brand-primary)',
                                    borderRadius: 'var(--radius-sm)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.15)'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--brand-primary)' }}>
                                      📦 ĐỔI TÊN BẢNG GOM VIỆC CÒN LẠI:
                                    </span>
                                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>Mặc Định</span>
                                  </div>
                                  <input
                                    type="text"
                                    className="select-filter"
                                    value={editingOtherName}
                                    onChange={(e) => setEditingOtherName(e.target.value)}
                                    placeholder="VD: Còn lại / Khác, Công việc khác..."
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem' }}
                                    autoFocus
                                  />
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      onClick={() => { setEditingOtherCatId(null); setEditingOtherName(''); }}
                                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                    >
                                      <X size={12} /> Hủy
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      onClick={() => handleSaveOtherSubName(c.id)}
                                      disabled={updateCategoryMutation.isPending || !editingOtherName.trim()}
                                      style={{ padding: '3px 12px', fontSize: '0.72rem', fontWeight: 700 }}
                                    >
                                      <Save size={12} /> {updateCategoryMutation.isPending ? 'Đang lưu...' : 'Lưu Tên Mới'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 14px',
                                    background: 'rgba(2, 132, 199, 0.04)',
                                    border: '1.5px dashed rgba(2, 132, 199, 0.45)',
                                    borderRadius: 'var(--radius-sm)'
                                  }}
                                >
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '0.95rem' }}>📦</span>
                                      <strong style={{ fontSize: '0.88rem', color: 'var(--brand-primary)' }}>
                                        {c.other_sub_category_name || 'Còn lại / Khác'}
                                      </strong>
                                      <span 
                                        className="badge badge-info" 
                                        style={{ fontSize: '0.65rem', padding: '1px 6px', fontWeight: 700 }}
                                      >
                                        BẢNG MẶC ĐỊNH
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phân loại:</span>
                                      <span
                                        style={{
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(100, 116, 139, 0.15)',
                                          color: 'var(--text-secondary)',
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '0.73rem',
                                          fontWeight: 700
                                        }}
                                      >
                                        KHÁC (Tự động gom việc không trùng từ khóa trên)
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      onClick={() => {
                                        setEditingOtherCatId(c.id);
                                        setEditingOtherName(c.other_sub_category_name || 'Còn lại / Khác');
                                      }}
                                      title="Đổi tên bảng còn lại này"
                                      style={{ padding: '4px 9px', fontSize: '0.72rem', color: 'var(--brand-primary)', borderColor: 'rgba(2, 132, 199, 0.35)', fontWeight: 700, gap: '4px', whiteSpace: 'nowrap' }}
                                    >
                                      <Pencil size={12} /> Đổi tên
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Form thêm đầu việc con mới */}
                          <div style={{ background: 'var(--bg-tertiary)', padding: '14px 16px', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(2, 132, 199, 0.3)' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--brand-primary)', display: 'block', marginBottom: '10px' }}>
                              + THÊM ĐẦU VIỆC CON MỚI (TỰ ĐỘNG BÁO LỖI NẾU TRÙNG TỪ KHÓA):
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '10px' }}>
                              <div style={{ flex: '1 1 200px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '3px', color: 'var(--text-secondary)' }}>
                                  TÊN ĐẦU VIỆC CON <span style={{ color: 'var(--danger)' }}>*</span>
                                </label>
                                <input
                                  type="text"
                                  className="select-filter"
                                  placeholder="VD: Bảo dưỡng điều hòa..."
                                  value={newSubName}
                                  onChange={(e) => setNewSubName(e.target.value)}
                                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem' }}
                                />
                              </div>

                              <div style={{ flex: '1 1 220px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '3px', color: 'var(--text-secondary)' }}>
                                  TỪ KHÓA TRONG NỘI DUNG (KEYWORD) <span style={{ color: 'var(--danger)' }}>*</span>
                                </label>
                                <input
                                  type="text"
                                  className="select-filter"
                                  placeholder="VD: CONDITIONER..."
                                  value={newSubKeyword}
                                  onChange={(e) => {
                                    setNewSubKeyword(e.target.value);
                                    setSubKeywordError('');
                                  }}
                                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
                                />
                              </div>

                              <div style={{ flex: '2 1 200px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '3px', color: 'var(--text-secondary)' }}>
                                  MÔ TẢ (TÙY CHỌN)
                                </label>
                                <input
                                  type="text"
                                  className="select-filter"
                                  placeholder="Ghi chú thêm..."
                                  value={newSubDesc}
                                  onChange={(e) => setNewSubDesc(e.target.value)}
                                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem' }}
                                />
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none', background: 'rgba(2, 132, 199, 0.08)', padding: '5px 10px', borderRadius: '4px' }}>
                                <input
                                  type="checkbox"
                                  checked={newSubIsStandalone}
                                  onChange={(e) => setNewSubIsStandalone(e.target.checked)}
                                  style={{ accentColor: 'var(--brand-primary)', width: '15px', height: '15px' }}
                                />
                                <span>📊 Tạo thành 1 Bảng Độc Lập riêng ngoài giao diện</span>
                              </label>

                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleAddSubCategory(c)}
                                disabled={createSubCategoryMutation.isPending || !newSubName.trim() || !newSubKeyword.trim()}
                                style={{ padding: '7px 18px', fontSize: '0.82rem', gap: '6px', fontWeight: 700, whiteSpace: 'nowrap' }}
                              >
                                <Plus size={15} />
                                {createSubCategoryMutation.isPending ? 'Đang thêm...' : 'Thêm Đầu Việc Con'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Chỉnh Sửa Bảng Báo Cáo */}
      {editingCategory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '520px',
            padding: '22px 24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} style={{ color: 'var(--brand-primary)' }} />
                Chỉnh Sửa Bảng Báo Cáo
              </h3>
              <button
                className="btn btn-outline"
                onClick={() => setEditingCategory(null)}
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingCategory.name?.trim() || editCatFilterValues.length === 0) return;
                updateCategoryMutation.mutate({
                  id: editingCategory.id,
                  data: {
                    name: editingCategory.name.trim(),
                    description: editingCategory.description?.trim() || '',
                    dashboard_view: editingCategory.dashboard_view || 'codien',
                    sort_order: Number(editingCategory.sort_order) || 0,
                    is_priority: Boolean(editingCategory.is_priority),
                    is_all_wo: false,
                    exclude_closed_prior_months: editingCategory.exclude_closed_prior_months !== false,
                    filter_mode: editCatFilterMode,
                    filter_values: editCatFilterValues,
                    other_sub_category_name: editingCategory.other_sub_category_name?.trim() || 'Còn lại / Khác',
                  }
                });
              }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  TÊN BẢNG BÁO CÁO <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="select-filter"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    VỊ TRÍ HIỂN THỊ <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="select-filter"
                    value={editingCategory.dashboard_view || 'codien'}
                    onChange={(e) => setEditingCategory({ ...editingCategory, dashboard_view: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem', fontWeight: 600 }}
                  >
                    <option value="codien">⚡ 2. Báo Cáo Cơ Điện</option>
                    <option value="nhatram">🏢 3. Báo Cáo Nhà Trạm</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    THỨ TỰ SẮP XẾP
                  </label>
                  <input
                    type="number"
                    className="select-filter"
                    value={editingCategory.sort_order ?? 0}
                    onChange={(e) => setEditingCategory({ ...editingCategory, sort_order: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Checkboxes in Edit Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(editingCategory.is_priority)}
                    onChange={(e) => setEditingCategory({ ...editingCategory, is_priority: e.target.checked })}
                    style={{ width: '15px', height: '15px', accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <span>⭐ Báo Cáo Ưu Tiên (Hiển thị đầu trang Dashboard, tải trước)</span>
                </label>
              </div>

              {/* Chế độ lọc toggle */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  CHẾ ĐỘ LỌC <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: 'fit-content', marginBottom: '10px' }}>
                  <button type="button"
                    onClick={() => { setEditCatFilterMode('by_loai'); setEditCatFilterValues([]); setEditCatTypeSearch(''); }}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                      background: editCatFilterMode === 'by_loai' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                      color: editCatFilterMode === 'by_loai' ? '#fff' : 'var(--text-secondary)' }}
                  >📂 Loại Công Việc</button>
                  <button type="button"
                    onClick={() => { setEditCatFilterMode('by_system'); setEditCatFilterValues([]); setEditCatTypeSearch(''); }}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700, border: 'none', borderLeft: '1px solid var(--border-color)', cursor: 'pointer',
                      background: editCatFilterMode === 'by_system' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                      color: editCatFilterMode === 'by_system' ? '#fff' : 'var(--text-secondary)' }}
                  >🖥️ Hệ Thống</button>
                </div>
                {/* Tags đã chọn */}
                {editCatFilterValues.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                    {editCatFilterValues.map(v => (
                      <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(2,132,199,0.1)', color: 'var(--brand-primary)',
                        border: '1px solid rgba(2,132,199,0.25)', borderRadius: '999px', padding: '2px 8px', fontSize: '0.76rem', fontWeight: 700 }}>
                        {v}
                        <button type="button"
                          onClick={() => setEditCatFilterValues(prev => prev.filter(x => x !== v))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', lineHeight: 1, fontWeight: 900 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Search + list */}
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" className="select-filter"
                      placeholder={editCatFilterMode === 'by_loai' ? 'Tìm loại công việc...' : 'Tìm hệ thống...'}
                      value={editCatTypeSearch}
                      onChange={(e) => setEditCatTypeSearch(e.target.value)}
                      style={{ width: '100%', padding: '5px 9px 5px 26px', fontSize: '0.8rem' }}
                    />
                  </div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {editCatFilterMode === 'by_loai'
                      ? (taskTypesList || [])
                          .filter(tt => !editCatTypeSearch || tt.toLowerCase().includes(editCatTypeSearch.toLowerCase()))
                          .map(tt => {
                            const sel = editCatFilterValues.includes(tt);
                            return (
                              <button key={tt} type="button"
                                onClick={() => setEditCatFilterValues(prev => sel ? prev.filter(x => x !== tt) : [...prev, tt])}
                                style={{ padding: '3px 9px', fontSize: '0.73rem', fontWeight: 600, borderRadius: '999px', cursor: 'pointer',
                                  border: sel ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-color)',
                                  background: sel ? 'rgba(2,132,199,0.12)' : 'var(--bg-secondary)',
                                  color: sel ? 'var(--brand-primary)' : 'var(--text-secondary)',
                                  maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tt}>
                                {sel ? '✓ ' : ''}{tt}
                              </button>
                            );
                          })
                      : (filterOptions?.systems || [])
                          .filter(s => !editCatTypeSearch || s.name.toLowerCase().includes(editCatTypeSearch.toLowerCase()))
                          .map(s => {
                            const sel = editCatFilterValues.includes(s.name);
                            return (
                              <button key={s.id} type="button"
                                onClick={() => setEditCatFilterValues(prev => sel ? prev.filter(x => x !== s.name) : [...prev, s.name])}
                                style={{ padding: '3px 11px', fontSize: '0.76rem', fontWeight: 700, borderRadius: '999px', cursor: 'pointer',
                                  border: sel ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-color)',
                                  background: sel ? 'rgba(2,132,199,0.12)' : 'var(--bg-secondary)',
                                  color: sel ? 'var(--brand-primary)' : 'var(--text-secondary)' }}>
                                {sel ? '✓ ' : ''}{s.name}
                              </button>
                            );
                          })
                    }
                  </div>
                  {editCatFilterValues.length === 0 && (
                    <p style={{ fontSize: '0.73rem', color: 'var(--danger)', fontWeight: 600, margin: '6px 0 0 0' }}>⚠️ Chưa chọn giá trị lọc nào!</p>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  MÔ TẢ BÁO CÁO
                </label>
                <textarea
                  className="select-filter"
                  value={editingCategory.description || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  rows={2}
                  placeholder="Ghi chú mục đích báo cáo..."
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Cấu hình tên bảng con gom việc còn lại */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  TÊN BẢNG GOM CÔNG VIỆC CÒN LẠI / KHÁC (MẶC ĐỊNH: Còn lại / Khác)
                </label>
                <input
                  type="text"
                  className="select-filter"
                  value={editingCategory.other_sub_category_name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, other_sub_category_name: e.target.value })}
                  placeholder="Còn lại / Khác"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Tên hiển thị của bảng con tự động gom các việc không khớp với từ khóa con nào.
                </span>
              </div>

              {/* Checkbox cấu hình lọc đóng tháng trước */}
              <div style={{ marginBottom: '18px', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="editCatExcludeClosedPrior"
                  checked={editingCategory.exclude_closed_prior_months !== false}
                  onChange={(e) => setEditingCategory({ ...editingCategory, exclude_closed_prior_months: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                />
                <label htmlFor="editCatExcludeClosedPrior" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  Loại bỏ các công việc đã đóng của tháng trước (Mặc định: <strong>BẬT</strong>)
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingCategory(null)}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateCategoryMutation.isPending || !editingCategory.name?.trim() || editCatFilterValues.length === 0}
                  style={{ padding: '8px 20px', gap: '6px', fontWeight: 700 }}
                >
                  <Save size={15} />
                  {updateCategoryMutation.isPending ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
