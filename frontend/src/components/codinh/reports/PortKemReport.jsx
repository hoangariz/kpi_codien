import React, { useState } from 'react';
import LevelTable from '../shared/LevelTable';

/**
 * Báo cáo Điều Hành Port Kém:
 * Giữ nguyên 100% cột chỉ tiêu và phong cách màu sắc Excel nguyên bản của phân hệ CĐBR.
 */
/**
 * Thẻ KPI mini cho PortKemReport
 */
export function getPortKemCardKpis(summary = {}) {
  return [
    { label: '% Đóng', value: `${summary.wo_rate || 0}%`, color: 'brand' },
    { label: 'Tồn việc', value: summary.pending_wos || 0, color: 'warning' },
    { label: 'Home kém', value: summary.home_kem_count || 0, color: 'purple' },
    { label: 'Port kém', value: summary.port_kem_count || 0, color: 'cyan' },
    { label: 'Hôm qua', value: summary.closed_yesterday_wos || summary.closed_yesterday || 0, color: 'success' },
  ];
}

export const PORT_KEM_COLUMNS = [
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
    tooltip: 'Số công việc tồn chưa xử lý',
  },
  {
    key: 'home_kem_count',
    label: 'Home Kém',
    align: 'right',
    variant: 'purple',
    drilldownMetric: 'home_kem',
    sortable: true,
    headerStyle: { background: 'rgba(147, 51, 234, 0.08)', color: '#9333ea' },
    tooltip: 'Đầu việc: Home Wifi thu kém đang tồn',
  },
  {
    key: 'port_kem_count',
    label: 'Port Kém',
    align: 'right',
    variant: 'cyan',
    drilldownMetric: 'port_kem',
    sortable: true,
    headerStyle: { background: 'rgba(6, 182, 212, 0.08)', color: '#0891b2' },
    tooltip: 'Đầu việc: Port kém GPON đang tồn',
  },
  {
    key: 'overdue_wos',
    label: 'Quá Hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'overdue',
    sortable: true,
    headerStyle: { background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)' },
    tooltip: 'Số WO tồn đã trễ hạn',
  },
  {
    key: 'kpi_24h_rate',
    label: 'KPI 24h',
    align: 'right',
    isRate: true,
    sortable: true,
    headerStyle: { background: 'rgba(99, 102, 241, 0.08)', color: '#6366f1' },
    tooltip: 'Tỉ lệ hoàn thành ≤ 24h (%): Đóng 24h / Tổng đã đóng',
  },
  {
    key: 'kpi_72h_rate',
    label: 'KPI 72h',
    align: 'right',
    isRate: true,
    sortable: true,
    headerStyle: { background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)' },
    tooltip: 'Tỉ lệ hoàn thành ≤ 72h (%): Đóng 72h / Tổng đã đóng',
  },
  {
    key: 'pending_under_24h',
    label: 'Tồn < 24h',
    align: 'right',
    drilldownMetric: 'pending_under_24h',
    sortable: true,
    tooltip: 'WO tồn dưới 1 ngày (< 24 giờ)',
  },
  {
    key: 'pending_under_72h',
    label: 'Tồn < 72h',
    align: 'right',
    drilldownMetric: 'pending_under_72h',
    sortable: true,
    tooltip: 'WO tồn dưới 3 ngày (< 72 giờ)',
  },
  {
    key: 'closed_within_24h',
    label: 'Đóng ≤ 24h',
    align: 'right',
    variant: 'success',
    drilldownMetric: 'kpi_24h',
    sortable: true,
    tooltip: 'Số WO hoàn thành trong vòng 24 giờ từ lúc tạo/bắt đầu',
  },
  {
    key: 'closed_within_72h',
    label: 'Đóng ≤ 72h',
    align: 'right',
    variant: 'success',
    drilldownMetric: 'kpi_72h',
    sortable: true,
    tooltip: 'Số WO hoàn thành trong vòng 72 giờ từ lúc tạo/bắt đầu',
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
    tooltip: 'Tổng số công việc port kém',
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
];

export default function PortKemReport({
  statsData,
  selectedMonth,
  onMonthChange,
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = 'ĐH Port Kém & Home Wifi Thu Kém',
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
      reportKey="port_kem"
      level={level}
      onLevelChange={setLevel}
      rows={rows}
      summary={summary}
      metricColumns={PORT_KEM_COLUMNS}
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
