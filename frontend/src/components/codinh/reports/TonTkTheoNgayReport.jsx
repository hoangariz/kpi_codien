import React, { useState, useMemo } from 'react';
import { Calendar, Clock, Layers } from 'lucide-react';
import LevelTable from '../shared/LevelTable';

export function getTonTkTheoNgayCardKpis(summary = {}) {
  return [
    {
      label: 'TỔNG TỒN',
      value: (Number(summary.tong_ton) || 0).toLocaleString(),
      variant: 'warning',
      tooltip: 'Tổng số công việc triển khai đang tồn',
    },
    {
      label: '> 30 NGÀY',
      value: (Number(summary.gt_30d) || 0).toLocaleString(),
      variant: 'danger',
      tooltip: 'Số công việc tồn cũ hơn 30 ngày',
    },
  ];
}

const baseThStyle = {
  fontSize: '0.70rem',
  padding: '4px 2px',
  lineHeight: '1.2',
  textAlign: 'right',
  verticalAlign: 'middle',
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

export function buildTonTkTheoNgayColumns(activeDate = '', dateColumnsMeta = []) {
  const cols = [
    {
      key: 'tong_ton',
      label: 'Tổng tồn',
      align: 'right',
      width: '60px',
      variant: 'warning',
      drilldownMetric: 'tong_ton',
      sortable: true,
      tooltip: 'Tổng số công việc QLCTKT đang tồn (chưa kết thúc/hủy)',
      headerStyle: {
        ...baseThStyle,
        width: '60px',
        minWidth: '54px',
        maxWidth: '68px',
        background: 'rgba(245, 158, 11, 0.16)',
        color: 'var(--warning-dark)',
        fontWeight: 800,
      },
    },
    {
      key: 'gt_30d',
      label: '> 30 ngày',
      align: 'right',
      width: '56px',
      variant: 'danger',
      drilldownMetric: 'gt_30d',
      sortable: true,
      tooltip: 'Các công việc tồn được tạo trước hơn 30 ngày tính từ ngày chọn',
      headerStyle: {
        ...baseThStyle,
        width: '56px',
        minWidth: '50px',
        maxWidth: '62px',
        background: 'rgba(239, 68, 68, 0.14)',
        color: 'var(--danger-dark)',
        fontWeight: 800,
      },
    },
  ];

  // 30 cột ngày từ mới nhất đến cũ nhất
  dateColumnsMeta.forEach((d) => {
    const isWeekend = d.day_of_week === 5 || d.day_of_week === 6; // T7 hoặc CN
    const isToday = Boolean(d.is_today);

    let bg = 'rgba(59, 130, 246, 0.05)';
    let color = 'var(--text-primary)';
    if (isToday) {
      bg = 'rgba(139, 92, 246, 0.15)';
      color = '#7c3aed';
    } else if (isWeekend) {
      bg = 'rgba(100, 116, 139, 0.08)';
      color = 'var(--text-secondary)';
    }

    cols.push({
      key: d.key,
      label: d.label,
      align: 'right',
      width: '46px',
      drilldownMetric: d.key,
      sortable: true,
      tooltip: `Công việc tồn có ngày tạo là ${d.full_date_vn || d.date}${isToday ? ' (Hôm nay)' : ''}`,
      headerStyle: {
        ...baseThStyle,
        width: '46px',
        minWidth: '42px',
        maxWidth: '52px',
        background: bg,
        color: color,
        fontWeight: isToday ? 800 : (isWeekend ? 600 : 700),
      },
    });
  });

  return cols;
}

export default function TonTkTheoNgayReport({
  statsData,
  selectedDate,
  onDateChange,
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = 'Tồn TK theo ngày',
  lastUpdatedStr = null,
}) {
  const [level, setLevel] = useState('employee'); // Mặc định mở tab Nhân viên

  const activeDate = selectedDate || statsData?.selected_date || '';
  const dateColumnsMeta = useMemo(() => {
    return statsData?.date_columns_meta || [];
  }, [statsData?.date_columns_meta]);

  const columns = useMemo(() => {
    return buildTonTkTheoNgayColumns(activeDate, dateColumnsMeta);
  }, [activeDate, dateColumnsMeta]);

  const groupedColumnsConfig = useMemo(() => {
    if (!dateColumnsMeta.length) return null;
    return [
      {
        groupName: 'Tồn theo ngày tạo (30 ngày gần nhất)',
        groupColumns: dateColumnsMeta.map((d) => d.key),
        groupStyle: {
          background: 'rgba(59, 130, 246, 0.12)',
          color: 'var(--brand-primary)',
          fontWeight: 800,
          textAlign: 'center',
          fontSize: '0.72rem',
          padding: '4px 6px',
          lineHeight: '1.2',
        },
      },
    ];
  }, [dateColumnsMeta]);

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
            📊 {reportTitle}
          </span>
          <span
            className="badge badge-purple"
            style={{ fontSize: '0.74rem', padding: '2px 10px', fontWeight: 700 }}
          >
            Mốc thời gian: {activeDate ? activeDate.split('-').reverse().join('/') : 'Hôm nay'}
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginLeft: '6px',
            }}
            title="Dữ liệu phân tích 30 ngày gần nhất tính từ ngày chọn"
          >
            <Layers size={13} /> 30 ngày lùi về quá khứ
          </span>
          {statsData?.last_data_update_vn && (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Thời điểm file QLCTKT được nạp gần nhất"
            >
              <Clock size={12} /> Cập nhật: {statsData.last_data_update_vn}
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
            Mốc tính:
          </span>
          <button
            type="button"
            onClick={handlePrevDay}
            className="btn btn-outline"
            style={{ padding: '2px 8px', fontSize: '0.78rem', height: '26px' }}
            title="Lùi 1 ngày"
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
            title="Tiến 1 ngày"
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
        reportKey="ton_tk_theo_ngay"
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
