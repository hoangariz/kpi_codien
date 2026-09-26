import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cable,
  Users,
  FolderKanban,
  Search,
  Download,
  RotateCcw,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Filter
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';
import { importsApi } from '../api/importsApi';
import { tasksApi } from '../api/tasksApi';
import { formatDataTimestamp } from '../utils/dateFormat';
import { formatGroupName } from '../utils/groupFormat';
import { getUserFullName } from '../utils/userMapping';
import CodinhDrilldownModal from '../components/CodinhDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';
import DhPortKemTable from '../components/DhPortKemTable';

export default function CodinhPage() {
  // Reference for smooth auto-scroll down to the selected table
  const tableSectionRef = useRef(null);

  // Active view tab: 'employee' | 'group'
  const [currentTab, setCurrentTab] = useState('employee');

  // Filter & Search states
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState(''); // Filter by cluster/group for employee tab
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');

  // Drilldown & Task Detail Modals
  const [drilldownFilter, setDrilldownFilter] = useState(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // 1. Fetch categories for CĐBR
  const { data: categories = [] } = useQuery({
    queryKey: ['codinh-categories'],
    queryFn: () => codinhApi.getCategories(null, true),
  });

  // Effective category id - Mặc định chưa xem bảng nào cho đến khi người dùng click chọn
  const effectiveCatId = selectedCatId;

  // Lắng nghe sự kiện reset khi click lại tab Cố Định BR trên Header
  useEffect(() => {
    const handleReset = () => {
      setSelectedCatId(null);
      setSelectedMonth('all');
    };
    window.addEventListener('reset-codinh-view', handleReset);
    return () => window.removeEventListener('reset-codinh-view', handleReset);
  }, []);

  // 2. Fetch stats for the effective category
  const { data: statsData, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['codinh-stats', effectiveCatId, selectedMonth],
    queryFn: () => codinhApi.getStats(effectiveCatId, selectedMonth === 'all' ? null : selectedMonth),
    enabled: effectiveCatId !== null,
  });

  // 3. Fallback import log if backend doesn't provide codinh-specific timestamp
  const { data: importLogs } = useQuery({
    queryKey: ['import-logs-latest'],
    queryFn: () => importsApi.getImportLogs(5),
    staleTime: 5 * 60 * 1000,
  });

  const latestImport =
    (importLogs || []).find((l) => l.is_active === 1) ||
    (importLogs || []).find((l) => l.status === 'COMPLETED') ||
    (importLogs && importLogs.length > 0 ? importLogs[0] : null);

  // Exact GMT+7 data timestamp from backend or formatted locally
  const lastDataUpdateStr = useMemo(() => {
    if (statsData?.last_data_update_vn) {
      return statsData.last_data_update_vn;
    }
    if (latestImport?.imported_at) {
      return formatDataTimestamp(latestImport.imported_at);
    }
    return null;
  }, [statsData, latestImport]);

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

  const activeCategory = statsData?.active_category;
  const summary = statsData?.summary || {
    total_wos: 0,
    closed_wos: 0,
    pending_wos: 0,
    overdue_wos: 0,
    closed_today_wos: 0,
    closed_yesterday_wos: 0,
    closed_week_wos: 0,
    wo_rate: 0,
    total_cabinets: 0,
    completed_cabinets: 0,
    pending_cabinets: 0,
    overdue_cabinets: 0,
    cabinet_rate: 0,
    has_cabinets: false,
  };

  const hasCabinets = summary.has_cabinets;

  // Unique clusters / groups for filtering employee table
  const uniqueGroups = useMemo(() => {
    if (!statsData?.by_group) return [];
    return statsData.by_group
      .map((g) => g.key_name)
      .filter((name) => name && name !== 'Chưa phân nhóm')
      .sort((a, b) => formatGroupName(a).localeCompare(formatGroupName(b), 'vi'));
  }, [statsData]);

  // Employee count per cluster / group
  const groupEmpCounts = useMemo(() => {
    const counts = {};
    if (statsData?.by_employee) {
      statsData.by_employee.forEach((e) => {
        const g = e.group_name || 'Khác';
        counts[g] = (counts[g] || 0) + 1;
      });
    }
    return counts;
  }, [statsData]);

  // Dynamic summary for employee table (reflects selected cluster filter if active)
  const activeEmpSummary = useMemo(() => {
    if (!selectedGroupFilter) return summary;
    const grp = (statsData?.by_group || []).find((g) => g.key_name === selectedGroupFilter);
    if (grp) {
      return {
        ...grp,
        total_wos: grp.total_wos,
        closed_wos: grp.closed_wos,
        pending_wos: grp.pending_wos,
        overdue_wos: grp.overdue_wos,
        closed_today_wos: grp.closed_today || 0,
        closed_yesterday_wos: grp.closed_yesterday || 0,
        closed_week_wos: grp.closed_week || 0,
        wo_rate: grp.wo_rate,
        total_cabinets: grp.total_cabinets || 0,
        completed_cabinets: grp.completed_cabinets || 0,
        pending_cabinets: grp.pending_cabinets || 0,
        overdue_cabinets: grp.overdue_cabinets || 0,
        cabinet_rate: grp.cabinet_rate || 0,
        has_cabinets: hasCabinets,
      };
    }
    return summary;
  }, [selectedGroupFilter, statsData, summary, hasCabinets]);

  // Determine whether current category is Port Kém
  const isPortKemCategory = Boolean(
    activeCategory?.is_port_kem ||
    summary?.is_port_kem ||
    activeCategory?.name?.toLowerCase().includes('port') ||
    activeCategory?.loai_cong_viec?.toLowerCase().includes('port')
  );

  // Drilldown handler
  const handleOpenDrilldown = (metric, filterType = null, targetName = null) => {
    setDrilldownFilter({
      categoryId: effectiveCatId,
      categoryName: activeCategory?.name,
      month: selectedMonth === 'all' ? null : selectedMonth,
      metric,
      filterType,
      targetName,
    });
  };

  const handleOpenTaskDetail = async (taskOrCode) => {
    try {
      const code = typeof taskOrCode === 'string' ? taskOrCode : taskOrCode.ma_cong_viec;
      const fullTask = await tasksApi.getTaskDetail(code);
      setSelectedDetailTask(fullTask);
    } catch (err) {
      alert('Không thể tải chi tiết công việc: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Filtered & Sorted Employees
  const sortedEmployees = useMemo(() => {
    if (!statsData?.by_employee) return [];
    let list = statsData.by_employee.filter((emp) => {
      // Cluster / Group filter
      if (selectedGroupFilter && emp.group_name !== selectedGroupFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const rawUser = (emp.key_name || '').toLowerCase();
        const fullName = getUserFullName(emp.key_name || '').toLowerCase();
        const mGrp = (emp.group_name || '').toLowerCase();
        const mShort = formatGroupName(emp.group_name || '').toLowerCase();
        if (!rawUser.includes(q) && !fullName.includes(q) && !mGrp.includes(q) && !mShort.includes(q)) return false;
      }
      return true;
    });

    if (sortKey) {
      list = [...list].sort((a, b) => {
        if (a.is_other) return 1;
        if (b.is_other) return -1;
        let cmp = 0;
        if (sortKey === 'key_name') {
          const nameA = getUserFullName(a.key_name || '');
          const nameB = getUserFullName(b.key_name || '');
          cmp = nameA.localeCompare(nameB, 'vi');
        } else if (sortKey === 'group_name') {
          cmp = formatGroupName(a.group_name || '').localeCompare(formatGroupName(b.group_name || ''), 'vi');
        } else {
          cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [statsData, searchQuery, selectedGroupFilter, sortKey, sortOrder]);

  // Filtered & Sorted Groups (Abbreviated group codes like overview)
  const sortedGroups = useMemo(() => {
    if (!statsData?.by_group) return [];
    let list = statsData.by_group.filter((grp) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const raw = (grp.key_name || '').toLowerCase();
        const short = formatGroupName(grp.key_name).toLowerCase();
        if (!raw.includes(q) && !short.includes(q)) return false;
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
  }, [statsData, searchQuery, sortKey, sortOrder]);

  // Auto-scroll down to table when selecting or viewing a report category
  const handleSelectCategory = (catId) => {
    setSelectedCatId(catId);
    setTimeout(() => {
      if (tableSectionRef.current) {
        tableSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!statsData) return;
    let csvLines = [];
    if (currentTab === 'employee') {
      csvLines.push(`BẢNG THỐNG KÊ ${activeCategory?.name || 'CĐBR'} THEO NHÂN VIÊN`);
      const headers = [
        'STT', 'Nhân viên', 'Nhóm / Cụm',
        '% Đóng', 'Tồn Việc', 'Quá Hạn',
        ...(hasCabinets ? ['% Tủ Xong', 'Tủ Tồn', 'Tủ Quá Hạn'] : []),
        'Hôm nay', 'Hôm qua', 'Tuần qua'
      ];
      csvLines.push(headers.join(','));
      csvLines.push([
        '--',
        '"TỔNG CỘNG"',
        '--',
        `${summary.wo_rate}%`,
        summary.pending_wos,
        summary.overdue_wos,
        ...(hasCabinets ? [`${summary.cabinet_rate}%`, summary.pending_cabinets, summary.overdue_cabinets] : []),
        summary.closed_today_wos ?? 0,
        summary.closed_yesterday_wos ?? 0,
        summary.closed_week_wos ?? 0,
      ].join(','));
      sortedEmployees.forEach((r, idx) => {
        csvLines.push([
          idx + 1,
          `"${getUserFullName(r.key_name)}"`,
          `"${formatGroupName(r.group_name)}"`,
          `${r.wo_rate}%`,
          r.pending_wos,
          r.overdue_wos,
          ...(hasCabinets ? [`${r.cabinet_rate}%`, r.pending_cabinets, r.overdue_cabinets] : []),
          r.closed_today ?? 0,
          r.closed_yesterday ?? 0,
          r.closed_week ?? 0,
        ].join(','));
      });
    } else {
      csvLines.push(`BẢNG THỐNG KÊ ${activeCategory?.name || 'CĐBR'} THEO NHÓM / CỤM`);
      const headers = [
        'STT', 'Nhóm / Cụm',
        '% Đóng', 'Tồn Việc', 'Quá Hạn',
        ...(hasCabinets ? ['% Tủ Xong', 'Tủ Tồn', 'Tủ Quá Hạn'] : []),
        'Hôm nay', 'Hôm qua', 'Tuần qua'
      ];
      csvLines.push(headers.join(','));
      csvLines.push([
        '--',
        '"TỔNG CỘNG"',
        `${summary.wo_rate}%`,
        summary.pending_wos,
        summary.overdue_wos,
        ...(hasCabinets ? [`${summary.cabinet_rate}%`, summary.pending_cabinets, summary.overdue_cabinets] : []),
        summary.closed_today_wos ?? 0,
        summary.closed_yesterday_wos ?? 0,
        summary.closed_week_wos ?? 0,
      ].join(','));
      sortedGroups.forEach((r, idx) => {
        csvLines.push([
          idx + 1,
          `"${formatGroupName(r.key_name)}"`,
          `${r.wo_rate}%`,
          r.pending_wos,
          r.overdue_wos,
          ...(hasCabinets ? [`${r.cabinet_rate}%`, r.pending_cabinets, r.overdue_cabinets] : []),
          r.closed_today ?? 0,
          r.closed_yesterday ?? 0,
          r.closed_week ?? 0,
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
      {/* Responsive mobile & cabinet UI styling */}
      <style>{`
        /* Sticky Left Columns for all Excel Tables in CĐBR (Desktop & Mobile) */
        .col-stt {
          position: sticky !important;
          left: 0 !important;
          width: 38px !important;
          min-width: 38px !important;
          max-width: 38px !important;
          z-index: 6 !important;
          background: var(--bg-secondary) !important;
          box-sizing: border-box !important;
          text-align: center !important;
        }
        th.col-stt {
          z-index: 10 !important;
          background: var(--bg-tertiary) !important;
        }
        .col-name {
          position: sticky !important;
          left: 38px !important;
          z-index: 6 !important;
          background: var(--bg-secondary) !important;
          box-shadow: 3px 0 6px -2px rgba(0, 0, 0, 0.18) !important;
        }
        th.col-name {
          z-index: 10 !important;
          background: var(--bg-tertiary) !important;
        }
        tr.excel-row:hover td.col-stt,
        tr.excel-row:hover td.col-name {
          background: var(--bg-hover) !important;
        }
        .excel-summary-row .col-summary-label {
          position: static !important;
          left: auto !important;
          z-index: auto !important;
          width: auto !important;
          min-width: unset !important;
          max-width: unset !important;
          box-shadow: none !important;
        }

        @media (max-width: 768px) {
          .report-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .report-selector-card {
            padding: 12px 14px !important;
            min-height: auto !important;
          }
          .card-kpi-summary-row {
            padding: 6px 2px !important;
            gap: 2px !important;
          }
          .card-kpi-summary-row span {
            font-size: 0.58rem !important;
          }
          .card-kpi-summary-row strong {
            font-size: 0.8rem !important;
          }
          .table-metric-strip {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 6px !important;
            padding: 8px 10px !important;
          }
          .excel-table th, .excel-table td {
            padding: 4px 6px !important;
            font-size: 0.76rem !important;
          }
          .mobile-swipe-hint {
            display: block !important;
            padding: 6px 12px !important;
            font-size: 0.74rem !important;
            background: rgba(139, 92, 246, 0.08) !important;
            color: #8b5cf6 !important;
            text-align: center !important;
            border-bottom: 1px solid var(--border-color) !important;
          }
        }
      `}</style>

      {/* 0. Top Strip: Badge CĐBR, Data freshness GMT+7, Refresh button (No large redundant title banner) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="badge badge-purple" style={{ fontSize: '0.8rem', fontWeight: 800, gap: '5px' }}>
            <Cable size={14} /> CỐ ĐỊNH BĂNG RỘNG (CĐBR)
          </span>

          {lastDataUpdateStr && (
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--bg-tertiary)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              <Clock size={12} /> Dữ liệu cập nhật đến: {lastDataUpdateStr}
            </span>
          )}
        </div>

        <button
          onClick={() => {
            if (effectiveCatId) refetchStats();
          }}
          disabled={!effectiveCatId || loadingStats}
          className="btn btn-outline"
          style={{ fontSize: '0.82rem', padding: '6px 14px', gap: '6px', opacity: !effectiveCatId ? 0.6 : 1 }}
          title={effectiveCatId ? "Tải lại số liệu mới nhất" : "Vui lòng chọn báo cáo trước"}
        >
          <RotateCcw size={14} className={loadingStats ? 'spin' : ''} /> Làm mới
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
              // Lấy summary: nếu đang chọn và có statsData thì dùng statsData.summary, ngược lại lấy từ cat.summary
              const catSum = (isSelected && summary?.total_wos != null) ? summary : (cat.summary || {});

              // 5 chỉ số theo yêu cầu: % ĐÓNG, TỒN VIỆC, QUÁ HẠN, TỦ TỒN, TỦ QUÁ HẠN
              const closeRate = catSum.wo_rate ?? catSum.completion_rate ?? 0;
              const pendingWos = catSum.pending_wos ?? catSum.pending ?? 0;
              const overdueWos = catSum.overdue_wos ?? catSum.overdue ?? 0;
              const pendingCabs = catSum.pending_cabinets ?? 0;
              const overdueCabs = catSum.overdue_cabinets ?? 0;

              const isPortKemCard = Boolean(
                cat.name?.toLowerCase().includes('port') ||
                cat.loai_cong_viec?.toLowerCase().includes('port') ||
                cat.loai_cong_viec?.toLowerCase().includes('chủ động') ||
                catSum.is_port_kem
              );

              return (
                <div
                  key={cat.id}
                  className="report-selector-card"
                  onClick={() => handleSelectCategory(cat.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '16px 18px',
                    borderRadius: 'var(--radius-lg)',
                    border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%)'
                      : 'var(--bg-secondary)',
                    boxShadow: isSelected ? '0 4px 16px -2px rgba(139, 92, 246, 0.25)' : 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '154px',
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

                  {isPortKemCard ? (
                    /* MINI KPI RIÊNG CHO ĐH PORT KÉM: % ĐÓNG, TỒN, HOME KÉM, PORT KÉM, HÔM QUA */
                    <div
                      className="card-kpi-summary-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '4px',
                        padding: '8px 4px',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                        border: '1px solid',
                        borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                        textAlign: 'center',
                        marginTop: '8px',
                      }}
                    >
                      {/* % đóng */}
                      <div title="Tỷ lệ hoàn thành đóng công việc">
                        <span style={{ fontSize: '0.62rem', color: 'var(--brand-primary)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          % ĐÓNG
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                          {closeRate}%
                        </strong>
                      </div>

                      {/* tồn */}
                      <div title="Số công việc tồn chưa hoàn thành">
                        <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          TỒN
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                          {pendingWos.toLocaleString()}
                        </strong>
                      </div>

                      {/* Home kém */}
                      <div title="Số công việc Home wifi thu kém đang tồn">
                        <span style={{ fontSize: '0.62rem', color: '#9333ea', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          HOME KÉM
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: '#9333ea', fontFamily: 'var(--font-mono)' }}>
                          {(catSum.home_kem_count ?? 0).toLocaleString()}
                        </strong>
                      </div>

                      {/* Port kém */}
                      <div title="Số công việc Port kém GPON đang tồn">
                        <span style={{ fontSize: '0.62rem', color: '#06b6d4', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          PORT KÉM
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>
                          {(catSum.port_kem_count ?? 0).toLocaleString()}
                        </strong>
                      </div>

                      {/* hôm qua */}
                      <div title="Số công việc đã hoàn thành / đóng hôm qua">
                        <span style={{ fontSize: '0.62rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          HÔM QUA
                        </span>
                        <strong
                          style={{
                            fontSize: '0.84rem',
                            color: (catSum.closed_yesterday_wos ?? catSum.closed_yesterday ?? 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {(catSum.closed_yesterday_wos ?? catSum.closed_yesterday ?? 0) > 0
                            ? `+${(catSum.closed_yesterday_wos ?? catSum.closed_yesterday ?? 0).toLocaleString()}`
                            : 0}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    /* MINI KPI TIẾN ĐỘ CHO BẢO DƯỠNG THC (5 CHỈ SỐ: % ĐÓNG, TỒN VIỆC, QUÁ HẠN, TỦ TỒN, TỦ QUÁ HẠN) */
                    <div
                      className="card-kpi-summary-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '4px',
                        padding: '8px 4px',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                        border: '1px solid',
                        borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                        textAlign: 'center',
                        marginTop: '8px',
                      }}
                    >
                      <div title="Tỷ lệ hoàn thành đóng công việc">
                        <span style={{ fontSize: '0.62rem', color: 'var(--brand-primary)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          % ĐÓNG
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                          {closeRate}%
                        </strong>
                      </div>

                      <div title="Số công việc tồn chưa hoàn thành">
                        <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          TỒN VIỆC
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                          {pendingWos.toLocaleString()}
                        </strong>
                      </div>

                      <div title="Số công việc bị quá hạn">
                        <span style={{ 
                          fontSize: '0.62rem', 
                          color: overdueWos > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', 
                          display: 'block', 
                          fontWeight: 700, 
                          marginBottom: '2px' 
                        }}>
                          QUÁ HẠN
                        </span>
                        <strong style={{ 
                          fontSize: '0.84rem', 
                          color: overdueWos > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', 
                          fontFamily: 'var(--font-mono)' 
                        }}>
                          {overdueWos.toLocaleString()}
                        </strong>
                      </div>

                      <div title="Số lượng tủ cáp THC con còn tồn chưa xong">
                        <span style={{ fontSize: '0.62rem', color: '#8b5cf6', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                          TỦ TỒN
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                          {pendingCabs.toLocaleString()}
                        </strong>
                      </div>

                      <div title="Số lượng tủ cáp THC con chưa xong thuộc các WO quá hạn">
                        <span style={{ 
                          fontSize: '0.62rem', 
                          color: overdueCabs > 0 ? '#ef4444' : 'var(--text-muted)', 
                          display: 'block', 
                          fontWeight: 700, 
                          marginBottom: '2px' 
                        }}>
                          TỦ QUÁ HẠN
                        </span>
                        <strong style={{ 
                          fontSize: '0.84rem', 
                          color: overdueCabs > 0 ? '#ef4444' : 'var(--text-muted)', 
                          fontFamily: 'var(--font-mono)' 
                        }}>
                          {overdueCabs.toLocaleString()}
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

      {/* Scroll anchor target for auto-scrolling to table */}
      <div ref={tableSectionRef} style={{ scrollMarginTop: '80px' }} />

      {/* Conditional Content: Chưa chọn bảng | Đang tải | Bảng số liệu chi tiết */}
      {!effectiveCatId ? (
        <div
          className="card"
          style={{
            padding: '52px 24px',
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--radius-xl)',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#8b5cf6',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Cable size={28} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)' }}>
            Chưa Chọn Bảng Báo Cáo
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 16px', lineHeight: 1.6 }}>
            Vui lòng nhấn chọn một bảng báo cáo ở danh sách phía trên (ví dụ: Bảo Dưỡng Tủ Hộp Cáp, Tuyến Cáp...) để xem bảng thống kê số liệu và tiến độ chi tiết.
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-tertiary)',
              color: '#8b5cf6',
              fontSize: '0.82rem',
              fontWeight: 700,
            }}
          >
            <span>👆 Nhấp vào một thẻ báo cáo ở trên để tải bảng</span>
          </div>
        </div>
      ) : loadingStats ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div className="spin" style={{ display: 'inline-block', marginBottom: '12px' }}>
            <RotateCcw size={28} />
          </div>
          <div>Đang tải dữ liệu báo cáo {activeCategory?.name || 'Cố Định Băng Rộng'}...</div>
        </div>
      ) : isPortKemCategory ? (
        <DhPortKemTable
          statsData={statsData}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          onOpenDrilldown={handleOpenDrilldown}
          lastDataUpdateStr={lastDataUpdateStr}
          onRefresh={refetchStats}
          loading={loadingStats}
        />
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
            <div
              onClick={() => handleOpenDrilldown('total')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tổng Công Việc (WO)"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {summary.total_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('closed')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đã Đóng"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {summary.closed_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('pending')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đang Tồn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {summary.pending_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('overdue')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Quá Hạn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {summary.overdue_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('closed_today')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Hôm Nay"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Hôm nay</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{summary.closed_today_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('closed_yesterday')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Hôm Qua"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Hôm qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{summary.closed_yesterday_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('closed_week')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tuần Qua"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tuần qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                +{summary.closed_week_wos ?? 0}
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
                <div
                  onClick={() => handleOpenDrilldown('cabinet_total')}
                  className="cell-clickable"
                  style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  title="Nhấn để xem chi tiết Tổng Tủ THC"
                >
                  <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Tổng Tủ THC</span>
                  <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                    {summary.total_cabinets ?? 0}
                  </strong>
                </div>

                <div
                  onClick={() => handleOpenDrilldown('cabinet_completed')}
                  className="cell-clickable"
                  style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  title="Nhấn để xem chi tiết Tủ THC Đã Xong"
                >
                  <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>Tủ Đã Xong</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                    {summary.completed_cabinets ?? 0}
                  </strong>
                </div>

                <div
                  onClick={() => handleOpenDrilldown('cabinet_pending')}
                  className="cell-clickable"
                  style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  title="Nhấn để xem chi tiết Tủ THC Còn Tồn"
                >
                  <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700 }}>Tủ Tồn</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                    {summary.pending_cabinets ?? 0}
                  </strong>
                </div>

                <div
                  onClick={() => handleOpenDrilldown('cabinet_overdue')}
                  className="cell-clickable"
                  style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  title="Nhấn để xem chi tiết Tủ THC Quá Hạn"
                >
                  <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block', fontWeight: 700 }}>Tủ Quá Hạn</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                    {summary.overdue_cabinets ?? 0}
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

          {/* Toolbar with exactly 2 tabs: 'employee' and 'group' */}
          <div className="table-toolbar" style={{ padding: '8px 16px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className={`btn ${currentTab === 'employee' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCurrentTab('employee')}
                style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
              >
                <Users size={14} />
                Theo Nhân Viên ({sortedEmployees.length})
              </button>

              <button
                className={`btn ${currentTab === 'group' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCurrentTab('group')}
                style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
              >
                <FolderKanban size={14} />
                Theo Nhóm / Cụm ({sortedGroups.length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-input-box" style={{ width: '220px' }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder={`Tìm ${currentTab === 'employee' ? 'nhân viên, cụm' : 'nhóm/cụm'}...`}
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

          {/* Quick Cluster / Group Filter Pills for Employee Tab */}
          {currentTab === 'employee' && uniqueGroups.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  marginRight: '2px',
                }}
              >
                <Filter size={14} style={{ color: '#8b5cf6' }} />
                <span>Cụm / Nhóm:</span>
              </div>

              {/* All button */}
              <button
                type="button"
                onClick={() => setSelectedGroupFilter('')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8rem',
                  fontWeight: !selectedGroupFilter ? 700 : 500,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: !selectedGroupFilter ? '1px solid #7c3aed' : '1px solid var(--border-color)',
                  background: !selectedGroupFilter ? '#8b5cf6' : 'var(--bg-primary)',
                  color: !selectedGroupFilter ? '#ffffff' : 'var(--text-primary)',
                  boxShadow: !selectedGroupFilter ? '0 2px 6px rgba(139, 92, 246, 0.35)' : 'none',
                }}
              >
                <span>Tất cả</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: !selectedGroupFilter ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-tertiary)',
                    color: !selectedGroupFilter ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}
                >
                  {statsData?.by_employee?.length || 0}
                </span>
              </button>

              {/* Each group button */}
              {uniqueGroups.map((grp) => {
                const isSelected = selectedGroupFilter === grp;
                const count = groupEmpCounts[grp] || 0;
                const short = formatGroupName(grp);
                return (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSelectedGroupFilter(isSelected ? '' : grp)}
                    title={`Lọc danh sách nhân viên thuộc cụm: ${grp}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.8rem',
                      fontWeight: isSelected ? 700 : 500,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-color)',
                      background: isSelected ? '#8b5cf6' : 'var(--bg-primary)',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      boxShadow: isSelected ? '0 2px 6px rgba(139, 92, 246, 0.35)' : 'none',
                    }}
                  >
                    <span>{short}</span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-tertiary)',
                        color: isSelected ? '#ffffff' : 'var(--text-muted)',
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile swipe hint banner */}
          <div className="mobile-swipe-hint">
            <span>👈 Vuốt ngang bảng để xem đầy đủ các cột chỉ tiêu 👉</span>
          </div>

          {/* ======================= TAB 1: THEO NHÂN VIÊN ======================= */}
          {currentTab === 'employee' && (
            <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
              <table className="excel-table" style={{ width: 'max-content', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                    <th
                      className="col-name"
                      style={{ width: '1%', textAlign: 'left', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('key_name')}
                      title="Nhấn để sắp xếp theo họ và tên nhân viên"
                    >
                      Họ và tên {renderSortIndicator('key_name')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', textAlign: 'center', padding: '5px 8px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('group_name')}
                      title="Nhấn để sắp xếp theo cụm"
                    >
                      Nhóm / Cụm {renderSortIndicator('group_name')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('wo_rate')}
                      title="Nhấn để sắp xếp theo % Đóng WO"
                    >
                      % Đóng {renderSortIndicator('wo_rate')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('pending_wos')}
                      title="Nhấn để sắp xếp theo Tồn Việc"
                    >
                      Tồn Việc {renderSortIndicator('pending_wos')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('overdue_wos')}
                      title="Nhấn để sắp xếp theo Quá Hạn"
                    >
                      Quá Hạn {renderSortIndicator('overdue_wos')}
                    </th>

                    {hasCabinets && (
                      <>
                        <th
                          style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('cabinet_rate')}
                          title="Nhấn để sắp xếp theo % Tủ Xong"
                        >
                          % Tủ Xong {renderSortIndicator('cabinet_rate')}
                        </th>
                        <th
                          style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('pending_cabinets')}
                          title="Nhấn để sắp xếp theo Tủ Tồn Chưa Xong"
                        >
                          Tủ Tồn {renderSortIndicator('pending_cabinets')}
                        </th>
                        <th
                          style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('overdue_cabinets')}
                          title="Nhấn để sắp xếp theo Tủ Quá Hạn"
                        >
                          Tủ Quá Hạn {renderSortIndicator('overdue_cabinets')}
                        </th>
                      </>
                    )}

                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_today')}
                      title="Nhấn để sắp xếp theo WO đóng hôm nay"
                    >
                      Hôm nay {renderSortIndicator('closed_today')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_yesterday')}
                      title="Nhấn để sắp xếp theo WO đóng hôm qua"
                    >
                      Hôm qua {renderSortIndicator('closed_yesterday')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(2, 132, 199, 0.08)', color: 'var(--brand-primary)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_week')}
                      title="Nhấn để sắp xếp theo WO đóng tuần qua"
                    >
                      Tuần qua {renderSortIndicator('closed_week')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Excel Summary Row on TOP */}
                  <tr className="excel-summary-row">
                    <td className="col-summary-label" colSpan={3} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      {selectedGroupFilter ? `TỔNG (${formatGroupName(selectedGroupFilter)}):` : 'TỔNG CỘNG:'}
                    </td>
                    <td className="cell-num" style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      {activeEmpSummary.wo_rate ?? 0}%
                    </td>
                    <td
                      className="cell-num cell-pending cell-clickable"
                      onClick={() => handleOpenDrilldown('pending', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đang Tồn ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                    >
                      {activeEmpSummary.pending_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-overdue cell-clickable"
                      onClick={() => handleOpenDrilldown('overdue', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Quá Hạn ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                    >
                      {activeEmpSummary.overdue_wos ?? 0}
                    </td>

                    {hasCabinets && (
                      <>
                        <td className="cell-num" style={{ fontSize: '0.92rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {activeEmpSummary.cabinet_rate ?? 0}%
                        </td>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_pending', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                          style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--warning-dark)', cursor: 'pointer' }}
                          title={`Nhấn để xem chi tiết Tủ THC Còn Tồn ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                        >
                          {activeEmpSummary.pending_cabinets ?? 0}
                        </td>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_overdue', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                          style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--danger-dark)', cursor: 'pointer' }}
                          title={`Nhấn để xem chi tiết Tủ THC Quá Hạn ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                        >
                          {activeEmpSummary.overdue_cabinets ?? 0}
                        </td>
                      </>
                    )}

                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('closed_today', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đóng Hôm Nay`}
                    >
                      +{activeEmpSummary.closed_today_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('closed_yesterday', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đóng Hôm Qua`}
                    >
                      +{activeEmpSummary.closed_yesterday_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('closed_week', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--brand-primary)', cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đóng Tuần Qua`}
                    >
                      +{activeEmpSummary.closed_week_wos ?? 0}
                    </td>
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
                      const fullName = getUserFullName(row.key_name);
                      return (
                        <tr key={`emp-${row.key_name || index}`} className="excel-row">
                          <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                            {row.is_other ? '*' : index + 1}
                          </td>
                          <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px' }}>
                            <strong
                              style={{ fontSize: '0.88rem', color: isOverdue ? 'var(--danger)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}
                              title={`User: ${row.key_name}`}
                            >
                              {fullName}
                            </strong>
                          </td>
                          <td style={{ width: '1%', whiteSpace: 'nowrap', textAlign: 'center', padding: '3px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <span className="badge" style={{ fontSize: '0.72rem', background: 'var(--bg-tertiary)', padding: '2px 6px' }}>
                              {formatGroupName(row.group_name)}
                            </span>
                          </td>
                          <td className="cell-num" style={{ fontWeight: 700, color: 'var(--success-dark)' }}>
                            {row.wo_rate}%
                          </td>
                          <td
                            className="cell-num cell-pending cell-clickable"
                            onClick={() => handleOpenDrilldown('pending', 'employee', row.key_name)}
                            style={{ fontWeight: 700, cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.pending_wos} WO tồn của ${row.key_name}`}
                          >
                            {row.pending_wos}
                          </td>
                          <td
                            className="cell-num cell-overdue cell-clickable"
                            onClick={() => handleOpenDrilldown('overdue', 'employee', row.key_name)}
                            style={{ fontWeight: isOverdue ? 900 : 400, cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.overdue_wos} WO quá hạn của ${row.key_name}`}
                          >
                            {row.overdue_wos}
                          </td>

                          {hasCabinets && (
                            <>
                              <td className="cell-num" style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                {row.cabinet_rate}%
                              </td>
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_pending', 'employee', row.key_name)}
                                style={{ fontWeight: 700, color: (row.pending_cabinets || 0) > 0 ? 'var(--warning-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.pending_cabinets || 0} tủ THC tồn của ${row.key_name}`}
                              >
                                {row.pending_cabinets || 0}
                              </td>
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_overdue', 'employee', row.key_name)}
                                style={{ fontWeight: (row.overdue_cabinets || 0) > 0 ? 800 : 400, color: (row.overdue_cabinets || 0) > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.overdue_cabinets || 0} tủ THC quá hạn của ${row.key_name}`}
                              >
                                {row.overdue_cabinets || 0}
                              </td>
                            </>
                          )}

                          {/* WO Đóng Hôm Nay */}
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('closed_today', 'employee', row.key_name)}
                            style={{ fontWeight: 600, color: (row.closed_today || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_today || 0} WO đóng hôm nay`}
                          >
                            {(row.closed_today || 0) > 0 ? `+${row.closed_today}` : 0}
                          </td>

                          {/* WO Đóng Hôm Qua */}
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('closed_yesterday', 'employee', row.key_name)}
                            style={{ fontWeight: 600, color: (row.closed_yesterday || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_yesterday || 0} WO đóng hôm qua`}
                          >
                            {(row.closed_yesterday || 0) > 0 ? `+${row.closed_yesterday}` : 0}
                          </td>

                          {/* WO Đóng Tuần Qua */}
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('closed_week', 'employee', row.key_name)}
                            style={{ fontWeight: 600, color: (row.closed_week || 0) > 0 ? 'var(--brand-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_week || 0} WO đóng tuần qua`}
                          >
                            {(row.closed_week || 0) > 0 ? `+${row.closed_week}` : 0}
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
              <table className="excel-table" style={{ width: 'max-content', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                    <th
                      className="col-name"
                      style={{ width: '1%', textAlign: 'left', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('key_name')}
                      title="Nhấn để sắp xếp theo tên cụm viết tắt"
                    >
                      Nhóm / Cụm {renderSortIndicator('key_name')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('wo_rate')}
                      title="Nhấn để sắp xếp theo % Đóng WO"
                    >
                      % Đóng {renderSortIndicator('wo_rate')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('pending_wos')}
                      title="Nhấn để sắp xếp theo Tồn Việc"
                    >
                      Tồn Việc {renderSortIndicator('pending_wos')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('overdue_wos')}
                      title="Nhấn để sắp xếp theo Quá Hạn"
                    >
                      Quá Hạn {renderSortIndicator('overdue_wos')}
                    </th>

                    {hasCabinets && (
                      <>
                        <th
                          style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('cabinet_rate')}
                          title="Nhấn để sắp xếp theo % Tủ Xong"
                        >
                          % Tủ Xong {renderSortIndicator('cabinet_rate')}
                        </th>
                        <th
                          style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('pending_cabinets')}
                          title="Nhấn để sắp xếp theo Tủ Tồn Chưa Xong"
                        >
                          Tủ Tồn {renderSortIndicator('pending_cabinets')}
                        </th>
                        <th
                          style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('overdue_cabinets')}
                          title="Nhấn để sắp xếp theo Tủ Quá Hạn"
                        >
                          Tủ Quá Hạn {renderSortIndicator('overdue_cabinets')}
                        </th>
                      </>
                    )}

                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_today')}
                      title="Nhấn để sắp xếp theo WO đóng hôm nay"
                    >
                      Hôm nay {renderSortIndicator('closed_today')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_yesterday')}
                      title="Nhấn để sắp xếp theo WO đóng hôm qua"
                    >
                      Hôm qua {renderSortIndicator('closed_yesterday')}
                    </th>
                    <th
                      style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(2, 132, 199, 0.08)', color: 'var(--brand-primary)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('closed_week')}
                      title="Nhấn để sắp xếp theo WO đóng tuần qua"
                    >
                      Tuần qua {renderSortIndicator('closed_week')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Summary Row */}
                  <tr className="excel-summary-row">
                    <td className="col-summary-label" colSpan={2} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      TỔNG CỘNG:
                    </td>
                    <td className="cell-num" style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      {summary.wo_rate ?? 0}%
                    </td>
                    <td
                      className="cell-num cell-pending cell-clickable"
                      onClick={() => handleOpenDrilldown('pending')}
                      style={{ fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết WO Đang Tồn"
                    >
                      {summary.pending_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-overdue cell-clickable"
                      onClick={() => handleOpenDrilldown('overdue')}
                      style={{ fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết WO Quá Hạn"
                    >
                      {summary.overdue_wos ?? 0}
                    </td>

                    {hasCabinets && (
                      <>
                        <td className="cell-num" style={{ fontSize: '0.92rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {summary.cabinet_rate ?? 0}%
                        </td>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_pending')}
                          style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--warning-dark)', cursor: 'pointer' }}
                          title="Nhấn để xem chi tiết Tủ THC Còn Tồn"
                        >
                          {summary.pending_cabinets ?? 0}
                        </td>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_overdue')}
                          style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--danger-dark)', cursor: 'pointer' }}
                          title="Nhấn để xem chi tiết Tủ THC Quá Hạn"
                        >
                          {summary.overdue_cabinets ?? 0}
                        </td>
                      </>
                    )}

                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('closed_today')}
                      style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đóng Hôm Nay`}
                    >
                      +{summary.closed_today_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('closed_yesterday')}
                      style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đóng Hôm Qua`}
                    >
                      +{summary.closed_yesterday_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('closed_week')}
                      style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--brand-primary)', cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đóng Tuần Qua`}
                    >
                      +{summary.closed_week_wos ?? 0}
                    </td>
                  </tr>

                  {/* Data Rows */}
                  {sortedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={hasCabinets ? 11 : 8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        Không tìm thấy cụm nào phù hợp bộ lọc tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    sortedGroups.map((row, index) => {
                      const shortName = formatGroupName(row.key_name);
                      const isOverdue = row.overdue_wos > 0;
                      return (
                        <tr key={`grp-${row.key_name || index}`} className="excel-row">
                          <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                            {row.is_other ? '*' : index + 1}
                          </td>
                          <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px' }}>
                            <strong style={{ fontSize: '0.88rem', color: isOverdue ? 'var(--danger)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {shortName}
                            </strong>
                          </td>
                          <td className="cell-num" style={{ fontWeight: 700, color: 'var(--success-dark)' }}>
                            {row.wo_rate}%
                          </td>
                          <td
                            className="cell-num cell-pending cell-clickable"
                            onClick={() => handleOpenDrilldown('pending', 'group', row.key_name)}
                            style={{ fontWeight: 700, cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.pending_wos} WO tồn của cụm ${shortName}`}
                          >
                            {row.pending_wos}
                          </td>
                          <td
                            className="cell-num cell-overdue cell-clickable"
                            onClick={() => handleOpenDrilldown('overdue', 'group', row.key_name)}
                            style={{ fontWeight: isOverdue ? 900 : 400, cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.overdue_wos} WO quá hạn của cụm ${shortName}`}
                          >
                            {row.overdue_wos}
                          </td>

                          {hasCabinets && (
                            <>
                              <td className="cell-num" style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                {row.cabinet_rate}%
                              </td>
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_pending', 'group', row.key_name)}
                                style={{ fontWeight: 700, color: (row.pending_cabinets || 0) > 0 ? 'var(--warning-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.pending_cabinets || 0} tủ THC tồn của cụm ${shortName}`}
                              >
                                {row.pending_cabinets || 0}
                              </td>
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_overdue', 'group', row.key_name)}
                                style={{ fontWeight: (row.overdue_cabinets || 0) > 0 ? 800 : 400, color: (row.overdue_cabinets || 0) > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.overdue_cabinets || 0} tủ THC quá hạn của cụm ${shortName}`}
                              >
                                {row.overdue_cabinets || 0}
                              </td>
                            </>
                          )}

                          {/* WO Đóng Hôm Nay */}
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('closed_today', 'group', row.key_name)}
                            style={{ fontWeight: 600, color: (row.closed_today || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_today || 0} WO đóng hôm nay của cụm ${shortName}`}
                          >
                            {(row.closed_today || 0) > 0 ? `+${row.closed_today}` : 0}
                          </td>

                          {/* WO Đóng Hôm Qua */}
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('closed_yesterday', 'group', row.key_name)}
                            style={{ fontWeight: 600, color: (row.closed_yesterday || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_yesterday || 0} WO đóng hôm qua của cụm ${shortName}`}
                          >
                            {(row.closed_yesterday || 0) > 0 ? `+${row.closed_yesterday}` : 0}
                          </td>

                          {/* WO Đóng Tuần Qua */}
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('closed_week', 'group', row.key_name)}
                            style={{ fontWeight: 600, color: (row.closed_week || 0) > 0 ? 'var(--brand-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_week || 0} WO đóng tuần qua của cụm ${shortName}`}
                          >
                            {(row.closed_week || 0) > 0 ? `+${row.closed_week}` : 0}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. Drilldown Modal for CĐBR (Xem chi tiết WO và Tủ THC con) */}
      {drilldownFilter && (
        <CodinhDrilldownModal
          isOpen={Boolean(drilldownFilter)}
          onClose={() => setDrilldownFilter(null)}
          filterInfo={drilldownFilter}
          onSelectTask={handleOpenTaskDetail}
        />
      )}

      {/* 5. Full Task Detail Modal */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onNoteAdded={async (ma_cong_viec) => {
            try {
              const updated = await tasksApi.getTaskDetail(ma_cong_viec);
              setSelectedDetailTask(updated);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
