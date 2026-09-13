import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Radio,
  BookmarkCheck,
  Flame,
  Plus,
  Trash2,
  Eye,
  Filter,
  XCircle,
  UserCheck
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
import { trackingApi } from '../api/trackingApi';
import { reportCategoryApi } from '../api/reportCategoryApi';
import KpiCard from '../components/KpiCard';
import TaskDrilldownModal from '../components/TaskDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';
import MaintenanceSpreadsheetTable from '../components/MaintenanceSpreadsheetTable';

export default function DashboardPage() {
  const queryClient = useQueryClient();

  // Report selection state: 'maintenance' (default) | 'overview-charts'
  const [selectedReport, setSelectedReport] = useState('maintenance');
  const [activeCategoryId, setActiveCategoryId] = useState(1);
  const [maintActiveTab, setMaintActiveTab] = useState('employee'); // 'employee' | 'group'
  const [activeSubCategoryFilter, setActiveSubCategoryFilter] = useState('all'); // 'all' | 'parent' | sub_category_id
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineDays, setTimelineDays] = useState(14);

  // Fetch report categories
  const { data: reportCategories } = useQuery({
    queryKey: ['report-categories'],
    queryFn: () => reportCategoryApi.getCategories(),
  });

  const activeCategory = (reportCategories || []).find(c => c.id === activeCategoryId) || (reportCategories || [])[0];
  const activeTaskType = activeCategory?.loai_cong_viec || 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS';

  // Tracking Board Filter state (for lower maintenance report)
  const [selectedBoardId, setSelectedBoardId] = useState('');

  // High-priority tracking board state (for the dedicated dashboard tracking section)
  const [activeHighBoardId, setActiveHighBoardId] = useState('');
  const [highTrackingSearch, setHighTrackingSearch] = useState('');
  const [quickAddWoCode, setQuickAddWoCode] = useState('');

  // Fetch list of tracking boards
  const { data: trackingBoards } = useQuery({
    queryKey: ['tracking-boards'],
    queryFn: trackingApi.getBoards,
  });

  // Automatically select the first board if none selected yet
  useEffect(() => {
    if (trackingBoards && trackingBoards.length > 0 && !activeHighBoardId) {
      setActiveHighBoardId(String(trackingBoards[0].id));
    }
  }, [trackingBoards, activeHighBoardId]);

  // Fetch selected board detail (for lower maintenance report filter)
  const { data: selectedBoardDetail } = useQuery({
    queryKey: ['tracking-board-detail', selectedBoardId],
    queryFn: () => trackingApi.getBoardDetail(Number(selectedBoardId)),
    enabled: Boolean(selectedBoardId),
  });

  const selectedBoard = (trackingBoards || []).find(b => String(b.id) === String(selectedBoardId));
  const selectedBoardCodes = selectedBoardDetail?.tasks?.map(t => t.ma_cong_viec) || null;

  // Fetch detail of active high-priority tracking board
  const { data: activeHighBoardDetail, isLoading: loadingHighBoard, refetch: refetchHighBoard } = useQuery({
    queryKey: ['tracking-board-detail', activeHighBoardId],
    queryFn: () => trackingApi.getBoardDetail(Number(activeHighBoardId)),
    enabled: Boolean(activeHighBoardId),
  });

  const activeHighBoard = (trackingBoards || []).find(b => String(b.id) === String(activeHighBoardId));
  const highTasks = activeHighBoardDetail?.tasks || [];
  const highTotal = highTasks.length;
  const highClosed = highTasks.filter(t => t.trang_thai === 'Đóng').length;
  const highPending = highTasks.filter(t => t.trang_thai && t.trang_thai !== 'Đóng').length;
  const highOverdue = highTasks.filter(t => t.trang_thai !== 'Đóng' && t.thoi_gian_con_lai != null && t.thoi_gian_con_lai < 0).length;
  const highRate = highTotal > 0 ? Math.round((highClosed / highTotal) * 100) : 0;

  // Mutation: Quick add WO to active high-priority tracking board
  const addHighTaskMutation = useMutation({
    mutationFn: ({ boardId, ma_cong_viec }) => trackingApi.addTaskToBoard(boardId, ma_cong_viec),
    onSuccess: () => {
      setQuickAddWoCode('');
      refetchHighBoard();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi thêm WO vào bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Mutation: Remove WO from active high-priority tracking board
  const removeHighTaskMutation = useMutation({
    mutationFn: ({ boardId, ma_cong_viec }) => trackingApi.removeTaskFromBoard(boardId, ma_cong_viec),
    onSuccess: () => {
      refetchHighBoard();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi gỡ WO khỏi bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Drilldown & Task Detail state
  const [drilldownFilter, setDrilldownFilter] = useState(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // Handlers for opening Drilldown & Detail Modals
  const handleOpenDrilldown = (metric, metricLabel, row = null, subContext = null) => {
    setDrilldownFilter({
      metric,
      metricLabel,
      filterType: row ? maintActiveTab : 'all',
      filterId: row?.id ?? null,
      isOther: Boolean(row?.is_other),
      targetName: row ? row.key_name : (subContext?.subCategoryName || 'Toàn Bộ Báo Cáo'),
      activeMonth: maintSpecial?.active_month,
      targetType: activeTaskType,
      excludeClosedPriorMonths: activeCategory?.exclude_closed_prior_months !== false,
      boardId: selectedBoardId ? Number(selectedBoardId) : undefined,
      boardCodes: selectedBoardCodes || undefined,
      boardName: selectedBoard ? selectedBoard.name : undefined,
      subCategoryId: subContext?.subCategoryId,
      subKeyword: subContext?.subKeyword,
      isSubOther: subContext?.isSubOther,
      allSubKeywords: subContext?.allSubKeywords,
      subCategoryName: subContext?.subCategoryName,
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
    queryKey: ['stats-maintenance-special', activeTaskType, selectedBoardId],
    queryFn: () => statsApi.getMaintenanceSpecial({
      task_type: activeTaskType,
      board_id: selectedBoardId ? Number(selectedBoardId) : undefined
    }),
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

  const subCategoriesList = (maintSpecial?.sub_categories && maintSpecial.sub_categories.length > 0)
    ? maintSpecial.sub_categories
    : (maintSpecial?.sub_categories_stats && maintSpecial.sub_categories_stats.length > 0)
      ? maintSpecial.sub_categories_stats
      : (activeCategory?.sub_categories && activeCategory.sub_categories.length > 0)
        ? activeCategory.sub_categories
        : [
            { id: 1, name: 'Bảo dưỡng điều hòa', keyword: 'CONDITIONER', description: 'Bảo dưỡng hệ thống điều hòa', summary: { total: 0 } },
            { id: 2, name: 'Bảo dưỡng máy phát điện', keyword: 'GENERATOR', description: 'Bảo dưỡng tổ máy phát điện', summary: { total: 0 } },
            { id: 3, name: 'Thông gió lọc bụi', keyword: 'VENTILATION', description: 'Thông gió và hệ thống lọc bụi ICMS', summary: { total: 0 } },
            { id: 0, name: 'Còn lại / Khác', keyword: 'KHÁC', description: 'Các công việc khác không thuộc từ khóa trên', is_other: true, summary: { total: 0 } }
          ];

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
        <KpiCard
          title="FT / CĐ TỪ CHỐI"
          value={kpi?.tu_choi_count || 0}
          subtext={`Quá hạn từ chối: ${kpi?.overdue_tu_choi_count || 0} • FT: ${kpi?.ft_tu_choi_count || 0} • CĐ: ${kpi?.cd_tu_choi_count || 0}`}
          icon={XCircle}
          color="rose"
        />
        <KpiCard
          title="FT HOÀN THÀNH"
          value={kpi?.ft_hoan_thanh_count || 0}
          subtext="Đang chờ cơ điện nghiệm thu"
          icon={CheckCircle2}
          color="cyan"
        />
        <KpiCard
          title="CHỜ CĐ TIẾP NHẬN"
          value={kpi?.cho_cd_tiep_nhan_count || 0}
          subtext="Việc mới chưa phân phối"
          icon={UserCheck}
          color="purple"
        />
      </div>

      {/* 2. MỤC: WO TRONG TRẠNG THÁI THEO DÕI CAO */}
      <div 
        className="table-card" 
        style={{ 
          padding: '20px 24px', 
          marginBottom: '26px',
          border: '1px solid rgba(139, 92, 246, 0.4)',
          background: 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(139, 92, 246, 0.03) 100%)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 4px 20px -2px rgba(139, 92, 246, 0.08)'
        }}
      >
        {/* Header Mục */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  WO Trong Trạng Thái Theo Dõi Cao
                </h3>
                <span className="badge badge-danger" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 800 }}>
                  TRỌNG ĐIỂM
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Board Tabs Pills if boards exist */}
        {trackingBoards && trackingBoards.length > 0 ? (
          <div>
            {/* Tab selector between boards */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Chọn bảng theo dõi:
              </span>
              {trackingBoards.map((b) => {
                const isActive = String(b.id) === String(activeHighBoardId);
                return (
                  <button
                    key={b.id}
                    onClick={() => setActiveHighBoardId(String(b.id))}
                    className={`btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
                    style={{
                      padding: '5px 14px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      gap: '6px',
                      borderRadius: '20px',
                      background: isActive ? '#8b5cf6' : 'var(--bg-tertiary)',
                      borderColor: isActive ? '#8b5cf6' : 'var(--border-color)',
                      color: isActive ? '#ffffff' : 'var(--text-primary)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span>📌 {b.name}</span>
                    <span 
                      style={{
                        padding: '1px 6px',
                        borderRadius: '10px',
                        background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(139, 92, 246, 0.15)',
                        color: isActive ? '#ffffff' : '#8b5cf6',
                        fontSize: '0.72rem',
                        fontWeight: 800
                      }}
                    >
                      {b.task_count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick summary stats strip for active board */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              padding: '12px 16px',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>TỔNG WO THEO DÕI</span>
                <strong style={{ fontSize: '1.2rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>{highTotal}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 600 }}>ĐANG TỒN (CHƯA ĐÓNG)</span>
                <strong style={{ fontSize: '1.2rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>{highPending}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--danger-dark)', display: 'block', fontWeight: 600 }}>QUÁ HẠN TIẾN ĐỘ</span>
                <strong style={{ fontSize: '1.2rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>{highOverdue}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--success-dark)', display: 'block', fontWeight: 600 }}>ĐÃ HOÀN THÀNH / ĐÓNG</span>
                <strong style={{ fontSize: '1.2rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>{highClosed}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>TỈ LỆ HOÀN THÀNH</span>
                <strong style={{ fontSize: '1.2rem', color: highRate >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                  {highRate}%
                </strong>
              </div>
            </div>

            {/* Action Bar: Quick add task code + Filter lower report + Search inside board */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '14px'
            }}>
              {/* Quick Add WO Code */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!quickAddWoCode.trim() || !activeHighBoardId) return;
                  addHighTaskMutation.mutate({
                    boardId: Number(activeHighBoardId),
                    ma_cong_viec: quickAddWoCode.trim()
                  });
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <input
                  type="text"
                  className="select-filter"
                  placeholder="Nhập mã WO cần theo dõi..."
                  value={quickAddWoCode}
                  onChange={(e) => setQuickAddWoCode(e.target.value)}
                  style={{ width: '220px', padding: '6px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={addHighTaskMutation.isPending || !quickAddWoCode.trim()}
                  style={{ padding: '6px 14px', fontSize: '0.82rem', gap: '5px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  <Plus size={14} /> {addHighTaskMutation.isPending ? 'Đang thêm...' : 'Thêm WO'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Button to sync filter to lower maintenance report */}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    if (selectedBoardId === String(activeHighBoardId)) {
                      setSelectedBoardId('');
                    } else {
                      setSelectedBoardId(String(activeHighBoardId));
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    gap: '5px',
                    fontWeight: 700,
                    borderColor: selectedBoardId === String(activeHighBoardId) ? 'var(--success-dark)' : 'rgba(139, 92, 246, 0.4)',
                    color: selectedBoardId === String(activeHighBoardId) ? 'var(--success-dark)' : '#8b5cf6',
                    background: selectedBoardId === String(activeHighBoardId) ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                  }}
                >
                  <Filter size={13} />
                  {selectedBoardId === String(activeHighBoardId)
                    ? '✓ Đang áp dụng lọc báo cáo phía dưới'
                    : '📊 Áp dụng lọc báo cáo phía dưới'}
                </button>

                {/* Search inside table */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="select-filter"
                    placeholder="Lọc mã WO, người thực hiện..."
                    value={highTrackingSearch}
                    onChange={(e) => setHighTrackingSearch(e.target.value)}
                    style={{ padding: '6px 10px 6px 30px', fontSize: '0.82rem', width: '200px' }}
                  />
                </div>
              </div>
            </div>

            {/* Table of tracked WOs */}
            <div style={{ overflowX: 'auto' }}>
              {loadingHighBoard ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Đang nạp danh sách công việc theo dõi...
                </div>
              ) : highTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>Chưa có công việc nào trong bảng "{activeHighBoard?.name}"</p>
                  <p style={{ fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                    Nhập mã công việc ở ô phía trên và bấm <strong>"Thêm WO"</strong> hoặc mở chi tiết công việc bất kỳ rồi bấm <strong>"Thêm vào bảng theo dõi"</strong>.
                  </p>
                </div>
              ) : (
                <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '38px', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '160px', textAlign: 'left' }}>Ghi Chú</th>
                      <th style={{ width: '130px', textAlign: 'left' }}>Mã Công Việc</th>
                      <th style={{ minWidth: '150px', textAlign: 'left' }}>Loại Công Việc</th>
                      <th style={{ width: '130px', textAlign: 'left' }}>Người Thực Hiện</th>
                      <th style={{ width: '120px', textAlign: 'left' }}>Nhóm Điều Phối</th>
                      <th style={{ width: '80px', textAlign: 'left' }}>Trạm</th>
                      <th style={{ width: '100px', textAlign: 'left' }}>Trạng Thái</th>
                      <th style={{ width: '110px', textAlign: 'left' }}>Thời Gian Còn Lại</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highTasks
                      .filter(t => {
                        if (!highTrackingSearch.trim()) return true;
                        const term = highTrackingSearch.trim().toLowerCase();
                        return (
                          (t.ma_cong_viec || '').toLowerCase().includes(term) ||
                          (t.employee_assigned_name || '').toLowerCase().includes(term) ||
                          (t.group_name || '').toLowerCase().includes(term) ||
                          (t.station_code || '').toLowerCase().includes(term) ||
                          (t.trang_thai || '').toLowerCase().includes(term) ||
                          (t.latest_note || '').toLowerCase().includes(term)
                        );
                      })
                      .map((t, idx) => {
                        const isOverdue = t.thoi_gian_con_lai != null && t.thoi_gian_con_lai < 0 && t.trang_thai !== 'Đóng';
                        return (
                          <tr key={t.id || t.ma_cong_viec} className="excel-row">
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                            
                            {/* Ghi chú */}
                            <td 
                              style={{ 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                maxWidth: '160px',
                                color: t.latest_note ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontStyle: t.latest_note ? 'normal' : 'italic',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                              }}
                              title={t.latest_note ? `Ghi chú: ${t.latest_note}` : 'Chưa có ghi chú (Nhấn để xem/thêm ghi chú)'}
                              onClick={() => handleOpenTaskDetail(t.ma_cong_viec)}
                            >
                              {t.latest_note ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: 'var(--brand-primary)', fontSize: '11px' }}>📝</span>
                                  <span>{t.latest_note}</span>
                                </span>
                              ) : (
                                <span style={{ opacity: 0.4 }}>--</span>
                              )}
                            </td>

                            {/* Mã công việc */}
                            <td 
                              style={{ 
                                fontWeight: 700, 
                                fontFamily: 'var(--font-mono)', 
                                color: 'var(--brand-primary)', 
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                              onClick={() => handleOpenTaskDetail(t.ma_cong_viec)}
                              title="Bấm để xem chi tiết công việc"
                            >
                              {t.ma_cong_viec}
                            </td>

                            {/* Loại công việc */}
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={t.loai_cong_viec || '--'}>
                              {t.loai_cong_viec || '--'}
                            </td>

                            {/* Người thực hiện */}
                            <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                              {t.employee_assigned_name || '--'}
                            </td>

                            {/* Nhóm điều phối */}
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                              {t.group_name || '--'}
                            </td>

                            {/* Mã trạm */}
                            <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                              {t.station_code || '--'}
                            </td>

                            {/* Trạng thái */}
                            <td>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: t.trang_thai === 'Đóng' ? 'rgba(16, 185, 129, 0.15)' :
                                            t.trang_thai === 'Chờ CD tiếp nhận' ? 'rgba(139, 92, 246, 0.15)' :
                                            t.trang_thai === 'FT hoàn thành' ? 'rgba(6, 182, 212, 0.15)' :
                                            'rgba(2, 132, 199, 0.15)',
                                color: t.trang_thai === 'Đóng' ? 'var(--success-dark)' :
                                       t.trang_thai === 'Chờ CD tiếp nhận' ? '#8b5cf6' :
                                       t.trang_thai === 'FT hoàn thành' ? 'var(--info-dark)' :
                                       'var(--brand-primary)'
                              }}>
                                {t.trang_thai || '--'}
                              </span>
                            </td>

                            {/* Thời gian còn lại */}
                            <td style={{ 
                              fontSize: '0.82rem', 
                              fontFamily: 'var(--font-mono)',
                              fontWeight: isOverdue ? 700 : 500,
                              color: isOverdue ? 'var(--danger-dark)' : 'var(--text-secondary)'
                            }}>
                              {t.thoi_gian_con_lai != null ? `${t.thoi_gian_con_lai}h` : '--'}
                            </td>

                            {/* Thao tác */}
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => handleOpenTaskDetail(t.ma_cong_viec)}
                                  title="Xem chi tiết & ghi chú"
                                  style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                                >
                                  <Eye size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => {
                                    if (window.confirm(`Bỏ công việc ${t.ma_cong_viec} khỏi bảng theo dõi này?`)) {
                                      removeHighTaskMutation.mutate({
                                        boardId: Number(activeHighBoardId),
                                        ma_cong_viec: t.ma_cong_viec
                                      });
                                    }
                                  }}
                                  title="Gỡ khỏi bảng theo dõi"
                                  style={{ padding: '2px 6px', fontSize: '0.72rem', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Chưa có bảng theo dõi nào được tạo.
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Bạn có thể tạo các bảng như <strong>"Bảng tồn tháng 8"</strong>, <strong>"WO chậm tiến độ"</strong> tại trang Quản trị, sau đó thêm các công việc cần theo dõi sát sao vào đây.
            </p>
            <a href="/admin" className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.82rem', gap: '6px', background: '#8b5cf6', borderColor: '#8b5cf6' }}>
              <Plus size={14} /> Tạo Bảng Theo Dõi Mới Tại Admin
            </a>
          </div>
        )}
      </div>

      {/* 2. Hub Loại Báo Cáo - Bấm vào loại nào thì hiện báo cáo đó ngay bên dưới */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} style={{ color: 'var(--brand-primary)' }} />
              Danh Mục Loại Báo Cáo (Ấn vào loại báo cáo để hiển thị số liệu)
            </h3>
          </div>
        </div>

        {/* Report Selector Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
          {/* Render all Report Categories dynamically */}
          {(reportCategories && reportCategories.length > 0 ? reportCategories : [
            {
              id: 1,
              name: 'Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS',
              loai_cong_viec: 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS',
              description: 'Tự động loại bỏ các việc đã đóng tháng trước. Bảng tính chi tiết theo Nhân viên và Nhóm điều phối.',
              is_default: true
            }
          ]).map((cat) => {
            const isSelected = selectedReport === 'maintenance' && activeCategory?.id === cat.id;
            const catSummary = (cat.id === activeCategory?.id && maintSummary.total != null)
              ? maintSummary
              : (cat.summary || { total: 0, closed: 0, pending: 0, overdue: 0 });

            return (
              <div 
                key={cat.id}
                onClick={() => {
                  setSelectedReport('maintenance');
                  setActiveCategoryId(cat.id);
                  statsApi.clearMaintenanceCache();
                }}
                style={{
                  cursor: 'pointer',
                  padding: '18px',
                  borderRadius: 'var(--radius-lg)',
                  border: isSelected ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)',
                  background: isSelected 
                    ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%)' 
                    : 'var(--bg-secondary)',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  transition: 'all var(--transition-fast)',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span 
                    className={`badge ${isSelected ? 'badge-info' : 'badge-neutral'}`}
                    style={{ gap: '5px', fontWeight: 700 }}
                  >
                    <Wrench size={13} /> {isSelected ? '● Đang Hiển Thị' : 'Bấm Để Xem Báo Cáo'}
                  </span>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem', gap: '3px' }}>
                    <Calendar size={11} /> {formatMonthDisplay(maintSpecial?.active_month)}
                  </span>
                </div>

                <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', lineHeight: 1.4 }}>
                  {cat.name}
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', textAlign: 'center', background: 'var(--bg-tertiary)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>TỔNG</span>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.total ?? 0}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--success-dark)', display: 'block' }}>ĐÃ ĐÓNG</span>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.closed ?? 0}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block' }}>TỒN</span>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.pending ?? 0}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--danger-dark)', display: 'block' }}>QUÁ HẠN</span>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.overdue ?? 0}
                    </strong>
                  </div>
                </div>

                {/* Sub status row: Từ chối (kèm quá hạn), FT hoàn thành, Chờ tiếp nhận */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center', background: 'rgba(2, 132, 199, 0.04)', padding: '6px', borderRadius: 'var(--radius-sm)', marginTop: '6px', border: '1px solid var(--border-color)' }}>
                  <div title={`Từ chối: ${catSummary.tu_choi ?? 0} (Trong đó quá hạn: ${catSummary.overdue_tu_choi ?? 0})`}>
                    <span style={{ fontSize: '0.6rem', color: '#e11d48', display: 'block', fontWeight: 700 }}>TỪ CHỐI</span>
                    <strong style={{ fontSize: '0.84rem', color: '#e11d48', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.tu_choi ?? 0}
                      <span style={{ fontSize: '0.64rem', color: 'var(--danger-dark)', fontWeight: 600, marginLeft: '2px' }}>
                        ({catSummary.overdue_tu_choi ?? 0} QH)
                      </span>
                    </strong>
                  </div>
                  <div title="FT hoàn thành chờ đóng">
                    <span style={{ fontSize: '0.6rem', color: '#0891b2', display: 'block', fontWeight: 700 }}>FT XONG</span>
                    <strong style={{ fontSize: '0.84rem', color: '#0891b2', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.ft_hoan_thanh ?? 0}
                    </strong>
                  </div>
                  <div title="Chờ CĐ tiếp nhận">
                    <span style={{ fontSize: '0.6rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>CHỜ CĐ NHẬN</span>
                    <strong style={{ fontSize: '0.84rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                      {catSummary.cho_cd_tiep_nhan ?? 0}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}

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

      {/* BÁO CÁO 1: BẢO DƯỠNG CƠ ĐIỆN (DẠNG BẢNG TÍNH EXCEL CHUYÊN BIỆT & CÁC ĐẦU VIỆC CON) */}
      {selectedReport === 'maintenance' && (
        <div style={{ marginBottom: '32px' }}>
          {/* Header Banner Báo Cáo */}
          <div 
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              marginBottom: '18px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="badge badge-info" style={{ fontWeight: 800, fontSize: '0.8rem', padding: '3px 10px' }}>
                  <Wrench size={13} /> Báo Cáo Chuyên Sâu
                </span>
                <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.8rem', padding: '3px 10px' }}>
                  <Calendar size={13} /> {formatMonthDisplay(maintSpecial?.active_month)}
                </span>
                {selectedBoard && (
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '5px',
                    padding: '3px 10px', 
                    borderRadius: '12px', 
                    background: 'rgba(139, 92, 246, 0.15)', 
                    color: '#8b5cf6', 
                    fontSize: '0.8rem', 
                    fontWeight: 700 
                  }}>
                    📌 Đang lọc: {selectedBoard.name} ({selectedBoard.task_count} WO)
                    <button 
                      onClick={() => setSelectedBoardId('')}
                      style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', padding: '0 2px', fontWeight: 800 }}
                      title="Bỏ lọc bảng này"
                    >
                      ×
                    </button>
                  </span>
                )}
                <strong style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  {activeCategory?.name || maintSpecial?.target_task_type || 'Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS'}
                </strong>
              </div>

              {/* Tracking board selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Bảng theo dõi:</span>
                <select
                  className="select-filter"
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: selectedBoardId ? '#8b5cf6' : 'var(--text-primary)',
                    borderColor: selectedBoardId ? '#8b5cf6' : 'var(--border-color)',
                    background: selectedBoardId ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <option value="">Toàn bộ công việc</option>
                  {(trackingBoards || []).map(b => (
                    <option key={b.id} value={b.id}>
                      📌 {b.name} ({b.task_count} WO)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sub-categories Navigator Tabs / Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px', whiteSpace: 'nowrap' }}>
                      Bộ lọc đầu việc:
                    </span>
                    <button
                      className={`btn ${activeSubCategoryFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setActiveSubCategoryFilter('all')}
                      style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: '20px', fontWeight: 700 }}
                    >
                      📊 Tất Cả (Bảng Mẹ + {subCategoriesList.length} Bảng Con)
                    </button>

                    <button
                      className={`btn ${activeSubCategoryFilter === 'parent' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setActiveSubCategoryFilter('parent')}
                      style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: '20px', fontWeight: 700 }}
                    >
                      🏛️ Chỉ Bảng Mẹ Tổng Hợp ({maintSummary.total ?? 0})
                    </button>

                    {subCategoriesList.map((sub) => {
                      const isSelected = activeSubCategoryFilter === String(sub.id);
                      const icon = sub.keyword === 'CONDITIONER' ? '❄️' :
                                   sub.keyword === 'GENERATOR' ? '⚡' :
                                   sub.keyword === 'VENTILATION' ? '🌀' :
                                   sub.is_other ? '📦' : '🔧';
                      return (
                        <button
                          key={sub.id}
                          className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setActiveSubCategoryFilter(String(sub.id))}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            borderRadius: '20px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>{icon} {sub.name}</span>
                          {sub.keyword && (
                            <span style={{ fontSize: '0.72rem', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>
                              ({sub.keyword})
                            </span>
                          )}
                          <span 
                            style={{
                              padding: '1px 6px',
                              borderRadius: '10px',
                              background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(2, 132, 199, 0.15)',
                              color: isSelected ? '#ffffff' : 'var(--brand-primary)',
                              fontSize: '0.72rem',
                              fontWeight: 800
                            }}
                          >
                            {sub.summary?.total ?? 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Case 1: activeSubCategoryFilter === 'all' -> Render Parent Table + All Child Tables */}
                {activeSubCategoryFilter === 'all' && (
                  <>
                    {/* Parent Table */}
                    <MaintenanceSpreadsheetTable
                      title={`BẢNG MẸ: ${activeCategory?.name || maintSpecial?.target_task_type || 'Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS'}`}
                      badgeText="BẢNG MẸ TỔNG HỢP"
                      badgeType="badge-info"
                      isChild={false}
                      summary={maintSummary}
                      byEmployee={byEmployee}
                      byGroup={byGroup}
                      activeTab={maintActiveTab}
                      onTabChange={setMaintActiveTab}
                      onDrilldown={handleOpenDrilldown}
                      exportFilename={`Bao_cao_me_${maintSpecial?.active_month || '2026-09'}`}
                    />

                    {/* Separator Section for Child Tables */}
                    {subCategoriesList.length > 0 && (
                      <div style={{ margin: '36px 0 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(2, 132, 199, 0.15)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers size={22} />
                          </div>
                          <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                              Bảng Thống Kê Các Đầu Việc Con ({subCategoriesList.length} bảng con)
                            </h3>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Child Tables List */}
                    {subCategoriesList.map((sub) => {
                      const icon = sub.keyword === 'CONDITIONER' ? '❄️ ' :
                                   sub.keyword === 'GENERATOR' ? '⚡ ' :
                                   sub.keyword === 'VENTILATION' ? '🌀 ' :
                                   sub.is_other ? '📦 ' : '🔧 ';
                      return (
                        <MaintenanceSpreadsheetTable
                          key={sub.id}
                          title={`${icon}BẢNG CON: ${sub.name}`}
                          badgeText={sub.is_other ? 'BẢNG KHÁC' : `TỪ KHÓA: ${sub.keyword}`}
                          badgeType={sub.is_other ? 'badge-neutral' : 'badge-primary'}
                          isChild={true}
                          keyword={sub.keyword}
                          isOther={sub.is_other}
                          summary={sub.summary || {}}
                          byEmployee={sub.by_employee || []}
                          byGroup={sub.by_group || []}
                          activeTab={maintActiveTab}
                          onTabChange={setMaintActiveTab}
                          onDrilldown={handleOpenDrilldown}
                          subCategoryContext={{
                            subCategoryId: sub.id,
                            subKeyword: sub.is_other ? null : sub.keyword,
                            isSubOther: sub.is_other,
                            subCategoryName: sub.name,
                            allSubKeywords: subCategoriesList.map(s => s.keyword).filter(Boolean)
                          }}
                          exportFilename={`Bao_cao_con_${sub.keyword || 'khac'}_${maintSpecial?.active_month || '2026-09'}`}
                        />
                      );
                    })}
                  </>
                )}

                {/* Case 2: activeSubCategoryFilter === 'parent' -> Render Parent Table Only */}
                {activeSubCategoryFilter === 'parent' && (
                  <div>
                    <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        className="btn btn-outline"
                        onClick={() => setActiveSubCategoryFilter('all')}
                        style={{ fontSize: '0.84rem', padding: '6px 14px' }}
                      >
                        ← Quay lại xem tất cả các bảng
                      </button>
                    </div>
                    <MaintenanceSpreadsheetTable
                      title={`BẢNG MẸ: ${activeCategory?.name || maintSpecial?.target_task_type || 'Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS'}`}
                      badgeText="BẢNG MẸ TỔNG HỢP"
                      badgeType="badge-info"
                      isChild={false}
                      summary={maintSummary}
                      byEmployee={byEmployee}
                      byGroup={byGroup}
                      activeTab={maintActiveTab}
                      onTabChange={setMaintActiveTab}
                      onDrilldown={handleOpenDrilldown}
                      exportFilename={`Bao_cao_me_${maintSpecial?.active_month || '2026-09'}`}
                    />
                  </div>
                )}

                {/* Case 3: activeSubCategoryFilter is a specific sub_category_id -> Render that Child Table Only */}
                {activeSubCategoryFilter !== 'all' && activeSubCategoryFilter !== 'parent' && (() => {
                  const selectedSub = subCategoriesList.find(s => String(s.id) === String(activeSubCategoryFilter));
                  if (!selectedSub) return null;
                  const icon = selectedSub.keyword === 'CONDITIONER' ? '❄️ ' :
                               selectedSub.keyword === 'GENERATOR' ? '⚡ ' :
                               selectedSub.keyword === 'VENTILATION' ? '🌀 ' :
                               selectedSub.is_other ? '📦 ' : '🔧 ';
                  return (
                    <div>
                      <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                          className="btn btn-outline"
                          onClick={() => setActiveSubCategoryFilter('all')}
                          style={{ fontSize: '0.84rem', padding: '6px 14px' }}
                        >
                          ← Quay lại xem tất cả các bảng ({1 + subCategoriesList.length} bảng)
                        </button>
                      </div>
                      <MaintenanceSpreadsheetTable
                        key={selectedSub.id}
                        title={`${icon}BẢNG CON: ${selectedSub.name}`}
                        badgeText={selectedSub.is_other ? 'BẢNG KHÁC' : `TỪ KHÓA: ${selectedSub.keyword}`}
                        badgeType={selectedSub.is_other ? 'badge-neutral' : 'badge-primary'}
                        isChild={true}
                        keyword={selectedSub.keyword}
                        isOther={selectedSub.is_other}
                        summary={selectedSub.summary || {}}
                        byEmployee={selectedSub.by_employee || []}
                        byGroup={selectedSub.by_group || []}
                        activeTab={maintActiveTab}
                        onTabChange={setMaintActiveTab}
                        onDrilldown={handleOpenDrilldown}
                        subCategoryContext={{
                          subCategoryId: selectedSub.id,
                          subKeyword: selectedSub.is_other ? null : selectedSub.keyword,
                          isSubOther: selectedSub.is_other,
                          subCategoryName: selectedSub.name,
                          allSubKeywords: subCategoriesList.map(s => s.keyword).filter(Boolean)
                        }}
                        exportFilename={`Bao_cao_con_${selectedSub.keyword || 'khac'}_${maintSpecial?.active_month || '2026-09'}`}
                      />
                    </div>
                  );
                })()}
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
              queryClient.invalidateQueries({ queryKey: ['maintenance-drilldown-tasks'] });
              queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
