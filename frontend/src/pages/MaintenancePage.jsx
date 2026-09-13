import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Wrench, 
  Users, 
  FolderKanban, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Search,
  Filter,
  Calendar,
  Download,
  Info,
  Layers
} from 'lucide-react';
import { statsApi } from '../api/statsApi';

export default function MaintenancePage({ onNavigateToTasks }) {
  const [activeTab, setActiveTab] = useState('employee'); // 'employee' | 'group'
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stats-maintenance-special'],
    queryFn: () => statsApi.getMaintenanceSpecial(),
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <Wrench size={36} className="spin" style={{ opacity: 0.5, marginBottom: '12px' }} />
        <p>Đang tải dữ liệu thống kê bảo dưỡng cơ điện...</p>
      </div>
    );
  }

  const { 
    target_task_type, 
    active_month,
    total_valid_records, 
    excluded_closed_prior_months, 
    summary = {},
    by_employee = [], 
    by_group = [] 
  } = data || {};

  const currentList = activeTab === 'employee' ? by_employee : by_group;

  const filteredList = currentList.filter(item => 
    !searchQuery.trim() || item.key_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const formatMonthDisplay = (m) => {
    if (!m) return '';
    const parts = m.split('-');
    if (parts.length === 2) return `Tháng ${parts[1]}/${parts[0]}`;
    return m;
  };

  // Export CSV function
  const handleExportCSV = () => {
    const headers = [
      'STT',
      activeTab === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm Điều Phối (Cụm)',
      'Tổng Số',
      'Đã Đóng',
      'Tồn Việc',
      'Quá Hạn',
      'Đóng Hôm Nay',
      'Đóng Tuần Qua',
      'Tỉ Lệ Đóng (%)'
    ];

    const rows = filteredList.map((row, idx) => [
      idx + 1,
      `"${row.key_name}"`,
      row.total,
      row.closed,
      row.pending,
      row.overdue,
      row.closed_today,
      row.closed_last_7_days,
      `${row.completion_rate}%`
    ]);

    // Add summary row
    rows.push([
      'TỔNG CỘNG',
      '--',
      summary.total ?? total_valid_records,
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
    link.setAttribute('download', `Bao_duong_co_dien_${active_month}_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Banner info */}
      <div 
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span className="badge badge-info">Chuyên Mục Theo Dõi Đặc Thù</span>
          <span className="badge badge-success" style={{ gap: '4px' }}>
            <Calendar size={13} /> {formatMonthDisplay(active_month)}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hệ thống: ICMS</span>
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {target_task_type}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '850px', lineHeight: 1.6 }}>
          Bảng thống kê định dạng Excel: <strong>Đã tự động loại bỏ các công việc đã đóng của tháng trước</strong>.
          Chỉ theo dõi khối lượng việc trong {formatMonthDisplay(active_month)} và các việc tồn đọng quá hạn chưa đóng.
          {excluded_closed_prior_months > 0 && (
            <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}> (Đã lọc bớt {excluded_closed_prior_months} việc đã đóng của các tháng trước).</span>
          )}
        </p>

        {/* Quick summary strip */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
            gap: '12px', 
            marginTop: '20px',
            paddingTop: '18px',
            borderTop: '1px solid var(--border-color)'
          }}
        >
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--brand-primary)' }}>{summary.total ?? total_valid_records}</strong>
          </div>
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--success-dark)' }}>{summary.closed ?? 0}</strong>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--warning-dark)' }}>{summary.pending ?? 0}</strong>
          </div>
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--danger-dark)' }}>{summary.overdue ?? 0}</strong>
          </div>
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Nay</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--success-dark)' }}>+{summary.closed_today ?? 0}</strong>
          </div>
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Tuần Qua</span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--brand-primary)' }}>{summary.closed_last_7_days ?? 0}</strong>
          </div>
          <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Tỉ Lệ Đóng</span>
            <strong style={{ fontSize: '1.4rem', color: (summary.completion_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' }}>
              {summary.completion_rate ?? 0}%
            </strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="table-card">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${activeTab === 'employee' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('employee')}
            >
              <Users size={16} />
              Theo Nhân Viên ({by_employee.length})
            </button>
            <button
              className={`btn ${activeTab === 'group' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('group')}
            >
              <FolderKanban size={16} />
              Theo Nhóm / Cụm ({by_group.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div className="search-input-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder={`Tìm ${activeTab === 'employee' ? 'nhân viên' : 'nhóm/cụm'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button
              className="btn btn-outline"
              onClick={handleExportCSV}
              title="Tải bảng dạng CSV/Excel"
              style={{ gap: '6px', fontSize: '0.82rem' }}
            >
              <Download size={15} /> Xuất Excel
            </button>
          </div>
        </div>

        {/* Excel Table */}
        <div className="table-responsive">
          <table className="excel-table">
            <thead>
              <tr>
                <th style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                <th style={{ textAlign: 'left', width: '1%', whiteSpace: 'nowrap', paddingRight: '22px' }}>
                  {activeTab === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm Điều Phối (Cụm)'}
                </th>
                <th style={{ width: '75px', whiteSpace: 'nowrap' }}>Tổng Số</th>
                <th style={{ width: '75px', background: 'rgba(16, 185, 129, 0.14)', color: 'var(--success-dark)', whiteSpace: 'nowrap' }}>Đã Đóng</th>
                <th style={{ width: '75px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', whiteSpace: 'nowrap' }}>Tồn Việc</th>
                <th style={{ width: '75px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', whiteSpace: 'nowrap' }}>Quá Hạn</th>
                <th style={{ width: '85px', whiteSpace: 'nowrap' }}>Đóng Hôm Nay</th>
                <th style={{ width: '85px', whiteSpace: 'nowrap' }}>Đóng Tuần Qua</th>
                <th style={{ textAlign: 'left', paddingLeft: '14px' }}>Tỉ Lệ Đóng (%)</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((row, index) => (
                <tr 
                  key={row.id || index}
                  className="excel-row"
                  style={{
                    background: row.is_other ? 'rgba(148, 163, 184, 0.08)' : (index % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)')
                  }}
                >
                  <td className="cell-num" style={{ width: '38px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                    {row.is_other ? '*' : index + 1}
                  </td>
                  <td style={{ width: '1%', whiteSpace: 'nowrap', paddingRight: '22px' }}>
                    <strong style={{ fontSize: '0.92rem', color: row.is_other ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {row.key_name}
                    </strong>
                    {row.is_other && (
                      <span className="badge badge-neutral" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>Khác</span>
                    )}
                  </td>
                  <td className="cell-num" style={{ width: '75px', whiteSpace: 'nowrap' }}>
                    {row.total}
                  </td>
                  <td className="cell-num cell-closed" style={{ width: '75px', whiteSpace: 'nowrap' }}>
                    {row.closed}
                  </td>
                  <td className="cell-num cell-pending" style={{ width: '75px', whiteSpace: 'nowrap' }}>
                    {row.pending}
                  </td>
                  <td className="cell-num cell-overdue" style={{ width: '75px', whiteSpace: 'nowrap' }}>
                    {row.overdue > 0 ? row.overdue : '0'}
                  </td>
                  <td className="cell-num cell-today" style={{ width: '85px', whiteSpace: 'nowrap' }}>
                    {row.closed_today > 0 ? `+${row.closed_today}` : '0'}
                  </td>
                  <td className="cell-num cell-week" style={{ width: '85px', whiteSpace: 'nowrap' }}>
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
                  </td>
                </tr>
              ))}

              {/* Excel Summary Row */}
              <tr className="excel-summary-row">
                <td colSpan={2} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                  TỔNG CỘNG ({currentList.length} hàng):
                </td>
                <td className="cell-num" style={{ width: '75px', fontSize: '0.98rem', color: 'var(--brand-primary)' }}>
                  {summary.total ?? total_valid_records}
                </td>
                <td className="cell-num cell-closed" style={{ width: '75px', fontSize: '0.98rem' }}>
                  {summary.closed ?? 0}
                </td>
                <td className="cell-num cell-pending" style={{ width: '75px', fontSize: '0.98rem' }}>
                  {summary.pending ?? 0}
                </td>
                <td className="cell-num cell-overdue" style={{ width: '75px', fontSize: '0.98rem' }}>
                  {summary.overdue ?? 0}
                </td>
                <td className="cell-num cell-today" style={{ width: '85px', fontSize: '0.98rem' }}>
                  +{summary.closed_today ?? 0}
                </td>
                <td className="cell-num cell-week" style={{ width: '85px', fontSize: '0.98rem' }}>
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
            </tbody>
          </table>
        </div>

        {/* Footnote */}
        <div style={{ padding: '12px 20px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={15} style={{ color: 'var(--brand-primary)' }} />
          <span>
            <strong>Ghi chú quy tắc:</strong> Bảng đã áp dụng cơ chế tự động loại bỏ các công việc đã Đóng trước {formatMonthDisplay(active_month)}.
            Các công việc có cụm trống hoặc nhân viên trống được tự động gom vào nhóm <strong>"Khác"</strong> ở cuối bảng.
          </span>
        </div>
      </div>
    </div>
  );
}
