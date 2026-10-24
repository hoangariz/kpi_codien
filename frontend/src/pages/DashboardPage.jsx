import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Database, 
  LayoutDashboard, 
  Zap, 
  Building2, 
  ArrowRight
} from 'lucide-react';

import { statsApi } from '../api/statsApi';
import { tasksApi } from '../api/tasksApi';
import { trackingApi } from '../api/trackingApi';
import { reportCategoryApi } from '../api/reportCategoryApi';
import { fixedWoApi } from '../api/fixedWoApi';
import { importsApi } from '../api/importsApi';

import TaskDrilldownModal from '../components/TaskDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';

import HighPriorityBoardSection from '../components/dashboard/HighPriorityBoardSection';
import ReportSelectorCards from '../components/dashboard/ReportSelectorCards';
import DynamicCategoryReport from '../components/dashboard/DynamicCategoryReport';
import OverviewChartsSection from '../components/dashboard/OverviewChartsSection';
import AllWoKpiSection from '../components/dashboard/AllWoKpiSection';
import { formatGroupName } from '../utils/groupFormat';
import { formatDataTimestamp } from '../utils/dateFormat';

export default function DashboardPage() {
  const queryClient = useQueryClient();

  // Helper to read initial view from URL (?view=overview | codien | nhatram)
  const getInitialView = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view')?.toLowerCase();
      if (['overview', 'codien', 'nhatram'].includes(v)) return v;
    } catch (e) {
      console.error(e);
    }
    return 'overview';
  };

  // 3-Page View state ('overview' | 'codien' | 'nhatram')
  const [activeDashboardView, setActiveDashboardView] = useState(getInitialView);

  // Sync URL when activeDashboardView changes without reload
  const handleViewChange = (newView) => {
    setActiveDashboardView(newView);
    try {
      const url = new URL(window.location);
      if (newView === 'overview') {
        url.searchParams.delete('view');
      } else {
        url.searchParams.set('view', newView);
      }
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      console.error(e);
    }
  };

  // Listen to popstate for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view')?.toLowerCase();
      if (['overview', 'codien', 'nhatram'].includes(v)) {
        setActiveDashboardView(v);
      } else {
        setActiveDashboardView('overview');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Selected card states
  const [selectedCodienCard, setSelectedCodienCard] = useState(null);
  const [selectedNhaTramCard, setSelectedNhaTramCard] = useState(null);

  // Sub-category and table tab states
  const [maintActiveTab, setMaintActiveTab] = useState('employee'); // 'employee' | 'group' | 'daily'
  const [codienSubFilter, setCodienSubFilter] = useState('parent'); // 'parent' | sub_category_id
  const [nhaTramSubFilter, setNhaTramSubFilter] = useState('parent');
  const [timelineDays, setTimelineDays] = useState(14);
  const [excludeTuChoi, setExcludeTuChoi] = useState(false);

  // Tracking Board Filter state (for lower category report)
  const [selectedBoardId, setSelectedBoardId] = useState('');

  // High-priority tracking board state (for the dedicated dashboard tracking section)
  const [activeHighBoardId, setActiveHighBoardId] = useState('');
  const [highTrackingSearch, setHighTrackingSearch] = useState('');
  const [quickAddWoCode, setQuickAddWoCode] = useState('');

  // Modals state
  const [drilldownFilter, setDrilldownFilter] = useState(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // 1. Fetch report categories
  const { data: reportCategories } = useQuery({
    queryKey: ['report-categories'],
    queryFn: () => reportCategoryApi.getCategories(),
  });

  // 2. Fetch tracking boards
  const { data: trackingBoards } = useQuery({
    queryKey: ['tracking-boards'],
    queryFn: trackingApi.getBoards,
  });

  // 2b. Fetch fixed WO reports
  const { data: fixedWoReports } = useQuery({
    queryKey: ['fixed-wo-reports'],
    queryFn: fixedWoApi.getReports,
  });

  // Helper to split categories & fixed reports according to dashboard_view
  const isNhaTramCategory = (cat) => {
    const s = `${cat.name || ''} ${cat.loai_cong_viec || ''} ${cat.description || ''}`.toLowerCase();
    return s.includes('nhà trạm') || s.includes('nhatram') || s.includes('trạm') || s.includes('tram') || s.includes('icms_bảo dưỡng nhà trạm');
  };

  const isItemForMode = (item, mode, fallbackDefault) => {
    if (item?.is_all_wo) {
      return mode === 'overview' || mode === 'nhatram';
    }
    const v = item?.dashboard_view || fallbackDefault;
    if (v === 'all') return true;
    return v === mode;
  };

  const codienCategories = (reportCategories || []).filter(c => isItemForMode(c, 'codien', isNhaTramCategory(c) ? 'nhatram' : 'codien'));
  const nhaTramCategories = (reportCategories || []).filter(c => isItemForMode(c, 'nhatram', isNhaTramCategory(c) ? 'nhatram' : 'codien'));
  const codienFixedWo = (fixedWoReports || []).filter(r => isItemForMode(r, 'codien', 'nhatram'));
  const nhaTramFixedWo = (fixedWoReports || []).filter(r => isItemForMode(r, 'nhatram', 'nhatram'));

  // Active category / task type for Cơ Điện query (only active when a category card is selected by user)
  const activeCodienCat = (selectedCodienCard && selectedCodienCard.type !== 'fixed_wo') ? selectedCodienCard.category : null;
  const activeCodienTaskType = activeCodienCat?.loai_cong_viec || null;

  // Stats query for Cơ Điện (only queries when user selects a category card in Cơ Điện)
  const { data: maintSpecial, isLoading: loadingMaint } = useQuery({
    queryKey: ['stats-maintenance-special', activeCodienTaskType, selectedBoardId, excludeTuChoi],
    queryFn: () => statsApi.getMaintenanceSpecial({
      task_type: activeCodienTaskType,
      board_id: selectedBoardId ? Number(selectedBoardId) : undefined,
      exclude_tu_choi: excludeTuChoi,
    }),
    enabled: Boolean(activeCodienTaskType && activeDashboardView === 'codien'),
  });

  // Stats query for Fixed WO (active in either Nhà Trạm or Cơ Điện)
  const activeFixedWoId = activeDashboardView === 'nhatram'
    ? (selectedNhaTramCard?.type === 'fixed_wo' ? selectedNhaTramCard.reportId : null)
    : (selectedCodienCard?.type === 'fixed_wo' ? selectedCodienCard.reportId : null);

  const { data: fixedWoStats, isLoading: loadingFixedWoStats } = useQuery({
    queryKey: ['fixed-wo-stats', activeFixedWoId, excludeTuChoi],
    queryFn: () => fixedWoApi.getStats(activeFixedWoId, { exclude_tu_choi: excludeTuChoi }),
    enabled: Boolean(activeFixedWoId),
  });

  // Stats query for Nhà Trạm Category (if selected)
  const activeNhaTramCat = selectedNhaTramCard?.type !== 'fixed_wo' ? selectedNhaTramCard?.category : null;
  const activeNhaTramTaskType = activeNhaTramCat?.loai_cong_viec;
  const { data: nhaTramCatSpecial, isLoading: loadingNhaTramCat } = useQuery({
    queryKey: ['stats-maintenance-special', activeNhaTramTaskType, excludeTuChoi],
    queryFn: () => statsApi.getMaintenanceSpecial({
      task_type: activeNhaTramTaskType,
      exclude_tu_choi: excludeTuChoi,
    }),
    enabled: Boolean(activeNhaTramTaskType && activeDashboardView === 'nhatram'),
  });

  // Fetch latest import log for data freshness timestamp
  const { data: importLogs } = useQuery({
    queryKey: ['import-logs-latest'],
    queryFn: () => importsApi.getImportLogs(5),
    staleTime: 5 * 60 * 1000,
  });

  const latestImport = (importLogs || []).find((l) => l.is_active === 1) || (importLogs || []).find((l) => l.status === 'COMPLETED') || (importLogs && importLogs.length > 0 ? importLogs[0] : null);
  const lastDataUpdate = latestImport?.imported_at || null;

  // Selected board detail for lower report filter
  const { data: selectedBoardDetail } = useQuery({
    queryKey: ['tracking-board-detail', selectedBoardId],
    queryFn: () => trackingApi.getBoardDetail(Number(selectedBoardId)),
    enabled: Boolean(selectedBoardId),
  });

  const selectedBoard = (trackingBoards || []).find(b => String(b.id) === String(selectedBoardId));
  const selectedBoardCodes = selectedBoardDetail?.tasks?.map(t => t.ma_cong_viec) || null;

  // Active high-priority tracking board detail
  const { data: activeHighBoardDetail, isLoading: loadingHighBoard, refetch: refetchHighBoard } = useQuery({
    queryKey: ['tracking-board-detail', activeHighBoardId],
    queryFn: () => trackingApi.getBoardDetail(Number(activeHighBoardId)),
    enabled: Boolean(activeHighBoardId),
  });

  const activeHighBoard = (trackingBoards || []).find(b => String(b.id) === String(activeHighBoardId));
  const highTasks = activeHighBoardDetail?.tasks || [];
  const highTotal = highTasks.length;
  const isHighClosed = (status) => ['Đóng', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(status);
  const highClosed = highTasks.filter(t => isHighClosed(t.trang_thai)).length;
  const highPending = highTasks.filter(t => t.trang_thai && !isHighClosed(t.trang_thai)).length;
  const highOverdue = highTasks.filter(t => !isHighClosed(t.trang_thai) && t.thoi_gian_con_lai != null && t.thoi_gian_con_lai < 0).length;
  const highRate = highTotal > 0 ? Math.round((highClosed / highTotal) * 100) : 0;

  // High-priority board mutations
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

  const { data: groupStats } = useQuery({
    queryKey: ['stats-by-group'],
    queryFn: () => statsApi.getByGroup(),
    enabled: activeDashboardView === 'overview',
  });

  const { data: empStats } = useQuery({
    queryKey: ['stats-by-employee'],
    queryFn: () => statsApi.getByEmployee({ limit: 10 }),
    enabled: activeDashboardView === 'overview',
  });

  const { data: timelineData } = useQuery({
    queryKey: ['stats-timeline', timelineDays],
    queryFn: () => statsApi.getTimeline(timelineDays),
    enabled: activeDashboardView === 'overview',
  });

  // Preload maintenance tasks for instant drilldown (only when card is selected)
  useEffect(() => {
    if (selectedCodienCard && maintSpecial?.active_month && activeDashboardView === 'codien') {
      statsApi.preloadMaintenanceTasks(maintSpecial.active_month, maintSpecial.target_task_type, true, excludeTuChoi);
    }
  }, [maintSpecial?.active_month, maintSpecial?.target_task_type, excludeTuChoi, activeDashboardView, selectedCodienCard]);

  // Card selection handlers (clicking selected card toggles it off)
  const handleSelectCodienCard = (card) => {
    if (selectedCodienCard?.id === card.id) {
      setSelectedCodienCard(null);
      return;
    }
    setSelectedCodienCard(card);
    if (card.type === 'category_parent') {
      setCodienSubFilter('parent');
    } else if (card.type === 'category_sub') {
      setCodienSubFilter(String(card.subId));
    }

    // Scroll smoothly to report table below
    setTimeout(() => {
      const el = document.getElementById('report-detail-section');
      if (el) {
        const navOffset = window.innerWidth <= 768 ? 60 : 76;
        const targetPos = el.getBoundingClientRect().top + window.pageYOffset - navOffset;
        window.scrollTo({ top: Math.max(0, targetPos), behavior: 'smooth' });
      }
    }, 70);
  };

  const handleSelectNhaTramCard = (card) => {
    if (selectedNhaTramCard?.id === card.id) {
      setSelectedNhaTramCard(null);
      return;
    }
    setSelectedNhaTramCard(card);
    if (card.type === 'category_parent') {
      setNhaTramSubFilter('parent');
    } else if (card.type === 'category_sub') {
      setNhaTramSubFilter(String(card.subId));
    }

    setTimeout(() => {
      const el = document.getElementById('report-detail-section');
      if (el) {
        const navOffset = window.innerWidth <= 768 ? 60 : 76;
        const targetPos = el.getBoundingClientRect().top + window.pageYOffset - navOffset;
        window.scrollTo({ top: Math.max(0, targetPos), behavior: 'smooth' });
      }
    }, 70);
  };

  // Drilldown handler
  const handleOpenDrilldown = (metric, metricLabel, row = null, subContext = null, extraParams = {}) => {
    const fType = extraParams?.filterType || (row ? (row.filterType || maintActiveTab) : 'all');

    const isCurrentFixedWo = (activeDashboardView === 'nhatram' && selectedNhaTramCard?.type === 'fixed_wo') ||
                             (activeDashboardView === 'codien' && selectedCodienCard?.type === 'fixed_wo');

    if (isCurrentFixedWo) {
      const activeReportId = activeDashboardView === 'nhatram' ? selectedNhaTramCard.reportId : selectedCodienCard.reportId;
      const isOtherRow = Boolean(row?.is_other || row?.key_name === 'Khác' || (row && row.id == null));
      setDrilldownFilter({
        fixedWoReportId: activeReportId,
        metric,
        metricLabel,
        filterType: fType,
        filterId: row?.id ?? null,
        isOther: isOtherRow,
        targetName: row ? row.key_name : (fixedWoStats?.name || 'Báo Cáo Cố Định'),
        activeMonth: fixedWoStats?.active_month,
        exclude_tu_choi: excludeTuChoi,
        ...extraParams,
      });
      return;
    }

    const currentCat = activeDashboardView === 'nhatram' ? activeNhaTramCat : activeCodienCat;
    const currentSpecial = activeDashboardView === 'nhatram' ? nhaTramCatSpecial : maintSpecial;

    setDrilldownFilter({
      metric,
      metricLabel,
      filterType: fType,
      filterId: row?.id ?? null,
      isOther: Boolean(row?.is_other),
      targetName: row ? row.key_name : (subContext?.subCategoryName || 'Toàn Bộ Báo Cáo'),
      activeMonth: currentSpecial?.active_month,
      targetType: currentCat?.loai_cong_viec || activeCodienTaskType,
      excludeClosedPriorMonths: currentCat?.exclude_closed_prior_months !== false,
      exclude_tu_choi: excludeTuChoi,
      boardId: selectedBoardId ? Number(selectedBoardId) : undefined,
      boardCodes: selectedBoardCodes || undefined,
      boardName: selectedBoard ? selectedBoard.name : undefined,
      subCategoryId: subContext?.subCategoryId,
      subKeyword: subContext?.subKeyword,
      isSubOther: subContext?.isSubOther,
      allSubKeywords: subContext?.allSubKeywords,
      subCategoryName: subContext?.subCategoryName,
      ...extraParams,
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

  // Prepare chart data for Groups (top 8)
  const groupChartData = (groupStats || []).slice(0, 8).map((g) => ({
    name: formatGroupName(g.group_name),
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

  const maintSummary = maintSpecial?.summary || {};
  const byEmployee = maintSpecial?.by_employee || [];
  const byGroup = maintSpecial?.by_group || [];

  return (
    <div>
      {/* 0. Header Data Freshness & Title Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={15} style={{ color: 'var(--brand-primary)' }} />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Dữ liệu hệ thống cập nhật đến: <strong style={{ color: lastDataUpdate ? 'var(--brand-primary)' : 'var(--text-muted)' }}>{formatDataTimestamp(lastDataUpdate)}</strong>
          </span>
        </div>
      </div>

      {/* 1. Main 3-View Sub-navigation Bar */}
      <nav className="dashboard-subnav" aria-label="Dashboard Views">
        <button
          type="button"
          className={`dashboard-subnav-btn ${activeDashboardView === 'overview' ? 'active' : ''}`}
          onClick={() => handleViewChange('overview')}
        >
          <LayoutDashboard size={18} />
          <span>1. Tổng Quan</span>
        </button>

        <button
          type="button"
          className={`dashboard-subnav-btn ${activeDashboardView === 'codien' ? 'active view-codien' : ''}`}
          onClick={() => handleViewChange('codien')}
        >
          <Zap size={18} />
          <span>2. Cơ Điện</span>
        </button>

        <button
          type="button"
          className={`dashboard-subnav-btn ${activeDashboardView === 'nhatram' ? 'active view-nhatram' : ''}`}
          onClick={() => handleViewChange('nhatram')}
        >
          <Building2 size={18} />
          <span>3. Nhà Trạm</span>
        </button>
      </nav>

      {/* ============================================================ */}
      {/* VIEW 1: TRANG TỔNG QUAN                                      */}
      {/* ============================================================ */}
      {activeDashboardView === 'overview' && (
        <div>
          {/* Quick Nav Shortcut Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '22px' }}>
            {/* Card Cơ Điện */}
            <div 
              className="dashboard-quick-card"
              onClick={() => handleViewChange('codien')}
              style={{ borderLeft: '4px solid var(--brand-primary)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: '2px' }}>Cơ Điện</h4>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Báo cáo tổng hợp & các bảng độc lập (Điều hòa, MPĐ, Thông gió...)
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--success-dark)', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Vào xem <ArrowRight size={13} />
                </span>
              </div>
            </div>

            {/* Card Nhà Trạm */}
            <div 
              className="dashboard-quick-card"
              onClick={() => handleViewChange('nhatram')}
              style={{ borderLeft: '4px solid #f59e0b' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: '2px' }}>Nhà Trạm</h4>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Báo cáo cố định WO nhà trạm, bảo dưỡng & lắp đặt thiết bị
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Vào xem <ArrowRight size={13} />
                </span>
              </div>
            </div>
          </div>

          {/* Section: WO Trong Trạng Thái Theo Dõi Cao (Watchlist) */}
          <HighPriorityBoardSection
            trackingBoards={trackingBoards}
            activeHighBoardId={activeHighBoardId}
            setActiveHighBoardId={setActiveHighBoardId}
            activeHighBoard={activeHighBoard}
            highTasks={highTasks}
            loadingHighBoard={loadingHighBoard}
            highTotal={highTotal}
            highPending={highPending}
            highOverdue={highOverdue}
            highClosed={highClosed}
            highRate={highRate}
            quickAddWoCode={quickAddWoCode}
            setQuickAddWoCode={setQuickAddWoCode}
            addHighTaskMutation={addHighTaskMutation}
            removeHighTaskMutation={removeHighTaskMutation}
            selectedBoardId={selectedBoardId}
            setSelectedBoardId={setSelectedBoardId}
            highTrackingSearch={highTrackingSearch}
            setHighTrackingSearch={setHighTrackingSearch}
            onOpenTaskDetail={handleOpenTaskDetail}
          />

          {/* Section: Báo Cáo Hiển Thị Trên Trang Tổng Quan (Nếu được cấu hình ở /admin) */}
          <ReportSelectorCards
            mode="overview"
            categories={reportCategories}
            fixedWoReports={fixedWoReports}
            selectedCard={null}
            liveFixedWoSummary={fixedWoStats?.summary}
            onSelectCard={(card) => {
              if (card.type === 'fixed_wo' || card.isAllWo || card.fixedWoReport?.is_all_wo || card.category?.is_all_wo || card.category?.dashboard_view === 'nhatram') {
                setSelectedNhaTramCard(card);
                handleViewChange('nhatram');
              } else {
                setSelectedCodienCard(card);
                handleViewChange('codien');
              }
            }}
          />

          {/* Section: Bảng Tính KPI VHKT Theo All-WO (Tham Khảo) */}
          <AllWoKpiSection
            fixedWoReports={fixedWoReports || []}
            reportCategories={reportCategories || []}
            excludeTuChoi={excludeTuChoi}
            onOpenDrilldown={handleOpenDrilldown}
          />

          {/* Section: Biểu Đồ Phân Tích Toàn Mạng (Dựa theo Quá khứ -> Ngày hiện tại) */}
          <OverviewChartsSection
            groupChartData={groupChartData}
            empChartData={empChartData}
            timelineData={timelineData}
            timelineDays={timelineDays}
            setTimelineDays={setTimelineDays}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: TRANG BÁO CÁO CƠ ĐIỆN                                 */}
      {/* ============================================================ */}
      {activeDashboardView === 'codien' && (
        <div>
          {/* Card Selection Grid for Cơ Điện (Tối đa 10 card, có nút xem thêm, mỗi bảng độc lập là 1 card mới) */}
          <ReportSelectorCards
            mode="codien"
            categories={reportCategories}
            fixedWoReports={fixedWoReports}
            selectedCard={selectedCodienCard}
            onSelectCard={handleSelectCodienCard}
            liveMaintSummary={maintSummary}
            liveFixedWoSummary={fixedWoStats?.summary}
          />

          {/* Detailed Spreadsheet Report Table (Bảng báo cáo chi tiết hiển thị bên dưới) */}
          <div id="report-detail-section" style={{ scrollMarginTop: '80px' }}>
            {!selectedCodienCard && (
              <div 
                style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  background: 'var(--bg-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--text-secondary)',
                  marginTop: '16px'
                }}
              >
                <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Chưa chọn bảng báo cáo nào
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                  Nhấp chọn một thẻ báo cáo ở phía trên để mở bảng số liệu chi tiết
                </div>
              </div>
            )}

            {selectedCodienCard?.type === 'fixed_wo' && (
              <DynamicCategoryReport
                key={`fixed-wo-rep-codien-${selectedCodienCard.reportId}`}
                activeCategory={{
                  id: selectedCodienCard.reportId,
                  name: fixedWoStats?.name || selectedCodienCard.title || 'Báo Cáo Cố Định WO',
                  loai_cong_viec: fixedWoStats?.name || selectedCodienCard.title || 'Báo Cáo Cố Định WO',
                  sub_categories: [],
                }}
                maintSpecial={fixedWoStats}
                loadingMaint={loadingFixedWoStats}
                maintSummary={fixedWoStats?.summary || {}}
                byEmployee={fixedWoStats?.by_employee || []}
                byGroup={fixedWoStats?.by_group || []}
                maintActiveTab={maintActiveTab}
                setMaintActiveTab={setMaintActiveTab}
                activeSubCategoryFilter="parent"
                setActiveSubCategoryFilter={() => {}}
                selectedBoardId=""
                setSelectedBoardId={() => {}}
                selectedBoard={null}
                trackingBoards={[]}
                handleOpenDrilldown={handleOpenDrilldown}
                excludeTuChoi={excludeTuChoi}
                setExcludeTuChoi={setExcludeTuChoi}
              />
            )}

            {selectedCodienCard?.type !== 'fixed_wo' && activeCodienCat && (
              <DynamicCategoryReport
                key={`maint-cat-codien-${activeCodienCat.id}-${codienSubFilter}`}
                activeCategory={activeCodienCat}
                maintSpecial={maintSpecial}
                loadingMaint={loadingMaint}
                maintSummary={maintSummary}
                byEmployee={byEmployee}
                byGroup={byGroup}
                maintActiveTab={maintActiveTab}
                setMaintActiveTab={setMaintActiveTab}
                activeSubCategoryFilter={codienSubFilter || 'parent'}
                setActiveSubCategoryFilter={setCodienSubFilter}
                selectedBoardId={selectedBoardId}
                setSelectedBoardId={setSelectedBoardId}
                selectedBoard={selectedBoard}
                trackingBoards={trackingBoards}
                handleOpenDrilldown={handleOpenDrilldown}
                excludeTuChoi={excludeTuChoi}
                setExcludeTuChoi={setExcludeTuChoi}
              />
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 3: TRANG BÁO CÁO NHÀ TRẠM                                */}
      {/* ============================================================ */}
      {activeDashboardView === 'nhatram' && (
        <div>
          {/* Card Selection Grid for Nhà Trạm (Báo cáo cố định & danh mục nhà trạm, tối đa 10 card) */}
          <ReportSelectorCards
            mode="nhatram"
            categories={reportCategories}
            fixedWoReports={fixedWoReports}
            selectedCard={selectedNhaTramCard}
            onSelectCard={handleSelectNhaTramCard}
            liveFixedWoSummary={fixedWoStats?.summary}
            liveMaintSummary={nhaTramCatSpecial?.summary}
          />

          {/* Detailed Spreadsheet Report Table */}
          <div id="report-detail-section" style={{ scrollMarginTop: '80px' }}>
            {!selectedNhaTramCard && (
              <div 
                style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  background: 'var(--bg-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--text-secondary)',
                  marginTop: '16px'
                }}
              >
                <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Chưa chọn bảng báo cáo nào
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                  Nhấp chọn một thẻ báo cáo ở phía trên để mở bảng số liệu chi tiết
                </div>
              </div>
            )}

            {selectedNhaTramCard?.type === 'fixed_wo' && (
              <DynamicCategoryReport
                key={`fixed-wo-rep-${selectedNhaTramCard.reportId}`}
                activeCategory={{
                  id: selectedNhaTramCard.reportId,
                  name: fixedWoStats?.name || selectedNhaTramCard.title || 'Báo Cáo Cố Định WO Nhà Trạm',
                  loai_cong_viec: fixedWoStats?.name || selectedNhaTramCard.title || 'Báo Cáo Cố Định WO Nhà Trạm',
                  sub_categories: [],
                }}
                maintSpecial={fixedWoStats}
                loadingMaint={loadingFixedWoStats}
                maintSummary={fixedWoStats?.summary || {}}
                byEmployee={fixedWoStats?.by_employee || []}
                byGroup={fixedWoStats?.by_group || []}
                maintActiveTab={maintActiveTab}
                setMaintActiveTab={setMaintActiveTab}
                activeSubCategoryFilter="parent"
                setActiveSubCategoryFilter={() => {}}
                selectedBoardId=""
                setSelectedBoardId={() => {}}
                selectedBoard={null}
                trackingBoards={[]}
                handleOpenDrilldown={handleOpenDrilldown}
                excludeTuChoi={excludeTuChoi}
                setExcludeTuChoi={setExcludeTuChoi}
              />
            )}

            {selectedNhaTramCard?.type !== 'fixed_wo' && activeNhaTramCat && (
              <DynamicCategoryReport
                key={`nhatram-cat-${activeNhaTramCat.id}-${nhaTramSubFilter}`}
                activeCategory={activeNhaTramCat}
                maintSpecial={nhaTramCatSpecial}
                loadingMaint={loadingNhaTramCat}
                maintSummary={nhaTramCatSpecial?.summary || {}}
                byEmployee={nhaTramCatSpecial?.by_employee || []}
                byGroup={nhaTramCatSpecial?.by_group || []}
                maintActiveTab={maintActiveTab}
                setMaintActiveTab={setMaintActiveTab}
                activeSubCategoryFilter={nhaTramSubFilter || 'parent'}
                setActiveSubCategoryFilter={setNhaTramSubFilter}
                selectedBoardId=""
                setSelectedBoardId={() => {}}
                selectedBoard={null}
                trackingBoards={[]}
                handleOpenDrilldown={handleOpenDrilldown}
                excludeTuChoi={excludeTuChoi}
                setExcludeTuChoi={setExcludeTuChoi}
              />
            )}
          </div>
        </div>
      )}

      {/* Drilldown Modal (Active across all 3 pages) */}
      {drilldownFilter && (
        <TaskDrilldownModal
          isOpen={Boolean(drilldownFilter)}
          onClose={() => setDrilldownFilter(null)}
          filterInfo={drilldownFilter}
          onSelectTask={handleOpenTaskDetail}
        />
      )}

      {/* Task Detail Modal */}
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
