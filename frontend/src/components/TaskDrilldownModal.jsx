import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Search, 
  Download, 
  Eye, 
  AlertCircle,
  FileSpreadsheet,
  Calendar,
  Clock,
  Briefcase
} from 'lucide-react';
import { statsApi } from '../api/statsApi';

/**
 * Format datetime string as dd/MM/yyyy HH:mm:ss
 */
function formatDateTime(val) {
  if (!val) return '--';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Status color helper
 */
function getStatusBadgeClass(status) {
  if (!status) return 'badge-neutral';
  const s = status.toLowerCase();
  if (s.includes('đóng')) {
    return 'badge-success';
  }
  if (s.includes('ft hoàn thành')) {
    return 'badge-cyan';
  }
  if (s.includes('chờ') && s.includes('tiếp nhận')) {
    return 'badge-purple';
  }
  if (s.includes('quá hạn') || s.includes('trễ')) {
    return 'badge-danger';
  }
  if (s.includes('tiếp nhận') || s.includes('giao ft') || s.includes('đang thực hiện') || s.includes('đang xử lý')) {
    return 'badge-info';
  }
  if (s.includes('hoàn thành') || s.includes('thành công')) {
    return 'badge-success';
  }
  return 'badge-warning';
}

export default function TaskDrilldownModal({ isOpen, onClose, filterInfo, onSelectTask }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('thoi_diem_yeu_cau_ket_thuc');
  const [sortOrder, setSortOrder] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key.startsWith('thoi_diem_') ? 'desc' : 'asc');
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <span style={{ opacity: 0.35, marginLeft: '4px', fontSize: '0.72rem' }}>↕</span>;
    }
    return (
      <span style={{ color: 'var(--brand-primary)', marginLeft: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Fetch all tasks matching the clicked number's exact filters (display all directly without page size limit)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['maintenance-drilldown-tasks', filterInfo, searchTerm, sortKey, sortOrder],
    queryFn: () => statsApi.getMaintenanceTasks({
      metric: filterInfo.metric || 'total',
      filter_type: filterInfo.filterType || null,
      filter_id: filterInfo.filterId ?? null,
      target_name: filterInfo.targetName || null,
      is_other: Boolean(filterInfo.isOther),
      month: filterInfo.activeMonth || null,
      target_type: filterInfo.targetType || undefined,
      exclude_closed_prior_months: filterInfo.excludeClosedPriorMonths,
      board_id: filterInfo.boardId || undefined,
      board_codes: filterInfo.boardCodes || undefined,
      sub_category_id: filterInfo.subCategoryId || undefined,
      sub_keyword: filterInfo.subKeyword || undefined,
      is_sub_other: Boolean(filterInfo.isSubOther),
      all_sub_keywords: filterInfo.allSubKeywords || undefined,
      search: searchTerm.trim() || undefined,
      sort_by: sortKey,
      sort_order: sortOrder,
      page: 1,
      page_size: 20000,
    }),
    enabled: Boolean(isOpen && filterInfo),
    keepPreviousData: true,
  });

  if (!isOpen || !filterInfo) return null;

  const total = data?.total || 0;
  const totalPages = data?.total_pages || 1;
  const items = data?.items || [];

  // Export current filtered list as CSV
  const handleExportCSV = () => {
    if (!items.length) return;
    const headers = [
      'STT',
      'Ghi chú',
      'Mã công việc',
      'Loại công việc',
      'Nội dung công việc',
      'Mô tả',
      'Trạng thái',
      'Nhóm điều phối',
      'Nhân viên thực hiện',
      'Thời điểm bắt đầu thực hiện',
      'Thời điểm yêu cầu kết thúc',
      'Thời gian còn lại (H)',
      'Mã trạm'
    ];

    const rows = items.map((t, idx) => [
      idx + 1,
      `"${(t.latest_note || '').replace(/"/g, '""')}"`,
      `"${t.ma_cong_viec || ''}"`,
      `"${(t.loai_cong_viec || '').replace(/"/g, '""')}"`,
      `"${(t.noi_dung_cong_viec || '').replace(/"/g, '""')}"`,
      `"${(t.ghi_chu || '').replace(/"/g, '""')}"`,
      `"${t.trang_thai || ''}"`,
      `"${t.group_name || ''}"`,
      `"${t.employee_assigned_name || ''}"`,
      `"${formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}"`,
      `"${formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}"`,
      t.thoi_gian_con_lai ?? '',
      `"${t.station_code || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeTitle = `${filterInfo.targetName || 'Tat_ca'}_${filterInfo.metricLabel || 'Chi_tiet'}`.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    link.setAttribute('download', `Chi_tiet_${safeTitle}_Toan_bo.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 60 }}>
      <div 
        className="modal-content modal-drilldown" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '1500px',
          width: '96vw',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div 
          className="modal-header" 
          style={{ 
            padding: '14px 20px', 
            background: 'var(--bg-secondary)', 
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ fontWeight: 800, fontSize: '0.82rem', padding: '3px 10px', gap: '5px' }}>
              <FileSpreadsheet size={14} /> Chi Tiết Dữ Liệu
            </span>

            <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {filterInfo.targetName ? (
                <>
                  <span style={{ color: 'var(--brand-primary)' }}>{filterInfo.targetName}</span>
                  <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>&bull;</span>
                </>
              ) : null}
              <span>Chỉ tiêu: </span>
              <span className={`badge ${
                filterInfo.metric === 'overdue' ? 'badge-danger' : 
                filterInfo.metric === 'closed' ? 'badge-success' : 
                filterInfo.metric === 'pending' ? 'badge-warning' : 
                filterInfo.metric === 'cho_cd_tiep_nhan' ? 'badge-purple' :
                filterInfo.metric === 'ft_hoan_thanh' ? 'badge-cyan' :
                filterInfo.metric === 'closed_today' ? 'badge-success' :
                'badge-info'
              }`} style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                {filterInfo.metricLabel || 'Tất Cả'}
              </span>
            </span>

            <span className="badge badge-neutral" style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? 'Đang tải...' : `${total.toLocaleString()} công việc`}
            </span>

            {filterInfo.boardName && (
              <span style={{ 
                padding: '2px 8px', 
                borderRadius: '12px', 
                background: 'rgba(139, 92, 246, 0.15)', 
                color: '#8b5cf6', 
                fontSize: '0.78rem', 
                fontWeight: 700 
              }}>
                📌 {filterInfo.boardName}
              </span>
            )}

            {filterInfo.subCategoryName && (
              <span style={{
                padding: '2px 10px',
                borderRadius: '12px',
                background: 'rgba(2, 132, 199, 0.15)',
                color: 'var(--brand-primary)',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid rgba(2, 132, 199, 0.3)'
              }}>
                📂 Đầu việc con: {filterInfo.subCategoryName}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              className="btn btn-outline"
              onClick={handleExportCSV}
              disabled={!items.length}
              title="Xuất danh sách này ra Excel CSV"
              style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '5px' }}
            >
              <Download size={14} /> Xuất Excel
            </button>

            <button 
              className="btn btn-outline btn-icon" 
              onClick={onClose}
              title="Đóng cửa sổ"
              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar: Search and Filter Info */}
        <div 
          style={{ 
            padding: '8px 20px', 
            background: 'var(--bg-tertiary)', 
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '420px' }}>
            <div className="search-input-box" style={{ width: '100%' }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm theo mã việc, nội dung, mô tả, trạm, người nhận..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem', height: '32px' }}
              />
            </div>
            {searchTerm && (
              <button 
                className="btn btn-outline" 
                onClick={() => setSearchTerm('')}
                style={{ padding: '4px 8px', fontSize: '0.75rem', height: '32px' }}
              >
                Xóa
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>* Nhấp tiêu đề cột để sắp xếp &bull; Rê chuột vào ô để xem nội dung đầy đủ</span>
            <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '3px 8px', fontWeight: 700 }}>
              Hiển thị toàn bộ ({items.length.toLocaleString()})
            </span>
          </div>
        </div>

        {/* Modal Body: Excel Table */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: '36px', height: '36px' }} />
              <p style={{ fontSize: '0.9rem' }}>Đang tải danh sách công việc...</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'var(--text-muted)', padding: '40px' }}>
              <AlertCircle size={40} style={{ opacity: 0.4 }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Không tìm thấy công việc nào phù hợp với bộ lọc</p>
              {searchTerm && (
                <button className="btn btn-outline" onClick={() => setSearchTerm('')} style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                  Xóa từ khóa tìm kiếm
                </button>
              )}
            </div>
          ) : (
            <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: '38px', minWidth: '38px', whiteSpace: 'nowrap' }}>STT</th>
                  
                  <th 
                    onClick={() => handleSort('latest_note')}
                    style={{ width: '160px', minWidth: '140px', maxWidth: '220px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Ghi chú"
                  >
                    Ghi chú {renderSortIndicator('latest_note')}
                  </th>

                  <th 
                    onClick={() => handleSort('ma_cong_viec')}
                    style={{ width: '130px', minWidth: '130px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mã công việc"
                  >
                    Mã công việc {renderSortIndicator('ma_cong_viec')}
                  </th>

                  <th 
                    onClick={() => handleSort('loai_cong_viec')}
                    style={{ width: '170px', minWidth: '150px', maxWidth: '200px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Loại công việc"
                  >
                    Loại công việc {renderSortIndicator('loai_cong_viec')}
                  </th>

                  <th 
                    onClick={() => handleSort('noi_dung_cong_viec')}
                    style={{ minWidth: '220px', maxWidth: '320px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nội dung công việc"
                  >
                    Nội dung công việc {renderSortIndicator('noi_dung_cong_viec')}
                  </th>

                  <th 
                    onClick={() => handleSort('ghi_chu')}
                    style={{ minWidth: '180px', maxWidth: '300px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mô tả"
                  >
                    Mô tả {renderSortIndicator('ghi_chu')}
                  </th>

                  <th 
                    onClick={() => handleSort('trang_thai')}
                    style={{ width: '100px', minWidth: '95px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Trạng thái"
                  >
                    Trạng thái {renderSortIndicator('trang_thai')}
                  </th>

                  <th 
                    onClick={() => handleSort('group_name')}
                    style={{ width: '130px', minWidth: '120px', maxWidth: '160px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nhóm điều phối"
                  >
                    Nhóm điều phối {renderSortIndicator('group_name')}
                  </th>

                  <th 
                    onClick={() => handleSort('employee_assigned_name')}
                    style={{ width: '140px', minWidth: '130px', maxWidth: '170px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nhân viên thực hiện"
                  >
                    Nhân viên thực hiện {renderSortIndicator('employee_assigned_name')}
                  </th>

                  <th 
                    onClick={() => handleSort('thoi_diem_bat_dau_thuc_hien')}
                    style={{ width: '140px', minWidth: '135px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Bắt đầu thực hiện"
                  >
                    Bắt đầu thực hiện {renderSortIndicator('thoi_diem_bat_dau_thuc_hien')}
                  </th>

                  <th 
                    onClick={() => handleSort('thoi_diem_yeu_cau_ket_thuc')}
                    style={{ width: '140px', minWidth: '135px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Yêu cầu kết thúc"
                  >
                    Yêu cầu kết thúc {renderSortIndicator('thoi_diem_yeu_cau_ket_thuc')}
                  </th>

                  <th 
                    onClick={() => handleSort('thoi_gian_con_lai')}
                    style={{ width: '95px', minWidth: '95px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Thời gian còn lại"
                  >
                    Thời gian còn lại (H) {renderSortIndicator('thoi_gian_con_lai')}
                  </th>

                  <th 
                    onClick={() => handleSort('station_code')}
                    style={{ width: '85px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mã trạm"
                  >
                    Mã trạm {renderSortIndicator('station_code')}
                  </th>

                  <th style={{ width: '90px', minWidth: '90px', whiteSpace: 'nowrap', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t, idx) => {
                  const isOverdue = t.thoi_gian_con_lai < 0;
                  const stt = idx + 1;
                  return (
                    <tr 
                      key={t.ma_cong_viec} 
                      className="excel-row"
                      style={{
                        background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                      }}
                    >
                      {/* 1. STT */}
                      <td className="cell-num" style={{ width: '38px', color: 'var(--text-muted)' }}>
                        {stt}
                      </td>

                      {/* Ghi chú */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '180px',
                          color: t.latest_note ? 'var(--text-primary)' : 'var(--text-muted)',
                          fontStyle: t.latest_note ? 'normal' : 'italic',
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                        title={t.latest_note ? `Ghi chú: ${t.latest_note}` : 'Chưa có ghi chú (Nhấn để xem/thêm ghi chú)'}
                        onClick={() => onSelectTask && onSelectTask(t)}
                      >
                        {t.latest_note ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--brand-primary)', fontSize: '11px' }}>📝</span>
                            <span>{t.latest_note}</span>
                          </span>
                        ) : (
                          <span style={{ opacity: 0.4 }}>--</span>
                        )}
                      </td>

                      {/* 2. Mã công việc */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          fontWeight: 700, 
                          fontFamily: 'var(--font-mono)', 
                          color: 'var(--brand-primary)',
                          cursor: 'pointer'
                        }}
                        title={t.ma_cong_viec}
                        onClick={() => onSelectTask && onSelectTask(t)}
                      >
                        {t.ma_cong_viec}
                      </td>

                      {/* 3. Loại công việc */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '200px' 
                        }}
                        title={t.loai_cong_viec || '--'}
                      >
                        {t.loai_cong_viec || '--'}
                      </td>

                      {/* 4. Nội dung công việc */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '320px',
                          color: 'var(--text-secondary)'
                        }}
                        title={t.noi_dung_cong_viec || '(Không có nội dung)'}
                      >
                        {t.noi_dung_cong_viec || '(Không có nội dung)'}
                      </td>

                      {/* 4.5 Mô tả */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '300px',
                          color: 'var(--text-secondary)'
                        }}
                        title={t.ghi_chu || '(Không có mô tả)'}
                      >
                        {t.ghi_chu || <span style={{ opacity: 0.35 }}>--</span>}
                      </td>

                      {/* 5. Trạng thái */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={t.trang_thai || '--'}>
                        <span className={`badge ${getStatusBadgeClass(t.trang_thai)}`} style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
                          {t.trang_thai || '--'}
                        </span>
                      </td>

                      {/* 6. Nhóm điều phối */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '160px' 
                        }}
                        title={t.group_name || 'Chưa phân nhóm'}
                      >
                        {t.group_name || <span style={{ color: 'var(--text-muted)' }}>Chưa phân nhóm</span>}
                      </td>

                      {/* 7. Nhân viên thực hiện */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '170px' 
                        }}
                        title={t.employee_assigned_name || 'Chưa gán'}
                      >
                        <strong style={{ color: t.employee_assigned_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {t.employee_assigned_name || 'Chưa gán'}
                        </strong>
                      </td>

                      {/* 8. Thời điểm bắt đầu thực hiện */}
                      <td 
                        className="cell-num" 
                        style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
                        title={formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}
                      >
                        {formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}
                      </td>

                      {/* 9. Thời điểm yêu cầu kết thúc */}
                      <td 
                        className="cell-num" 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          fontSize: '0.82rem',
                          color: isOverdue ? 'var(--danger-dark)' : 'var(--text-primary)',
                          fontWeight: isOverdue ? 700 : 500
                        }}
                        title={formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}
                      >
                        {formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}
                      </td>

                      {/* 10. Thời gian còn lại (H) */}
                      <td 
                        className="cell-num" 
                        style={{ 
                          whiteSpace: 'nowrap',
                          color: isOverdue ? 'var(--danger-dark)' : 'var(--text-primary)',
                          background: isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                          fontWeight: 700
                        }}
                        title={t.thoi_gian_con_lai != null ? `${t.thoi_gian_con_lai} giờ` : '--'}
                      >
                        {t.thoi_gian_con_lai != null ? t.thoi_gian_con_lai : '--'}
                      </td>

                      {/* 11. Mã trạm */}
                      <td 
                        className="cell-num" 
                        style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                        title={t.station_code || '--'}
                      >
                        {t.station_code ? (
                          <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>
                            {t.station_code}
                          </span>
                        ) : '--'}
                      </td>

                      {/* 12. Thao tác */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '2.5px 6px' }}>
                        <button
                          className="btn btn-outline"
                          onClick={() => onSelectTask && onSelectTask(t)}
                          title="Xem chi tiết, lịch sử và ghi chú công việc"
                          style={{
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            gap: '3px',
                            height: '24px',
                            borderColor: 'var(--brand-primary)',
                            color: 'var(--brand-primary)'
                          }}
                        >
                          <Eye size={12} /> Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer: Total & Count Summary (Displaying All Records) */}
        <div 
          style={{ 
            padding: '10px 20px', 
            background: 'var(--bg-secondary)', 
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Tổng cộng:</span>
            <strong style={{ color: 'var(--brand-primary)', fontSize: '0.98rem', fontFamily: 'var(--font-mono)' }}>
              {total.toLocaleString()}
            </strong>
            <span>công việc</span>
            <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 700 }}>
              Đang hiển thị toàn bộ ({items.length.toLocaleString()})
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {searchTerm ? `(Đang lọc tìm kiếm: "${searchTerm}")` : '* Cuộn danh sách để xem toàn bộ công việc'}
          </div>
        </div>
      </div>
    </div>
  );
}
