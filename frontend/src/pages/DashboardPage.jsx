import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Briefcase, 
  Users, 
  Wrench,
  BarChart3,
  Calendar,
  Layers,
  Search,
  Download,
  Info,
  FolderKanban,
  CheckCircle2,
  TrendingUp,
  Radio
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
  AreaChart,
  Area
} from 'recharts';

import { statsApi } from '../api/statsApi';
import { tasksApi } from '../api/tasksApi';
import KpiCard from '../components/KpiCard';
import TaskDrilldownModal from '../components/TaskDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';

export default function DashboardPage() {
  // Report selection state: 'maintenance' (default) | 'overview-charts'
  const [selectedReport, setSelectedReport] = useState('maintenance');
  const [maintActiveTab, setMaintActiveTab] = useState('employee'); // 'employee' | 'group'
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineDays, setTimelineDays] = useState(14);

  // Drilldown & Task Detail state
  const [drilldownFilter, setDrilldownFilter] = useState(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // Handlers for opening Drilldown & Detail Modals
  const handleOpenDrilldown = (metric, metricLabel, row = null) => {
    setDrilldownFilter({
      metric,
      metricLabel,
      filterType: row ? maintActiveTab : 'all',
      filterId: row?.id ?? null,
      isOther: Boolean(row?.is_other),
      targetName: row ? row.key_name : 'Toàn Bộ Báo Cáo',
      activeMonth: maintSpecial?.active_month,
      targetType: maintSpecial?.target_task_type,
    });
  };

  const handleOpenTaskDetail = async (taskOrCode) => {
    try {
      const code = typeof taskOrCode === 'string' ? taskOrCode : taskOrCode.ma_cong_viec;
      const fullTask = await tasksApi.getTaskDetail(code);
      setSelectedDetailTask(fullTask);
    } catch (err) {
      alert('Không thể tải chi tiết công việc: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Queries
  const { data: kpi } = useQuery({
    queryKey: ['kpi-summary'],
    queryFn: statsApi.getKpiOverview,
    refetchInterval: 30000,
  });

  const { data: maintSpecial, isLoading: loadingMaint } = useQuery({
    queryKey: ['stats-maintenance-special'],
    queryFn: () => statsApi.getMaintenanceSpecial(),
  });

  const { data: groupStats } = useQuery({
    queryKey: ['stats-by-group'],
    queryFn: () => statsApi.getByGroup(),
  });

  const { data: empStats } = useQuery({
    queryKey: ['stats-by-employee'],
    queryFn: () => statsApi.getByEmployee({ limit: 10 }),
  });

  const { data: timelineData } = useQuery({
    queryKey: ['stats-timeline', timelineDays],
    queryFn: () => statsApi.getTimeline(timelineDays),
  });

  // Prepare chart data for Groups (top 8)
  const groupChartData = (groupStats || []).slice(0, 8).map((g) => ({
    name: g.group_name.replace('Trung tâm ', 'TT.').replace(/\(.*\)/, ''),
    'Hoàn thành': g.completed,
    'Đang xử lý': g.in_progress,
    'Trễ hạn': g.overdue,
  }));

  // Prepare chart data for Employees (top 8)
  const empChartData = (empStats || []).slice(0, 8).map((e) => ({
    name: e.employee_name,
    'Hoàn thành': e.completed,
    'Đang xử lý': e.in_progress,
    'Trễ hạn': e.overdue,
  }));

  const formatMonthDisplay = (m) => {
    if (!m) return '';
    const parts = m.split('-');
    if (parts.length === 2) return `Tháng ${parts[1]}/${parts[0]}`;
    return m;
  };

  // Preload maintenance tasks into client-side cache for instant (0ms) drilldown
  React.useEffect(() => {
    if (maintSpecial?.active_month) {
      statsApi.preloadMaintenanceTasks(maintSpecial.active_month, maintSpecial.target_task_type);
    }
  }, [maintSpecial?.active_month, maintSpecial?.target_task_type]);

  // Sorting state for main report table
  const [maintSortKey, setMaintSortKey] = useState(null);
  const [maintSortOrder, setMaintSortOrder] = useState('desc'); // 'asc' | 'desc'

  const handleMaintSort = (key) => {
    if (maintSortKey === key) {
      setMaintSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setMaintSortKey(key);
      setMaintSortOrder(key === 'key_name' ? 'asc' : 'desc');
    }
  };

  const renderSortIndicator = (key) => {
    if (maintSortKey !== key) {
      return <span style={{ opacity: 0.35, fontSize: '0.65rem', marginLeft: '3px' }}>↕</span>;
    }
    return (
      <span style={{ color: 'var(--brand-primary)', fontWeight: 800, fontSize: '0.72rem', marginLeft: '3px' }}>
        {maintSortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const maintSummary = maintSpecial?.summary || {};
  const byEmployee = maintSpecial?.by_employee || [];
  const byGroup = maintSpecial?.by_group || [];

  const currentMaintList = maintActiveTab === 'employee' ? byEmployee : byGroup;
  const filteredMaintList = currentMaintList.filter(item => 
    !searchQuery.trim() || item.key_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Sắp xếp đa cột (giữ dòng 'Khác' luôn ở cuối)
  const sortedMaintList = [...filteredMaintList].sort((a, b) => {
    if (a.is_other) return 1;
    if (b.is_other) return -1;
    if (!maintSortKey) return 0;
    let cmp = 0;
    if (maintSortKey === 'key_name') {
      cmp = (a.key_name || '').localeCompare(b.key_name || '', 'vi');
    } else {
      const valA = Number(a[maintSortKey] ?? 0);
      const valB = Number(b[maintSortKey] ?? 0);
      cmp = valA - valB;
    }
    return maintSortOrder === 'asc' ? cmp : -cmp;
  });

  // Export CSV function
  const handleExportCSV = () => {
    const headers = [
      'STT',
      maintActiveTab === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm Điều Phối (Cụm)',
      'Tổng Số',
      'Đã Đóng',
      'Tồn Việc',
      'Quá Hạn',
      'Chờ CD Tiếp Nhận',
      'FT Hoàn Thành',
      'Đóng Hôm Nay',
      'Đóng Tuần Qua',
      'Tỉ Lệ Đóng (%)'
    ];

    const rows = sortedMaintList.map((row, idx) => [
      idx + 1,
      `"${row.key_name}"`,
      row.total,
      row.closed,
      row.pending,
      row.overdue,
      row.cho_cd_tiep_nhan || 0,
      row.ft_hoan_thanh || 0,
      row.closed_today,
      row.closed_last_7_days,
      `${row.completion_rate}%`
    ]);

    rows.push([
      'TỔNG CỘNG',
      '--',
      maintSummary.total ?? maintSpecial?.total_valid_records ?? 0,
      maintSummary.closed ?? 0,
      maintSummary.pending ?? 0,
      maintSummary.overdue ?? 0,
      maintSummary.cho_cd_tiep_nhan ?? 0,
      maintSummary.ft_hoan_thanh ?? 0,
      maintSummary.closed_today ?? 0,
      maintSummary.closed_last_7_days ?? 0,
      `${maintSummary.completion_rate ?? 0}%`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_duong_co_dien_${maintSpecial?.active_month || '2026-09'}_${maintActiveTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* 1. Overall KPI Cards */}
      <div className="kpi-grid">
        <KpiCard
          title="TỔNG CÔNG VIỆC TOÀN MẠNG"
          value={kpi?.total_tasks || 0}
          subtext={`${kpi?.total_groups || 0} nhóm • ${kpi?.total_employees || 0} nhân sự`}
          icon={Briefcase}
          color="blue"
        />
        <KpiCard
          title="ĐANG THỰC HIỆN"
          value={kpi?.in_progress_count || 0}
          subtext="Đang giao FT & tiếp nhận"
          icon={Clock}
          color="amber"
        />
        <KpiCard
          title="ĐÃ HOÀN THÀNH"
          value={kpi?.completed_count || 0}
          subtext={`Tỉ lệ hoàn thành: ${kpi?.completion_rate || 0}%`}
          icon={CheckCircle}
          color="green"
        />
        <KpiCard
          title="CÔNG VIỆC TRỄ HẠN"
          value={kpi?.overdue_count || 0}
          subtext="Cần tập trung đôn đốc"
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* 2. Hub Loại Báo Cáo - Bấm vào loại nào thì hiện báo cáo đó ngay bên dưới */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} style={{ color: 'var(--brand-primary)' }} />
              Danh Mục Loại Báo Cáo (Ấn vào loại báo cáo để hiển thị số liệu)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Chọn loại công việc cần xem báo cáo dạng bảng tính Excel hoặc biểu đồ tổng hợp
            </p>
          </div>
        </div>

        {/* Report Selector Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {/* Card 1: Bảo Dưỡng Cơ Điện (Active by default) */}
          <div 
            onClick={() => setSelectedReport('maintenance')}
            style={{
              cursor: 'pointer',
              padding: '18px',
              borderRadius: 'var(--radius-lg)',
              border: selectedReport === 'maintenance' ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)',
              background: selectedReport === 'maintenance' 
                ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%)' 
                : 'var(--bg-secondary)',
              boxShadow: selectedReport === 'maintenance' ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              transition: 'all var(--transition-fast)',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span 
                className={`badge ${selectedReport === 'maintenance' ? 'badge-info' : 'badge-neutral'}`}
                style={{ gap: '5px', fontWeight: 700 }}
              >
                <Wrench size={13} /> {selectedReport === 'maintenance' ? '● Đang Hiển Thị' : 'Bấm Để Xem Báo Cáo'}
              </span>
              <span className="badge badge-success" style={{ fontSize: '0.72rem', gap: '3px' }}>
                <Calendar size={11} /> {formatMonthDisplay(maintSpecial?.active_month)}
              </span>
            </div>

            <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.4 }}>
              Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS
            </h4>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
              Tự động loại bỏ các việc đã đóng tháng trước. Bảng tính chi tiết theo <strong>Nhân viên</strong> và <strong>Nhóm điều phối</strong>.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', textAlign: 'center', background: 'var(--bg-tertiary)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>TỔNG</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                  {maintSummary.total ?? maintSpecial?.total_valid_records ?? 0}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.62rem', color: 'var(--success-dark)', display: 'block' }}>ĐÃ ĐÓNG</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                  {maintSummary.closed ?? 0}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block' }}>TỒN</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                  {maintSummary.pending ?? 0}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.62rem', color: 'var(--danger-dark)', display: 'block' }}>QUÁ HẠN</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                  {maintSummary.overdue ?? 0}
                </strong>
              </div>
            </div>
          </div>

          {/* Card 2: Biểu Đồ Phân Tích Khối Lượng */}
          <div 
            onClick={() => setSelectedReport('overview-charts')}
            style={{
              cursor: 'pointer',
              padding: '18px',
              borderRadius: 'var(--radius-lg)',
              border: selectedReport === 'overview-charts' ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)',
              background: selectedReport === 'overview-charts' 
                ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%)' 
                : 'var(--bg-secondary)',
              boxShadow: selectedReport === 'overview-charts' ? 'var(--shadow-md)' : 'var(--shadow-sm)',
              transition: 'all var(--transition-fast)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span 
                className={`badge ${selectedReport === 'overview-charts' ? 'badge-info' : 'badge-neutral'}`}
                style={{ gap: '5px', fontWeight: 700 }}
              >
                <BarChart3 size={13} /> {selectedReport === 'overview-charts' ? '● Đang Hiển Thị' : 'Bấm Để Xem Biểu Đồ'}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Toàn mạng</span>
            </div>

            <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.4 }}>
              Biểu Đồ Phân Tích Khối Lượng & Xu Hướng Toàn Mạng
            </h4>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
              Biểu đồ trực quan so sánh tiến độ giữa các trung tâm điều phối, top nhân sự và xu hướng tạo/đóng việc theo ngày.
            </p>

            <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Bao gồm biểu đồ nhóm, top nhân sự và tiến độ 7/14/30 ngày
            </div>
          </div>

          {/* Card 3: Sự Cố CĐBR (Placeholder) */}
          <div 
            style={{
              padding: '18px',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border-color)',
              background: 'var(--bg-secondary)',
              opacity: 0.65,
              cursor: 'not-allowed'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>Sắp bổ sung</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>SPM / VTNET</span>
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Báo Cáo Sự Cố Cố Định Băng Rộng (CĐBR) & Đứt Cáp
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Thống kê thời gian xử lý sự cố, chỉ tiêu MTTR theo từng trạm viễn thông.
            </p>
          </div>

          {/* Card 4: Tuần Tra Tuyến Cáp (Placeholder) */}
          <div 
            style={{
              padding: '18px',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border-color)',
              background: 'var(--bg-secondary)',
              opacity: 0.65,
              cursor: 'not-allowed'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>Sắp bổ sung</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>WFM-FT</span>
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Báo Cáo Tuần Tra & Kiểm Tra Tuyến Cáp Nhà Trạm
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Theo dõi tiến độ kiểm tra nhà trạm định kỳ và xử lý hạ tầng cơ điện phát sinh.
            </p>
          </div>
        </div>
      </div>

      {/* 3. VÙNG HIỂN THỊ BÁO CÁO (ẤN VÀO THÌ HIỆN) */}

      {/* BÁO CÁO 1: BẢO DƯỠNG CƠ ĐIỆN (DẠNG BẢNG TÍNH EXCEL CHUYÊN BIỆT) */}
      {selectedReport === 'maintenance' && (
        <div style={{ marginBottom: '28px' }}>
          {/* Header Banner Báo Cáo (Compact) */}
          <div 
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 18px',
              marginBottom: '14px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-info" style={{ fontWeight: 700, fontSize: '0.75rem', padding: '2px 8px' }}>
                  <Wrench size={12} /> Báo Cáo Chuyên Sâu
                </span>
                <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.75rem', padding: '2px 8px' }}>
                  <Calendar size={12} /> {formatMonthDisplay(maintSpecial?.active_month)}
                </span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS
                </strong>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hệ thống: ICMS</span>
            </div>

            {/* Quick summary strip (Compact inline & Clickable) */}
            <div 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', 
                gap: '8px', 
                paddingTop: '10px',
                borderTop: '1px solid var(--border-color)'
              }}
            >
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('total', 'Tổng Công Việc')}
                title="Nhấn để xem toàn bộ danh sách công việc"
                style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>{maintSummary.total ?? maintSpecial?.total_valid_records ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('closed', 'Đã Đóng')}
                title="Nhấn để xem danh sách việc đã đóng"
                style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>{maintSummary.closed ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('pending', 'Tồn Việc')}
                title="Nhấn để xem danh sách việc tồn"
                style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>{maintSummary.pending ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('overdue', 'Quá Hạn')}
                title="Nhấn để xem danh sách việc quá hạn"
                style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>{maintSummary.overdue ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('cho_cd_tiep_nhan', 'Chờ CD Tiếp Nhận')}
                title="Nhấn để xem danh sách việc Chờ CD tiếp nhận"
                style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: '#7c3aed', display: 'block', fontWeight: 600 }}>Chờ CD Tiếp Nhận</span>
                <strong style={{ fontSize: '1.15rem', color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{maintSummary.cho_cd_tiep_nhan ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('ft_hoan_thanh', 'FT Hoàn Thành')}
                title="Nhấn để xem danh sách việc FT hoàn thành"
                style={{ background: 'rgba(6, 182, 212, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: '#0891b2', display: 'block', fontWeight: 600 }}>FT Hoàn Thành</span>
                <strong style={{ fontSize: '1.15rem', color: '#0891b2', fontFamily: 'var(--font-mono)' }}>{maintSummary.ft_hoan_thanh ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('closed_today', 'Đóng Hôm Nay')}
                title="Nhấn để xem danh sách việc đóng hôm nay (check FT hoàn thành)"
                style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Hôm Nay</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>+{maintSummary.closed_today ?? 0}</strong>
              </div>
              <div 
                className="cell-clickable"
                onClick={() => handleOpenDrilldown('closed_last_7_days', 'Đóng Tuần Qua')}
                title="Nhấn để xem danh sách việc đóng tuần qua (trạng thái = Đóng & FT hoàn thành 7 ngày qua)"
                style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}
              >
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Đóng Tuần Qua</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>{maintSummary.closed_last_7_days ?? 0}</strong>
              </div>
              <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tỉ Lệ Đóng</span>
                <strong style={{ fontSize: '1.15rem', fontFamily: 'var(--font-mono)', color: (maintSummary.completion_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' }}>
                  {maintSummary.completion_rate ?? 0}%
                </strong>
              </div>
            </div>
          </div>

          {/* Bảng tính Excel Tối Ưu Chiều Dọc & Tỉ Lệ Cột */}
          <div className="table-card">
            {/* Toolbar */}
            <div className="table-toolbar" style={{ padding: '8px 16px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className={`btn ${maintActiveTab === 'employee' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setMaintActiveTab('employee')}
                  style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
                >
                  <Users size={14} />
                  Theo Nhân Viên ({byEmployee.length})
                </button>
                <button
                  className={`btn ${maintActiveTab === 'group' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setMaintActiveTab('group')}
                  style={{ padding: '5px 12px', fontSize: '0.82rem', gap: '5px' }}
                >
                  <FolderKanban size={14} />
                  Theo Nhóm / Cụm ({byGroup.length})
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div className="search-input-box" style={{ width: '240px' }}>
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder={`Tìm ${maintActiveTab === 'employee' ? 'nhân viên' : 'nhóm/cụm'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem' }}
                  />
                </div>

                <button
                  className="btn btn-outline"
                  onClick={handleExportCSV}
                  title="Tải bảng dạng CSV / Excel"
                  style={{ gap: '5px', fontSize: '0.8rem', padding: '5px 12px' }}
                >
                  <Download size={14} /> Xuất Excel
                </button>
              </div>
            </div>

            {/* Excel-style Table Container */}
            <div style={{ overflowX: 'auto', borderBottom: '1px solid var(--border-color)' }}>
              <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th style={{ width: '38px', whiteSpace: 'nowrap' }}>STT</th>
                    <th 
                      style={{ textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('key_name')}
                      title="Nhấn để sắp xếp theo tên A-Z hoặc Z-A"
                    >
                      {maintActiveTab === 'employee' ? 'Nhân Viên Thực Hiện' : 'Nhóm / Cụm'}
                      {renderSortIndicator('key_name')}
                    </th>
                    <th 
                      style={{ width: '75px', background: 'rgba(2, 132, 199, 0.1)', color: 'var(--brand-primary)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('total')}
                      title="Nhấn để sắp xếp theo Tổng Số"
                    >
                      Tổng Số{renderSortIndicator('total')}
                    </th>
                    <th 
                      style={{ width: '75px', background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('closed')}
                      title="Nhấn để sắp xếp theo Đã Đóng"
                    >
                      Đã Đóng{renderSortIndicator('closed')}
                    </th>
                    <th 
                      style={{ width: '75px', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('pending')}
                      title="Nhấn để sắp xếp theo Tồn Việc"
                    >
                      Tồn Việc{renderSortIndicator('pending')}
                    </th>
                    <th 
                      style={{ width: '75px', background: 'rgba(239, 68, 68, 0.16)', color: 'var(--danger-dark)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('overdue')}
                      title="Nhấn để sắp xếp theo Quá Hạn"
                    >
                      Quá Hạn{renderSortIndicator('overdue')}
                    </th>
                    <th 
                      style={{ width: '82px', background: 'rgba(139, 92, 246, 0.12)', color: '#7c3aed', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('cho_cd_tiep_nhan')}
                      title="Nhấn để sắp xếp theo Chờ CD Nhận"
                    >
                      Chờ CD Nhận{renderSortIndicator('cho_cd_tiep_nhan')}
                    </th>
                    <th 
                      style={{ width: '82px', background: 'rgba(6, 182, 212, 0.12)', color: '#0891b2', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('ft_hoan_thanh')}
                      title="Nhấn để sắp xếp theo FT Hoàn Thành"
                    >
                      FT Hoàn Thành{renderSortIndicator('ft_hoan_thanh')}
                    </th>
                    <th 
                      style={{ width: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('closed_today')}
                      title="Nhấn để sắp xếp theo Đóng Hôm Nay"
                    >
                      Đóng Hôm Nay{renderSortIndicator('closed_today')}
                    </th>
                    <th 
                      style={{ width: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('closed_last_7_days')}
                      title="Nhấn để sắp xếp theo Đóng Tuần Qua"
                    >
                      Đóng Tuần Qua{renderSortIndicator('closed_last_7_days')}
                    </th>
                    <th 
                      style={{ textAlign: 'left', paddingLeft: '14px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleMaintSort('completion_rate')}
                      title="Nhấn để sắp xếp theo Tỉ Lệ Đóng"
                    >
                      Tỉ Lệ Đóng (%){renderSortIndicator('completion_rate')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMaintList.map((row, index) => (
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
                      <td 
                        className="cell-num cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.total} công việc của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('total', 'Tổng Số', row)}
                      >
                        {row.total}
                      </td>
                      <td 
                        className="cell-num cell-closed cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed} việc đã đóng của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('closed', 'Đã Đóng', row)}
                      >
                        {row.closed}
                      </td>
                      <td 
                        className="cell-num cell-pending cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.pending} việc tồn của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('pending', 'Tồn Việc', row)}
                      >
                        {row.pending}
                      </td>
                      <td 
                        className="cell-num cell-overdue cell-clickable" 
                        style={{ width: '75px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.overdue} việc quá hạn của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('overdue', 'Quá Hạn', row)}
                      >
                        {row.overdue > 0 ? row.overdue : '0'}
                      </td>
                      <td 
                        className="cell-num cell-clickable" 
                        style={{ width: '82px', whiteSpace: 'nowrap', color: '#7c3aed', background: 'rgba(139, 92, 246, 0.05)', fontWeight: 700 }}
                        title={`Nhấn để xem ${row.cho_cd_tiep_nhan || 0} việc chờ CD tiếp nhận của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('cho_cd_tiep_nhan', 'Chờ CD Tiếp Nhận', row)}
                      >
                        {row.cho_cd_tiep_nhan || 0}
                      </td>
                      <td 
                        className="cell-num cell-clickable" 
                        style={{ width: '82px', whiteSpace: 'nowrap', color: '#0891b2', background: 'rgba(6, 182, 212, 0.05)', fontWeight: 700 }}
                        title={`Nhấn để xem ${row.ft_hoan_thanh || 0} việc FT hoàn thành của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('ft_hoan_thanh', 'FT Hoàn Thành', row)}
                      >
                        {row.ft_hoan_thanh || 0}
                      </td>
                      <td 
                        className="cell-num cell-today cell-clickable" 
                        style={{ width: '85px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed_today} việc đóng hôm nay của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('closed_today', 'Đóng Hôm Nay', row)}
                      >
                        {row.closed_today > 0 ? `+${row.closed_today}` : '0'}
                      </td>
                      <td 
                        className="cell-num cell-week cell-clickable" 
                        style={{ width: '85px', whiteSpace: 'nowrap' }}
                        title={`Nhấn để xem ${row.closed_last_7_days} việc đóng 7 ngày qua của ${row.key_name}`}
                        onClick={() => handleOpenDrilldown('closed_last_7_days', 'Đóng Tuần Qua', row)}
                      >
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
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Excel Summary Row */}
                  <tr className="excel-summary-row">
                    <td colSpan={2} style={{ textAlign: 'right', paddingRight: '16px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      TỔNG CỘNG ({filteredMaintList.length} hàng):
                    </td>
                    <td 
                      className="cell-num cell-clickable" 
                      style={{ width: '75px', fontSize: '0.98rem', color: 'var(--brand-primary)' }}
                      title="Nhấn để xem toàn bộ danh sách công việc"
                      onClick={() => handleOpenDrilldown('total', 'Tổng Số')}
                    >
                      {maintSummary.total ?? maintSpecial?.total_valid_records ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-closed cell-clickable" 
                      style={{ width: '75px', fontSize: '0.98rem' }}
                      title="Nhấn để xem toàn bộ việc đã đóng"
                      onClick={() => handleOpenDrilldown('closed', 'Đã Đóng')}
                    >
                      {maintSummary.closed ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-pending cell-clickable" 
                      style={{ width: '75px', fontSize: '0.98rem' }}
                      title="Nhấn để xem toàn bộ việc đang tồn"
                      onClick={() => handleOpenDrilldown('pending', 'Tồn Việc')}
                    >
                      {maintSummary.pending ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-overdue cell-clickable" 
                      style={{ width: '75px', fontSize: '0.98rem' }}
                      title="Nhấn để xem toàn bộ việc quá hạn"
                      onClick={() => handleOpenDrilldown('overdue', 'Quá Hạn')}
                    >
                      {maintSummary.overdue ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-clickable" 
                      style={{ width: '82px', fontSize: '0.98rem', color: '#7c3aed', background: 'rgba(139, 92, 246, 0.08)' }}
                      title="Nhấn để xem toàn bộ việc chờ CD tiếp nhận"
                      onClick={() => handleOpenDrilldown('cho_cd_tiep_nhan', 'Chờ CD Tiếp Nhận')}
                    >
                      {maintSummary.cho_cd_tiep_nhan ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-clickable" 
                      style={{ width: '82px', fontSize: '0.98rem', color: '#0891b2', background: 'rgba(6, 182, 212, 0.08)' }}
                      title="Nhấn để xem toàn bộ việc FT hoàn thành"
                      onClick={() => handleOpenDrilldown('ft_hoan_thanh', 'FT Hoàn Thành')}
                    >
                      {maintSummary.ft_hoan_thanh ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-today cell-clickable" 
                      style={{ width: '85px', fontSize: '0.98rem' }}
                      title="Nhấn để xem toàn bộ việc đóng hôm nay"
                      onClick={() => handleOpenDrilldown('closed_today', 'Đóng Hôm Nay')}
                    >
                      +{maintSummary.closed_today ?? 0}
                    </td>
                    <td 
                      className="cell-num cell-week cell-clickable" 
                      style={{ width: '85px', fontSize: '0.98rem' }}
                      title="Nhấn để xem toàn bộ việc đóng 7 ngày qua"
                      onClick={() => handleOpenDrilldown('closed_last_7_days', 'Đóng Tuần Qua')}
                    >
                      {maintSummary.closed_last_7_days ?? 0}
                    </td>
                    <td style={{ padding: '3px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <div style={{ flex: 1, height: '9px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
                          <div 
                            style={{ 
                              width: `${Math.min(100, Math.max(0, maintSummary.completion_rate || 0))}%`, 
                              height: '100%', 
                              background: (maintSummary.completion_rate || 0) >= 80 ? 'var(--success)' : 'var(--brand-primary)',
                              borderRadius: '4px'
                            }} 
                          />
                        </div>
                        <span style={{ fontSize: '0.92rem', fontFamily: 'var(--font-mono)', fontWeight: 800, minWidth: '46px', textAlign: 'right', color: 'var(--brand-primary)' }}>
                          {maintSummary.completion_rate ?? 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footnote */}
            <div style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={14} style={{ color: 'var(--brand-primary)' }} />
              <span>
                <strong>Ghi chú quy tắc:</strong> Bảng đã áp dụng cơ chế tự động loại bỏ các công việc đã Đóng trước {formatMonthDisplay(maintSpecial?.active_month)}.
                Các công việc có cụm trống hoặc nhân viên trống được tự động gom vào nhóm <strong>"Khác"</strong> ở cuối bảng.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* BÁO CÁO 2: BIỂU ĐỒ PHÂN TÍCH KHỐI LƯỢNG & XU HƯỚNG TOÀN MẠNG */}
      {selectedReport === 'overview-charts' && (
        <div style={{ marginBottom: '32px' }}>
          {/* Charts Row 1: Groups & Employees */}
          <div className="charts-grid">
            {/* Chart by Group */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Thống Kê Khối Lượng Theo Nhóm Điều Phối</h3>
                  <p className="chart-subtitle">Phân bổ tiến độ thực hiện theo từng trung tâm</p>
                </div>
                <BarChart3 size={18} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={groupChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Hoàn thành" fill="#10b981" stackId="a" />
                    <Bar dataKey="Đang xử lý" fill="#0284c7" stackId="a" />
                    <Bar dataKey="Trễ hạn" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart by Employee */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3 className="chart-title">Top Nhân Viên Nhận Việc Nhiều Nhất</h3>
                  <p className="chart-subtitle">Khối lượng và kết quả theo từng nhân sự</p>
                </div>
                <Users size={18} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={empChartData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={85} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Hoàn thành" fill="#10b981" stackId="a" />
                    <Bar dataKey="Đang xử lý" fill="#0284c7" stackId="a" />
                    <Bar dataKey="Trễ hạn" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Chart Row 2: Timeline Trends */}
          <div className="chart-card" style={{ marginTop: '20px' }}>
            <div className="chart-header">
              <div>
                <h3 className="chart-title">Xu Hướng Công Việc Theo Ngày</h3>
                <p className="chart-subtitle">So sánh tiến độ tạo mới và đóng/hoàn thành công việc</p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className={`btn ${timelineDays === 7 ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setTimelineDays(7)}
                >
                  7 ngày
                </button>
                <button
                  className={`btn ${timelineDays === 14 ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setTimelineDays(14)}
                >
                  14 ngày
                </button>
                <button
                  className={`btn ${timelineDays === 30 ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setTimelineDays(30)}
                >
                  30 ngày
                </button>
              </div>
            </div>

            <div style={{ height: '260px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData || []} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} />
                  <Area type="monotone" dataKey="created_count" name="Tạo mới" stroke="#0284c7" fillOpacity={1} fill="url(#colorCreated)" />
                  <Area type="monotone" dataKey="completed_count" name="Hoàn thành/Đóng" stroke="#10b981" fillOpacity={1} fill="url(#colorCompleted)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 4. CỬA SỔ XEM CHI TIẾT SỐ LIỆU (DRILLDOWN MODAL) */}
      {drilldownFilter && (
        <TaskDrilldownModal
          isOpen={Boolean(drilldownFilter)}
          onClose={() => setDrilldownFilter(null)}
          filterInfo={drilldownFilter}
          onSelectTask={handleOpenTaskDetail}
        />
      )}

      {/* 5. CỬA SỔ XEM CHI TIẾT TỪNG CÔNG VIỆC, LỊCH SỬ & GHI CHÚ (TASK DETAIL MODAL) */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onNoteAdded={async (ma_cong_viec) => {
            try {
              const updated = await tasksApi.getTaskDetail(ma_cong_viec);
              setSelectedDetailTask(updated);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
