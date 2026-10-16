import React, { useState } from 'react';
import { FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import LevelTable from '../shared/LevelTable';

/**
 * File mẫu để bổ sung báo cáo mới cho phân hệ Cố Định Băng Rộng (CĐBR).
 * 
 * Các bước:
 * 1. Sao chép file này sang tên báo cáo mới (ví dụ: MyNewReport.jsx).
 * 2. Khai báo các cột số liệu trong mảng `MY_REPORT_COLUMNS`.
 * 3. Khai báo các thẻ KPI mini trong `getMyReportCardKpis`.
 * 4. Đăng ký component mới trong `frontend/src/components/codinh/registry.js`.
 */
export const TEMPLATE_COLUMNS = [
  {
    key: 'total_wos',
    label: 'Tổng WO',
    align: 'right',
    drilldownMetric: 'total',
    tooltip: 'Tổng số công việc phát sinh',
  },
  {
    key: 'closed_wos',
    label: 'Đã đóng',
    align: 'right',
    variant: 'success',
    drilldownMetric: 'closed',
    tooltip: 'Số WO đã hoàn thành đóng',
  },
  {
    key: 'pending_wos',
    label: 'Tồn WO',
    align: 'right',
    variant: 'warning',
    drilldownMetric: 'pending',
    tooltip: 'Số WO đang tồn chưa xử lý',
  },
  {
    key: 'overdue_wos',
    label: 'Quá hạn',
    align: 'right',
    variant: 'danger',
    drilldownMetric: 'overdue',
    tooltip: 'Số WO tồn đã quá hạn xử lý',
  },
  {
    key: 'wo_rate',
    label: 'Tỉ lệ WO',
    align: 'right',
    isRate: true,
    tooltip: 'Tỉ lệ hoàn thành WO (%)',
  },
];

export function getTemplateCardKpis(summary = {}) {
  const totW = summary.total_wos || 0;
  const clsW = summary.closed_wos || 0;
  const pndW = summary.pending_wos || 0;

  return [
    {
      id: 'total_wos',
      label: 'Tổng WO',
      value: totW.toLocaleString('vi-VN'),
      subValue: 'Phát sinh trong kỳ',
      icon: FileText,
      color: 'blue',
      metric: 'total',
    },
    {
      id: 'closed_wos',
      label: 'WO Đã Đóng',
      value: clsW.toLocaleString('vi-VN'),
      subValue: 'Đã hoàn thành',
      icon: CheckCircle2,
      color: 'emerald',
      metric: 'closed',
    },
    {
      id: 'pending_wos',
      label: 'WO Đang Tồn',
      value: pndW.toLocaleString('vi-VN'),
      subValue: 'Chưa đóng',
      icon: Clock,
      color: 'amber',
      metric: 'pending',
    },
  ];
}

export default function TemplateReport({
  statsData,
  onDrilldown,
  orgMetadata = {},
  reportTitle = 'Tên Báo Cáo Mới',
  lastUpdatedStr = null,
}) {
  const [level, setLevel] = useState('employee');

  const rows =
    level === 'cluster'
      ? statsData?.by_cluster || []
      : level === 'team'
      ? statsData?.by_team || []
      : statsData?.by_employee || [];

  const summary = statsData?.summary || null;

  return (
    <LevelTable
      reportKey="template"
      level={level}
      onLevelChange={setLevel}
      rows={rows}
      summary={summary}
      metricColumns={TEMPLATE_COLUMNS}
      onDrilldown={onDrilldown}
      orgMetadata={orgMetadata}
      reportTitle={reportTitle}
      lastUpdatedStr={lastUpdatedStr}
    />
  );
}
