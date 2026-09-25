import React, { useState } from 'react';
import { 
  Wrench, 
  Users, 
  FolderKanban, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Calendar,
  Download,
  Info,
  CheckSquare,
  Square,
  Eye,
  EyeOff
} from 'lucide-react';

export default function MaintenanceSpecialWidget({ data, onSelectFilter }) {
  const [showTable, setShowTable] = useState(true); // Checkbox state
  const [activeView, setActiveView] = useState('employee'); // 'employee' or 'group'

  if (!data) return null;

  const { 
    target_task_type, 
    active_month,
    total_valid_records, 
    excluded_closed_prior_months, 
    summary = {},
    by_employee = [], 
    by_group = [] 
  } = data;

  const currentList = activeView === 'employee' ? by_employee : by_group;

  const formatMonthDisplay = (m) => {
    if (!m) return '';
    const parts = m.split('-');
    if (parts.length === 2) return `Tháng ${parts[1]}/${parts[0]}`;
    return m;
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'STT',
      activeView === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm Điều Phối (Cụm)',
      'Tổng Số',
      'Đã Đóng',
      'Tồn Việc',
      'Quá Hạn',
      'Đóng Hôm Nay',
      'Đóng Hôm Qua',
      'Đóng Tuần Qua',
      'Tỉ Lệ Đóng (%)'
    ];

    const rows = currentList.map((row, idx) => [
      idx + 1,
      `"${row.key_name}"`,
      row.total,
      row.closed,
      row.pending,
      row.overdue,
      row.closed_today,
      row.closed_yesterday || 0,
      row.closed_last_7_days,
      `${row.completion_rate}%`
    ]);

    rows.push([
      'TỔNG CỘNG',
      '--',
      summary.total ?? total_valid_records,
      summary.closed ?? 0,
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
    link.setAttribute('download', `Bao_duong_co_dien_${active_month}_${activeView}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="excel-table-container" 
      style={{ 
        marginBottom: '28px', 
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      {/* Top Banner with Checkbox toggle */}
      <div 
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(37, 99, 235, 0.04) 100%)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Main Checkbox requested by user */}
          <label 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              cursor: 'pointer',
              background: 'var(--bg-secondary)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              border: showTable ? '1px solid var(--brand-primary)' : '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)',
              userSelect: 'none'
            }}
          >
            <input 
              type="checkbox" 
              checked={showTable} 
              onChange={(e) => setShowTable(e.target.checked)} 
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
            />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: showTable ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
              Xem Báo Cáo Bảo Dưỡng Cơ Điện
            </span>
          </label>

          <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.78rem' }}>
            <Calendar size={12} /> {formatMonthDisplay(active_month)}
          </span>

          {excluded_closed_prior_months > 0 && (
            <span className="badge badge-neutral" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Đã lọc bỏ {excluded_closed_prior_months} việc đóng tháng trước
            </span>
          )}
        </div>

        {/* View Switcher & Export (only when table is checked) */}
        {showTable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
              <button
                className={`btn ${activeView === 'employee' ? 'btn-primary' : ''}`}
                onClick={() => setActiveView('employee')}
                style={{ 
                  padding: '5px 12px', 
                  fontSize: '0.78rem',
                  borderRadius: 'var(--radius-sm)',
                  background: activeView === 'employee' ? 'var(--brand-gradient)' : 'transparent',
                  color: activeView === 'employee' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Users size={13} style={{ marginRight: '4px' }} />
                Theo Nhân Viên ({by_employee.length})
              </button>
              <button
                className={`btn ${activeView === 'group' ? 'btn-primary' : ''}`}
                onClick={() => setActiveView('group')}
                style={{ 
                  padding: '5px 12px', 
                  fontSize: '0.78rem',
                  borderRadius: 'var(--radius-sm)',
                  background: activeView === 'group' ? 'var(--brand-gradient)' : 'transparent',
                  color: activeView === 'group' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <FolderKanban size={13} style={{ marginRight: '4px' }} />
                Theo Nhóm / Cụm ({by_group.length})
              </button>
            </div>

            <button
              className="btn btn-outline"
              onClick={handleExportCSV}
              title="Xuất bảng ra file Excel/CSV"
              style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '4px' }}
            >
              <Download size={13} /> Xuất Excel
            </button>
          </div>
        )}
      </div>

      {/* Summary KPI Strip for Quick Inspection */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
          gap: '8px', 
          padding: '12px 20px',
          background: 'var(--bg-secondary)',
          borderBottom: showTable ? '1px solid var(--border-color)' : 'none'
        }}
      >
        <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>TỔNG CỘNG</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--brand-primary)' }}>
            {summary.total ?? total_valid_records}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.10)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--success-dark)', display: 'block' }}>ĐÃ ĐÓNG</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--success-dark)' }}>
            {summary.closed ?? 0}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'rgba(245, 158, 11, 0.10)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--warning-dark)', display: 'block' }}>TỒN VIỆC</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--warning-dark)' }}>
            {summary.pending ?? 0}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.10)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--danger-dark)', display: 'block' }}>QUÁ HẠN</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--danger-dark)' }}>
            {summary.overdue ?? 0}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>ĐÓNG HÔM NAY</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--success-dark)' }}>
            +{summary.closed_today ?? 0}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>ĐÓNG HÔM QUA</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--success-dark)' }}>
            +{summary.closed_yesterday ?? 0}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>ĐÓNG TUẦN QUA</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--brand-primary)' }}>
            {summary.closed_last_7_days ?? 0}
          </strong>
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>TỈ LỆ ĐÓNG</span>
          <strong style={{ fontSize: '1.25rem', color: (summary.completion_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' }}>
            {summary.completion_rate ?? 0}%
          </strong>
        </div>
      </div>

      {/* Excel Table Display (Toggled by Checkbox) */}
      {showTable ? (
        <div className="table-responsive">
          <table className="excel-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>STT</th>
                <th style={{ textAlign: 'left', minWidth: '220px' }}>
                  {activeView === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm Điều Phối (Cụm)'}
                </th>
                <th style={{ width: '90px' }}>Tổng Số</th>
                <th style={{ width: '90px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success-dark)' }}>Đã Đóng</th>
                <th style={{ width: '90px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)' }}>Tồn Việc</th>
                <th style={{ width: '90px', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger-dark)' }}>Quá Hạn</th>
                <th style={{ width: '105px' }}>Đóng Hôm Nay</th>
                <th style={{ width: '105px' }}>Đóng Hôm Qua</th>
                <th style={{ width: '110px' }}>Đóng Tuần Qua</th>
                <th style={{ minWidth: '150px' }}>Tỉ Lệ Đóng (%)</th>
                <th style={{ width: '80px' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {/* Excel True Summary Top Row */}
              <tr className="excel-summary-row">
                <td colSpan={2} style={{ textAlign: 'right', paddingRight: '14px', fontSize: '0.85rem', fontWeight: 800 }}>
                  TỔNG CỘNG:
                </td>
                <td className="cell-num" style={{ fontSize: '0.95rem', color: 'var(--brand-primary)' }}>
                  {summary.total ?? total_valid_records}
                </td>
                <td className="cell-num cell-closed" style={{ fontSize: '0.95rem' }}>
                  {summary.closed ?? 0}
                </td>
                <td className="cell-num cell-pending" style={{ fontSize: '0.95rem' }}>
                  {summary.pending ?? 0}
                </td>
                <td className="cell-num cell-overdue" style={{ fontSize: '0.95rem' }}>
                  {summary.overdue ?? 0}
                </td>
                <td className="cell-num cell-today" style={{ fontSize: '0.95rem' }}>
                  +{summary.closed_today ?? 0}
                </td>
                <td className="cell-num cell-yesterday" style={{ fontSize: '0.95rem' }}>
                  +{summary.closed_yesterday ?? 0}
                </td>
                <td className="cell-num cell-week" style={{ fontSize: '0.95rem' }}>
                  {summary.closed_last_7_days ?? 0}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                  {summary.completion_rate ?? 0}%
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Full</span>
                </td>
              </tr>
              {currentList.map((row, index) => (
                <tr 
                  key={row.id || index}
                  className="excel-row"
                  style={{
                    background: row.is_other ? 'rgba(148, 163, 184, 0.08)' : (index % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)')
                  }}
                >
                  <td className="cell-num" style={{ color: 'var(--text-muted)' }}>
                    {row.is_other ? '*' : index + 1}
                  </td>
                  <td>
                    <strong style={{ color: row.is_other ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {row.key_name}
                    </strong>
                    {row.is_other && (
                      <span className="badge badge-neutral" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>Khác</span>
                    )}
                  </td>
                  <td className="cell-num" style={{ fontWeight: 700 }}>
                    {row.total}
                  </td>
                  <td className="cell-num cell-closed">
                    {row.closed}
                  </td>
                  <td className="cell-num cell-pending">
                    {row.pending}
                  </td>
                  <td className="cell-num cell-overdue">
                    {row.overdue > 0 ? row.overdue : '0'}
                  </td>
                  <td className="cell-num cell-today">
                    {row.closed_today > 0 ? `+${row.closed_today}` : '0'}
                  </td>
                  <td className="cell-num cell-yesterday">
                    {(row.closed_yesterday || 0) > 0 ? `+${row.closed_yesterday}` : '0'}
                  </td>
                  <td className="cell-num cell-week">
                    {row.closed_last_7_days}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '7px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min(100, row.completion_rate)}%`, 
                            height: '100%', 
                            background: row.completion_rate >= 80 ? 'var(--success)' : row.completion_rate >= 40 ? 'var(--brand-primary)' : 'var(--warning)',
                            borderRadius: '3px'
                          }} 
                        />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '38px', textAlign: 'right' }}>
                        {row.completion_rate}%
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '2px' }}
                      onClick={() => {
                        if (onSelectFilter) {
                          onSelectFilter({
                            task_type: target_task_type,
                            [activeView === 'employee' ? 'assigned_to_id' : 'group_id']: row.id,
                          });
                        }
                      }}
                    >
                      Xem <ArrowUpRight size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footnote */}
          <div style={{ padding: '10px 18px', background: 'var(--bg-tertiary)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} style={{ color: 'var(--brand-primary)' }} />
            <span>
              <strong>Quy tắc Excel:</strong> Bảng chỉ thống kê việc trong {formatMonthDisplay(active_month)} và các việc tồn đọng từ tháng trước mang sang. Đã bỏ qua các việc đã Đóng của tháng trước. Cụm trống hoặc nhân viên trống được gộp vào dòng <strong>Khác</strong>.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px 20px', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Bảng chi tiết đang được thu gọn. Hãy <strong>tick vào ô "Xem Báo Cáo Bảo Dưỡng Cơ Điện"</strong> ở trên để mở bảng tính.
          </p>
          <button 
            className="btn btn-outline" 
            onClick={() => setShowTable(true)}
            style={{ fontSize: '0.8rem', padding: '5px 14px', gap: '6px' }}
          >
            <Eye size={14} /> Mở bảng báo cáo Excel
          </button>
        </div>
      )}
    </div>
  );
}
