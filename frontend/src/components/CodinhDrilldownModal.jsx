import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Search,
  Download,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Cable,
  Eye
} from 'lucide-react';
import { codinhApi } from '../api/codinhApi';
import { formatGroupName } from '../utils/groupFormat';

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

function getStatusBadgeClass(status) {
  if (!status) return 'badge-neutral';
  const s = status.toLowerCase();
  if (s.includes('đóng')) return 'badge-success';
  if (s.includes('ft hoàn thành')) return 'badge-cyan';
  if (s.includes('quá hạn') || s.includes('trễ')) return 'badge-danger';
  if (s.includes('tiếp nhận') || s.includes('đang thực hiện') || s.includes('đang xử lý')) return 'badge-info';
  if (s.includes('hoàn thành')) return 'badge-success';
  return 'badge-warning';
}

function getMetricLabel(metric) {
  switch ((metric || '').toLowerCase()) {
    case 'closed':
    case 'da_dong':
    case 'dong':
      return 'WO Đã Đóng';
    case 'pending':
    case 'ton':
    case 'ton_viec':
      return 'WO Đang Tồn';
    case 'overdue':
    case 'qua_han':
      return 'WO Quá Hạn';
    case 'closed_today':
    case 'dong_hom_nay':
      return 'WO Đóng Hôm Nay';
    case 'closed_yesterday':
    case 'dong_hom_qua':
      return 'WO Đóng Hôm Qua';
    case 'cabinet_total':
    case 'total_cabinets':
    case 'tu_thc':
      return 'Tổng Tủ THC';
    case 'cabinet_completed':
    case 'completed_cabinets':
    case 'tu_xong':
      return 'Tủ THC Đã Xong';
    case 'cabinet_pending':
    case 'pending_cabinets':
    case 'tu_ton':
      return 'Tủ THC Đang Tồn';
    default:
      return 'Tất Cả Công Việc (Tổng WO)';
  }
}

export default function CodinhDrilldownModal({ isOpen, onClose, filterInfo, onSelectTask }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('thoi_diem_yeu_cau_ket_thuc');
  const [sortOrder, setSortOrder] = useState('desc');
  const [expandedWos, setExpandedWos] = useState({});

  const toggleExpand = (maCv) => {
    setExpandedWos((prev) => ({
      ...prev,
      [maCv]: !prev[maCv],
    }));
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
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
      <span style={{ color: '#8b5cf6', marginLeft: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Query drilldown tasks
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['codinh-drilldown-tasks', filterInfo, searchTerm, sortKey, sortOrder],
    queryFn: () => {
      return codinhApi.getDrilldownTasks({
        category_id: filterInfo.categoryId || undefined,
        metric: filterInfo.metric || 'total',
        filter_type: filterInfo.filterType || undefined,
        target_name: filterInfo.targetName || undefined,
        search: searchTerm.trim() || undefined,
        sort_by: sortKey,
        sort_order: sortOrder,
        page: 1,
        page_size: 20000,
      });
    },
    enabled: Boolean(isOpen && filterInfo),
    keepPreviousData: true,
  });

  if (!isOpen || !filterInfo) return null;

  const total = data?.total || 0;
  const items = data?.items || [];
  const totalCabinets = items.reduce((acc, t) => acc + (t.total_cabinets || 0), 0);

  // Export CSV
  const handleExportCSV = () => {
    if (!items.length) return;
    const headers = [
      'STT',
      'Mã công việc',
      'Mã trạm',
      'Loại công việc',
      'Nội dung công việc',
      'Mô tả/Ghi chú',
      'Trạng thái WO',
      'Nhóm/Cụm',
      'Nhân viên thực hiện',
      'Yêu cầu kết thúc',
      'Thời gian còn lại (H)',
      'Tổng tủ THC',
      'Tủ THC đã xong',
      'Chi tiết tủ con'
    ];

    const rows = items.map((t, idx) => {
      const cabStr = (t.cabinets || [])
        .map((c) => `${c.ma_doi_tuong} (${c.trang_thai_thc})`)
        .join('; ');
      return [
        idx + 1,
        `"${t.ma_cong_viec || ''}"`,
        `"${t.station_code || ''}"`,
        `"${(t.loai_cong_viec || '').replace(/"/g, '""')}"`,
        `"${(t.noi_dung_cong_viec || '').replace(/"/g, '""')}"`,
        `"${(t.ghi_chu || '').replace(/"/g, '""')}"`,
        `"${t.trang_thai || ''}"`,
        `"${formatGroupName(t.group_name)}"`,
        `"${t.employee_assigned_name || ''}"`,
        `"${formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}"`,
        t.thoi_gian_con_lai ?? '',
        t.total_cabinets || 0,
        t.completed_cabinets || 0,
        `"${cabStr.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileBase = `ChiTiet_CDBR_${filterInfo.targetName || 'ToanMang'}_${filterInfo.metric || 'All'}`;
    link.download = `${fileBase.replace(/[\s/\\:]/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-container"
        style={{
          width: '95vw',
          maxWidth: '1440px',
          height: '92vh',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-2xl)',
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-purple" style={{ fontSize: '0.74rem', fontWeight: 800 }}>
                <Cable size={12} /> CHI TIẾT CỐ ĐỊNH BĂNG RỘNG
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                {filterInfo.categoryName || 'Báo Cáo CĐBR'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {filterInfo.targetName ? filterInfo.targetName : 'Toàn Bộ Hệ Thống CĐBR'}
              </h3>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#8b5cf6',
                  background: 'rgba(139, 92, 246, 0.12)',
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                Chỉ tiêu: {getMetricLabel(filterInfo.metric)}
              </span>
            </div>
          </div>

          {/* Close & Stats badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge" style={{ fontSize: '0.82rem', padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              WO: <strong style={{ marginLeft: '4px', color: '#8b5cf6' }}>{total.toLocaleString()}</strong>
            </span>
            {totalCabinets > 0 && (
              <span className="badge badge-purple" style={{ fontSize: '0.82rem', padding: '6px 12px' }}>
                Tủ THC: <strong style={{ marginLeft: '4px' }}>{totalCabinets.toLocaleString()}</strong>
              </span>
            )}
            <button
              onClick={onClose}
              className="btn btn-outline"
              style={{
                width: '34px',
                height: '34px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
              }}
              title="Đóng (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* TOOLBAR: SEARCH & EXCEL */}
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Search box */}
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="form-control"
              placeholder="Tìm mã WO, mã trạm, mã tủ THC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                paddingLeft: '32px',
                paddingRight: '24px',
                fontSize: '0.82rem',
                height: '34px',
                width: '100%',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 0,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="btn btn-outline"
              onClick={handleExportCSV}
              disabled={items.length === 0}
              style={{ gap: '6px', fontSize: '0.82rem', height: '34px', padding: '0 14px' }}
              title="Xuất file CSV/Excel chi tiết"
            >
              <Download size={14} /> Xuất Excel ({items.length})
            </button>
          </div>
        </div>

        {/* MODAL BODY TABLE */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            position: 'relative',
            background: 'var(--bg-primary)',
          }}
        >
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <div className="spin" style={{ display: 'inline-block', marginBottom: '10px' }}>
                <Clock size={28} style={{ color: '#8b5cf6' }} />
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Đang tải danh sách công việc chi tiết CĐBR...</p>
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
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-tertiary)' }}>
                <tr>
                  <th style={{ width: '38px', minWidth: '38px', whiteSpace: 'nowrap' }}>STT</th>
                  
                  <th
                    onClick={() => handleSort('ma_cong_viec')}
                    style={{ width: '135px', minWidth: '130px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mã công việc"
                  >
                    Mã công việc {renderSortIndicator('ma_cong_viec')}
                  </th>

                  <th
                    onClick={() => handleSort('station_code')}
                    style={{ width: '85px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mã trạm"
                  >
                    Mã trạm {renderSortIndicator('station_code')}
                  </th>

                  <th
                    onClick={() => handleSort('loai_cong_viec')}
                    style={{ minWidth: '160px', maxWidth: '220px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Loại công việc"
                  >
                    Loại công việc {renderSortIndicator('loai_cong_viec')}
                  </th>

                  <th
                    onClick={() => handleSort('noi_dung_cong_viec')}
                    style={{ minWidth: '220px', maxWidth: '320px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nội dung"
                  >
                    Nội dung công việc {renderSortIndicator('noi_dung_cong_viec')}
                  </th>

                  <th
                    onClick={() => handleSort('trang_thai')}
                    style={{ width: '105px', minWidth: '95px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Trạng thái"
                  >
                    Trạng thái {renderSortIndicator('trang_thai')}
                  </th>

                  <th
                    style={{ width: '130px', minWidth: '115px', whiteSpace: 'nowrap', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}
                    title="Tủ cáp (THC) con đối chiếu theo WO"
                  >
                    Tủ Cáp (THC)
                  </th>

                  <th
                    onClick={() => handleSort('employee_assigned_name')}
                    style={{ width: '140px', minWidth: '130px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nhân viên"
                  >
                    Nhân viên {renderSortIndicator('employee_assigned_name')}
                  </th>

                  <th
                    onClick={() => handleSort('group_name')}
                    style={{ width: '120px', minWidth: '100px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nhóm"
                  >
                    Cụm / Nhóm {renderSortIndicator('group_name')}
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
                    style={{ width: '90px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Thời gian còn lại"
                  >
                    Còn lại (H) {renderSortIndicator('thoi_gian_con_lai')}
                  </th>

                  <th style={{ width: '85px', minWidth: '80px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((t, idx) => {
                  const isOverdue = t.is_overdue;
                  const isExpanded = expandedWos[t.ma_cong_viec];
                  const hasCabs = (t.cabinets && t.cabinets.length > 0);
                  const isAllCabsDone = hasCabs && t.completed_cabinets === t.total_cabinets;

                  return (
                    <React.Fragment key={t.ma_cong_viec}>
                      <tr
                        className="excel-row"
                        style={{
                          background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                        }}
                      >
                        {/* STT */}
                        <td className="cell-num" style={{ width: '38px', color: 'var(--text-muted)' }}>
                          {idx + 1}
                        </td>

                        {/* Mã công việc */}
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: isOverdue ? 'var(--danger-dark)' : '#8b5cf6',
                            cursor: 'pointer',
                          }}
                          title={`Nhấn để xem chi tiết đầy đủ của WO: ${t.ma_cong_viec}`}
                          onClick={() => onSelectTask && onSelectTask(t)}
                        >
                          {t.ma_cong_viec}
                        </td>

                        {/* Mã trạm */}
                        <td className="cell-num" style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                          {t.station_code ? (
                            <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>
                              {t.station_code}
                            </span>
                          ) : '--'}
                        </td>

                        {/* Loại công việc */}
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '220px',
                          }}
                          title={t.loai_cong_viec}
                        >
                          {t.loai_cong_viec || '--'}
                        </td>

                        {/* Nội dung công việc */}
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '300px',
                          }}
                          title={t.noi_dung_cong_viec}
                        >
                          {t.noi_dung_cong_viec || '--'}
                        </td>

                        {/* Trạng thái WO */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span
                            className={`badge ${getStatusBadgeClass(t.trang_thai)}`}
                            style={{ fontSize: '0.74rem', padding: '2px 8px', fontWeight: 700 }}
                          >
                            {t.trang_thai}
                          </span>
                        </td>

                        {/* Tủ Cáp (THC) Status & Expand button */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {hasCabs ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span
                                className={`badge ${isAllCabsDone ? 'badge-success' : 'badge-purple'}`}
                                style={{ fontSize: '0.72rem', padding: '2px 7px', fontWeight: 800 }}
                              >
                                {t.completed_cabinets}/{t.total_cabinets} Xong
                              </span>
                              <button
                                onClick={() => toggleExpand(t.ma_cong_viec)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#8b5cf6',
                                  padding: '2px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title={isExpanded ? 'Thu gọn tủ' : 'Xem danh sách tủ con'}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>--</span>
                          )}
                        </td>

                        {/* Nhân viên */}
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {t.employee_assigned_name}
                        </td>

                        {/* Nhóm / Cụm */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--bg-tertiary)' }}>
                            {formatGroupName(t.group_name)}
                          </span>
                        </td>

                        {/* Yêu cầu kết thúc */}
                        <td className="cell-num" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                          {formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}
                        </td>

                        {/* Thời gian còn lại */}
                        <td
                          className="cell-num"
                          style={{
                            whiteSpace: 'nowrap',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: isOverdue ? 'var(--danger-dark)' : 'var(--text-secondary)',
                          }}
                        >
                          {t.thoi_gian_con_lai !== null && t.thoi_gian_con_lai !== undefined
                            ? Number(t.thoi_gian_con_lai).toFixed(1)
                            : '--'}
                        </td>

                        {/* Thao tác Chi tiết */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '2.5px 6px' }}>
                          <button
                            className="btn btn-outline"
                            onClick={() => onSelectTask && onSelectTask(t)}
                            title="Xem chi tiết đầy đủ, lịch sử và ghi chú WO"
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              gap: '3px',
                              height: '24px',
                              borderColor: '#8b5cf6',
                              color: '#8b5cf6',
                            }}
                          >
                            <Eye size={12} /> Chi tiết
                          </button>
                        </td>
                      </tr>

                      {/* EXPANDED ROW: CHILD CABINETS THC */}
                      {isExpanded && hasCabs && (
                        <tr style={{ background: 'rgba(139, 92, 246, 0.04)' }}>
                          <td colSpan={12} style={{ padding: '8px 24px 14px 48px' }}>
                            <div
                              style={{
                                border: '1px solid rgba(139, 92, 246, 0.25)',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)',
                                padding: '10px 14px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <Layers size={14} style={{ color: '#8b5cf6' }} />
                                <strong style={{ fontSize: '0.82rem', color: '#8b5cf6' }}>
                                  Danh Sách Tủ Cáp THC Con ({t.cabinets.length} tủ) của WO: {t.ma_cong_viec}
                                </strong>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                                {t.cabinets.map((cab, cIdx) => (
                                  <div
                                    key={cab.id || cIdx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '6px 10px',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--border-color)',
                                      background: cab.is_completed ? 'rgba(16, 185, 129, 0.06)' : 'var(--bg-tertiary)',
                                      fontSize: '0.78rem',
                                    }}
                                  >
                                    <div>
                                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                                        {cab.ma_doi_tuong}
                                      </strong>
                                      {cab.ma_tram && (
                                        <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>
                                          [{cab.ma_tram}]
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={`badge ${cab.is_completed ? 'badge-success' : 'badge-warning'}`}
                                      style={{ fontSize: '0.68rem', padding: '2px 6px', fontWeight: 700 }}
                                    >
                                      {cab.trang_thai_thc}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
