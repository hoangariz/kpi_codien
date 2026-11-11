import React, { useState } from 'react';
import LevelTable from '../shared/LevelTable';

/**
 * Thẻ KPI mini cho BaoHongThcReport (hiển thị trên card chọn báo cáo)
 */
export function getBaoHongThcCardKpis(summary = {}) {
  return [
    { label: '% Đóng', value: `${summary.wo_rate || 0}%`, color: 'brand' },
    { label: 'Tồn việc', value: summary.pending_wos || 0, color: 'warning' },
    { label: 'Quá hạn', value: summary.overdue_wos || 0, color: 'danger' },
    { label: 'Tồn PDA', value: summary.ton_pda || 0, color: 'purple' },
    { label: 'Tồn Thay Hộp', value: summary.ton_thay_hop || 0, color: 'orange' },
  ];
}

export const BAO_HONG_THC_GROUPED_CONFIG = [
  {
    groupName: 'PDA',
    groupColumns: ['ton_pda', 'qua_han_pda'],
    groupStyle: { background: 'rgba(147, 51, 234, 0.12)', color: '#9333ea', fontWeight: 800 },
  },
  {
    groupName: 'Thay thế hộp',
    groupColumns: ['ton_thay_hop', 'qua_han_thay_hop'],
    groupStyle: { background: 'rgba(234, 88, 12, 0.12)', color: '#ea580c', fontWeight: 800 },
  },
];

export const BAO_HONG_THC_COLUMNS = [
  {
    key: 'total_wos',
    label: 'Tổng',
    align: 'right',
    drilldownMetric: 'total',
    sortable: true,
    tooltip: 'Tổng số WO báo hỏng hạ tầng mạng lưới THC',
  },
  {
    key: 'closed_wos',
    label: 'Đã đóng',
    align: 'right',
    variant: 'success',
    drilldownMetric: 'closed',
    sortable: true,
    headerStyle: { background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)' },
    tooltip: 'Số WO đã đóng (hoặc FT hoàn thành)',
  },
  {
    key: 'wo_rate',
    label: '% Đóng',
    align: 'right',
    isRate: true,
    sortable: true,
    headerStyle: { background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success-dark)' },
    tooltip: 'Tỉ lệ hoàn thành WO (%): Đã đóng / Tổng',
  },
  {
    key: 'pending_wos',
    label: 'Tồn việc',
    align: 'right',
    variant: 'warning',
    drilldownMetric: 'pending',
    sortable: true,
    headerStyle: { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)' },
    tooltip: 'Số WO tồn chưa hoàn thành (Trạng thái khác Đóng, FT hoàn thành)',
  },
  {
    key: 'overdue_wos',
    label: 'Quá hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'overdue',
    sortable: true,
    headerStyle: { background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)' },
    tooltip: 'Số WO tồn bị quá hạn',
  },
  {
    key: 'ton_pda',
    label: 'Tồn',
    align: 'right',
    variant: 'warning',
    drilldownMetric: 'ton_pda',
    sortable: true,
    headerStyle: { background: 'rgba(147, 51, 234, 0.08)', color: '#9333ea' },
    tooltip: 'Số WO tồn có nội dung chứa PDA',
  },
  {
    key: 'qua_han_pda',
    label: 'Quá hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'qua_han_pda',
    sortable: true,
    headerStyle: { background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger-dark)' },
    tooltip: 'Số WO quá hạn có nội dung chứa PDA',
  },
  {
    key: 'ton_thay_hop',
    label: 'Tồn',
    align: 'right',
    variant: 'warning',
    drilldownMetric: 'ton_thay_hop',
    sortable: true,
    headerStyle: { background: 'rgba(234, 88, 12, 0.08)', color: '#ea580c' },
    tooltip: 'Số WO tồn có nội dung chứa Thực hiện thay thế hộp',
  },
  {
    key: 'qua_han_thay_hop',
    label: 'Quá hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'qua_han_thay_hop',
    sortable: true,
    headerStyle: { background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger-dark)' },
    tooltip: 'Số WO quá hạn có nội dung chứa Thực hiện thay thế hộp',
  },
];

export default function BaoHongThcReport({
  statsData,
  selectedMonth,
  onMonthChange,
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = 'Báo hỏng Tủ hộp cáp (THC)',
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
      reportKey="bao_hong_thc"
      level={level}
      onLevelChange={setLevel}
      rows={rows}
      summary={summary}
      metricColumns={BAO_HONG_THC_COLUMNS}
      groupedColumnsConfig={BAO_HONG_THC_GROUPED_CONFIG}
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

