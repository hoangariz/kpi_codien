import React, { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import LevelTable from '../shared/LevelTable';

/**
 * Thẻ KPI mini cho Tổng Hợp TK (QLCTKT)
 */
export function getQlctktCardKpis(summary = {}) {
  return [
    { label: 'Tổng Tồn', value: summary.tong_ton || 0, color: 'warning' },
    { label: 'Quá Hạn', value: summary.qua_han || 0, color: 'danger' },
    { label: 'HỦY', value: summary.huy || 0, color: 'danger' },
  ];
}

/**
 * Danh sách cột cho bảng Tổng Hợp TK
 * - wrap text xuống nhiều dòng (white-space: normal, word-break: normal)
 * - kích thước các cột bằng cột Số NV (dao động từ 46px - 62px)
 * - text size nhỏ gọn (0.68rem - 0.72rem)
 * - cột Nghiệm thu, ĐD nghiệm thu, Đấu nối, NSLĐ hiển thị động theo ngày đang chọn
 */
export function buildQlctktColumns(selectedDate) {
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
      width: '50px',
      sortable: true,
      tooltip: 'Số nhân sự active của đội/cụm theo danh mục (dòng nhân viên: 1). Không phụ thuộc WO',
      headerStyle: {
        ...baseThStyle,
        width: '50px',
        minWidth: '46px',
        maxWidth: '54px',
        background: 'rgba(59, 130, 246, 0.08)',
        color: 'var(--brand-primary)',
      },
    },
    {
      key: 'cap_nhat_ho_so',
      label: 'Cập nhật hồ sơ',
      align: 'right',
      width: '54px',
      drilldownMetric: 'cap_nhat_ho_so',
      sortable: true,
      tooltip: 'Tiến độ công việc là Cập nhật hồ sơ',
      headerStyle: {
        ...baseThStyle,
        width: '54px',
        minWidth: '48px',
        maxWidth: '58px',
      },
    },
    {
      key: 'nghiem_thu_n',
      label: `Nghiệm thu trong ngày ${dayStr}`,
      align: 'right',
      width: '60px',
      variant: 'success',
      drilldownMetric: 'nghiem_thu_n',
      sortable: true,
      headerStyle: {
        ...baseThStyle,
        width: '60px',
        minWidth: '55px',
        maxWidth: '66px',
        background: 'rgba(16, 185, 129, 0.1)',
        color: 'var(--success-dark)',
      },
      tooltip: `Tiến độ = Kết thúc hoặc Cập nhật hồ sơ và Ngày kết thúc thực tế trong ngày ${dayStr}`,
    },
    {
      key: 'dd_nghiem_thu_n',
      label: 'Số lượng ĐD nghiệm thu',
      align: 'right',
      width: '58px',
      drilldownMetric: 'dd_nghiem_thu_n',
      sortable: true,
      headerStyle: {
        ...baseThStyle,
        width: '58px',
        minWidth: '52px',
        maxWidth: '64px',
      },
      tooltip: `Số lượng đường dây mới nghiệm thu trong ngày ${dayStr} (Tiến độ = Kết thúc hoặc Cập nhật hồ sơ)`,
    },
    {
      key: 'dau_noi_n',
      label: `Đấu nối trong ngày ${dayStr}`,
      align: 'right',
      width: '56px',
      drilldownMetric: 'dau_noi_n',
      sortable: true,
      headerStyle: {
        ...baseThStyle,
        width: '56px',
        minWidth: '50px',
        maxWidth: '62px',
        background: 'rgba(139, 92, 246, 0.1)',
        color: '#8b5cf6',
      },
      tooltip: `Ngày tạo trong ngày ${dayStr} (mọi tiến độ)`,
    },
    {
      key: 'nsld',
      label: 'NSLĐ',
      align: 'right',
      width: '54px',
      sortable: true,
      tooltip: `Năng suất lao động: Nghiệm thu ngày ${dayStr} / Số NV`,
      headerStyle: {
        ...baseThStyle,
        width: '54px',
        minWidth: '48px',
        maxWidth: '60px',
        background: 'rgba(16, 185, 129, 0.06)',
        color: 'var(--success-dark)',
      },
    },
    // Nhóm 9 cột "Tồn triển khai"
    {
      key: 'ton_duong_day',
      label: 'Đường dây',
      align: 'right',
      width: '48px',
      drilldownMetric: 'ton_duong_day',
      sortable: true,
      tooltip: 'Việc tồn và đường dây mới',
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '52px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_duong_day_th',
      label: 'Tích hẹn ĐD',
      align: 'right',
      width: '50px',
      drilldownMetric: 'ton_duong_day_th',
      sortable: true,
      tooltip: 'Tồn đường dây và có tích hẹn OK',
      headerStyle: {
        ...baseThStyle,
        width: '50px',
        minWidth: '46px',
        maxWidth: '54px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_ldtb',
      label: 'LĐTB',
      align: 'right',
      width: '46px',
      drilldownMetric: 'ton_ldtb',
      sortable: true,
      tooltip: 'Việc tồn và không phải đường dây mới',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_ldtb_th',
      label: 'Tích hẹn LĐTB',
      align: 'right',
      width: '50px',
      drilldownMetric: 'ton_ldtb_th',
      sortable: true,
      tooltip: 'Tồn LĐTB và có tích hẹn OK',
      headerStyle: {
        ...baseThStyle,
        width: '50px',
        minWidth: '46px',
        maxWidth: '54px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_lt1',
      label: '<1 ngày',
      align: 'right',
      width: '46px',
      drilldownMetric: 'ton_lt1',
      sortable: true,
      tooltip: 'Tồn dưới 24 giờ',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_lt2',
      label: '<2 ngày',
      align: 'right',
      width: '46px',
      drilldownMetric: 'ton_lt2',
      sortable: true,
      tooltip: 'Tồn từ 24h đến dưới 48h',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_lt3',
      label: '<3 ngày',
      align: 'right',
      width: '46px',
      drilldownMetric: 'ton_lt3',
      sortable: true,
      tooltip: 'Tồn từ 48h đến dưới 72h',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'ton_gt3',
      label: '>3 ngày',
      align: 'right',
      width: '46px',
      drilldownMetric: 'ton_gt3',
      sortable: true,
      tooltip: 'Tồn từ 72 giờ trở lên',
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '50px',
        background: 'rgba(245, 158, 11, 0.08)',
      },
    },
    {
      key: 'tong_ton',
      label: 'Tổng tồn',
      align: 'right',
      width: '50px',
      variant: 'warning',
      drilldownMetric: 'tong_ton',
      sortable: true,
      headerStyle: {
        ...baseThStyle,
        width: '50px',
        minWidth: '46px',
        maxWidth: '54px',
        background: 'rgba(245, 158, 11, 0.18)',
        color: 'var(--warning-dark)',
        fontWeight: 800,
      },
      tooltip: 'Tổng việc tồn (= Đường dây + LĐTB = <1d + <2d + <3d + >3d)',
    },
    {
      key: 'qua_han',
      label: 'Quá hạn',
      align: 'right',
      width: '48px',
      variant: 'danger',
      drilldownMetric: 'qua_han',
      sortable: true,
      headerStyle: {
        ...baseThStyle,
        width: '48px',
        minWidth: '44px',
        maxWidth: '52px',
        background: 'rgba(239, 68, 68, 0.15)',
        color: 'var(--danger-dark)',
        fontWeight: 800,
      },
      tooltip: 'Tồn và số giờ tồn > 0',
    },
    {
      key: 'huy',
      label: 'HỦY',
      align: 'right',
      width: '44px',
      variant: 'danger',
      drilldownMetric: 'huy',
      sortable: true,
      headerStyle: {
        ...baseThStyle,
        width: '44px',
        minWidth: '40px',
        maxWidth: '48px',
        background: 'rgba(239, 68, 68, 0.12)',
        color: 'var(--danger-dark)',
        fontWeight: 800,
      },
      tooltip: 'Ghi chú đầu mối khớp nguyên từ hủy/huỷ và chưa kết thúc',
    },
  ];
}

export default function QlctktTrienKhaiReport({
  statsData,
  selectedDate,
  onDateChange,
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = 'Tổng Hợp TK',
  lastUpdatedStr = null,
}) {
  const [level, setLevel] = useState('employee'); // Mặc định mở tab Nhân viên

  const activeDate = selectedDate || statsData?.selected_date || '';

  const columns = useMemo(() => {
    return buildQlctktColumns(activeDate);
  }, [activeDate]);

  const groupedColumnsConfig = useMemo(() => {
    return {
      groupName: 'Tồn triển khai',
      groupColumns: [
        'ton_duong_day',
        'ton_duong_day_th',
        'ton_ldtb',
        'ton_ldtb_th',
        'ton_lt1',
        'ton_lt2',
        'ton_lt3',
        'ton_gt3',
        'tong_ton',
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
    };
  }, []);

  // Helper to shift calendar day in pure local date math (immune to UTC shifts)
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
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, '0');
    const nd = String(dt.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
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
    // If today exists in dataset, jump to today; otherwise jump to the latest available date in dataset
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
            📊 {reportTitle}
          </span>
          <span
            className="badge badge-purple"
            style={{ fontSize: '0.74rem', padding: '2px 10px', fontWeight: 700 }}
          >
            Số liệu ngày: {activeDate ? activeDate.split('-').reverse().join('/') : 'Hôm nay'}
          </span>
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
        reportKey="qlctkt_trien_khai"
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
