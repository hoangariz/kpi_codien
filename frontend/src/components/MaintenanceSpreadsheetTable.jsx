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
  AlertTriangle
} from 'lucide-react';
import { formatGroupName } from '../utils/groupFormat';

/**
 * Reusable Large Excel Spreadsheet Table Component
 * Supports Parent table and Sub-category Child tables
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

  const handleExportCSV = () => {
    const headers = [
      'STT',
      currentTab === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm Điều Phối (Cụm)',
      'Tổng Số',
      'Đã Đóng',
      'Tồn Việc',
      'Quá Hạn',
      'Đóng Hôm Nay',
      'Đóng Tuần Qua',
      'Tỉ Lệ Đóng (%)'
    ];

    const rows = sortedList.map((row, idx) => [
      idx + 1,
      currentTab === 'group' ? `"${formatGroupName(row.key_name)}"` : `"${row.key_name}"`,
      row.total,
      row.closed,
      row.pending,
      row.overdue,
      row.closed_today || 0,
      row.closed_last_7_days || 0,
      `${row.completion_rate}%`
    ]);

    rows.push([
      'TỔNG CỘNG',
      '--',
      summary.total ?? 0,
      summary.closed ?? 0,
      summary.pending ?? 0,
      summary.overdue ?? 0,
      summary.closed_today ?? 0,
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


      <>
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
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>{summary.total ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('closed', 'Đã Đóng')}
              title="Nhấn để xem danh sách việc đã đóng"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>{summary.closed ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('pending', 'Tồn Việc')}
              title="Nhấn để xem danh sách việc tồn"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>{summary.pending ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('overdue', 'Quá Hạn')}
              title="Nhấn để xem danh sách việc quá hạn"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>{summary.overdue ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('closed_today', 'Đóng Hôm Nay')}
              title="Nhấn để xem danh sách việc đóng hôm nay"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Nay</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>+{summary.closed_today ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('closed_last_7_days', 'Đóng Tuần Qua')}
              title="Nhấn để xem danh sách việc đóng tuần qua"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Tuần Qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>{summary.closed_last_7_days ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('tu_choi', 'FT / CĐ Từ Chối')}
              title={`Nhấn để xem danh sách việc từ chối (Tổng: ${summary.tu_choi ?? 0}, trong đó Quá hạn: ${summary.overdue_tu_choi ?? 0}, FT từ chối: ${summary.ft_tu_choi ?? 0}, CĐ từ chối: ${summary.cd_tu_choi ?? 0})`}
              style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(244, 63, 94, 0.2)' }}
            >
              <span style={{ fontSize: '0.68rem', color: '#e11d48', display: 'block', fontWeight: 700 }}>FT/CĐ Từ Chối</span>
              <strong style={{ fontSize: '1.15rem', color: '#e11d48', fontFamily: 'var(--font-mono)' }}>
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
              <strong style={{ fontSize: '1.15rem', color: '#0891b2', fontFamily: 'var(--font-mono)' }}>{summary.ft_hoan_thanh ?? 0}</strong>
            </div>

            <div 
              className="cell-clickable"
              onClick={() => handleCellClick('cho_cd_tiep_nhan', 'Chờ CĐ Tiếp Nhận')}
              title="Nhấn để xem danh sách việc Chờ CĐ tiếp nhận"
              style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Chờ CĐ Nhận</span>
              <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>{summary.cho_cd_tiep_nhan ?? 0}</strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tỉ Lệ Đóng</span>
              <strong style={{ fontSize: '1.15rem', fontFamily: 'var(--font-mono)', color: (summary.completion_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' }}>
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
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="search-input-box" style={{ width: '240px' }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder={`Tìm ${currentTab === 'employee' ? 'nhân viên' : 'nhóm/cụm'}...`}
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

          {/* Excel Table */}
          <div className="excel-table-scroll-wrapper" style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)', WebkitOverflowScrolling: 'touch' }}>
            <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                  <th 
                    className="col-name"
                    style={{ textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('key_name')}
                    title="Nhấn để sắp xếp theo tên A-Z hoặc Z-A"
                  >
                    {currentTab === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm / Cụm'}
                    {renderSortIndicator('key_name')}
                  </th>
                  <th 
                    style={{ width: '75px', background: 'rgba(2, 132, 199, 0.1)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('total')}
                    title="Nhấn để sắp xếp theo Tổng Số"
                  >
                    Tổng Số{renderSortIndicator('total')}
                  </th>
                  <th 
                    style={{ width: '75px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('closed')}
                    title="Nhấn để sắp xếp theo Đã Đóng"
                  >
                    Đã Đóng{renderSortIndicator('closed')}
                  </th>
                  <th 
                    style={{ width: '75px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('pending')}
                    title="Nhấn để sắp xếp theo Tồn Việc"
                  >
                    Tồn Việc{renderSortIndicator('pending')}
                  </th>
                  <th 
                    style={{ width: '75px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('overdue')}
                    title="Nhấn để sắp xếp theo Quá Hạn"
                  >
                    Quá Hạn{renderSortIndicator('overdue')}
                  </th>
                  <th 
                    style={{ width: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('closed_today')}
                    title="Nhấn để sắp xếp theo Đóng Hôm Nay"
                  >
                    Đóng Hôm Nay{renderSortIndicator('closed_today')}
                  </th>
                  <th 
                    style={{ width: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('closed_last_7_days')}
                    title="Nhấn để sắp xếp theo Đóng Tuần Qua"
                  >
                    Đóng Tuần Qua{renderSortIndicator('closed_last_7_days')}
                  </th>
                  <th 
                    style={{ textAlign: 'left', paddingLeft: '14px', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('completion_rate')}
                    title="Nhấn để sắp xếp theo Tỉ Lệ Đóng"
                  >
                    Tỉ Lệ Đóng (%){renderSortIndicator('completion_rate')}
                  </th>
                </tr>
              </thead>
              <tbody key={`tbody-${currentTab}`}>
                {/* Excel Summary Row on TOP */}
                <tr className="excel-summary-row">
                  <td className="col-summary-label" colSpan={2} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', whiteSpace: 'nowrap', fontWeight: 800 }}>
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
                    className="cell-num cell-week cell-clickable" 
                    style={{ width: '85px', fontSize: '0.98rem' }}
                    title="Nhấn để xem toàn bộ việc đóng 7 ngày qua"
                    onClick={() => handleCellClick('closed_last_7_days', 'Đóng Tuần Qua')}
                  >
                    {summary.closed_last_7_days ?? 0}
                  </td>
                  <td style={{ padding: '3px 14px' }}>
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
                      <span style={{ fontSize: '0.92rem', fontFamily: 'var(--font-mono)', fontWeight: 800, minWidth: '46px', textAlign: 'right', color: 'var(--brand-primary)' }}>
                        {summary.completion_rate ?? 0}%
                      </span>
                    </div>
                  </td>
                </tr>

                {sortedList.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
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
                        <td className="col-name" style={{ whiteSpace: 'nowrap', paddingRight: '14px' }}>
                          <span 
                            className="row-name-text"
                            title={row.key_name}
                            style={{ fontSize: '0.92rem', color: row.is_other ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 700 }}
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
                          className="cell-num cell-week cell-clickable" 
                          style={{ width: '85px', whiteSpace: 'nowrap' }}
                          title={`Nhấn để xem ${row.closed_last_7_days} việc đóng 7 ngày qua của ${displayName}`}
                          onClick={() => handleCellClick('closed_last_7_days', 'Đóng Tuần Qua', row)}
                        >
                          {row.closed_last_7_days}
                        </td>
                        <td style={{ padding: '2.5px 14px' }}>
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
                            <span style={{ fontSize: '0.88rem', fontFamily: 'var(--font-mono)', fontWeight: 800, minWidth: '46px', textAlign: 'right', color: row.completion_rate >= 80 ? 'var(--success-dark)' : 'var(--text-primary)' }}>
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
      </>
    </div>
  );
}
