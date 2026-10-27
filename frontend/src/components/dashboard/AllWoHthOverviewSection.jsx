import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Network, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  BarChart3, 
  Calendar, 
  ChevronRight,
  Users,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';
import { fixedWoApi } from '../../api/fixedWoApi';
import MaintenanceSpreadsheetTable from '../MaintenanceSpreadsheetTable';

export default function AllWoHthOverviewSection({
  excludeTuChoi = false,
  onOpenDrilldown,
}) {
  const [tableActiveTab, setTableActiveTab] = useState('group'); // 'group' | 'employee' | 'daily'
  const [showDetailTable, setShowDetailTable] = useState(false); // Default: not pressed, table hidden

  // 1. Fetch singleton All-Wo-HTH report info
  const { data: hthReport } = useQuery({
    queryKey: ['admin-all-wo-hth-report'],
    queryFn: fixedWoApi.getAllWoHthReport,
  });

  const reportId = hthReport?.id;

  // 2. Fetch statistics for All-Wo-HTH report
  const { data: statsData } = useQuery({
    queryKey: ['all-wo-hth-stats', reportId, excludeTuChoi],
    queryFn: () => fixedWoApi.getStats(reportId, { exclude_tu_choi: excludeTuChoi }),
    enabled: Boolean(reportId),
  });

  const summary = statsData?.summary || {};
  const byTag = statsData?.by_tag || [];
  const byGroup = statsData?.by_group || [];
  const byEmployee = statsData?.by_employee || [];

  // Prepare Chart 1 Data: Khối Lượng & Tiến Độ từng nhóm WO (Hoàn thành, Tồn việc, Quá hạn)
  const tagVolumeChartData = useMemo(() => {
    return byTag.map(t => ({
      name: t.key_name,
      'Hoàn thành': t.closed,
      'Tồn việc': Math.max(0, t.pending - t.overdue),
      'Quá hạn': t.overdue,
      total: t.total,
      rawTag: t.key_name,
    }));
  }, [byTag]);

  // Prepare Chart 2 Data: Tỷ Lệ Hoàn Thành (%) từng nhóm WO
  const tagRateChartData = useMemo(() => {
    return byTag.map(t => ({
      name: t.key_name,
      'Tỷ lệ hoàn thành (%)': t.completion_rate,
      total: t.total,
      closed: t.closed,
      rawTag: t.key_name,
    }));
  }, [byTag]);

  // Clickable drilldown helper from top card
  const handleCardCellClick = (metric, metricLabel) => {
    if (!onOpenDrilldown || !reportId) return;
    onOpenDrilldown(metric, metricLabel, null, null, {
      fixedWoReportId: reportId,
      filterType: 'all',
      targetName: 'Toàn Bộ All-Wo-HTH',
      filterId: null,
      isOther: false,
      activeMonth: statsData?.active_month,
      exclude_tu_choi: excludeTuChoi,
    });
  };

  // Clickable drilldown helper from charts
  const handleChartBarClick = (entry, metric = 'total') => {
    if (!entry || !onOpenDrilldown || !reportId) return;
    const tagName = entry.rawTag || entry.name;
    const row = byTag.find(t => t.key_name === tagName);
    onOpenDrilldown(metric, `Nhóm ${tagName}`, row, null, {
      fixedWoReportId: reportId,
      filterType: 'tag',
      targetName: tagName,
      filterId: null,
      isOther: tagName === 'Khác' || tagName === 'Chưa phân nhóm',
      activeMonth: statsData?.active_month,
      exclude_tu_choi: excludeTuChoi,
    });
  };

  // Clickable drilldown handler forwarded from standard MaintenanceSpreadsheetTable
  const handleTableDrilldown = (metric, metricLabel, row = null, subCategoryContext = null, extraParams = {}) => {
    if (!onOpenDrilldown || !reportId) return;
    const isTotalRow = !row;
    const fType = isTotalRow ? 'all' : (extraParams?.filterType || row?.filterType || tableActiveTab);
    const targetName = row ? row.key_name : 'Toàn Bộ All-Wo-HTH';

    onOpenDrilldown(metric, metricLabel, row, subCategoryContext, {
      fixedWoReportId: reportId,
      filterType: fType,
      targetName: targetName,
      filterId: row?.id ?? null,
      isOther: Boolean(row?.is_other),
      activeMonth: statsData?.active_month,
      exclude_tu_choi: excludeTuChoi,
      ...extraParams,
    });
  };

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* ============================================================ */}
      {/* 1. UI CARD TỔNG QUAN ALL-WO-HTH                              */}
      {/* ============================================================ */}
      <div 
        className="card"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1.5px solid rgba(14, 165, 233, 0.3)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 4px 20px -2px rgba(14, 165, 233, 0.1)',
          marginBottom: '22px'
        }}
      >
        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div 
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.35)',
                flexShrink: 0
              }}
            >
              <Network size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.18rem', fontWeight: 850, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  BÁO CÁO TIẾN ĐỘ TOÀN MẠNG: ALL-WO-HTH
                </h3>
                <span 
                  className="badge" 
                  style={{ 
                    background: 'rgba(14, 165, 233, 0.12)', 
                    color: '#0284c7', 
                    border: '1px solid rgba(14, 165, 233, 0.3)',
                    fontWeight: 750,
                    fontSize: '0.72rem'
                  }}
                >
                  ⚡ Nguồn WO Cố Định • 1. Tổng Quan
                </span>
                {statsData?.active_month && (
                  <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '1px 7px', fontWeight: 700 }}>
                    <Calendar size={11} style={{ marginRight: '3px' }} />
                    {statsData.active_month}
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Tổng hợp toàn bộ danh mục công việc điều phối theo các nhóm WO (KSVHKT, Cơ điện, NOC...). Bấm vào bất kỳ ô số liệu nào để tra cứu danh sách chi tiết.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Đã nạp: <strong style={{ color: '#0ea5e9' }}>{(summary.total ?? 0).toLocaleString()}</strong> mã WO
            </span>
          </div>
        </div>

        {/* 5 Primary Metric Stat Blocks */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '12px',
            marginBottom: '16px'
          }}
        >
          {/* Box 1: Tổng số */}
          <div 
            onClick={() => handleCardCellClick('total', 'Tổng Số WO Toàn Mạng')}
            style={{
              background: '#ffffff',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #0ea5e9',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
            className="hover-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>TỔNG SỐ WO</span>
              <Network size={14} style={{ color: '#0ea5e9' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 850, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {(summary.total ?? 0).toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#0ea5e9', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
              Xem toàn bộ <ChevronRight size={11} />
            </span>
          </div>

          {/* Box 2: Đã hoàn thành */}
          <div 
            onClick={() => handleCardCellClick('closed', 'WO Đã Hoàn Thành')}
            style={{
              background: '#ffffff',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #10b981',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
            className="hover-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>ĐÃ HOÀN THÀNH</span>
              <CheckCircle2 size={14} style={{ color: '#10b981' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#059669', fontFamily: 'var(--font-mono)' }}>
              {(summary.closed ?? 0).toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
              Hôm nay: +{summary.closed_today ?? 0} <ChevronRight size={11} />
            </span>
          </div>

          {/* Box 3: Đang tồn việc */}
          <div 
            onClick={() => handleCardCellClick('pending', 'WO Đang Tồn Việc')}
            style={{
              background: '#ffffff',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #f59e0b',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
            className="hover-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.74rem', color: '#d97706', fontWeight: 700 }}>ĐANG TỒN VIỆC</span>
              <Clock size={14} style={{ color: '#f59e0b' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#d97706', fontFamily: 'var(--font-mono)' }}>
              {(summary.pending ?? 0).toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
              Chờ CĐ: {summary.cho_cd_tiep_nhan ?? 0} <ChevronRight size={11} />
            </span>
          </div>

          {/* Box 4: Quá hạn */}
          <div 
            onClick={() => handleCardCellClick('overdue', 'WO Quá Hạn')}
            style={{
              background: '#ffffff',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #ef4444',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
            className="hover-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700 }}>TRỄ HẠN</span>
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#dc2626', fontFamily: 'var(--font-mono)' }}>
              {(summary.overdue ?? 0).toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
              Cần xử lý gấp <ChevronRight size={11} />
            </span>
          </div>

          {/* Box 5: Tỷ lệ hoàn thành % */}
          <div 
            style={{
              background: '#ffffff',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #8b5cf6',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.74rem', color: '#7c3aed', fontWeight: 700 }}>TỶ LỆ HOÀN THÀNH</span>
              <TrendingUp size={14} style={{ color: '#8b5cf6' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
              {summary.completion_rate ?? 0}%
            </div>
            {/* Progress bar */}
            <div style={{ width: '100%', height: '6px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
              <div 
                style={{ 
                  width: `${Math.min(100, Math.max(0, summary.completion_rate || 0))}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #8b5cf6, #10b981)',
                  borderRadius: '3px'
                }} 
              />
            </div>
          </div>
        </div>

        {/* Action Button: Xem chi tiết theo nhân viên/cụm */}
        <div 
          style={{ 
            paddingTop: '14px', 
            borderTop: '1px dashed var(--border-color)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}
        >
          <button
            type="button"
            onClick={() => setShowDetailTable(prev => !prev)}
            className={`btn ${showDetailTable ? 'btn-primary' : 'btn-outline'}`}
            style={{
              fontSize: '0.82rem',
              padding: '7px 18px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: 'var(--radius-md)',
              transition: 'all var(--transition-fast)',
              borderColor: showDetailTable ? undefined : 'rgba(14, 165, 233, 0.45)',
              color: showDetailTable ? '#ffffff' : '#0284c7',
              background: showDetailTable ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : 'rgba(14, 165, 233, 0.06)'
            }}
          >
            <Users size={15} />
            <span>{showDetailTable ? 'Ẩn chi tiết theo nhân viên/cụm' : 'Xem chi tiết theo nhân viên/cụm'}</span>
            {showDetailTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. BẢNG TỔNG HỢP: ALL-WO-HTH (CHỈ HIỆN KHI NHẤN NÚT)         */}
      {/* ============================================================ */}
      {showDetailTable && (
        <MaintenanceSpreadsheetTable
          key={`all-wo-hth-table-${tableActiveTab}`}
          title="BẢNG TỔNG HỢP: ALL-WO-HTH"
          subtitle="Phân bổ chi tiết số lượng WO toàn mạng theo Cụm/Đội, Nhân viên và NSLĐ từng ngày"
          badgeText="TOÀN MẠNG HTH"
          badgeType="badge-info"
          isChild={false}
          summary={summary}
          byEmployee={byEmployee}
          byGroup={byGroup}
          activeTab={tableActiveTab}
          onTabChange={setTableActiveTab}
          onDrilldown={handleTableDrilldown}
          excludeTuChoi={excludeTuChoi}
          exportFilename={`All_Wo_HTH_${statsData?.active_month || '2026'}`}
        />
      )}

      {/* ============================================================ */}
      {/* 3. BIỂU ĐỒ PHÂN TÍCH TIẾN ĐỘ THEO NHÓM WO (TAG)              */}
      {/* ============================================================ */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 850, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={18} style={{ color: '#0ea5e9' }} />
              🏷️ BIỂU ĐỒ PHÂN TÍCH TIẾN ĐỘ THEO NHÓM WO (TAG)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Thống kê số lượng, tiến độ hoàn thành và tỷ lệ hoàn thành (%) từng nhóm (KSVHKT, Cơ điện, NOC...). Nhấp vào cột để xem drilldown.
            </p>
          </div>
        </div>

        {/* 2 Charts Grid */}
        <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
          {/* Chart 1: Khối Lượng & Tiến Độ Từng Nhóm WO */}
          <div className="chart-card" style={{ padding: '16px 18px', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="chart-header" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Khối Lượng & Tiến Độ Từng Nhóm WO
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  So sánh Đã hoàn thành, Đang tồn việc và Quá hạn theo từng nhóm
                </p>
              </div>
              <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                {byTag.length} nhóm
              </span>
            </div>

            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tagVolumeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis 
                    dataKey="name" 
                    angle={-15} 
                    textAnchor="end" 
                    tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-primary)' }} 
                    interval={0} 
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)', 
                      fontSize: '0.78rem',
                      border: '1px solid var(--border-color)' 
                    }} 
                  />
                  <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: '0.76rem' }} />
                  <Bar 
                    dataKey="Hoàn thành" 
                    fill="#10b981" 
                    stackId="a" 
                    cursor="pointer"
                    onClick={(entry) => handleChartBarClick(entry, 'closed')}
                  />
                  <Bar 
                    dataKey="Tồn việc" 
                    fill="#0ea5e9" 
                    stackId="a" 
                    cursor="pointer"
                    onClick={(entry) => handleChartBarClick(entry, 'pending')}
                  />
                  <Bar 
                    dataKey="Quá hạn" 
                    fill="#ef4444" 
                    stackId="a" 
                    cursor="pointer"
                    onClick={(entry) => handleChartBarClick(entry, 'overdue')}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Tỷ Lệ Hoàn Thành (%) Từng Nhóm WO */}
          <div className="chart-card" style={{ padding: '16px 18px', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="chart-header" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Tỷ Lệ Hoàn Thành (%) Theo Từng Nhóm
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Mức độ hoàn thành chỉ tiêu đóng WO (Đóng / Tổng) của từng nhóm
                </p>
              </div>
              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                Target: 100%
              </span>
            </div>

            <div style={{ height: '300px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={tagRateChartData} 
                  layout="vertical"
                  margin={{ top: 10, right: 35, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis 
                    type="number" 
                    domain={[0, 100]} 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }} 
                    unit="%"
                  />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    tick={{ fontSize: 11, fontWeight: 650, fill: 'var(--text-primary)' }} 
                    width={90} 
                  />
                  <Tooltip 
                    formatter={(val, name, item) => [`${val}% (${item.payload.closed}/${item.payload.total} WO)`, name]}
                    contentStyle={{ 
                      borderRadius: '8px', 
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)', 
                      fontSize: '0.78rem',
                      border: '1px solid var(--border-color)' 
                    }} 
                  />
                  <Bar 
                    dataKey="Tỷ lệ hoàn thành (%)" 
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(entry) => handleChartBarClick(entry, 'total')}
                  >
                    {tagRateChartData.map((entry, index) => {
                      const rate = entry['Tỷ lệ hoàn thành (%)'] || 0;
                      const fill = rate >= 90 ? '#10b981' : rate >= 70 ? '#0ea5e9' : rate >= 50 ? '#f59e0b' : '#ef4444';
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                    <LabelList 
                      dataKey="Tỷ lệ hoàn thành (%)" 
                      position="right" 
                      formatter={(val) => `${val}%`}
                      style={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-primary)' }} 
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
