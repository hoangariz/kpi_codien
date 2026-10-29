import React, { useState, useMemo } from 'react';
import { Calendar, Clock, AlertTriangle } from 'lucide-react';
import LevelTable from '../shared/LevelTable';

/**
 * Thẻ KPI mini cho Tổng Hợp Sự Cố
 */
export function getTongHopSuCoCardKpis(summary = {}) {
  return [
    { label: 'Tồn Sự Cố', value: summary.ton_su_co || 0, color: 'warning' },
    { label: 'Quá Hạn', value: summary.qua_han || 0, color: 'danger' },
    { label: 'HOT', value: summary.hot || 0, color: 'danger' },
  ];
}

/**
 * Danh sách cột cho bảng Tổng Hợp Sự Cố
 * - wrap text xuống nhiều dòng (white-space: normal, word-break: normal)
 * - kích thước cột gọn gàng (46px - 62px)
 * - text size nhỏ gọn (0.68rem - 0.72rem)
 * - tiêu đề cột hiển thị ngày thực đang chọn (ví dụ: "Phát sinh ngày 15")
 */
export function buildTongHopSuCoColumns(selectedDate) {
  let dayStr = 'n';
  if (selectedDate) {
    if (selectedDate.includes('-')) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        dayStr = parseInt(parts[2], 10) || parts[2];
      }
    } else if (selectedDate.includes('/')) {
      const parts = selectedDate.split('/');
      if (parts.length === 3) {
        dayStr = parseInt(parts[0], 10) || parts[0];
      }
    }
  }

  const baseThStyle = {
    whiteSpace: 'normal',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    textAlign: 'center',
    lineHeight: '1.15',
    fontSize: '0.68rem',
    padding: '3px 2px',
    boxSizing: 'border-box',
  };

  return [
    {
      key: 'so_nv',
      label: 'Số NV',
      align: 'right',
      width: '48px',
      sortable: true,
      tooltip: 'Số nhân sự active của đội/cụm theo danh mục (dòng nhân viên: 1). Chưa phân đội/cụm = 0',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '52px',
        background: 'rgba(59, 130, 246, 0.08)',
        color: 'var(--brand-primary)',
      },
    },
    {
      key: 'ton_truoc',
      label: `Tồn trước ngày ${dayStr}`,
      align: 'right',
      width: '56px',
      drilldownMetric: 'ton_truoc',
      sortable: true,
      tooltip: `Sự cố bắt đầu trước 00:00 ngày ${dayStr} và còn mở hoặc đóng sau 00:00 ngày ${dayStr}`,
      headerStyle: {
        ...baseThStyle,
        width: '56px',
        minWidth: '50px',
        maxWidth: '62px',
      },
    },
    {
      key: 'phat_sinh',
      label: `Phát sinh ngày ${dayStr}`,
      align: 'right',
      width: '56px',
      drilldownMetric: 'phat_sinh',
      sortable: true,
      tooltip: `Sự cố có thời điểm bắt đầu thực hiện trong ngày ${dayStr}`,
      headerStyle: {
        ...baseThStyle,
        width: '56px',
        minWidth: '50px',
        maxWidth: '62px',
        background: 'rgba(139, 92, 246, 0.08)',
        color: '#8b5cf6',
      },
    },
    {
      key: 'xu_ly',
      label: `Xử lý trong ngày ${dayStr}`,
      align: 'right',
      width: '58px',
      variant: 'success',
      drilldownMetric: 'xu_ly',
      sortable: true,
      tooltip: `Sự cố đã đóng trong ngày ${dayStr} (cùng tháng)`,
      headerStyle: {
        ...baseThStyle,
        width: '58px',
        minWidth: '52px',
        maxWidth: '64px',
        background: 'rgba(16, 185, 129, 0.1)',
        color: 'var(--success-dark)',
      },
    },
    {
      key: 'ton_su_co',
      label: 'Tồn Sự cố',
      align: 'right',
      width: '54px',
      variant: 'warning',
      drilldownMetric: 'ton_su_co',
      sortable: true,
      tooltip: 'Sự cố đang mở (Trạng thái != Đóng)',
      headerStyle: {
        ...baseThStyle,
        width: '54px',
        minWidth: '48px',
        maxWidth: '60px',
        background: 'rgba(245, 158, 11, 0.12)',
        color: 'var(--warning-dark)',
      },
    },

    // Nhóm "Tồn Sự cố" (9 cột)
    {
      key: 'lte_3h',
      label: '<=3h',
      align: 'right',
      width: '46px',
      drilldownMetric: 'lte_3h',
      sortable: true,
      tooltip: 'Sự cố tồn <= 3 giờ',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
      },
    },
    {
      key: 'h3_24',
      label: '3h-24h',
      align: 'right',
      width: '48px',
      drilldownMetric: 'h3_24',
      sortable: true,
      tooltip: 'Sự cố tồn > 3h và <= 24h',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
      },
    },
    {
      key: 'h24_48',
      label: '24h-48h',
      align: 'right',
      width: '50px',
      drilldownMetric: 'h24_48',
      sortable: true,
      tooltip: 'Sự cố tồn > 24h và <= 48h',
      headerStyle: {
        ...baseThStyle,
        width: '50px',
        minWidth: '46px',
        maxWidth: '56px',
      },
    },
    {
      key: 'h48_72',
      label: '48-72h',
      align: 'right',
      width: '48px',
      drilldownMetric: 'h48_72',
      sortable: true,
      tooltip: 'Sự cố tồn > 48h và <= 72h',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
      },
    },
    {
      key: 'gt_72h',
      label: '>72h',
      align: 'right',
      width: '46px',
      drilldownMetric: 'gt_72h',
      sortable: true,
      tooltip: 'Sự cố tồn > 72h',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        color: 'var(--danger-dark)',
      },
    },
    {
      key: 'tam_dung',
      label: 'Sự cố tạm dừng',
      align: 'right',
      width: '54px',
      drilldownMetric: 'tam_dung',
      sortable: true,
      tooltip: 'Sự cố có trạng thái "Tạm dừng"',
      headerStyle: {
        ...baseThStyle,
        width: '54px',
        minWidth: '48px',
        maxWidth: '60px',
      },
    },
    {
      key: 'tong',
      label: 'Tổng',
      align: 'right',
      width: '48px',
      sortable: true,
      tooltip: 'Tổng sự cố đang tồn (= tổng 5 bucket tuổi)',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        fontWeight: 800,
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'hot',
      label: 'HOT',
      align: 'right',
      width: '46px',
      variant: 'danger',
      drilldownMetric: 'hot',
      sortable: true,
      tooltip: 'Sự cố đang mở mức độ ưu tiên HOT',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        background: 'rgba(236, 72, 153, 0.1)',
        color: '#ec4899',
        fontWeight: 800,
      },
    },
    {
      key: 'qua_han',
      label: 'Quá hạn',
      align: 'right',
      width: '48px',
      variant: 'danger',
      drilldownMetric: 'qua_han',
      sortable: true,
      tooltip: 'Sự cố đang mở có thời gian còn lại < 0 và thời gian thực hiện > 24h',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        background: 'rgba(239, 68, 68, 0.12)',
        color: 'var(--danger-dark)',
        fontWeight: 800,
      },
    },

    // Nhóm "Soc_mất tín hiệu" (2 cột)
    {
      key: 'soc_tong',
      label: 'Tổng',
      align: 'right',
      width: '48px',
      drilldownMetric: 'soc_tong',
      sortable: true,
      tooltip: 'Sự cố đang mở có nội dung chứa "Hiện tượng: Mất dịch vụ"',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        background: 'rgba(244, 63, 94, 0.08)',
        color: '#e11d48',
        fontWeight: 700,
      },
    },
    {
      key: 'soc_gt_72h',
      label: '>72h',
      align: 'right',
      width: '48px',
      variant: 'danger',
      drilldownMetric: 'soc_gt_72h',
      sortable: true,
      tooltip: 'Soc mất tín hiệu đang mở có thời gian xử lý > 72h',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        background: 'rgba(244, 63, 94, 0.12)',
        color: 'var(--danger-dark)',
        fontWeight: 800,
      },
    },

    // Nhóm "Hỗ trợ dịch vụ" (3 cột)
    {
      key: 'htdv_tong',
      label: 'Tổng',
      align: 'right',
      width: '48px',
      drilldownMetric: 'htdv_tong',
      sortable: true,
      tooltip: 'Sự cố đang mở có nội dung chứa "Báo hỏng DV cố định" và "Hỗ trợ dịch vụ"',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        background: 'rgba(6, 182, 212, 0.08)',
        color: '#0891b2',
        fontWeight: 700,
      },
    },
    {
      key: 'htdv_qua_han',
      label: 'Quá hạn',
      align: 'right',
      width: '48px',
      variant: 'danger',
      drilldownMetric: 'htdv_qua_han',
      sortable: true,
      tooltip: 'Hỗ trợ dịch vụ đang mở có thời gian còn lại < 0',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        background: 'rgba(239, 68, 68, 0.1)',
        color: 'var(--danger-dark)',
        fontWeight: 800,
      },
    },
    {
      key: 'htdv_gt_72h',
      label: '>72h',
      align: 'right',
      width: '48px',
      variant: 'danger',
      drilldownMetric: 'htdv_gt_72h',
      sortable: true,
      tooltip: 'Hỗ trợ dịch vụ đang mở có thời gian xử lý > 72h',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '54px',
        background: 'rgba(6, 182, 212, 0.12)',
        color: '#0e7490',
        fontWeight: 800,
      },
    },
  ];
}

export default function TongHopSuCoReport({
  statsData,
  selectedDate,
  onDateChange,
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = 'Tổng Hợp Sự Cố',
  lastUpdatedStr = null,
}) {
  const [level, setLevel] = useState('employee'); // Mặc định mở tab Nhân viên

  const activeDate = selectedDate || statsData?.selected_date || '';

  const columns = useMemo(() => {
    return buildTongHopSuCoColumns(activeDate);
  }, [activeDate]);

  const groupedColumnsConfig = useMemo(() => {
    return [
      {
        groupName: 'Tồn Sự cố',
        groupColumns: [
          'lte_3h',
          'h3_24',
          'h24_48',
          'h48_72',
          'gt_72h',
          'tam_dung',
          'tong',
          'hot',
          'qua_han',
        ],
        groupStyle: {
          background: 'rgba(245, 158, 11, 0.15)',
          color: 'var(--warning-dark)',
          fontWeight: 800,
          textAlign: 'center',
          fontSize: '0.70rem',
          padding: '3px 4px',
          lineHeight: '1.2',
        },
      },
      {
        groupName: 'Soc_mất tín hiệu',
        groupColumns: ['soc_tong', 'soc_gt_72h'],
        groupStyle: {
          background: 'rgba(244, 63, 94, 0.15)',
          color: '#e11d48',
          fontWeight: 800,
          textAlign: 'center',
          fontSize: '0.70rem',
          padding: '3px 4px',
          lineHeight: '1.2',
        },
      },
      {
        groupName: 'Hỗ trợ dịch vụ',
        groupColumns: ['htdv_tong', 'htdv_qua_han', 'htdv_gt_72h'],
        groupStyle: {
          background: 'rgba(6, 182, 212, 0.15)',
          color: '#0891b2',
          fontWeight: 800,
          textAlign: 'center',
          fontSize: '0.70rem',
          padding: '3px 4px',
          lineHeight: '1.2',
        },
      },
    ];
  }, []);

  // Helper to shift calendar day in pure local date math
  const shiftDay = (dateStr, days) => {
    if (!dateStr || !dateStr.includes('-')) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    const ry = dt.getFullYear();
    const rm = String(dt.getMonth() + 1).padStart(2, '0');
    const rd = String(dt.getDate()).padStart(2, '0');
    return `${ry}-${rm}-${rd}`;
  };

  const handlePrevDay = () => {
    const cur = activeDate || statsData?.selected_date;
    const newDate = shiftDay(cur, -1);
    if (onDateChange) onDateChange(newDate);
  };

  const handleNextDay = () => {
    const cur = activeDate || statsData?.selected_date;
    const newDate = shiftDay(cur, 1);
    if (onDateChange) onDateChange(newDate);
  };

  const handleToday = () => {
    const now = new Date();
    let vnToday = '';
    try {
      vnToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch (e) {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      vnToday = `${y}-${m}-${d}`;
    }

    const available = statsData?.available_dates || [];
    let target = vnToday;
    if (available.length > 0 && !available.includes(vnToday)) {
      target = available[0];
    }
    if (onDateChange) onDateChange(target);
  };

  const rows =
    level === 'cluster'
      ? statsData?.by_cluster || []
      : level === 'team'
        ? statsData?.by_team || []
        : statsData?.by_employee || [];

  const summary = statsData?.summary || null;

  return (
    <div>
      {/* 1. Header Toolbar Chọn Ngày Ngay Trên Bảng */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '8px 14px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ⚡ {reportTitle}
          </span>
          <span
            className="badge badge-purple"
            style={{ fontSize: '0.74rem', padding: '2px 10px', fontWeight: 700 }}
          >
            Số liệu ngày: {activeDate ? activeDate.split('-').reverse().join('/') : 'Hôm nay'}
          </span>
          {statsData?.gnoc_updated_at && (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '6px',
              }}
              title="Thời điểm file GNOC được nạp gần nhất"
            >
              <Clock size={12} /> GNOC: {statsData.gnoc_updated_at}
            </span>
          )}
        </div>

        {/* Thanh Chọn Ngày Ngay Trên Bảng */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-primary)',
            padding: '3px 8px',
            borderRadius: '8px',
            border: '1px solid #8b5cf6',
          }}
        >
          <Calendar size={14} style={{ color: '#8b5cf6' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Chọn ngày:
          </span>
          <button
            type="button"
            onClick={handlePrevDay}
            className="btn btn-outline"
            style={{ padding: '2px 8px', fontSize: '0.78rem', height: '26px' }}
            title="Xem ngày trước"
          >
            ←
          </button>
          <input
            type="date"
            value={activeDate}
            onChange={(e) => onDateChange && onDateChange(e.target.value)}
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              height: '26px',
            }}
          />
          <button
            type="button"
            onClick={handleNextDay}
            className="btn btn-outline"
            style={{ padding: '2px 8px', fontSize: '0.78rem', height: '26px' }}
            title="Xem ngày sau"
          >
            →
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="btn btn-primary"
            style={{
              padding: '2px 10px',
              fontSize: '0.76rem',
              fontWeight: 700,
              height: '26px',
              background: '#8b5cf6',
              borderColor: '#8b5cf6',
            }}
            title="Xem ngày hôm nay"
          >
            Hôm nay
          </button>
        </div>
      </div>

      {/* 2. Bảng Dữ Liệu 3 Cấp (LevelTable) */}
      <LevelTable
        reportKey="tong_hop_su_co"
        level={level}
        onLevelChange={setLevel}
        rows={rows}
        summary={summary}
        metricColumns={columns}
        groupedColumnsConfig={groupedColumnsConfig}
        onDrilldown={onDrilldown}
        orgMetadata={orgMetadata}
        emptyOrg={emptyOrg}
        reportTitle={reportTitle}
        lastUpdatedStr={lastUpdatedStr}
        statsData={statsData}
        selectedDate={activeDate}
        onDateChange={onDateChange}
      />
    </div>
  );
}
