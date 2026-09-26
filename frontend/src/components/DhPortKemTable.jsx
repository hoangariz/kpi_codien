import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Search,
  Download,
  Users,
  FolderKanban,
  Filter,
} from 'lucide-react';
import { formatGroupName } from '../utils/groupFormat';
import { getUserFullName } from '../utils/userMapping';

export default function DhPortKemTable({
  statsData,
  selectedMonth,
  onMonthChange,
  onOpenDrilldown,
}) {
  const [currentTab, setCurrentTab] = useState('employee'); // 'employee' | 'group'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');

  const summary = statsData?.summary || {
    total_wos: 0,
    closed_wos: 0,
    pending_wos: 0,
    overdue_wos: 0,
    closed_today_wos: 0,
    closed_yesterday_wos: 0,
    closed_week_wos: 0,
    home_kem_count: 0,
    port_kem_count: 0,
    pending_under_24h: 0,
    pending_under_72h: 0,
    closed_within_24h: 0,
    closed_within_72h: 0,
    kpi_24h_rate: 0,
    kpi_72h_rate: 0,
  };

  const availableMonths = statsData?.available_months || [];

  // Sorting handler
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

  // Filtered & sorted Employees
  const sortedEmployees = useMemo(() => {
    if (!statsData?.by_employee) return [];
    let list = [...statsData.by_employee];

    // Filter by group
    if (selectedGroupFilter) {
      list = list.filter((e) => e.group_name === selectedGroupFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          (e.key_name && e.key_name.toLowerCase().includes(q)) ||
          getUserFullName(e.key_name).toLowerCase().includes(q) ||
          (e.group_name && e.group_name.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (sortKey) {
      list.sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];

        if (sortKey === 'key_name') {
          valA = getUserFullName(a.key_name);
          valB = getUserFullName(b.key_name);
          return sortOrder === 'asc'
            ? String(valA).localeCompare(String(valB), 'vi')
            : String(valB).localeCompare(String(valA), 'vi');
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else {
      list.sort((a, b) => (b.closed_wos || 0) - (a.closed_wos || 0) || (b.pending_wos || 0) - (a.pending_wos || 0));
    }

    return list;
  }, [statsData, selectedGroupFilter, searchQuery, sortKey, sortOrder]);

  // Filtered & sorted Groups
  const sortedGroups = useMemo(() => {
    if (!statsData?.by_group) return [];
    let list = [...statsData.by_group];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => g.key_name && g.key_name.toLowerCase().includes(q));
    }

    // Sorting
    if (sortKey) {
      list.sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];

        if (sortKey === 'key_name') {
          return sortOrder === 'asc'
            ? String(valA).localeCompare(String(valB), 'vi')
            : String(valB).localeCompare(String(valA), 'vi');
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else {
      list.sort((a, b) => (b.closed_wos || 0) - (a.closed_wos || 0) || (b.pending_wos || 0) - (a.pending_wos || 0));
    }

    return list;
  }, [statsData, searchQuery, sortKey, sortOrder]);

  // Dynamic summary for the currently active tab & filter
  const activeSummary = useMemo(() => {
    if (currentTab === 'employee' && selectedGroupFilter) {
      return sortedEmployees.reduce(
        (acc, r) => {
          acc.closed_wos += r.closed_wos || 0;
          acc.pending_wos += r.pending_wos || 0;
          acc.home_kem_count += r.home_kem_count || 0;
          acc.port_kem_count += r.port_kem_count || 0;
          acc.pending_under_24h += r.pending_under_24h || 0;
          acc.pending_under_72h += r.pending_under_72h || 0;
          acc.closed_within_24h += r.closed_within_24h || 0;
          acc.closed_within_72h += r.closed_within_72h || 0;
          acc.closed_today_wos += r.closed_today || 0;
          acc.closed_yesterday_wos += r.closed_yesterday || 0;
          acc.closed_week_wos += r.closed_week || 0;
          return acc;
        },
        {
          closed_wos: 0,
          pending_wos: 0,
          home_kem_count: 0,
          port_kem_count: 0,
          pending_under_24h: 0,
          pending_under_72h: 0,
          closed_within_24h: 0,
          closed_within_72h: 0,
          closed_today_wos: 0,
          closed_yesterday_wos: 0,
          closed_week_wos: 0,
        }
      );
    }
    return {
      closed_wos: summary.closed_wos || 0,
      pending_wos: summary.pending_wos || 0,
      home_kem_count: summary.home_kem_count || 0,
      port_kem_count: summary.port_kem_count || 0,
      pending_under_24h: summary.pending_under_24h || 0,
      pending_under_72h: summary.pending_under_72h || 0,
      closed_within_24h: summary.closed_within_24h || 0,
      closed_within_72h: summary.closed_within_72h || 0,
      closed_today_wos: summary.closed_today_wos || 0,
      closed_yesterday_wos: summary.closed_yesterday_wos || 0,
      closed_week_wos: summary.closed_week_wos || 0,
    };
  }, [currentTab, selectedGroupFilter, sortedEmployees, summary]);

  const activeKpi24h = activeSummary.closed_wos > 0
    ? ((activeSummary.closed_within_24h / activeSummary.closed_wos) * 100).toFixed(1)
    : '0.0';
  const activeKpi72h = activeSummary.closed_wos > 0
    ? ((activeSummary.closed_within_72h / activeSummary.closed_wos) * 100).toFixed(1)
    : '0.0';

  // Export to Excel (CSV with UTF-8 BOM)
  const handleExportCSV = () => {
    if (!statsData) return;
    let csvLines = [];
    const monthLabel = selectedMonth && selectedMonth !== 'all' ? `Tháng ${selectedMonth}` : 'Tất cả các tháng';
    
    if (currentTab === 'employee') {
      csvLines.push(`"BẢNG ĐIỀU HÀNH XỬ LÝ PORT KÉM THEO NHÂN VIÊN (${monthLabel})"`);
      const headers = [
        'STT',
        'Họ và tên',
        'Nhóm / Cụm',
        'Đóng',
        'Tồn',
        'Home kém',
        'Port kém',
        'Tồn 24h',
        'Tồn 72h',
        'KPI 1 ngày (% hoàn thành trong 24h)',
        'KPI 3 ngày (% hoàn thành trong 72h)',
        'Hôm nay',
        'Hôm qua',
        'Tuần qua',
      ];
      csvLines.push(headers.join(','));
      csvLines.push([
        '--',
        '"TỔNG CỘNG"',
        '--',
        activeSummary.closed_wos,
        activeSummary.pending_wos,
        activeSummary.home_kem_count,
        activeSummary.port_kem_count,
        activeSummary.pending_under_24h,
        activeSummary.pending_under_72h,
        `"${activeKpi24h}%"`,
        `"${activeKpi72h}%"`,
        activeSummary.closed_today_wos,
        activeSummary.closed_yesterday_wos,
        activeSummary.closed_week_wos,
      ].join(','));

      sortedEmployees.forEach((r, idx) => {
        csvLines.push([
          idx + 1,
          `"${getUserFullName(r.key_name)}"`,
          `"${formatGroupName(r.group_name)}"`,
          r.closed_wos,
          r.pending_wos,
          r.home_kem_count,
          r.port_kem_count,
          r.pending_under_24h,
          r.pending_under_72h,
          `"${r.kpi_24h_rate}%"`,
          `"${r.kpi_72h_rate}%"`,
          r.closed_today ?? 0,
          r.closed_yesterday ?? 0,
          r.closed_week ?? 0,
        ].join(','));
      });
    } else {
      csvLines.push(`"BẢNG ĐIỀU HÀNH XỬ LÝ PORT KÉM THEO NHÓM / CỤM (${monthLabel})"`);
      const headers = [
        'STT',
        'Nhóm / Cụm',
        'Đóng',
        'Tồn',
        'Home kém',
        'Port kém',
        'Tồn 24h',
        'Tồn 72h',
        'KPI 1 ngày (% hoàn thành trong 24h)',
        'KPI 3 ngày (% hoàn thành trong 72h)',
        'Hôm nay',
        'Hôm qua',
        'Tuần qua',
      ];
      csvLines.push(headers.join(','));
      csvLines.push([
        '--',
        '"TỔNG CỘNG"',
        activeSummary.closed_wos,
        activeSummary.pending_wos,
        activeSummary.home_kem_count,
        activeSummary.port_kem_count,
        activeSummary.pending_under_24h,
        activeSummary.pending_under_72h,
        `"${activeKpi24h}%"`,
        `"${activeKpi72h}%"`,
        activeSummary.closed_today_wos,
        activeSummary.closed_yesterday_wos,
        activeSummary.closed_week_wos,
      ].join(','));

      sortedGroups.forEach((r, idx) => {
        csvLines.push([
          idx + 1,
          `"${formatGroupName(r.key_name)}"`,
          r.closed_wos,
          r.pending_wos,
          r.home_kem_count,
          r.port_kem_count,
          r.pending_under_24h,
          r.pending_under_72h,
          `"${r.kpi_24h_rate}%"`,
          `"${r.kpi_72h_rate}%"`,
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
    link.setAttribute(
      'download',
      `Bao_cao_DH_Port_Kem_${currentTab}_${selectedMonth || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
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
      <style>{`
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
      `}</style>
      {/* 1. Quick Metric Strip (Exact same styling as THC) */}
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
        {/* Đóng */}
        <div
          onClick={() => onOpenDrilldown('closed')}
          className="cell-clickable"
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn để xem chi tiết Tổng WO Đã Đóng"
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>
            Đã Đóng
          </span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
            {summary.closed_wos ?? 0}
          </strong>
        </div>

        {/* Tồn */}
        <div
          onClick={() => onOpenDrilldown('pending')}
          className="cell-clickable"
          style={{
            background: 'rgba(245, 158, 11, 0.12)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn để xem chi tiết Tổng WO Đang Tồn"
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700 }}>
            Đang Tồn
          </span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
            {summary.pending_wos ?? 0}
          </strong>
        </div>

        {/* Home kém */}
        <div
          onClick={() => onOpenDrilldown('home_kem')}
          className="cell-clickable"
          style={{
            background: 'rgba(147, 51, 234, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO Home wifi thu kém"
        >
          <span style={{ fontSize: '0.68rem', color: '#9333ea', display: 'block', fontWeight: 700 }}>
            Home Kém
          </span>
          <strong style={{ fontSize: '1.15rem', color: '#9333ea', fontFamily: 'var(--font-mono)' }}>
            {summary.home_kem_count ?? 0}
          </strong>
        </div>

        {/* Port kém */}
        <div
          onClick={() => onOpenDrilldown('port_kem')}
          className="cell-clickable"
          style={{
            background: 'rgba(6, 182, 212, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO Port kém GPON"
        >
          <span style={{ fontSize: '0.68rem', color: '#06b6d4', display: 'block', fontWeight: 700 }}>
            Port Kém
          </span>
          <strong style={{ fontSize: '1.15rem', color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>
            {summary.port_kem_count ?? 0}
          </strong>
        </div>

        {/* Tồn 24h */}
        <div
          onClick={() => onOpenDrilldown('pending_under_24h')}
          className="cell-clickable"
          style={{
            background: 'rgba(37, 99, 235, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO Tồn dưới 24h"
        >
          <span style={{ fontSize: '0.68rem', color: '#2563eb', display: 'block', fontWeight: 700 }}>
            Tồn 24h
          </span>
          <strong style={{ fontSize: '1.15rem', color: '#2563eb', fontFamily: 'var(--font-mono)' }}>
            {summary.pending_under_24h ?? 0}
          </strong>
        </div>

        {/* Tồn 72h */}
        <div
          onClick={() => onOpenDrilldown('pending_under_72h')}
          className="cell-clickable"
          style={{
            background: 'rgba(234, 88, 12, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO Tồn dưới 72h"
        >
          <span style={{ fontSize: '0.68rem', color: '#ea580c', display: 'block', fontWeight: 700 }}>
            Tồn 72h
          </span>
          <strong style={{ fontSize: '1.15rem', color: '#ea580c', fontFamily: 'var(--font-mono)' }}>
            {summary.pending_under_72h ?? 0}
          </strong>
        </div>

        {/* KPI 1 ngày */}
        <div
          onClick={() => onOpenDrilldown('kpi_24h')}
          className="cell-clickable"
          style={{
            background: 'rgba(79, 70, 229, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title={`Nhấn xem ${summary.closed_within_24h ?? 0}/${summary.closed_wos ?? 0} WO hoàn thành trong 24h`}
        >
          <span style={{ fontSize: '0.68rem', color: '#4f46e5', display: 'block', fontWeight: 700 }}>
            KPI 1 Ngày
          </span>
          <strong style={{ fontSize: '1.15rem', color: '#4f46e5', fontFamily: 'var(--font-mono)' }}>
            {summary.kpi_24h_rate ?? 0}%
          </strong>
        </div>

        {/* KPI 3 ngày */}
        <div
          onClick={() => onOpenDrilldown('kpi_72h')}
          className="cell-clickable"
          style={{
            background: 'rgba(124, 58, 237, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title={`Nhấn xem ${summary.closed_within_72h ?? 0}/${summary.closed_wos ?? 0} WO hoàn thành trong 72h`}
        >
          <span style={{ fontSize: '0.68rem', color: '#7c3aed', display: 'block', fontWeight: 700 }}>
            KPI 3 Ngày
          </span>
          <strong style={{ fontSize: '1.15rem', color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
            {summary.kpi_72h_rate ?? 0}%
          </strong>
        </div>

        {/* Hôm nay */}
        <div
          onClick={() => onOpenDrilldown('closed_today')}
          className="cell-clickable"
          style={{
            background: 'rgba(16, 185, 129, 0.06)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO đóng hôm nay"
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>
            Hôm Nay
          </span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
            +{summary.closed_today_wos ?? 0}
          </strong>
        </div>

        {/* Hôm qua */}
        <div
          onClick={() => onOpenDrilldown('closed_yesterday')}
          className="cell-clickable"
          style={{
            background: 'rgba(16, 185, 129, 0.06)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO đóng hôm qua"
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 700 }}>
            Hôm Qua
          </span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            +{summary.closed_yesterday_wos ?? 0}
          </strong>
        </div>

        {/* Tuần qua */}
        <div
          onClick={() => onOpenDrilldown('closed_week')}
          className="cell-clickable"
          style={{
            background: 'rgba(2, 132, 199, 0.08)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
          title="Nhấn xem chi tiết WO đóng tuần qua"
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--brand-primary)', display: 'block', fontWeight: 700 }}>
            Tuần Qua
          </span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
            +{summary.closed_week_wos ?? 0}
          </strong>
        </div>
      </div>

      {/* 2. Toolbar: Tabs, Month Select, Search, Export */}
      <div className="table-toolbar" style={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${currentTab === 'employee' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setCurrentTab('employee');
              setSortKey(null);
            }}
            style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
          >
            <Users size={14} />
            Theo Nhân Viên ({sortedEmployees.length})
          </button>

          <button
            className={`btn ${currentTab === 'group' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setCurrentTab('group');
              setSortKey(null);
            }}
            style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
          >
            <FolderKanban size={14} />
            Theo Nhóm / Cụm ({sortedGroups.length})
          </button>

          {/* Month Selector */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginLeft: '8px',
              paddingLeft: '10px',
              borderLeft: '1px solid var(--border-color)',
            }}
          >
            <Calendar size={14} style={{ color: 'var(--brand-primary)' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Tháng:</span>
            <select
              value={selectedMonth || 'all'}
              onChange={(e) => onMonthChange && onMonthChange(e.target.value)}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">📅 Tất cả các tháng</option>
              {availableMonths.map((m) => {
                const parts = m.split('-');
                const label = parts.length === 2 ? `Tháng ${parts[1]}/${parts[0]}` : m;
                return (
                  <option key={m} value={m}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
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

      {/* 3. Quick Cluster / Group Filter Pills for Employee Tab (EXACTLY LIKE THC) */}
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

      {/* 4. Table Scroll Wrapper & Content (Exact same styling as THC) */}
      <div
        className="excel-table-scroll-wrapper"
        style={{
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-color)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table className="excel-table" style={{ width: 'max-content', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>
                STT
              </th>

              {currentTab === 'employee' ? (
                <>
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
                </>
              ) : (
                <th
                  className="col-name"
                  style={{ width: '1%', textAlign: 'left', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('key_name')}
                  title="Nhấn để sắp xếp theo nhóm / cụm"
                >
                  Nhóm / Cụm {renderSortIndicator('key_name')}
                </th>
              )}

              {/* Đóng */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('closed_wos')}
                title="Nhấn để sắp xếp theo Đóng"
              >
                Đóng {renderSortIndicator('closed_wos')}
              </th>

              {/* Tồn */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('pending_wos')}
                title="Nhấn để sắp xếp theo Tồn"
              >
                Tồn {renderSortIndicator('pending_wos')}
              </th>

              {/* Home kém */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(147, 51, 234, 0.08)', color: '#9333ea', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('home_kem_count')}
                title="Nhấn để sắp xếp theo Home kém (Home wifi thu kém)"
              >
                Home kém {renderSortIndicator('home_kem_count')}
              </th>

              {/* Port kém */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(6, 182, 212, 0.08)', color: '#06b6d4', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('port_kem_count')}
                title="Nhấn để sắp xếp theo Port kém (Port kém GPON)"
              >
                Port kém {renderSortIndicator('port_kem_count')}
              </th>

              {/* Tồn 24h */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('pending_under_24h')}
                title="Nhấn để sắp xếp theo Tồn 24h"
              >
                Tồn 24h {renderSortIndicator('pending_under_24h')}
              </th>

              {/* Tồn 72h */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(234, 88, 12, 0.08)', color: '#ea580c', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('pending_under_72h')}
                title="Nhấn để sắp xếp theo Tồn 72h"
              >
                Tồn 72h {renderSortIndicator('pending_under_72h')}
              </th>

              {/* KPI 1 ngày (% hoàn thành trong 24h) */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(79, 70, 229, 0.08)', color: '#4f46e5', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('kpi_24h_rate')}
                title="Tỷ lệ hoàn thành trong 24h = (WO đóng <= 24h / Tổng đóng) * 100%"
              >
                KPI 1 ngày {renderSortIndicator('kpi_24h_rate')}
              </th>

              {/* KPI 3 ngày (% hoàn thành trong 72h) */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(124, 58, 237, 0.08)', color: '#7c3aed', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('kpi_72h_rate')}
                title="Tỷ lệ hoàn thành trong 72h = (WO đóng <= 72h / Tổng đóng) * 100%"
              >
                KPI 3 ngày {renderSortIndicator('kpi_72h_rate')}
              </th>

              {/* Hôm nay */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('closed_today')}
                title="Nhấn để sắp xếp theo WO đóng hôm nay"
              >
                Hôm nay {renderSortIndicator('closed_today')}
              </th>

              {/* Hôm qua */}
              <th
                style={{ width: '1%', whiteSpace: 'nowrap', padding: '5px 8px', background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort('closed_yesterday')}
                title="Nhấn để sắp xếp theo WO đóng hôm qua"
              >
                Hôm qua {renderSortIndicator('closed_yesterday')}
              </th>

              {/* Tuần qua */}
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
              <td
                className="col-summary-label"
                colSpan={currentTab === 'employee' ? 3 : 2}
                style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', whiteSpace: 'nowrap', fontWeight: 800 }}
              >
                {selectedGroupFilter ? `Tổng (${formatGroupName(selectedGroupFilter)}):` : 'Tổng:'}
              </td>

              {/* Đóng */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('closed', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết tổng WO Đóng"
              >
                {activeSummary.closed_wos}
              </td>

              {/* Tồn */}
              <td
                className="cell-num cell-pending cell-clickable"
                onClick={() => onOpenDrilldown('pending', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' }}
                title="Nhấn để xem chi tiết tổng WO Tồn"
              >
                {activeSummary.pending_wos}
              </td>

              {/* Home kém */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('home_kem', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: '#9333ea', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết tổng WO Home wifi thu kém"
              >
                {activeSummary.home_kem_count}
              </td>

              {/* Port kém */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('port_kem', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: '#06b6d4', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết tổng WO Port kém GPON"
              >
                {activeSummary.port_kem_count}
              </td>

              {/* Tồn 24h */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('pending_under_24h', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: '#2563eb', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết tổng WO Tồn 24h"
              >
                {activeSummary.pending_under_24h}
              </td>

              {/* Tồn 72h */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('pending_under_72h', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ea580c', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết tổng WO Tồn 72h"
              >
                {activeSummary.pending_under_72h}
              </td>

              {/* KPI 1 ngày */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('kpi_24h', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: '#4f46e5', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết các WO đạt KPI 1 ngày (hoàn thành trong 24h)"
              >
                {activeKpi24h}%
              </td>

              {/* KPI 3 ngày */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('kpi_72h', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.95rem', fontWeight: 800, color: '#7c3aed', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết các WO đạt KPI 3 ngày (hoàn thành trong 72h)"
              >
                {activeKpi72h}%
              </td>

              {/* Hôm nay */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('closed_today', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết WO đóng hôm nay"
              >
                +{activeSummary.closed_today_wos}
              </td>

              {/* Hôm qua */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('closed_yesterday', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--success-dark)', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết WO đóng hôm qua"
              >
                +{activeSummary.closed_yesterday_wos}
              </td>

              {/* Tuần qua */}
              <td
                className="cell-num cell-clickable"
                onClick={() => onOpenDrilldown('closed_week', selectedGroupFilter ? 'group' : null, selectedGroupFilter || null)}
                style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--brand-primary)', cursor: 'pointer' }}
                title="Nhấn để xem chi tiết WO đóng tuần qua"
              >
                +{activeSummary.closed_week_wos}
              </td>
            </tr>

            {/* Rows list */}
            {currentTab === 'employee' ? (
              sortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    Không tìm thấy nhân viên nào phù hợp bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                sortedEmployees.map((row, index) => {
                  const fullName = getUserFullName(row.key_name);
                  return (
                    <tr key={`emp-${row.key_name || index}`} className="excel-row">
                      <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                        {index + 1}
                      </td>
                      <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px' }}>
                        <strong
                          style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}
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

                      {/* Đóng */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('closed', 'employee', row.key_name)}
                        style={{ fontWeight: 700, color: 'var(--success-dark)', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.closed_wos} WO đóng của ${fullName}`}
                      >
                        {row.closed_wos}
                      </td>

                      {/* Tồn */}
                      <td
                        className="cell-num cell-pending cell-clickable"
                        onClick={() => onOpenDrilldown('pending', 'employee', row.key_name)}
                        style={{ fontWeight: 700, cursor: 'pointer' }}
                        title={`Nhấn xem ${row.pending_wos} WO tồn của ${fullName}`}
                      >
                        {row.pending_wos}
                      </td>

                      {/* Home kém */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('home_kem', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: '#9333ea', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.home_kem_count} WO Home wifi thu kém của ${fullName}`}
                      >
                        {row.home_kem_count}
                      </td>

                      {/* Port kém */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('port_kem', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: '#06b6d4', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.port_kem_count} WO Port kém GPON của ${fullName}`}
                      >
                        {row.port_kem_count}
                      </td>

                      {/* Tồn 24h */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('pending_under_24h', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.pending_under_24h} WO tồn 24h của ${fullName}`}
                      >
                        {row.pending_under_24h}
                      </td>

                      {/* Tồn 72h */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('pending_under_72h', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: '#ea580c', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.pending_under_72h} WO tồn 72h của ${fullName}`}
                      >
                        {row.pending_under_72h}
                      </td>

                      {/* KPI 1 ngày */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('kpi_24h', 'employee', row.key_name)}
                        style={{
                          fontWeight: 700,
                          color: row.kpi_24h_rate >= 90 ? 'var(--success-dark)' : row.kpi_24h_rate >= 70 ? '#4f46e5' : '#e11d48',
                          cursor: 'pointer'
                        }}
                        title={`Nhấn xem ${row.closed_within_24h}/${row.closed_wos} WO đạt KPI 1 ngày (<= 24h) của ${fullName}`}
                      >
                        {row.kpi_24h_rate}%
                      </td>

                      {/* KPI 3 ngày */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('kpi_72h', 'employee', row.key_name)}
                        style={{
                          fontWeight: 700,
                          color: row.kpi_72h_rate >= 95 ? 'var(--success-dark)' : row.kpi_72h_rate >= 80 ? '#7c3aed' : '#e11d48',
                          cursor: 'pointer'
                        }}
                        title={`Nhấn xem ${row.closed_within_72h}/${row.closed_wos} WO đạt KPI 3 ngày (<= 72h) của ${fullName}`}
                      >
                        {row.kpi_72h_rate}%
                      </td>

                      {/* Hôm nay */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('closed_today', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: (row.closed_today || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.closed_today || 0} WO đóng hôm nay của ${fullName}`}
                      >
                        {(row.closed_today || 0) > 0 ? `+${row.closed_today}` : 0}
                      </td>

                      {/* Hôm qua */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('closed_yesterday', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: (row.closed_yesterday || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.closed_yesterday || 0} WO đóng hôm qua của ${fullName}`}
                      >
                        {(row.closed_yesterday || 0) > 0 ? `+${row.closed_yesterday}` : 0}
                      </td>

                      {/* Tuần qua */}
                      <td
                        className="cell-num cell-clickable"
                        onClick={() => onOpenDrilldown('closed_week', 'employee', row.key_name)}
                        style={{ fontWeight: 600, color: (row.closed_week || 0) > 0 ? 'var(--brand-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                        title={`Nhấn xem ${row.closed_week || 0} WO đóng tuần qua của ${fullName}`}
                      >
                        {(row.closed_week || 0) > 0 ? `+${row.closed_week}` : 0}
                      </td>
                    </tr>
                  );
                })
              )
            ) : sortedGroups.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Không tìm thấy nhóm / cụm nào phù hợp bộ lọc tìm kiếm.
                </td>
              </tr>
            ) : (
              sortedGroups.map((row, index) => (
                <tr key={`grp-${row.key_name || index}`} className="excel-row">
                  <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                    {index + 1}
                  </td>
                  <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px' }}>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {formatGroupName(row.key_name)}
                    </strong>
                  </td>

                  {/* Đóng */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('closed', 'group', row.key_name)}
                    style={{ fontWeight: 700, color: 'var(--success-dark)', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.closed_wos} WO đóng của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.closed_wos}
                  </td>

                  {/* Tồn */}
                  <td
                    className="cell-num cell-pending cell-clickable"
                    onClick={() => onOpenDrilldown('pending', 'group', row.key_name)}
                    style={{ fontWeight: 700, cursor: 'pointer' }}
                    title={`Nhấn xem ${row.pending_wos} WO tồn của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.pending_wos}
                  </td>

                  {/* Home kém */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('home_kem', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: '#9333ea', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.home_kem_count} WO Home wifi thu kém của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.home_kem_count}
                  </td>

                  {/* Port kém */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('port_kem', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: '#06b6d4', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.port_kem_count} WO Port kém GPON của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.port_kem_count}
                  </td>

                  {/* Tồn 24h */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('pending_under_24h', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.pending_under_24h} WO tồn 24h của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.pending_under_24h}
                  </td>

                  {/* Tồn 72h */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('pending_under_72h', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: '#ea580c', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.pending_under_72h} WO tồn 72h của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.pending_under_72h}
                  </td>

                  {/* KPI 1 ngày */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('kpi_24h', 'group', row.key_name)}
                    style={{
                      fontWeight: 700,
                      color: row.kpi_24h_rate >= 90 ? 'var(--success-dark)' : row.kpi_24h_rate >= 70 ? '#4f46e5' : '#e11d48',
                      cursor: 'pointer'
                    }}
                    title={`Nhấn xem ${row.closed_within_24h}/${row.closed_wos} WO đạt KPI 1 ngày (<= 24h) của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.kpi_24h_rate}%
                  </td>

                  {/* KPI 3 ngày */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('kpi_72h', 'group', row.key_name)}
                    style={{
                      fontWeight: 700,
                      color: row.kpi_72h_rate >= 95 ? 'var(--success-dark)' : row.kpi_72h_rate >= 80 ? '#7c3aed' : '#e11d48',
                      cursor: 'pointer'
                    }}
                    title={`Nhấn xem ${row.closed_within_72h}/${row.closed_wos} WO đạt KPI 3 ngày (<= 72h) của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {row.kpi_72h_rate}%
                  </td>

                  {/* Hôm nay */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('closed_today', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: (row.closed_today || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.closed_today || 0} WO đóng hôm nay của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {(row.closed_today || 0) > 0 ? `+${row.closed_today}` : 0}
                  </td>

                  {/* Hôm qua */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('closed_yesterday', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: (row.closed_yesterday || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.closed_yesterday || 0} WO đóng hôm qua của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {(row.closed_yesterday || 0) > 0 ? `+${row.closed_yesterday}` : 0}
                  </td>

                  {/* Tuần qua */}
                  <td
                    className="cell-num cell-clickable"
                    onClick={() => onOpenDrilldown('closed_week', 'group', row.key_name)}
                    style={{ fontWeight: 600, color: (row.closed_week || 0) > 0 ? 'var(--brand-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
                    title={`Nhấn xem ${row.closed_week || 0} WO đóng tuần qua của cụm ${formatGroupName(row.key_name)}`}
                  >
                    {(row.closed_week || 0) > 0 ? `+${row.closed_week}` : 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
