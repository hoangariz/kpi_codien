import React, { useState, useMemo, useEffect } from 'react';
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
import CodinhDrilldownModal from '../components/CodinhDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';

export default function CodinhPage() {
  // Active view tab: 'employee' | 'group'
  const [currentTab, setCurrentTab] = useState('employee');

  // Filter & Search states
  const [selectedCatId, setSelectedCatId] = useState(null);
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
    wo_rate: 0,
    total_cabinets: 0,
    completed_cabinets: 0,
    pending_cabinets: 0,
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
        wo_rate: grp.wo_rate,
        total_cabinets: grp.total_cabinets || 0,
        completed_cabinets: grp.completed_cabinets || 0,
        pending_cabinets: grp.pending_cabinets || 0,
        cabinet_rate: grp.cabinet_rate || 0,
        has_cabinets: hasCabinets,
      };
    }
    return summary;
  }, [selectedGroupFilter, statsData, summary, hasCabinets]);

  // Drilldown handler
  const handleOpenDrilldown = (metric, filterType = null, targetName = null) => {
    setDrilldownFilter({
      categoryId: effectiveCatId,
      categoryName: activeCategory?.name,
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
        const mName = (emp.key_name || '').toLowerCase().includes(q);
        const mGrp = (emp.group_name || '').toLowerCase().includes(q);
        const mShort = formatGroupName(emp.group_name || '').toLowerCase().includes(q);
        if (!mName && !mGrp && !mShort) return false;
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

  // Export CSV
  const handleExportCSV = () => {
    if (!statsData) return;
    let csvLines = [];
    if (currentTab === 'employee') {
      csvLines.push(`BẢNG THỐNG KÊ ${activeCategory?.name || 'CĐBR'} THEO NHÂN VIÊN`);
      const headers = ['STT', 'Nhân viên', 'Nhóm / Cụm', 'Tổng WO', 'Đã Đóng', '% Đóng', 'Tồn Việc', 'Quá Hạn'];
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
    } else {
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
          onClick={() => refetchStats()}
          className="btn btn-outline"
          style={{ fontSize: '0.82rem', padding: '6px 14px', gap: '6px' }}
          title="Tải lại số liệu mới nhất"
        >
          <RotateCcw size={14} /> Làm mới
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
                    minHeight: '145px',
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
              title="Nhấn để xem chi tiết WO Đóng Hôm Nay"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Nay</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{summary.closed_today_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => handleOpenDrilldown('closed_yesterday')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đóng Hôm Qua"
            >
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
                  title="Nhấn để xem chi tiết Tủ THC Chưa Xong"
                >
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
              <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                    <th
                      className="col-name"
                      style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('key_name')}
                      title="Nhấn để sắp xếp theo tên nhân viên"
                    >
                      Nhân viên {renderSortIndicator('key_name')}
                    </th>
                    <th
                      style={{ minWidth: '95px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('group_name')}
                      title="Nhấn để sắp xếp theo cụm"
                    >
                      Nhóm / Cụm {renderSortIndicator('group_name')}
                    </th>
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
                  </tr>
                </thead>
                <tbody>
                  {/* Excel Summary Row on TOP */}
                  <tr className="excel-summary-row">
                    <td className="col-summary-label" colSpan={3} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', width: '1%', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      {selectedGroupFilter ? `TỔNG (${formatGroupName(selectedGroupFilter)}):` : 'TỔNG CỘNG:'}
                    </td>
                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('total', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ width: '75px', fontSize: '0.98rem', color: 'var(--brand-primary)', fontWeight: 800, cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết Tổng WO ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                    >
                      {activeEmpSummary.total_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-closed cell-clickable"
                      onClick={() => handleOpenDrilldown('closed', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ width: '75px', fontSize: '0.98rem', fontWeight: 800, cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đã Đóng ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                    >
                      {activeEmpSummary.closed_wos ?? 0}
                    </td>
                    <td className="cell-num" style={{ width: '75px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      {activeEmpSummary.wo_rate ?? 0}%
                    </td>
                    <td
                      className="cell-num cell-pending cell-clickable"
                      onClick={() => handleOpenDrilldown('pending', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ width: '75px', fontSize: '0.98rem', fontWeight: 800, cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Đang Tồn ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                    >
                      {activeEmpSummary.pending_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-overdue cell-clickable"
                      onClick={() => handleOpenDrilldown('overdue', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                      style={{ width: '75px', fontSize: '0.98rem', fontWeight: 800, cursor: 'pointer' }}
                      title={`Nhấn để xem chi tiết WO Quá Hạn ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                    >
                      {activeEmpSummary.overdue_wos ?? 0}
                    </td>

                    {hasCabinets && (
                      <>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_total', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                          style={{ width: '85px', fontSize: '0.98rem', fontWeight: 800, color: '#8b5cf6', cursor: 'pointer' }}
                          title={`Nhấn để xem chi tiết Tổng Tủ THC ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                        >
                          {activeEmpSummary.total_cabinets ?? 0}
                        </td>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_completed', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                          style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                          title={`Nhấn để xem chi tiết Tủ THC Đã Xong ${selectedGroupFilter ? `cụm ${formatGroupName(selectedGroupFilter)}` : ''}`}
                        >
                          {activeEmpSummary.completed_cabinets ?? 0}
                        </td>
                        <td className="cell-num" style={{ width: '80px', fontSize: '0.95rem', fontWeight: 800, color: '#8b5cf6' }}>
                          {activeEmpSummary.cabinet_rate ?? 0}%
                        </td>
                      </>
                    )}

                    <td>
                      <div className="progress-bar-container" style={{ width: '100px' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min(hasCabinets ? activeEmpSummary.cabinet_rate : activeEmpSummary.wo_rate, 100)}%`,
                            background: hasCabinets ? '#8b5cf6' : 'var(--brand-primary)',
                          }}
                        />
                      </div>
                    </td>
                  </tr>

                  {/* Data Rows */}
                  {sortedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={hasCabinets ? 11 : 8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        Không tìm thấy nhân viên nào phù hợp bộ lọc tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    sortedEmployees.map((row, index) => {
                      const isOverdue = row.overdue_wos > 0;
                      return (
                        <tr key={`emp-${row.key_name || index}`} className="excel-row">
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
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('total', 'employee', row.key_name)}
                            style={{ fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.total_wos} WO của ${row.key_name}`}
                          >
                            {row.total_wos}
                          </td>
                          <td
                            className="cell-num cell-closed cell-clickable"
                            onClick={() => handleOpenDrilldown('closed', 'employee', row.key_name)}
                            style={{ fontWeight: 700, cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_wos} WO đã đóng của ${row.key_name}`}
                          >
                            {row.closed_wos}
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
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_total', 'employee', row.key_name)}
                                style={{ fontWeight: 700, color: '#8b5cf6', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.total_cabinets} tủ THC của ${row.key_name}`}
                              >
                                {row.total_cabinets}
                              </td>
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_completed', 'employee', row.key_name)}
                                style={{ fontWeight: 700, color: 'var(--success-dark)', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.completed_cabinets} tủ THC đã xong của ${row.key_name}`}
                              >
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
                      title="Nhấn để sắp xếp theo tên cụm viết tắt"
                    >
                      Nhóm / Cụm {renderSortIndicator('key_name')}
                    </th>
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
                    <td className="col-summary-label" colSpan={2} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', width: '1%', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      TỔNG CỘNG:
                    </td>
                    <td
                      className="cell-num cell-clickable"
                      onClick={() => handleOpenDrilldown('total')}
                      style={{ width: '80px', fontSize: '0.98rem', color: 'var(--brand-primary)', fontWeight: 800, cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết Tổng WO"
                    >
                      {summary.total_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-closed cell-clickable"
                      onClick={() => handleOpenDrilldown('closed')}
                      style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800, cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết WO Đã Đóng"
                    >
                      {summary.closed_wos ?? 0}
                    </td>
                    <td className="cell-num" style={{ width: '75px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      {summary.wo_rate ?? 0}%
                    </td>
                    <td
                      className="cell-num cell-pending cell-clickable"
                      onClick={() => handleOpenDrilldown('pending')}
                      style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800, cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết WO Đang Tồn"
                    >
                      {summary.pending_wos ?? 0}
                    </td>
                    <td
                      className="cell-num cell-overdue cell-clickable"
                      onClick={() => handleOpenDrilldown('overdue')}
                      style={{ width: '80px', fontSize: '0.98rem', fontWeight: 800, cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết WO Quá Hạn"
                    >
                      {summary.overdue_wos ?? 0}
                    </td>

                    {hasCabinets && (
                      <>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_total')}
                          style={{ width: '90px', fontSize: '0.98rem', fontWeight: 800, color: '#8b5cf6', cursor: 'pointer' }}
                          title="Nhấn để xem chi tiết Tổng Tủ THC"
                        >
                          {summary.total_cabinets ?? 0}
                        </td>
                        <td
                          className="cell-num cell-clickable"
                          onClick={() => handleOpenDrilldown('cabinet_completed')}
                          style={{ width: '85px', fontSize: '0.98rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                          title="Nhấn để xem chi tiết Tủ THC Đã Xong"
                        >
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
                          <td
                            className="cell-num cell-clickable"
                            onClick={() => handleOpenDrilldown('total', 'group', row.key_name)}
                            style={{ fontWeight: 700, color: 'var(--brand-primary)', cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.total_wos} WO của cụm ${shortName}`}
                          >
                            {row.total_wos}
                          </td>
                          <td
                            className="cell-num cell-closed cell-clickable"
                            onClick={() => handleOpenDrilldown('closed', 'group', row.key_name)}
                            style={{ fontWeight: 700, cursor: 'pointer' }}
                            title={`Nhấn để xem chi tiết ${row.closed_wos} WO đã đóng của cụm ${shortName}`}
                          >
                            {row.closed_wos}
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
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_total', 'group', row.key_name)}
                                style={{ fontWeight: 700, color: '#8b5cf6', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.total_cabinets} tủ THC của cụm ${shortName}`}
                              >
                                {row.total_cabinets}
                              </td>
                              <td
                                className="cell-num cell-clickable"
                                onClick={() => handleOpenDrilldown('cabinet_completed', 'group', row.key_name)}
                                style={{ fontWeight: 700, color: 'var(--success-dark)', cursor: 'pointer' }}
                                title={`Nhấn để xem chi tiết ${row.completed_cabinets} tủ THC đã xong của cụm ${shortName}`}
                              >
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
