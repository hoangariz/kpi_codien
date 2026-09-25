import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FolderKanban, 
  Search, 
  Download, 
  Layers, 
  Tag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar
} from 'lucide-react';
import { formatGroupName } from '../utils/groupFormat';

/**
 * Reusable Large Excel Spreadsheet Table Component
 * Supports Parent table and Sub-category Child tables
 * Tabs: 'employee' (Nhân viên), 'group' (Nhóm/Cụm), 'daily' (Theo Ngày & NSLĐ)
 */
export default function MaintenanceSpreadsheetTable({
  title,
  subtitle,
  badgeText = 'BẢNG THỐNG KÊ',
  badgeType = 'badge-info',
  isChild = false,
  keyword = null,
  isOther = false,
  summary = {},
  byEmployee = [],
  byGroup = [],
  activeTab = 'employee',
  onTabChange,
  onDrilldown,
  subCategoryContext = null,
  exportFilename = 'Bao_cao_co_dien',
  defaultExpanded = true,
  themeColor = 'var(--brand-primary)',
}) {
  const [localActiveTab, setLocalActiveTab] = useState(activeTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc');

  // States for 'daily' tab
  const [dailySubView, setDailySubView] = useState('all'); // 'all' | 'group' | 'employee'
  const [dailyGroupSortKey, setDailyGroupSortKey] = useState('nsld');
  const [dailyGroupSortOrder, setDailyGroupSortOrder] = useState('desc');
  const [dailyEmpSortKey, setDailyEmpSortKey] = useState('nsld');
  const [dailyEmpSortOrder, setDailyEmpSortOrder] = useState('desc');

  const currentTab = onTabChange ? activeTab : localActiveTab;

  useEffect(() => {
    setSearchQuery('');
    setSortKey(null);
  }, [currentTab]);

  const handleTabSelect = (tab) => {
    setSearchQuery('');
    setSortKey(null);
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setLocalActiveTab(tab);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
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
      <span style={{ color: themeColor, fontWeight: 800, fontSize: '0.78rem', marginLeft: '4px' }}>
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Days list calculation for daily stats: Always full 1 to 31
  const maxDay = summary?.max_day || 20;
  const daysList = (summary?.days_list && summary.days_list.length >= 31) 
    ? summary.days_list 
    : Array.from({ length: 31 }, (_, i) => i + 1);

  const getRowClosedSum = (row) => {
    if (row.closed_up_to_max_day != null) return row.closed_up_to_max_day;
    if (row.daily_closed) {
      return Object.values(row.daily_closed).reduce((a, b) => a + Number(b || 0), 0);
    }
    return row.closed || 0;
  };

  const getRowNsld = (row) => {
    if (row.nsld != null && row.nsld > 0) return Number(row.nsld);
    const sumC = getRowClosedSum(row);
    return maxDay > 0 ? Math.round((sumC / maxDay) * 100) / 100 : 0;
  };

  // Sorting handlers for Daily tables
  const handleDailyGroupSort = (key) => {
    if (dailyGroupSortKey === key) {
      setDailyGroupSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDailyGroupSortKey(key);
      setDailyGroupSortOrder(key === 'key_name' ? 'asc' : 'desc');
    }
  };

  const handleDailyEmpSort = (key) => {
    if (dailyEmpSortKey === key) {
      setDailyEmpSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDailyEmpSortKey(key);
      setDailyEmpSortOrder(key === 'key_name' || key === 'group_name' ? 'asc' : 'desc');
    }
  };

  const renderDailySortIndicator = (key, currentSortKey, currentSortOrder) => {
    if (currentSortKey !== key) {
      return <span style={{ opacity: 0.35, fontSize: '0.72rem', marginLeft: '4px' }}>↕</span>;
    }
    return (
      <span style={{ color: themeColor, fontWeight: 800, fontSize: '0.78rem', marginLeft: '4px' }}>
        {currentSortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Standard employee/group tab filter & sort
  const currentList = currentTab === 'employee' ? byEmployee : byGroup;
  const filteredList = currentList.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const raw = (item.key_name || '').toLowerCase();
    const short = currentTab === 'group' ? formatGroupName(item.key_name).toLowerCase() : '';
    return raw.includes(q) || short.includes(q);
  });

  const sortedList = [...filteredList].sort((a, b) => {
    if (a.is_other) return 1;
    if (b.is_other) return -1;
    if (!sortKey) return 0;
    let cmp = 0;
    if (sortKey === 'key_name') {
      const nameA = currentTab === 'group' ? formatGroupName(a.key_name) : (a.key_name || '');
      const nameB = currentTab === 'group' ? formatGroupName(b.key_name) : (b.key_name || '');
      cmp = nameA.localeCompare(nameB, 'vi');
    } else {
      const valA = Number(a[sortKey] ?? 0);
      const valB = Number(b[sortKey] ?? 0);
      cmp = valA - valB;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Filtered & sorted for Daily Groups
  const filteredDailyGroups = byGroup.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const raw = (item.key_name || '').toLowerCase();
    const short = formatGroupName(item.key_name).toLowerCase();
    return raw.includes(q) || short.includes(q);
  });

  const sortedDailyGroups = [...filteredDailyGroups].sort((a, b) => {
    if (a.is_other) return 1;
    if (b.is_other) return -1;
    let cmp = 0;
    if (dailyGroupSortKey === 'key_name') {
      cmp = formatGroupName(a.key_name).localeCompare(formatGroupName(b.key_name), 'vi');
    } else if (dailyGroupSortKey === 'nsld') {
      cmp = getRowNsld(a) - getRowNsld(b);
    } else if (dailyGroupSortKey === 'total_closed') {
      cmp = getRowClosedSum(a) - getRowClosedSum(b);
    } else if (dailyGroupSortKey.startsWith('day_')) {
      const d = dailyGroupSortKey.replace('day_', '');
      cmp = (a.daily_closed?.[d] || 0) - (b.daily_closed?.[d] || 0);
    } else {
      cmp = Number(a[dailyGroupSortKey] ?? 0) - Number(b[dailyGroupSortKey] ?? 0);
    }
    return dailyGroupSortOrder === 'asc' ? cmp : -cmp;
  });

  // Filtered & sorted for Daily Employees
  const filteredDailyEmployees = byEmployee.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const raw = (item.key_name || '').toLowerCase();
    const grp = (item.group_name || '').toLowerCase();
    const grpShort = formatGroupName(item.group_name || '').toLowerCase();
    return raw.includes(q) || grp.includes(q) || grpShort.includes(q);
  });

  const sortedDailyEmployees = [...filteredDailyEmployees].sort((a, b) => {
    if (a.is_other) return 1;
    if (b.is_other) return -1;
    let cmp = 0;
    if (dailyEmpSortKey === 'key_name') {
      cmp = (a.key_name || '').localeCompare(b.key_name || '', 'vi');
    } else if (dailyEmpSortKey === 'group_name') {
      cmp = formatGroupName(a.group_name || '').localeCompare(formatGroupName(b.group_name || ''), 'vi');
    } else if (dailyEmpSortKey === 'nsld') {
      cmp = getRowNsld(a) - getRowNsld(b);
    } else if (dailyEmpSortKey === 'total_closed') {
      cmp = getRowClosedSum(a) - getRowClosedSum(b);
    } else if (dailyEmpSortKey.startsWith('day_')) {
      const d = dailyEmpSortKey.replace('day_', '');
      cmp = (a.daily_closed?.[d] || 0) - (b.daily_closed?.[d] || 0);
    } else {
      cmp = Number(a[dailyEmpSortKey] ?? 0) - Number(b[dailyEmpSortKey] ?? 0);
    }
    return dailyEmpSortOrder === 'asc' ? cmp : -cmp;
  });

  // Summary numbers for daily
  const summaryClosedUpToMax = summary.closed_up_to_max_day ?? (
    summary.daily_closed ? Object.values(summary.daily_closed).reduce((a, b) => a + Number(b || 0), 0) : summary.closed ?? 0
  );
  const summaryNsld = summary.nsld != null && summary.nsld > 0 ? Number(summary.nsld) : (
    maxDay > 0 ? Math.round((summaryClosedUpToMax / maxDay) * 100) / 100 : 0
  );

  const handleExportCSV = () => {
    // 1. Daily Tab Export
    if (currentTab === 'daily') {
      let csvLines = [];
      const dayHeaders = daysList.map(d => `Ngày ${d}`);

      if (dailySubView === 'all' || dailySubView === 'group') {
        csvLines.push(`BẢNG TIẾN ĐỘ ĐÓNG WO & NSLĐ THEO NHÓM / CỤM (NGÀY 1 ĐẾN 31)`);
        const grpHeaders = ['STT', 'Nhóm / Cụm', 'NSLĐ (TB/ngày)', `Tổng Đóng (1->${maxDay})`, ...dayHeaders];
        csvLines.push(grpHeaders.join(','));
        csvLines.push([
          '--',
          '"TỔNG CỘNG"',
          summaryNsld.toFixed(2),
          summaryClosedUpToMax,
          ...daysList.map(d => summary.daily_closed?.[d] ?? summary.daily_closed?.[String(d)] ?? 0)
        ].join(','));
        sortedDailyGroups.forEach((r, idx) => {
          csvLines.push([
            idx + 1,
            `"${formatGroupName(r.key_name)}"`,
            getRowNsld(r).toFixed(2),
            getRowClosedSum(r),
            ...daysList.map(d => r.daily_closed?.[d] ?? r.daily_closed?.[String(d)] ?? 0)
          ].join(','));
        });
        csvLines.push('');
      }

      if (dailySubView === 'all' || dailySubView === 'employee') {
        csvLines.push(`BẢNG TIẾN ĐỘ ĐÓNG WO & NSLĐ THEO NHÂN VIÊN (NGÀY 1 ĐẾN 31)`);
        const empHeaders = ['STT', 'Nhân viên', 'NSLĐ (TB/ngày)', `Tổng Đóng (1->${maxDay})`, ...dayHeaders];
        csvLines.push(empHeaders.join(','));
        csvLines.push([
          '--',
          '"TỔNG CỘNG"',
          summaryNsld.toFixed(2),
          summaryClosedUpToMax,
          ...daysList.map(d => summary.daily_closed?.[d] ?? summary.daily_closed?.[String(d)] ?? 0)
        ].join(','));
        sortedDailyEmployees.forEach((r, idx) => {
          csvLines.push([
            idx + 1,
            `"${r.key_name}"`,
            getRowNsld(r).toFixed(2),
            getRowClosedSum(r),
            ...daysList.map(d => r.daily_closed?.[d] ?? r.daily_closed?.[String(d)] ?? 0)
          ].join(','));
        });
      }

      const csvContent = '\uFEFF' + csvLines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${exportFilename}_theo_ngay_nsld.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 2. Standard Employee / Group Export
    const headers = [
      'STT',
      currentTab === 'employee' ? 'Nhân viên' : 'Nhóm Điều Phối (Cụm)',
      'Tổng Số',
      'Đã Đóng',
      '% Đóng',
      'Tồn Việc',
      'Quá Hạn',
      'Đóng Hôm Nay',
      'Đóng Hôm Qua',
      'Đóng Tuần Qua',
      'Tiến Độ (%)'
    ];

    const rows = sortedList.map((row, idx) => [
      idx + 1,
      currentTab === 'group' ? `"${formatGroupName(row.key_name)}"` : `"${row.key_name}"`,
      row.total,
      row.closed,
      `${row.completion_rate}%`,
      row.pending,
      row.overdue,
      row.closed_today || 0,
      row.closed_yesterday || 0,
      row.closed_last_7_days || 0,
      `${row.completion_rate}%`
    ]);

    rows.push([
      'TỔNG CỘNG',
      '--',
      summary.total ?? 0,
      summary.closed ?? 0,
      `${summary.completion_rate ?? 0}%`,
      summary.pending ?? 0,
      summary.overdue ?? 0,
      summary.closed_today ?? 0,
      summary.closed_yesterday ?? 0,
      summary.closed_last_7_days ?? 0,
      `${summary.completion_rate ?? 0}%`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${exportFilename}_${currentTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCellClick = (metric, metricLabel, row = null) => {
    if (onDrilldown) {
      onDrilldown(metric, metricLabel, row, subCategoryContext);
    }
  };

  return (
    <div 
      className="table-card" 
      style={{ 
        marginBottom: '28px',
        border: isChild ? '1px solid rgba(2, 132, 199, 0.25)' : '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: isChild ? '0 4px 16px -2px rgba(2, 132, 199, 0.08)' : 'var(--shadow-md)',
        overflow: 'hidden',
        background: 'var(--bg-secondary)'
      }}
    >
      {/* Quick Clickable Metric Strip (Compact) */}
      <div 
        className="table-metric-strip"
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', 
          gap: '8px', 
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)'
        }}
      >
        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('total', 'Tổng Công Việc')}
          title="Nhấn để xem toàn bộ danh sách công việc của bảng này"
          style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)' }}>{summary.total ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('closed', 'Đã Đóng')}
          title="Nhấn để xem danh sách việc đã đóng"
          style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)' }}>{summary.closed ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('pending', 'Tồn Việc')}
          title="Nhấn để xem danh sách việc tồn"
          style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)' }}>{summary.pending ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('overdue', 'Quá Hạn')}
          title="Nhấn để xem danh sách việc quá hạn"
          style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)' }}>{summary.overdue ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('closed_today', 'Đóng Hôm Nay')}
          title="Nhấn để xem danh sách việc đóng hôm nay"
          style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Nay</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)' }}>+{summary.closed_today ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('closed_yesterday', 'Đóng Hôm Qua')}
          title="Nhấn để xem danh sách việc đóng hôm qua"
          style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Qua</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)' }}>+{summary.closed_yesterday ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('closed_last_7_days', 'Đóng Tuần Qua')}
          title="Nhấn để xem danh sách việc đóng tuần qua"
          style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Tuần Qua</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)' }}>{summary.closed_last_7_days ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('tu_choi', 'FT / CĐ Từ Chối')}
          title={`Nhấn để xem danh sách việc từ chối (Tổng: ${summary.tu_choi ?? 0}, trong đó Quá hạn: ${summary.overdue_tu_choi ?? 0}, FT từ chối: ${summary.ft_tu_choi ?? 0}, CĐ từ chối: ${summary.cd_tu_choi ?? 0})`}
          style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(244, 63, 94, 0.2)' }}
        >
          <span style={{ fontSize: '0.68rem', color: '#e11d48', display: 'block', fontWeight: 700 }}>FT/CĐ Từ Chối</span>
          <strong style={{ fontSize: '1.15rem', color: '#e11d48' }}>
            {summary.tu_choi ?? 0}
            <span 
              onClick={(e) => {
                e.stopPropagation();
                handleCellClick('overdue_tu_choi', 'Từ Chối Quá Hạn');
              }}
              style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', marginLeft: '4px', background: 'rgba(239, 68, 68, 0.15)', padding: '1px 5px', borderRadius: '4px', cursor: 'pointer' }}
              title="Nhấn để chỉ xem những việc Từ chối bị Quá hạn"
            >
              {summary.overdue_tu_choi ?? 0} QH
            </span>
          </strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('ft_hoan_thanh', 'FT Hoàn Thành (Chờ Đóng)')}
          title="Nhấn để xem danh sách việc FT hoàn thành"
          style={{ background: 'rgba(6, 182, 212, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: '#0891b2', display: 'block', fontWeight: 700 }}>FT Hoàn Thành</span>
          <strong style={{ fontSize: '1.15rem', color: '#0891b2' }}>{summary.ft_hoan_thanh ?? 0}</strong>
        </div>

        <div 
          className="cell-clickable"
          onClick={() => handleCellClick('cho_cd_tiep_nhan', 'Chờ CĐ Tiếp Nhận')}
          title="Nhấn để xem danh sách việc Chờ CĐ tiếp nhận"
          style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
        >
          <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Chờ CĐ Nhận</span>
          <strong style={{ fontSize: '1.15rem', color: '#8b5cf6' }}>{summary.cho_cd_tiep_nhan ?? 0}</strong>
        </div>

        <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tỉ Lệ Đóng</span>
          <strong style={{ fontSize: '1.15rem', color: (summary.completion_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' }}>
            {summary.completion_rate ?? 0}%
          </strong>
        </div>
      </div>

      {/* Toolbar */}
      <div className="table-toolbar" style={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${currentTab === 'employee' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleTabSelect('employee')}
            style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
          >
            <Users size={14} />
            Theo Nhân Viên ({byEmployee.length})
          </button>
          <button
            className={`btn ${currentTab === 'group' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleTabSelect('group')}
            style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
          >
            <FolderKanban size={14} />
            Theo Nhóm / Cụm ({byGroup.length})
          </button>
          <button
            className={`btn ${currentTab === 'daily' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleTabSelect('daily')}
            style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
            title="Thống kê số WO đóng từ ngày 1 đến ngày n-1 và tính NSLĐ trung bình"
          >
            <Calendar size={14} />
            Theo Ngày (NSLĐ)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="search-input-box" style={{ width: '240px' }}>
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder={`Tìm ${currentTab === 'employee' ? 'nhân viên' : currentTab === 'group' ? 'nhóm/cụm' : 'nhân viên, cụm'}...`}
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

      {/* ======================= CASE A: TAB THEO NGÀY (NSLĐ) ======================= */}
      {currentTab === 'daily' && (
        <div style={{ padding: '0 0 12px 0' }}>
          {/* Sub-view switcher for Daily tab */}
          <div style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Chế độ xem:</span>
              <button
                className={`btn ${dailySubView === 'all' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDailySubView('all')}
                style={{ padding: '3px 10px', fontSize: '0.76rem', borderRadius: '16px' }}
              >
                🏛️ + 👤 Cả 2 bảng
              </button>
              <button
                className={`btn ${dailySubView === 'group' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDailySubView('group')}
                style={{ padding: '3px 10px', fontSize: '0.76rem', borderRadius: '16px' }}
              >
                🏛️ Theo Cụm ({byGroup.length})
              </button>
              <button
                className={`btn ${dailySubView === 'employee' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDailySubView('employee')}
                style={{ padding: '3px 10px', fontSize: '0.76rem', borderRadius: '16px' }}
              >
                👤 Theo Nhân Viên ({byEmployee.length})
              </button>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              * Cột <strong>NSLĐ</strong> tính trung bình lũy kế đến ngày <strong>{maxDay}</strong> (Tổng đóng / {maxDay} ngày) • Hiển thị chi tiết số WO đóng đủ từ ngày 1 đến ngày 31
            </div>
          </div>

          {/* TABLE 1: THEO CỤM (1 -> 31) */}
          {(dailySubView === 'all' || dailySubView === 'group') && (
            <div style={{ marginBottom: dailySubView === 'all' ? '24px' : '0' }}>
              <div style={{ padding: '8px 16px', background: 'rgba(2, 132, 199, 0.07)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--brand-primary)' }}>
                    🏛️ TIẾN ĐỘ ĐÓNG WO THEO CỤM (NGÀY 1 ➔ 31)
                  </span>
                  <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '1px 6px', fontWeight: 700 }}>
                    {sortedDailyGroups.length} Cụm
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* Nhấp tiêu đề cột để sắp xếp</span>
              </div>

              <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
                <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                      <th 
                        className="col-name" 
                        style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleDailyGroupSort('key_name')}
                        title="Sắp xếp theo Nhóm / Cụm"
                      >
                        Nhóm / Cụm {renderDailySortIndicator('key_name', dailyGroupSortKey, dailyGroupSortOrder)}
                      </th>
                      <th 
                        style={{ width: '80px', minWidth: '80px', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleDailyGroupSort('nsld')}
                        title={`Năng suất lao động trung bình tới ngày ${maxDay} (Tổng đóng / ${maxDay})`}
                      >
                        NSLĐ {renderDailySortIndicator('nsld', dailyGroupSortKey, dailyGroupSortOrder)}
                      </th>
                      <th 
                        style={{ width: '85px', minWidth: '85px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleDailyGroupSort('total_closed')}
                        title={`Tổng số WO đóng từ ngày 1 đến ngày ${maxDay}`}
                      >
                        Tổng Đóng {renderDailySortIndicator('total_closed', dailyGroupSortKey, dailyGroupSortOrder)}
                      </th>
                      {daysList.map(d => (
                        <th 
                          key={`th-grp-d-${d}`}
                          style={{ width: '28px', minWidth: '28px', maxWidth: '32px', padding: '4px 1px', textAlign: 'center', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleDailyGroupSort(`day_${d}`)}
                          title={`Sắp xếp theo ngày ${d}`}
                        >
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Summary Row */}
                    <tr className="excel-summary-row">
                      <td className="cell-num col-stt" style={{ color: 'var(--text-muted)' }}>--</td>
                      <td className="col-name" style={{ textAlign: 'right', width: '1%', whiteSpace: 'nowrap', paddingRight: '14px', fontWeight: 800, fontSize: '0.88rem' }}>
                        TỔNG CỘNG:
                      </td>
                      <td className="cell-num" style={{ fontWeight: 800, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.08)' }}>
                        {summaryNsld.toFixed(2)}
                      </td>
                      <td 
                        className={`cell-num cell-closed ${summaryClosedUpToMax > 0 ? 'cell-clickable' : ''}`} 
                        style={{ fontWeight: 800, cursor: summaryClosedUpToMax > 0 ? 'pointer' : 'default' }}
                        title={summaryClosedUpToMax > 0 ? `Nhấn để xem toàn bộ ${summaryClosedUpToMax} WO đóng từ ngày 1 đến ${maxDay}` : ''}
                        onClick={() => {
                          if (summaryClosedUpToMax > 0 && onDrilldown) {
                            onDrilldown('closed_up_to_max', `Tổng Đóng (Ngày 1 -> ${maxDay})`, null, subCategoryContext, { max_day: maxDay, filterType: 'all' });
                          }
                        }}
                      >
                        {summaryClosedUpToMax}
                      </td>
                      {daysList.map(d => {
                        const sumVal = summary.daily_closed?.[d] ?? summary.daily_closed?.[String(d)] ?? 0;
                        return (
                          <td 
                            key={`sum-grp-d-${d}`} 
                            className={`cell-num ${sumVal > 0 ? 'cell-clickable' : ''}`} 
                            style={{ width: '28px', minWidth: '28px', maxWidth: '32px', padding: '4px 1px', fontSize: '0.8rem', textAlign: 'center', fontWeight: 700, cursor: sumVal > 0 ? 'pointer' : 'default' }}
                            title={sumVal > 0 ? `Nhấn để xem ${sumVal} WO đóng ngày ${d} toàn mạng` : ''}
                            onClick={() => {
                              if (sumVal > 0 && onDrilldown) {
                                onDrilldown('closed_day', `Tổng Đóng Ngày ${d}`, null, subCategoryContext, { day: d, filterType: 'all' });
                              }
                            }}
                          >
                            {sumVal}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Data Rows */}
                    {sortedDailyGroups.length === 0 ? (
                      <tr>
                        <td colSpan={4 + daysList.length} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                          Không tìm thấy cụm nào phù hợp với bộ lọc tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      sortedDailyGroups.map((row, index) => {
                        const displayName = formatGroupName(row.key_name);
                        const rowNsld = getRowNsld(row);
                        const rowTotal = getRowClosedSum(row);
                        return (
                          <tr 
                            key={`daily-grp-${row.id || index}`}
                            className="excel-row"
                            style={{ background: row.is_other ? 'rgba(148, 163, 184, 0.08)' : (index % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)') }}
                          >
                            <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                              {row.is_other ? '*' : index + 1}
                            </td>
                            <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px', lineHeight: 1.35 }}>
                              <strong style={{ fontSize: '0.88rem', color: row.is_other ? 'var(--text-muted)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                {displayName}
                              </strong>
                              {row.is_other && <span className="badge badge-neutral" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>Khác</span>}
                            </td>
                            <td className="cell-num" style={{ fontWeight: 800, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.06)' }} title={`NSLĐ trung bình: ${rowNsld.toFixed(2)} WO/ngày`}>
                              {rowNsld.toFixed(2)}
                            </td>
                            <td 
                              className={`cell-num cell-closed ${rowTotal > 0 ? 'cell-clickable' : ''}`} 
                              style={{ fontWeight: 700, cursor: rowTotal > 0 ? 'pointer' : 'default' }}
                              title={rowTotal > 0 ? `Nhấn để xem ${rowTotal} WO đóng từ ngày 1 đến ${maxDay} của ${displayName}` : ''}
                              onClick={() => {
                                if (rowTotal > 0 && onDrilldown) {
                                  onDrilldown('closed_up_to_max', `Đóng (Ngày 1 -> ${maxDay})`, { ...row, filterType: 'group' }, subCategoryContext, { max_day: maxDay, filterType: 'group' });
                                }
                              }}
                            >
                              {rowTotal}
                            </td>
                            {daysList.map(d => {
                              const val = row.daily_closed?.[d] ?? row.daily_closed?.[String(d)] ?? 0;
                              return (
                                <td 
                                  key={`val-grp-${row.id}-${d}`}
                                  className={`cell-num ${val > 0 ? 'cell-clickable' : ''}`}
                                  style={{ 
                                    width: '28px',
                                    minWidth: '28px',
                                    maxWidth: '32px',
                                    padding: '3px 1px',
                                    fontSize: '0.8rem',
                                    textAlign: 'center',
                                    color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                                    fontWeight: val > 0 ? 700 : 400,
                                    background: val > 0 ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                                    opacity: val > 0 ? 1 : 0.35,
                                    cursor: val > 0 ? 'pointer' : 'default'
                                  }}
                                  title={val > 0 ? `Nhấn để xem ${val} WO đóng ngày ${d} của ${displayName}` : `${displayName} - Ngày ${d}: 0 WO đóng`}
                                  onClick={() => {
                                    if (val > 0 && onDrilldown) {
                                      onDrilldown('closed_day', `Đóng Ngày ${d}`, { ...row, filterType: 'group' }, subCategoryContext, { day: d, filterType: 'group' });
                                    }
                                  }}
                                >
                                  {val > 0 ? val : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABLE 2: THEO NHÂN VIÊN (1 -> 31) */}
          {(dailySubView === 'all' || dailySubView === 'employee') && (
            <div>
              <div style={{ padding: '8px 16px', background: 'rgba(16, 185, 129, 0.07)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--success-dark)' }}>
                    👤 BẢNG THEO NHÂN VIÊN (NGÀY 1 ➔ 31)
                  </span>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '1px 6px', fontWeight: 700 }}>
                    {sortedDailyEmployees.length} Nhân viên
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* Nhấp tiêu đề cột để sắp xếp</span>
              </div>

              <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
                <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                      <th 
                        className="col-name" 
                        style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleDailyEmpSort('key_name')}
                        title="Sắp xếp theo Tên Nhân Viên"
                      >
                        Nhân viên {renderDailySortIndicator('key_name', dailyEmpSortKey, dailyEmpSortOrder)}
                      </th>
                      <th 
                        style={{ width: '80px', minWidth: '80px', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleDailyEmpSort('nsld')}
                        title={`Năng suất lao động trung bình tới ngày ${maxDay} (Tổng đóng / ${maxDay})`}
                      >
                        NSLĐ {renderDailySortIndicator('nsld', dailyEmpSortKey, dailyEmpSortOrder)}
                      </th>
                      <th 
                        style={{ width: '85px', minWidth: '85px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleDailyEmpSort('total_closed')}
                        title={`Tổng số WO đóng từ ngày 1 đến ngày ${maxDay}`}
                      >
                        Tổng Đóng {renderDailySortIndicator('total_closed', dailyEmpSortKey, dailyEmpSortOrder)}
                      </th>
                      {daysList.map(d => (
                        <th 
                          key={`th-emp-d-${d}`}
                          style={{ width: '28px', minWidth: '28px', maxWidth: '32px', padding: '4px 1px', textAlign: 'center', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleDailyEmpSort(`day_${d}`)}
                          title={`Sắp xếp theo ngày ${d}`}
                        >
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Summary Row */}
                    <tr className="excel-summary-row">
                      <td className="cell-num col-stt" style={{ color: 'var(--text-muted)' }}>--</td>
                      <td className="col-name" style={{ textAlign: 'right', width: '1%', whiteSpace: 'nowrap', paddingRight: '14px', fontWeight: 800, fontSize: '0.88rem' }}>
                        TỔNG CỘNG:
                      </td>
                      <td className="cell-num" style={{ fontWeight: 800, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.08)' }}>
                        {summaryNsld.toFixed(2)}
                      </td>
                      <td 
                        className={`cell-num cell-closed ${summaryClosedUpToMax > 0 ? 'cell-clickable' : ''}`} 
                        style={{ fontWeight: 800, cursor: summaryClosedUpToMax > 0 ? 'pointer' : 'default' }}
                        title={summaryClosedUpToMax > 0 ? `Nhấn để xem toàn bộ ${summaryClosedUpToMax} WO đóng từ ngày 1 đến ${maxDay}` : ''}
                        onClick={() => {
                          if (summaryClosedUpToMax > 0 && onDrilldown) {
                            onDrilldown('closed_up_to_max', `Tổng Đóng (Ngày 1 -> ${maxDay})`, null, subCategoryContext, { max_day: maxDay, filterType: 'all' });
                          }
                        }}
                      >
                        {summaryClosedUpToMax}
                      </td>
                      {daysList.map(d => {
                        const sumVal = summary.daily_closed?.[d] ?? summary.daily_closed?.[String(d)] ?? 0;
                        return (
                          <td 
                            key={`sum-emp-d-${d}`} 
                            className={`cell-num ${sumVal > 0 ? 'cell-clickable' : ''}`} 
                            style={{ width: '28px', minWidth: '28px', maxWidth: '32px', padding: '4px 1px', fontSize: '0.8rem', textAlign: 'center', fontWeight: 700, cursor: sumVal > 0 ? 'pointer' : 'default' }}
                            title={sumVal > 0 ? `Nhấn để xem ${sumVal} WO đóng ngày ${d} toàn mạng` : ''}
                            onClick={() => {
                              if (sumVal > 0 && onDrilldown) {
                                onDrilldown('closed_day', `Tổng Đóng Ngày ${d}`, null, subCategoryContext, { day: d, filterType: 'all' });
                              }
                            }}
                          >
                            {sumVal}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Data Rows */}
                    {sortedDailyEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={4 + daysList.length} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                          Không tìm thấy nhân viên nào phù hợp với bộ lọc tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      sortedDailyEmployees.map((row, index) => {
                        const rowNsld = getRowNsld(row);
                        const rowTotal = getRowClosedSum(row);
                        return (
                          <tr 
                            key={`daily-emp-${row.id || index}`}
                            className="excel-row"
                            style={{ background: row.is_other ? 'rgba(148, 163, 184, 0.08)' : (index % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)') }}
                          >
                            <td className="cell-num col-stt" style={{ width: '38px', color: 'var(--text-muted)' }}>
                              {row.is_other ? '*' : index + 1}
                            </td>
                            <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '3px 12px', lineHeight: 1.35 }}>
                              <strong style={{ fontSize: '0.88rem', color: row.is_other ? 'var(--text-muted)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                {row.key_name}
                              </strong>
                              {row.is_other && <span className="badge badge-neutral" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>Khác</span>}
                            </td>
                            <td className="cell-num" style={{ fontWeight: 800, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.06)' }} title={`NSLĐ trung bình: ${rowNsld.toFixed(2)} WO/ngày`}>
                              {rowNsld.toFixed(2)}
                            </td>
                            <td 
                              className={`cell-num cell-closed ${rowTotal > 0 ? 'cell-clickable' : ''}`} 
                              style={{ fontWeight: 700, cursor: rowTotal > 0 ? 'pointer' : 'default' }}
                              title={rowTotal > 0 ? `Nhấn để xem ${rowTotal} WO đóng từ ngày 1 đến ${maxDay} của ${row.key_name}` : ''}
                              onClick={() => {
                                if (rowTotal > 0 && onDrilldown) {
                                  onDrilldown('closed_up_to_max', `Đóng (Ngày 1 -> ${maxDay})`, { ...row, filterType: 'employee' }, subCategoryContext, { max_day: maxDay, filterType: 'employee' });
                                }
                              }}
                            >
                              {rowTotal}
                            </td>
                            {daysList.map(d => {
                              const val = row.daily_closed?.[d] ?? row.daily_closed?.[String(d)] ?? 0;
                              return (
                                <td 
                                  key={`val-emp-${row.id}-${d}`}
                                  className={`cell-num ${val > 0 ? 'cell-clickable' : ''}`}
                                  style={{ 
                                    width: '28px',
                                    minWidth: '28px',
                                    maxWidth: '32px',
                                    padding: '3px 1px',
                                    fontSize: '0.8rem',
                                    textAlign: 'center',
                                    color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                                    fontWeight: val > 0 ? 700 : 400,
                                    background: val > 0 ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                                    opacity: val > 0 ? 1 : 0.35,
                                    cursor: val > 0 ? 'pointer' : 'default'
                                  }}
                                  title={val > 0 ? `Nhấn để xem ${val} WO đóng ngày ${d} của ${row.key_name}` : `${row.key_name} - Ngày ${d}: 0 WO đóng`}
                                  onClick={() => {
                                    if (val > 0 && onDrilldown) {
                                      onDrilldown('closed_day', `Đóng Ngày ${d}`, { ...row, filterType: 'employee' }, subCategoryContext, { day: d, filterType: 'employee' });
                                    }
                                  }}
                                >
                                  {val > 0 ? val : '-'}
                                </td>
                              );
                            })}
                          </tr>
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

      {/* ======================= CASE B: TAB THEO NHÂN VIÊN HOẶC THEO CỤM ======================= */}
      {currentTab !== 'daily' && (
        <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
          <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                <th 
                  className="col-name"
                  style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', padding: '5px 12px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('key_name')}
                  title="Nhấn để sắp xếp theo tên A-Z hoặc Z-A"
                >
                  {currentTab === 'employee' ? 'Nhân viên' : 'Nhóm / Cụm'}
                  {renderSortIndicator('key_name')}
                </th>
                <th 
                  style={{ width: '75px', minWidth: '75px', background: 'rgba(2, 132, 199, 0.1)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('total')}
                  title="Nhấn để sắp xếp theo Tổng Số"
                >
                  Tổng Số{renderSortIndicator('total')}
                </th>
                <th 
                  style={{ width: '75px', minWidth: '75px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('closed')}
                  title="Nhấn để sắp xếp theo Đã Đóng"
                >
                  Đã Đóng{renderSortIndicator('closed')}
                </th>
                <th 
                  style={{ width: '75px', minWidth: '75px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('completion_rate')}
                  title="Nhấn để sắp xếp theo % Đóng"
                >
                  % Đóng{renderSortIndicator('completion_rate')}
                </th>
                <th 
                  style={{ width: '75px', minWidth: '75px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('pending')}
                  title="Nhấn để sắp xếp theo Tồn Việc"
                >
                  Tồn Việc{renderSortIndicator('pending')}
                </th>
                <th 
                  style={{ width: '75px', minWidth: '75px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('overdue')}
                  title="Nhấn để sắp xếp theo Quá Hạn"
                >
                  Quá Hạn{renderSortIndicator('overdue')}
                </th>
                <th 
                  style={{ width: '85px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('closed_today')}
                  title="Nhấn để sắp xếp theo Đóng Hôm Nay"
                >
                  Đóng Hôm Nay{renderSortIndicator('closed_today')}
                </th>
                <th 
                  style={{ width: '85px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('closed_yesterday')}
                  title="Nhấn để sắp xếp theo Đóng Hôm Qua"
                >
                  Đóng Hôm Qua{renderSortIndicator('closed_yesterday')}
                </th>
                <th 
                  style={{ width: '85px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('closed_last_7_days')}
                  title="Nhấn để sắp xếp theo Đóng Tuần Qua"
                >
                  Đóng Tuần Qua{renderSortIndicator('closed_last_7_days')}
                </th>
                <th 
                  style={{ width: 'auto', minWidth: '130px', textAlign: 'left', paddingLeft: '14px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('completion_rate')}
                  title="Nhấn để sắp xếp theo Tiến Độ Hoàn Thành"
                >
                  Tiến Độ{renderSortIndicator('completion_rate')}
                </th>
              </tr>
            </thead>
            <tbody key={`tbody-${currentTab}`}>
              {/* Excel Summary Row on TOP */}
              <tr className="excel-summary-row">
                <td className="col-summary-label" colSpan={2} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', width: '1%', whiteSpace: 'nowrap', fontWeight: 800 }}>
                  TỔNG CỘNG:
                </td>
                <td 
                  className="cell-num cell-clickable" 
                  style={{ width: '75px', fontSize: '0.98rem', color: 'var(--brand-primary)' }}
                  title="Nhấn để xem toàn bộ danh sách công việc"
                  onClick={() => handleCellClick('total', 'Tổng Số')}
                >
                  {summary.total ?? 0}
                </td>
                <td 
                  className="cell-num cell-closed cell-clickable" 
                  style={{ width: '75px', fontSize: '0.98rem' }}
                  title="Nhấn để xem toàn bộ việc đã đóng"
                  onClick={() => handleCellClick('closed', 'Đã Đóng')}
                >
                  {summary.closed ?? 0}
                </td>
                <td 
                  className="cell-num" 
                  style={{ 
                    width: '75px', 
                    fontSize: '0.98rem', 
                    fontWeight: 800, 
                    color: (summary.completion_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' 
                  }}
                  title={`Tỉ lệ đóng toàn bộ: ${summary.completion_rate ?? 0}%`}
                >
                  {summary.completion_rate ?? 0}%
                </td>
                <td 
                  className="cell-num cell-pending cell-clickable" 
                  style={{ width: '75px', fontSize: '0.98rem' }}
                  title="Nhấn để xem toàn bộ việc đang tồn"
                  onClick={() => handleCellClick('pending', 'Tồn Việc')}
                >
                  {summary.pending ?? 0}
                </td>
                <td 
                  className="cell-num cell-overdue cell-clickable" 
                  style={{ width: '75px', fontSize: '0.98rem' }}
                  title="Nhấn để xem toàn bộ việc quá hạn"
                  onClick={() => handleCellClick('overdue', 'Quá Hạn')}
                >
                  {summary.overdue ?? 0}
                </td>
                <td 
                  className="cell-num cell-today cell-clickable" 
                  style={{ width: '85px', fontSize: '0.98rem' }}
                  title="Nhấn để xem toàn bộ việc đóng hôm nay"
                  onClick={() => handleCellClick('closed_today', 'Đóng Hôm Nay')}
                >
                  +{summary.closed_today ?? 0}
                </td>
                <td 
                  className="cell-num cell-yesterday cell-clickable" 
                  style={{ width: '85px', fontSize: '0.98rem' }}
                  title="Nhấn để xem toàn bộ việc đóng hôm qua"
                  onClick={() => handleCellClick('closed_yesterday', 'Đóng Hôm Qua')}
                >
                  +{summary.closed_yesterday ?? 0}
                </td>
                <td 
                  className="cell-num cell-week cell-clickable" 
                  style={{ width: '85px', fontSize: '0.98rem' }}
                  title="Nhấn để xem toàn bộ việc đóng 7 ngày qua"
                  onClick={() => handleCellClick('closed_last_7_days', 'Đóng Tuần Qua')}
                >
                  {summary.closed_last_7_days ?? 0}
                </td>
                <td style={{ width: 'auto', padding: '3px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <div style={{ flex: 1, height: '9px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
                      <div 
                        style={{ 
                          width: `${Math.min(100, Math.max(0, summary.completion_rate || 0))}%`, 
                          height: '100%', 
                          background: (summary.completion_rate || 0) >= 80 ? 'var(--success)' : 'var(--brand-primary)',
                          borderRadius: '4px'
                        }} 
                      />
                    </div>
                    <span style={{ fontSize: '0.92rem', fontWeight: 800, minWidth: '46px', textAlign: 'right', color: 'var(--brand-primary)' }}>
                      {summary.completion_rate ?? 0}%
                    </span>
                  </div>
                </td>
              </tr>

              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    Không tìm thấy bản ghi nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                sortedList.map((row, index) => {
                  const displayName = currentTab === 'group' ? formatGroupName(row.key_name) : row.key_name;
                  return (
                    <tr 
                      key={`${currentTab}-${row.is_other ? 'other' : (row.id ?? '')}-${index}-${row.key_name}`}
                      className="excel-row"
                      style={{
                        background: row.is_other ? 'rgba(148, 163, 184, 0.08)' : (index % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)')
                      }}
                    >
                      <td className="cell-num col-stt" style={{ width: '38px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {row.is_other ? '*' : index + 1}
                      </td>
                      <td className="col-name" style={{ width: '1%', whiteSpace: 'nowrap', padding: '2.5px 12px', lineHeight: 1.35 }}>
                        <span 
                          className="row-name-text"
                          title={row.key_name}
                          style={{ fontSize: '0.9rem', color: row.is_other ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline' }}
                        >
                          {displayName}
                        </span>
                        {row.is_other && (
                          <span className="badge badge-neutral" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>Khác</span>
                        )}
                      </td>
                      <td 
                        className="cell-num cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.total} công việc của ${displayName}`}
                        onClick={() => handleCellClick('total', 'Tổng Số', row)}
                      >
                        {row.total}
                      </td>
                      <td 
                        className="cell-num cell-closed cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed} việc đã đóng của ${displayName}`}
                        onClick={() => handleCellClick('closed', 'Đã Đóng', row)}
                      >
                        {row.closed}
                      </td>
                      <td 
                        className="cell-num" 
                        style={{ 
                          width: '75px', 
                          whiteSpace: 'nowrap', 
                          fontWeight: 800, 
                          color: row.completion_rate >= 80 ? 'var(--success-dark)' : row.completion_rate >= 40 ? 'var(--brand-primary)' : 'var(--warning-dark)'
                        }}
                        title={`Tỉ lệ đóng của ${displayName}: ${row.completion_rate}%`}
                      >
                        {row.completion_rate}%
                      </td>
                      <td 
                        className="cell-num cell-pending cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.pending} việc tồn của ${displayName}`}
                        onClick={() => handleCellClick('pending', 'Tồn Việc', row)}
                      >
                        {row.pending}
                      </td>
                      <td 
                        className="cell-num cell-overdue cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.overdue} việc quá hạn của ${displayName}`}
                        onClick={() => handleCellClick('overdue', 'Quá Hạn', row)}
                      >
                        {row.overdue > 0 ? row.overdue : '0'}
                      </td>
                      <td 
                        className="cell-num cell-today cell-clickable" 
                        style={{ width: '85px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed_today} việc đóng hôm nay của ${displayName}`}
                        onClick={() => handleCellClick('closed_today', 'Đóng Hôm Nay', row)}
                      >
                        {row.closed_today > 0 ? `+${row.closed_today}` : '0'}
                      </td>
                      <td 
                        className="cell-num cell-yesterday cell-clickable" 
                        style={{ width: '85px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed_yesterday || 0} việc đóng hôm qua của ${displayName}`}
                        onClick={() => handleCellClick('closed_yesterday', 'Đóng Hôm Qua', row)}
                      >
                        {(row.closed_yesterday || 0) > 0 ? `+${row.closed_yesterday}` : '0'}
                      </td>
                      <td 
                        className="cell-num cell-week cell-clickable" 
                        style={{ width: '85px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed_last_7_days} việc đóng 7 ngày qua của ${displayName}`}
                        onClick={() => handleCellClick('closed_last_7_days', 'Đóng Tuần Qua', row)}
                      >
                        {row.closed_last_7_days}
                      </td>
                      <td style={{ width: 'auto', padding: '2.5px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                          <div style={{ flex: 1, height: '9px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
                            <div 
                              style={{ 
                                width: `${Math.min(100, Math.max(0, row.completion_rate))}%`, 
                                height: '100%', 
                                background: row.completion_rate >= 80 ? 'var(--success)' : row.completion_rate >= 40 ? 'var(--brand-primary)' : 'var(--warning)',
                                borderRadius: '4px',
                                transition: 'width 0.2s ease'
                              }} 
                            />
                          </div>
                          <span style={{ fontSize: '0.88rem', fontWeight: 800, minWidth: '46px', textAlign: 'right', color: row.completion_rate >= 80 ? 'var(--success-dark)' : 'var(--text-primary)' }}>
                            {row.completion_rate}%
                          </span>
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
  );
}
