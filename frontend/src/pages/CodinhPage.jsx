import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Layers,
  Users,
  FolderKanban,
  Search,
  Download,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Box,
  Calendar,
  Eye,
  FileSpreadsheet
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';
import { importsApi } from '../api/importsApi';
import { tasksApi } from '../api/tasksApi';
import TaskDetailModal from '../components/TaskDetailModal';
import { formatDataTimestamp } from '../utils/dateFormat';
import { formatGroupName } from '../utils/groupFormat';

export default function CodinhPage() {
  const queryClient = useQueryClient();

  // Active view tab: 'employee' | 'group' | 'wos'
  const [currentTab, setCurrentTab] = useState('employee');

  // Filter & Search states
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'CLOSED' | 'OVERDUE'
  const [selectedFtFilter, setSelectedFtFilter] = useState('');

  // Expanded WO rows in detail view
  const [expandedWos, setExpandedWos] = useState({});

  // Modal detail task
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // 1. Fetch categories for CĐBR
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['codinh-categories'],
    queryFn: () => codinhApi.getCategories(null, true),
  });

  // Effective category id
  const effectiveCatId = useMemo(() => {
    if (selectedCatId) return selectedCatId;
    if (categories.length > 0) {
      const def = categories.find((c) => c.is_default) || categories[0];
      return def?.id;
    }
    return null;
  }, [selectedCatId, categories]);

  // 2. Fetch stats for the effective category
  const { data: statsData, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['codinh-stats', effectiveCatId],
    queryFn: () => codinhApi.getStats(effectiveCatId),
    enabled: effectiveCatId !== null,
  });

  // 3. Fetch latest import log for data freshness timestamp
  const { data: importLogs } = useQuery({
    queryKey: ['import-logs-latest'],
    queryFn: () => importsApi.getImportLogs(5),
    staleTime: 5 * 60 * 1000,
  });

  const latestImport =
    (importLogs || []).find((l) => l.is_active === 1) ||
    (importLogs || []).find((l) => l.status === 'COMPLETED') ||
    (importLogs && importLogs.length > 0 ? importLogs[0] : null);
  const lastDataUpdate = latestImport?.imported_at || null;

  // Reset search and sort on tab change
  useEffect(() => {
    setSearchQuery('');
    setSortKey(null);
  }, [currentTab]);

  // Sorting handlers
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'key_name' ? 'asc' : 'desc');
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <span style={{ opacity: 0.35, fontSize: '0.72rem', marginLeft: '4px' }}>↕</span>;
    }
    return (
      <span style={{ color: 'var(--brand-primary)', fontWeight: 800, fontSize: '0.78rem', marginLeft: '4px' }}>
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Toggle single WO row expansion
  const toggleWoExpand = (woCode) => {
    setExpandedWos((prev) => ({
      ...prev,
      [woCode]: !prev[woCode],
    }));
  };

  // Expand all / Collapse all WOs
  const handleToggleAllWos = (expand) => {
    if (!statsData?.wos) return;
    const next = {};
    if (expand) {
      statsData.wos.forEach((w) => {
        if (w.cabinets && w.cabinets.length > 0) {
          next[w.ma_cong_viec] = true;
        }
      });
    }
    setExpandedWos(next);
  };

  // Open Task Detail Modal
  const handleOpenTaskDetail = async (ma_cong_viec) => {
    try {
      const detail = await tasksApi.getTaskDetail(ma_cong_viec);
      setSelectedDetailTask(detail);
    } catch (err) {
      console.error('Failed to load task detail:', err);
      alert('Không thể tải chi tiết công việc: ' + (err.response?.data?.detail || err.message));
    }
  };

  const activeCategory = statsData?.active_category;
  const summary = statsData?.summary || {
    total_wos: 0,
    closed_wos: 0,
    pending_wos: 0,
    overdue_wos: 0,
    closed_today_wos: 0,
    closed_yesterday_wos: 0,
    wo_rate: 0,
    total_cabinets: 0,
    completed_cabinets: 0,
    pending_cabinets: 0,
    cabinet_rate: 0,
    has_cabinets: false,
  };

  const hasCabinets = summary.has_cabinets;

  // Filtered & Sorted Employees
  const sortedEmployees = useMemo(() => {
    if (!statsData?.by_employee) return [];
    let list = statsData.by_employee.filter((emp) => {
      if (selectedGroupFilter !== 'ALL' && emp.group_name !== selectedGroupFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mName = (emp.key_name || '').toLowerCase().includes(q);
        const mGrp = (emp.group_name || '').toLowerCase().includes(q);
        if (!mName && !mGrp) return false;
      }
      return true;
    });

    if (sortKey) {
      list = [...list].sort((a, b) => {
        if (a.is_other) return 1;
        if (b.is_other) return -1;
        let cmp = 0;
        if (sortKey === 'key_name') {
          cmp = (a.key_name || '').localeCompare(b.key_name || '', 'vi');
        } else {
          cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [statsData, selectedGroupFilter, searchQuery, sortKey, sortOrder]);

  // Filtered & Sorted Groups
  const sortedGroups = useMemo(() => {
    if (!statsData?.by_group) return [];
    let list = statsData.by_group.filter((grp) => {
      if (selectedGroupFilter !== 'ALL' && grp.key_name !== selectedGroupFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const short = formatGroupName(grp.key_name).toLowerCase();
        if (!(grp.key_name || '').toLowerCase().includes(q) && !short.includes(q)) return false;
      }
      return true;
    });

    if (sortKey) {
      list = [...list].sort((a, b) => {
        if (a.is_other) return 1;
        if (b.is_other) return -1;
        let cmp = 0;
        if (sortKey === 'key_name') {
          cmp = formatGroupName(a.key_name).localeCompare(formatGroupName(b.key_name), 'vi');
        } else {
          cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [statsData, selectedGroupFilter, searchQuery, sortKey, sortOrder]);

  // Filtered & Sorted WOs
  const sortedWos = useMemo(() => {
    if (!statsData?.wos) return [];
    let list = statsData.wos.filter((w) => {
      if (selectedFtFilter && w.employee_assigned_name !== selectedFtFilter) return false;
      if (selectedGroupFilter !== 'ALL' && w.group_name !== selectedGroupFilter) return false;
      if (selectedStatusFilter === 'PENDING' && w.is_closed) return false;
      if (selectedStatusFilter === 'CLOSED' && !w.is_closed) return false;
      if (selectedStatusFilter === 'OVERDUE' && !w.is_overdue) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mWo = (w.ma_cong_viec || '').toLowerCase().includes(q);
        const mStation = (w.station_code || '').toLowerCase().includes(q);
        const mFt = (w.employee_assigned_name || '').toLowerCase().includes(q);
        const mContent = (w.noi_dung_cong_viec || '').toLowerCase().includes(q);
        const mCab = (w.cabinets || []).some(
          (c) =>
            (c.ma_doi_tuong || '').toLowerCase().includes(q) ||
            (c.ma_tram || '').toLowerCase().includes(q)
        );
        if (!mWo && !mStation && !mFt && !mContent && !mCab) return false;
      }
      return true;
    });

    if (sortKey) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'ma_cong_viec') cmp = (a.ma_cong_viec || '').localeCompare(b.ma_cong_viec || '');
        else if (sortKey === 'station_code') cmp = (a.station_code || '').localeCompare(b.station_code || '');
        else if (sortKey === 'employee_assigned_name') cmp = (a.employee_assigned_name || '').localeCompare(b.employee_assigned_name || '', 'vi');
        else if (sortKey === 'total_cabinets') cmp = (a.total_cabinets || 0) - (b.total_cabinets || 0);
        else if (sortKey === 'completed_cabinets') cmp = (a.completed_cabinets || 0) - (b.completed_cabinets || 0);
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [statsData, selectedFtFilter, selectedGroupFilter, selectedStatusFilter, searchQuery, sortKey, sortOrder]);

  // Export CSV
  const handleExportCSV = () => {
    if (!statsData) return;
    let csvLines = [];
    if (currentTab === 'employee') {
      csvLines.push(`BẢNG THỐNG KÊ ${activeCategory?.name || 'CĐBR'} THEO NHÂN VIÊN`);
      const headers = ['STT', 'Nhân viên', 'Cụm / Nhóm', 'Tổng WO', 'Đã Đóng', '% Đóng', 'Tồn Việc', 'Quá Hạn'];
      if (hasCabinets) headers.push('Tổng Tủ THC', 'Tủ Đã Xong', 'Tủ Chưa Xong', '% Tủ Xong');
      csvLines.push(headers.join(','));
      csvLines.push([
        '--',
        '"TỔNG CỘNG"',
        '--',
        summary.total_wos,
        summary.closed_wos,
        `${summary.wo_rate}%`,
        summary.pending_wos,
        summary.overdue_wos,
        ...(hasCabinets ? [summary.total_cabinets, summary.completed_cabinets, summary.pending_cabinets, `${summary.cabinet_rate}%`] : [])
      ].join(','));
      sortedEmployees.forEach((r, idx) => {
        csvLines.push([
          idx + 1,
          `"${r.key_name}"`,
          `"${formatGroupName(r.group_name)}"`,
          r.total_wos,
          r.closed_wos,
          `${r.wo_rate}%`,
          r.pending_wos,
          r.overdue_wos,
          ...(hasCabinets ? [r.total_cabinets, r.completed_cabinets, r.pending_cabinets, `${r.cabinet_rate}%`] : [])
        ].join(','));
      });
    } else if (currentTab === 'group') {
      csvLines.push(`BẢNG THỐNG KÊ ${activeCategory?.name || 'CĐBR'} THEO NHÓM / CỤM`);
      const headers = ['STT', 'Nhóm / Cụm', 'Tổng WO', 'Đã Đóng', '% Đóng', 'Tồn Việc', 'Quá Hạn'];
      if (hasCabinets) headers.push('Tổng Tủ THC', 'Tủ Đã Xong', 'Tủ Chưa Xong', '% Tủ Xong');
      csvLines.push(headers.join(','));
      csvLines.push([
        '--',
        '"TỔNG CỘNG"',
        summary.total_wos,
        summary.closed_wos,
        `${summary.wo_rate}%`,
        summary.pending_wos,
        summary.overdue_wos,
        ...(hasCabinets ? [summary.total_cabinets, summary.completed_cabinets, summary.pending_cabinets, `${summary.cabinet_rate}%`] : [])
      ].join(','));
      sortedGroups.forEach((r, idx) => {
        csvLines.push([
          idx + 1,
          `"${formatGroupName(r.key_name)}"`,
          r.total_wos,
          r.closed_wos,
          `${r.wo_rate}%`,
          r.pending_wos,
          r.overdue_wos,
          ...(hasCabinets ? [r.total_cabinets, r.completed_cabinets, r.pending_cabinets, `${r.cabinet_rate}%`] : [])
        ].join(','));
      });
    } else {
      csvLines.push(`DANH SÁCH CHI TIẾT CÔNG VIỆC VÀ TỦ CÁP CON`);
      const headers = ['STT', 'Mã WO', 'Mã Trạm', 'Nhân viên FT', 'Cụm', 'Trạng Thái', 'Quá Hạn', 'Tổng Tủ THC', 'Tủ Đã Xong', 'Mã Các Tủ Con'];
      csvLines.push(headers.join(','));
      sortedWos.forEach((w, idx) => {
        csvLines.push([
          idx + 1,
          `"${w.ma_cong_viec}"`,
          `"${w.station_code || ''}"`,
          `"${w.employee_assigned_name || ''}"`,
          `"${formatGroupName(w.group_name) || ''}"`,
          `"${w.trang_thai || ''}"`,
          `"${w.is_overdue ? 'Quá hạn' : 'Đúng hạn'}"`,
          w.total_cabinets || 0,
          w.completed_cabinets || 0,
          `"${(w.cabinets || []).map((c) => c.ma_doi_tuong).join('; ')}"`
        ].join(','));
      });
    }

    const csvContent = '\uFEFF' + csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bao_cao_CDBR_${activeCategory?.name || 'THC'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* 0. Top Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.78rem', fontWeight: 800, gap: '5px' }}>
              <Cable size={14} /> CỐ ĐỊNH BĂNG RỘNG (CĐBR)
            </span>
            {lastDataUpdate && (
              <span
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--bg-tertiary)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                <Clock size={12} /> Dữ liệu cập nhật đến: {formatDataTimestamp(lastDataUpdate)}
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {activeCategory?.name || 'Báo Cáo Cố Định Băng Rộng'}
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Báo cáo tiến độ triển khai & bảo dưỡng chi tiết theo nhân viên (FT), nhóm cụm và đối chiếu tủ cáp con
          </p>
        </div>

        <button
          onClick={() => refetchStats()}
          className="btn btn-outline"
          style={{ fontSize: '0.84rem', padding: '7px 14px', gap: '6px' }}
          title="Tải lại số liệu mới nhất"
        >
          <RotateCcw size={15} /> Làm mới
        </button>
      </div>

      {/* 1. Category Selector Cards (Matching Dashboard ReportSelectorCards style) */}
      {categories.length > 0 && (
        <div style={{ marginBottom: '22px' }}>
          <div
            className="report-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '14px',
            }}
          >
            {categories.map((cat) => {
              const isSelected = String(cat.id) === String(effectiveCatId);
              const cardSummary = isSelected ? summary : null;
              const rateVal = isSelected ? (hasCabinets ? summary.cabinet_rate : summary.wo_rate) : null;

              return (
                <div
                  key={cat.id}
                  className="report-selector-card"
                  onClick={() => setSelectedCatId(cat.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '16px 18px',
                    borderRadius: 'var(--radius-lg)',
                    border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.04) 100%)'
                      : 'var(--bg-secondary)',
                    boxShadow: isSelected ? '0 4px 16px -2px rgba(139, 92, 246, 0.25)' : 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '150px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span
                        className={`badge ${isSelected ? 'badge-purple' : 'badge-neutral'}`}
                        style={{ gap: '5px', fontWeight: 700, fontSize: '0.75rem' }}
                      >
                        {isSelected ? <CheckCircle2 size={13} /> : <FileSpreadsheet size={13} />}
                        {isSelected ? 'Đang Xem' : 'Chọn Báo Cáo'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {cat.filter_mode === 'by_system' ? 'Theo Hệ Thống' : 'Theo Đầu Việc'}
                      </span>
                    </div>

                    <h4
                      style={{
                        fontSize: '0.96rem',
                        fontWeight: 800,
                        color: isSelected ? '#8b5cf6' : 'var(--text-primary)',
                        marginBottom: '10px',
                        lineHeight: 1.4,
                      }}
                    >
                      {cat.name}
                    </h4>
                  </div>

                  {isSelected && cardSummary && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '4px',
                        padding: '8px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)',
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>TỔNG WO</span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                          {cardSummary.total_wos}
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.6rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>ĐÃ ĐÓNG</span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                          {cardSummary.closed_wos}
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.6rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700 }}>TỒN</span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                          {cardSummary.pending_wos}
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.6rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>
                          {hasCabinets ? 'XONG TỦ' : 'TỈ LỆ'}
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                          {rateVal}%
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.6rem', color: cardSummary.overdue_wos > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', display: 'block', fontWeight: 700 }}>QUÁ HẠN</span>
                        <strong style={{ fontSize: '0.84rem', color: cardSummary.overdue_wos > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {cardSummary.overdue_wos}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loadingStats ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div className="spin" style={{ display: 'inline-block', marginBottom: '12px' }}>
            <RotateCcw size={28} />
          </div>
          <div>Đang tải dữ liệu báo cáo Cố Định Băng Rộng...</div>
        </div>
      ) : (
        /* 2. MAIN SPREADSHEET TABLE CARD (Identical to Dashboard MaintenanceSpreadsheetTable) */
        <div
          className="table-card excel-table-container"
          style={{
            marginBottom: '28px',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
            background: 'var(--bg-secondary)',
          }}
        >
          {/* Quick Metric Strip (Compact) */}
          <div
            className="table-metric-strip"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: '8px',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
            }}
          >
            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {summary.total_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {summary.closed_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {summary.pending_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {summary.overdue_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Nay</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{summary.closed_today_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{summary.closed_yesterday_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tỉ Lệ Đóng WO</span>
              <strong style={{ fontSize: '1.15rem', color: summary.wo_rate >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {summary.wo_rate ?? 0}%
              </strong>
            </div>

            {hasCabinets && (
              <>
                <div style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Tổng Tủ THC</span>
                  <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                    {summary.total_cabinets ?? 0}
                  </strong>
                </div>

                <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>Tủ Đã Xong</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                    {summary.completed_cabinets ?? 0}
                  </strong>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700 }}>Tủ Chưa Xong</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                    {summary.pending_cabinets ?? 0}
                  </strong>
                </div>

                <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Tiến Độ Tủ</span>
                  <strong style={{ fontSize: '1.15rem', color: summary.cabinet_rate >= 80 ? 'var(--success-dark)' : '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                    {summary.cabinet_rate ?? 0}%
                  </strong>
                </div>
              </>
            )}
          </div>

          {/* Toolbar */}
          <div className="table-toolbar" style={{ padding: '8px 16px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className={`btn ${currentTab === 'employee' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCurrentTab('employee')}
                style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
              >
                <Users size={14} />
                Theo Nhân Viên ({sortedEmployees.length})
              </button>

              <button
                className={`btn ${currentTab === 'group' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCurrentTab('group')}
                style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
              >
                <FolderKanban size={14} />
                Theo Nhóm / Cụm ({sortedGroups.length})
              </button>

              <button
                className={`btn ${currentTab === 'wos' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCurrentTab('wos')}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.82rem',
                  gap: '5px',
                  background: currentTab === 'wos' ? '#8b5cf6' : 'transparent',
                  borderColor: currentTab === 'wos' ? '#8b5cf6' : 'var(--border-color)',
                  color: currentTab === 'wos' ? '#fff' : 'var(--text-primary)',
                }}
              >
                <Layers size={14} />
                Chi Tiết WO & Tủ Con ({sortedWos.length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Active FT filter pill if filtered from employee row */}
              {selectedFtFilter && (
                <span
                  className="badge badge-purple"
                  style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  FT: {selectedFtFilter}
                  <span
                    onClick={() => setSelectedFtFilter('')}
                    style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '2px' }}
                  >
                    ×
                  </span>
                </span>
              )}

              {/* Status filter in WO view */}
              {currentTab === 'wos' && (
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  style={{
                    padding: '5px 8px',
                    fontSize: '0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="ALL">-- Tất cả trạng thái --</option>
                  <option value="PENDING">Chỉ WO đang tồn</option>
                  <option value="CLOSED">Chỉ WO đã đóng</option>
                  <option value="OVERDUE">Chỉ WO quá hạn</option>
                </select>
              )}

              <div className="search-input-box" style={{ width: '220px' }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder={`Tìm ${currentTab === 'employee' ? 'nhân viên' : currentTab === 'group' ? 'nhóm/cụm' : 'WO, tủ, trạm'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem' }}
                />
              </div>

              <button
                className="btn btn-outline"
                onClick={handleExportCSV}
                title="Tải bảng dạng CSV / Excel"
                style={{ gap: '5px', fontSize: '0.8rem', padding: '5px 12px' }}
              >
                <Download size={14} /> Xuất Excel
              </button>
            </div>
          </div>

          {/* Mobile swipe hint banner */}
          <div className="mobile-swipe-hint">
            <span>👈 Vuốt ngang bảng để xem đầy đủ các cột chỉ tiêu 👉</span>
          </div>

          {/* ======================= TAB 1: THEO NHÂN VIÊN ======================= */}
          {currentTab === 'employee' && (
            <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
              <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                    <th
                      className="col-name"
                      style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('key_name')}
                      title="Nhấn để sắp xếp theo tên"
                    >
                      Nhân viên {renderSortIndicator('key_name')}
                    </th>
                    <th style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>Cụm / Nhóm</th>
                    <th
                      style={{ width: '75px', minWidth: '75px', background: 'rgba(2, 132, 199, 0.1)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('total_wos')}
                      title="Nhấn để sắp xếp theo Tổng WO"
                    >
                      Tổng WO {renderSortIndicator('total_wos')}
                    </th>
                    <th
                      style={{ width: '75px', minWidth: '75px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_wos')}
                      title="Nhấn để sắp xếp theo Đã Đóng"
                    >
                      Đã Đóng {renderSortIndicator('closed_wos')}
                    </th>
                    <th
                      style={{ width: '75px', minWidth: '75px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('wo_rate')}
                      title="Nhấn để sắp xếp theo % Đóng WO"
                    >
                      % Đóng {renderSortIndicator('wo_rate')}
                    </th>
                    <th
                      style={{ width: '75px', minWidth: '75px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('pending_wos')}
                      title="Nhấn để sắp xếp theo Tồn Việc"
                    >
                      Tồn Việc {renderSortIndicator('pending_wos')}
                    </th>
                    <th
                      style={{ width: '75px', minWidth: '75px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('overdue_wos')}
                      title="Nhấn để sắp xếp theo Quá Hạn"
                    >
                      Quá Hạn {renderSortIndicator('overdue_wos')}
                    </th>

                    {hasCabinets && (
                      <>
                        <th
                          style={{ width: '85px', minWidth: '85px', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('total_cabinets')}
                          title="Nhấn để sắp xếp theo Tổng Tủ THC"
                        >
                          Tổng Tủ THC {renderSortIndicator('total_cabinets')}
                        </th>
                        <th
                          style={{ width: '80px', minWidth: '80px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('completed_cabinets')}
                          title="Nhấn để sắp xếp theo Tủ Đã Xong"
                        >
                          Tủ Đã Xong {renderSortIndicator('completed_cabinets')}
                        </th>
                        <th
                          style={{ width: '80px', minWidth: '80px', background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('cabinet_rate')}
                          title="Nhấn để sắp xếp theo % Tủ Xong"
                        >
                          % Tủ Xong {renderSortIndicator('cabinet_rate')}
                        </th>
                      </>
                    )}

                    <th style={{ width: 'auto', minWidth: '130px', textAlign: 'left', paddingLeft: '14px' }}>
                      Tiến Độ
                    </th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Chi Tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Excel Summary Row on TOP */}
                  <tr className="excel-summary-row">
                    <td className="col-summary-label" colSpan={3} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', width: '1%', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      TỔNG CỘNG:
                    </td>
                    <td className="cell-num" style={{ width: '75px', fontSize: '0.98rem', color: 'var(--brand-primary)', fontWeight: 800 }}>
                      {summary.total_wos ?? 0}
                    </td>
                    <td className="cell-num cell-closed" style={{ width: '75px', fontSize: '0.98rem', fontWeight: 800 }}>
                      {summary.closed_wos ?? 0}
                    </td>
                    <td className="cell-num" style={{ width: '75px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      {summary.wo_rate ?? 0}%
                    </td>
                    <td className="cell-num cell-pending" style={{ width: '75px', fontSize: '0.98rem', fontWeight: 800 }}>
                      {summary.pending_wos ?? 0}
                    </td>
                    <td className="cell-num cell-overdue" style={{ width: '75px', fontSize: '0.98rem', fontWeight: 800 }}>
                      {summary.overdue_wos ?? 0}
                    </td>

                    {hasCabinets && (
                      <>
                        <td className="cell-num" style={{ width: '85px', fontSize: '0.98rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {summary.total_cabinets ?? 0}
                        </td>
                        <td className="cell-num" style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                          {summary.completed_cabinets ?? 0}
                        </td>
                        <td className="cell-num" style={{ width: '80px', fontSize: '0.95rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {summary.cabinet_rate ?? 0}%
                        </td>
                      </>
                    )}

                    <td>
                      <div className="progress-bar-container" style={{ width: '100px' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min(hasCabinets ? summary.cabinet_rate : summary.wo_rate, 100)}%`,
                            background: hasCabinets ? '#8b5cf6' : 'var(--brand-primary)',
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>--</td>
                  </tr>

                  {/* Data Rows */}
                  {sortedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={hasCabinets ? 12 : 9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        Không tìm thấy nhân viên nào phù hợp bộ lọc tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    sortedEmployees.map((row, index) => {
                      const isOverdue = row.overdue_wos > 0;
                      return (
                        <tr key={`emp-${row.employee_id || index}`} className="excel-row">
                          <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                            {row.is_other ? '*' : index + 1}
                          </td>
                          <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px' }}>
                            <strong style={{ fontSize: '0.88rem', color: isOverdue ? 'var(--danger)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {row.key_name}
                            </strong>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--bg-tertiary)' }}>
                              {formatGroupName(row.group_name)}
                            </span>
                          </td>
                          <td className="cell-num" style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>
                            {row.total_wos}
                          </td>
                          <td className="cell-num cell-closed" style={{ fontWeight: 700 }}>
                            {row.closed_wos}
                          </td>
                          <td className="cell-num" style={{ fontWeight: 700, color: 'var(--success-dark)' }}>
                            {row.wo_rate}%
                          </td>
                          <td className="cell-num cell-pending" style={{ fontWeight: 700 }}>
                            {row.pending_wos}
                          </td>
                          <td className="cell-num cell-overdue" style={{ fontWeight: isOverdue ? 900 : 400 }}>
                            {row.overdue_wos}
                          </td>

                          {hasCabinets && (
                            <>
                              <td className="cell-num" style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                {row.total_cabinets}
                              </td>
                              <td className="cell-num" style={{ fontWeight: 700, color: 'var(--success-dark)' }}>
                                {row.completed_cabinets}
                              </td>
                              <td className="cell-num" style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                {row.cabinet_rate}%
                              </td>
                            </>
                          )}

                          <td>
                            <div className="progress-bar-container" style={{ width: '90px' }}>
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${Math.min(hasCabinets ? row.cabinet_rate : row.wo_rate, 100)}%`,
                                  background: (hasCabinets ? row.cabinet_rate : row.wo_rate) >= 100
                                    ? 'var(--success)'
                                    : hasCabinets
                                    ? '#8b5cf6'
                                    : 'var(--brand-primary)',
                                }}
                              />
                            </div>
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                              onClick={() => {
                                setSelectedFtFilter(row.key_name);
                                setCurrentTab('wos');
                              }}
                              title={`Xem chi tiết WO của ${row.key_name}`}
                            >
                              Xem WO
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ======================= TAB 2: THEO NHÓM / CỤM ======================= */}
          {currentTab === 'group' && (
            <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
              <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                    <th
                      className="col-name"
                      style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('key_name')}
                      title="Nhấn để sắp xếp theo tên cụm"
                    >
                      Nhóm / Cụm {renderSortIndicator('key_name')}
                    </th>
                    <th style={{ width: '80px', textAlign: 'center', whiteSpace: 'nowrap' }}>Mã Ngắn</th>
                    <th
                      style={{ width: '80px', minWidth: '80px', background: 'rgba(2, 132, 199, 0.1)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('total_wos')}
                      title="Nhấn để sắp xếp theo Tổng WO"
                    >
                      Tổng WO {renderSortIndicator('total_wos')}
                    </th>
                    <th
                      style={{ width: '80px', minWidth: '80px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_wos')}
                      title="Nhấn để sắp xếp theo Đã Đóng"
                    >
                      Đã Đóng {renderSortIndicator('closed_wos')}
                    </th>
                    <th
                      style={{ width: '75px', minWidth: '75px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('wo_rate')}
                      title="Nhấn để sắp xếp theo % Đóng WO"
                    >
                      % Đóng {renderSortIndicator('wo_rate')}
                    </th>
                    <th
                      style={{ width: '80px', minWidth: '80px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('pending_wos')}
                      title="Nhấn để sắp xếp theo Tồn Việc"
                    >
                      Tồn Việc {renderSortIndicator('pending_wos')}
                    </th>
                    <th
                      style={{ width: '80px', minWidth: '80px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('overdue_wos')}
                      title="Nhấn để sắp xếp theo Quá Hạn"
                    >
                      Quá Hạn {renderSortIndicator('overdue_wos')}
                    </th>

                    {hasCabinets && (
                      <>
                        <th
                          style={{ width: '90px', minWidth: '90px', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('total_cabinets')}
                          title="Nhấn để sắp xếp theo Tổng Tủ THC"
                        >
                          Tổng Tủ THC {renderSortIndicator('total_cabinets')}
                        </th>
                        <th
                          style={{ width: '85px', minWidth: '85px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('completed_cabinets')}
                          title="Nhấn để sắp xếp theo Tủ Đã Xong"
                        >
                          Tủ Đã Xong {renderSortIndicator('completed_cabinets')}
                        </th>
                        <th
                          style={{ width: '85px', minWidth: '85px', background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('cabinet_rate')}
                          title="Nhấn để sắp xếp theo % Tủ Xong"
                        >
                          % Tủ Xong {renderSortIndicator('cabinet_rate')}
                        </th>
                      </>
                    )}

                    <th style={{ width: 'auto', minWidth: '130px', textAlign: 'left', paddingLeft: '14px' }}>
                      Tiến Độ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Summary Row */}
                  <tr className="excel-summary-row">
                    <td className="col-summary-label" colSpan={3} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', width: '1%', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      TỔNG CỘNG:
                    </td>
                    <td className="cell-num" style={{ width: '80px', fontSize: '0.98rem', color: 'var(--brand-primary)', fontWeight: 800 }}>
                      {summary.total_wos ?? 0}
                    </td>
                    <td className="cell-num cell-closed" style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800 }}>
                      {summary.closed_wos ?? 0}
                    </td>
                    <td className="cell-num" style={{ width: '75px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      {summary.wo_rate ?? 0}%
                    </td>
                    <td className="cell-num cell-pending" style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800 }}>
                      {summary.pending_wos ?? 0}
                    </td>
                    <td className="cell-num cell-overdue" style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800 }}>
                      {summary.overdue_wos ?? 0}
                    </td>

                    {hasCabinets && (
                      <>
                        <td className="cell-num" style={{ width: '90px', fontSize: '0.98rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {summary.total_cabinets ?? 0}
                        </td>
                        <td className="cell-num" style={{ width: '85px', fontSize: '0.98rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                          {summary.completed_cabinets ?? 0}
                        </td>
                        <td className="cell-num" style={{ width: '85px', fontSize: '0.95rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {summary.cabinet_rate ?? 0}%
                        </td>
                      </>
                    )}

                    <td>
                      <div className="progress-bar-container" style={{ width: '100px' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min(hasCabinets ? summary.cabinet_rate : summary.wo_rate, 100)}%`,
                            background: hasCabinets ? '#8b5cf6' : 'var(--brand-primary)',
                          }}
                        />
                      </div>
                    </td>
                  </tr>

                  {/* Data Rows */}
                  {sortedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={hasCabinets ? 12 : 9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        Không tìm thấy cụm nào phù hợp bộ lọc tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    sortedGroups.map((row, index) => {
                      const shortName = formatGroupName(row.key_name);
                      return (
                        <tr key={`grp-${row.group_id || index}`} className="excel-row">
                          <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                            {row.is_other ? '*' : index + 1}
                          </td>
                          <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px' }}>
                            <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {row.key_name}
                            </strong>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge" style={{ fontSize: '0.74rem', background: 'var(--brand-light)', color: 'var(--brand-primary)', fontWeight: 700 }}>
                              {shortName}
                            </span>
                          </td>
                          <td className="cell-num" style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>
                            {row.total_wos}
                          </td>
                          <td className="cell-num cell-closed" style={{ fontWeight: 700 }}>
                            {row.closed_wos}
                          </td>
                          <td className="cell-num" style={{ fontWeight: 700, color: 'var(--success-dark)' }}>
                            {row.wo_rate}%
                          </td>
                          <td className="cell-num cell-pending" style={{ fontWeight: 700 }}>
                            {row.pending_wos}
                          </td>
                          <td className="cell-num cell-overdue" style={{ fontWeight: row.overdue_wos > 0 ? 900 : 400 }}>
                            {row.overdue_wos}
                          </td>

                          {hasCabinets && (
                            <>
                              <td className="cell-num" style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                {row.total_cabinets}
                              </td>
                              <td className="cell-num" style={{ fontWeight: 700, color: 'var(--success-dark)' }}>
                                {row.completed_cabinets}
                              </td>
                              <td className="cell-num" style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                {row.cabinet_rate}%
                              </td>
                            </>
                          )}

                          <td>
                            <div className="progress-bar-container" style={{ width: '90px' }}>
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${Math.min(hasCabinets ? row.cabinet_rate : row.wo_rate, 100)}%`,
                                  background: (hasCabinets ? row.cabinet_rate : row.wo_rate) >= 100
                                    ? 'var(--success)'
                                    : hasCabinets
                                    ? '#8b5cf6'
                                    : 'var(--brand-primary)',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ======================= TAB 3: CHI TIẾT WO & TỦ CÁP CON (ACCORDION) ======================= */}
          {currentTab === 'wos' && (
            <div>
              {/* Accordion helper banner */}
              <div
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Hiển thị <strong>{sortedWos.length}</strong> công việc (WO). Bấm <strong style={{ color: '#8b5cf6' }}>[ + ]</strong> để xem danh sách tủ cáp con đối chiếu bên trong WO.
                </span>

                {hasCabinets && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => handleToggleAllWos(true)}
                    >
                      Mở rộng tất cả tủ
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => handleToggleAllWos(false)}
                    >
                      Thu gọn tất cả
                    </button>
                  </div>
                )}
              </div>

              <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
                <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      {hasCabinets && <th style={{ width: '36px', textAlign: 'center' }}></th>}
                      <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                      <th
                        style={{ minWidth: '140px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('ma_cong_viec')}
                        title="Sắp xếp theo Mã WO"
                      >
                        Mã WO {renderSortIndicator('ma_cong_viec')}
                      </th>
                      <th
                        style={{ minWidth: '100px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('station_code')}
                        title="Sắp xếp theo Mã Trạm"
                      >
                        Mã Trạm {renderSortIndicator('station_code')}
                      </th>
                      <th
                        style={{ minWidth: '140px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('employee_assigned_name')}
                        title="Sắp xếp theo Nhân viên FT"
                      >
                        Nhân Viên (FT) {renderSortIndicator('employee_assigned_name')}
                      </th>
                      <th style={{ minWidth: '85px', whiteSpace: 'nowrap' }}>Cụm</th>
                      <th style={{ minWidth: '180px' }}>Loại Việc / Nội Dung</th>
                      <th style={{ width: '105px', textAlign: 'center', whiteSpace: 'nowrap' }}>Trạng Thái WO</th>
                      <th style={{ width: '110px', textAlign: 'center', whiteSpace: 'nowrap' }}>Hạn Xử Lý</th>
                      {hasCabinets && (
                        <th
                          style={{ minWidth: '130px', textAlign: 'center', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('completed_cabinets')}
                          title="Sắp xếp theo số tủ đã xong"
                        >
                          Chi Tiết Tủ (THC) {renderSortIndicator('completed_cabinets')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWos.length === 0 ? (
                      <tr>
                        <td colSpan={hasCabinets ? 10 : 8} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                          Không tìm thấy công việc nào phù hợp với bộ lọc tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      sortedWos.map((w, idx) => {
                        const isExpanded = Boolean(expandedWos[w.ma_cong_viec]);
                        const cabCount = (w.cabinets || []).length;
                        const isOverdue = w.is_overdue;

                        return (
                          <React.Fragment key={w.ma_cong_viec || idx}>
                            <tr
                              className="excel-row"
                              style={{
                                background: isExpanded
                                  ? 'rgba(139, 92, 246, 0.05)'
                                  : isOverdue
                                  ? 'rgba(239, 68, 68, 0.04)'
                                  : undefined,
                              }}
                            >
                              {hasCabinets && (
                                <td style={{ textAlign: 'center', padding: '4px' }}>
                                  {cabCount > 0 ? (
                                    <button
                                      onClick={() => toggleWoExpand(w.ma_cong_viec)}
                                      style={{
                                        border: 'none',
                                        background: isExpanded ? '#8b5cf6' : 'var(--bg-tertiary)',
                                        color: isExpanded ? '#fff' : 'var(--text-primary)',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title={isExpanded ? 'Thu gọn' : `Mở rộng ${cabCount} tủ con`}
                                    >
                                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                                  )}
                                </td>
                              )}

                              <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                                {idx + 1}
                              </td>

                              <td>
                                <span
                                  onClick={() => handleOpenTaskDetail(w.ma_cong_viec)}
                                  style={{
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)',
                                    color: isOverdue ? 'var(--danger)' : 'var(--brand-primary)',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    textUnderlineOffset: '3px',
                                  }}
                                  title="Bấm để xem lịch sử và chi tiết WO"
                                >
                                  {w.ma_cong_viec}
                                </span>
                              </td>

                              <td>
                                {w.station_code ? (
                                  <span className="badge" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', background: 'var(--bg-tertiary)' }}>
                                    {w.station_code}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </td>

                              <td>
                                <span style={{ fontWeight: isOverdue ? 800 : 600, color: isOverdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                                  {w.employee_assigned_name}
                                </span>
                              </td>

                              <td>
                                <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--bg-tertiary)' }}>
                                  {formatGroupName(w.group_name)}
                                </span>
                              </td>

                              <td>
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-primary)',
                                    maxWidth: '240px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={w.noi_dung_cong_viec || w.loai_cong_viec}
                                >
                                  {w.noi_dung_cong_viec || w.loai_cong_viec}
                                </div>
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                {w.is_closed ? (
                                  <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 7px' }}>
                                    Đã Đóng
                                  </span>
                                ) : (
                                  <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '2px 7px' }}>
                                    {w.trang_thai || 'Đang xử lý'}
                                  </span>
                                )}
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                {isOverdue ? (
                                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <AlertTriangle size={12} /> Quá hạn
                                  </span>
                                ) : w.is_closed ? (
                                  <span style={{ fontSize: '0.74rem', color: 'var(--success)' }}>Đã đóng</span>
                                ) : (
                                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Trong hạn</span>
                                )}
                              </td>

                              {hasCabinets && (
                                <td style={{ textAlign: 'center' }}>
                                  {cabCount > 0 ? (
                                    <div
                                      onClick={() => toggleWoExpand(w.ma_cong_viec)}
                                      style={{
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '2px 8px',
                                        borderRadius: 'var(--radius-full)',
                                        background: w.completed_cabinets === cabCount ? 'var(--success-light)' : 'rgba(139, 92, 246, 0.12)',
                                        color: w.completed_cabinets === cabCount ? 'var(--success-dark)' : '#8b5cf6',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                      }}
                                      title="Bấm để xem các tủ cáp con"
                                    >
                                      <Box size={12} />
                                      {w.completed_cabinets}/{cabCount} Tủ
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>-</span>
                                  )}
                                </td>
                              )}
                            </tr>

                            {/* Sub-table: Nested Cabinets */}
                            {hasCabinets && isExpanded && (
                              <tr style={{ background: 'var(--bg-tertiary)' }}>
                                <td colSpan={10} style={{ padding: '10px 16px 14px 44px' }}>
                                  <div
                                    style={{
                                      background: 'var(--bg-secondary)',
                                      borderRadius: 'var(--radius-md)',
                                      border: '1px solid var(--border-color)',
                                      padding: '12px',
                                      boxShadow: 'var(--shadow-sm)',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                      <Cable size={14} style={{ color: '#8b5cf6' }} />
                                      <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                        Danh Sách Tủ Cáp Con Của WO: {w.ma_cong_viec}
                                      </strong>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        ({cabCount} tủ đối chiếu)
                                      </span>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                          <th style={{ padding: '5px 8px', width: '38px' }}>STT</th>
                                          <th style={{ padding: '5px 8px' }}>Mã Đối Tượng (Tủ THC)</th>
                                          <th style={{ padding: '5px 8px' }}>Mã Trạm THC</th>
                                          <th style={{ padding: '5px 8px' }}>Trạng Thái THC</th>
                                          <th style={{ padding: '5px 8px' }}>Tỉnh / Khu Vực</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {w.cabinets.map((cab, cIdx) => (
                                          <tr key={cab.id || cIdx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{cIdx + 1}</td>
                                            <td style={{ padding: '5px 8px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#8b5cf6' }}>
                                              {cab.ma_doi_tuong}
                                            </td>
                                            <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                              {cab.ma_tram || '-'}
                                            </td>
                                            <td style={{ padding: '5px 8px' }}>
                                              {cab.is_completed ? (
                                                <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                                  <CheckCircle2 size={11} /> {cab.trang_thai_thc}
                                                </span>
                                              ) : (
                                                <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                                  <Clock size={11} /> {cab.trang_thai_thc || 'Đang thực hiện'}
                                                </span>
                                              )}
                                            </td>
                                            <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>
                                              {cab.tinh || ''} {cab.khu_vuc ? `(${cab.khu_vuc})` : ''}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Task Detail Sheet Modal with Notes & History */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onNoteAdded={async (ma_cong_viec) => {
            try {
              const updated = await tasksApi.getTaskDetail(ma_cong_viec);
              setSelectedDetailTask(updated);
              queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
