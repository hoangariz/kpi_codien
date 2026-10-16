import React, { useState } from 'react';
import LevelTable from '../shared/LevelTable';

/**
 * Báo cáo Bảo Dưỡng Tủ Hộp Cáp (THC):
 * Giữ nguyên 100% cột chỉ tiêu và phong cách màu sắc Excel nguyên bản của phân hệ CĐBR.
 */
/**
 * Thẻ KPI mini cho ThcReport
 */
export function getThcCardKpis(summary = {}) {
  return [
    { label: '% Đóng', value: `${summary.wo_rate || 0}%`, color: 'brand' },
    { label: 'Tồn việc', value: summary.pending_wos || 0, color: 'warning' },
    { label: 'Quá hạn', value: summary.overdue_wos || 0, color: 'danger' },
    { label: 'Tủ tồn', value: summary.pending_cabinets || 0, color: 'purple' },
    { label: 'Tủ quá hạn', value: summary.overdue_cabinets || 0, color: 'danger' },
  ];
}

export const THC_COLUMNS = [
  {
    key: 'wo_rate',
    label: '% Đóng',
    align: 'right',
    isRate: true,
    sortable: true,
    headerStyle: { background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)' },
    tooltip: 'Tỉ lệ hoàn thành WO (%): Đã đóng / Tổng WO',
  },
  {
    key: 'pending_wos',
    label: 'Tồn Việc',
    align: 'right',
    variant: 'warning',
    drilldownMetric: 'pending',
    sortable: true,
    headerStyle: { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)' },
    tooltip: 'Số công việc tồn chưa hoàn thành',
  },
  {
    key: 'overdue_wos',
    label: 'Quá Hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'overdue',
    sortable: true,
    headerStyle: { background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)' },
    tooltip: 'Số công việc bị quá hạn',
  },
  {
    key: 'pending_cabinets',
    label: 'Tủ Tồn',
    align: 'right',
    variant: 'warning',
    drilldownMetric: 'cabinet_pending',
    sortable: true,
    headerStyle: { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)' },
    tooltip: 'Số lượng tủ cáp THC con còn tồn chưa xong',
  },
  {
    key: 'overdue_cabinets',
    label: 'Tủ Quá Hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'cabinet_overdue',
    sortable: true,
    headerStyle: { background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)' },
    tooltip: 'Số lượng tủ cáp THC con chưa xong thuộc các WO quá hạn',
  },
  {
    key: 'closed_today',
    label: 'Hôm nay',
    align: 'right',
    variant: 'today',
    showPlus: true,
    drilldownMetric: 'closed_today',
    sortable: true,
    headerStyle: { background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)' },
    tooltip: 'Số WO hoàn thành hôm nay',
  },
  {
    key: 'closed_yesterday',
    label: 'Hôm qua',
    align: 'right',
    variant: 'yesterday',
    showPlus: true,
    drilldownMetric: 'closed_yesterday',
    sortable: true,
    headerStyle: { background: 'rgba(16, 185, 129, 0.06)', color: 'var(--success-dark)' },
    tooltip: 'Số WO hoàn thành hôm qua',
  },
  {
    key: 'closed_week',
    label: 'Tuần qua',
    align: 'right',
    variant: 'week',
    showPlus: true,
    drilldownMetric: 'closed_week',
    sortable: true,
    headerStyle: { background: 'rgba(2, 132, 199, 0.08)', color: 'var(--brand-primary)' },
    tooltip: 'Số WO hoàn thành tuần qua',
  },
  {
    key: 'total_wos',
    label: 'Tổng WO',
    align: 'right',
    drilldownMetric: 'total',
    sortable: true,
    tooltip: 'Tổng số công việc phát sinh trong kỳ',
  },
  {
    key: 'closed_wos',
    label: 'Đã đóng',
    align: 'right',
    variant: 'success',
    drilldownMetric: 'closed',
    sortable: true,
    tooltip: 'Số WO đã đóng hoàn thành',
  },
  {
    key: 'total_cabinets',
    label: 'Tổng Tủ',
    align: 'right',
    variant: 'purple',
    drilldownMetric: 'cabinet_total',
    sortable: true,
    tooltip: 'Tổng số tủ cáp THC con liên kết',
  },
  {
    key: 'completed_cabinets',
    label: 'Tủ xong',
    align: 'right',
    variant: 'success',
    drilldownMetric: 'cabinet_completed',
    sortable: true,
    tooltip: 'Số tủ cáp THC đã hoàn thành bảo dưỡng',
  },
  {
    key: 'cabinet_rate',
    label: 'Tỉ lệ Tủ',
    align: 'right',
    isRate: true,
    sortable: true,
    tooltip: 'Tiến độ hoàn thành bảo dưỡng tủ THC (%): Tủ xong / Tổng tủ',
  },
];

export default function ThcReport({
  statsData,
  selectedMonth,
  onMonthChange,
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = 'Bảo Dưỡng Tủ Hộp Cáp, Tuyến Cáp',
  lastUpdatedStr = null,
}) {
  const [level, setLevel] = useState('employee'); // Mặc định mở tab Nhân viên

  const rows =
    level === 'cluster'
      ? statsData?.by_cluster || []
      : level === 'team'
      ? statsData?.by_team || []
      : statsData?.by_employee || [];

  const summary = statsData?.summary || null;

  return (
    <LevelTable
      reportKey="thc"
      level={level}
      onLevelChange={setLevel}
      rows={rows}
      summary={summary}
      metricColumns={THC_COLUMNS}
      onDrilldown={onDrilldown}
      orgMetadata={orgMetadata}
      emptyOrg={emptyOrg}
      reportTitle={reportTitle}
      lastUpdatedStr={lastUpdatedStr}
      selectedMonth={selectedMonth}
      onMonthChange={onMonthChange}
      availableMonths={statsData?.available_months || []}
      statsData={statsData}
    />
  );
}
