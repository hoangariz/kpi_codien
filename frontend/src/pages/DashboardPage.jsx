import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { statsApi } from '../api/statsApi';
import { tasksApi } from '../api/tasksApi';
import { trackingApi } from '../api/trackingApi';
import { reportCategoryApi } from '../api/reportCategoryApi';
import { fixedWoApi } from '../api/fixedWoApi';

import TaskDrilldownModal from '../components/TaskDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';

import HighPriorityBoardSection from '../components/dashboard/HighPriorityBoardSection';
import ReportSelectorCards from '../components/dashboard/ReportSelectorCards';
import DynamicCategoryReport from '../components/dashboard/DynamicCategoryReport';
import OverviewChartsSection from '../components/dashboard/OverviewChartsSection';

export default function DashboardPage() {
  const queryClient = useQueryClient();

  // Navigation & View state
  const [selectedReport, setSelectedReport] = useState('maintenance'); // 'maintenance' | 'fixed_wo' | 'overview-charts'
  const [activeCategoryId, setActiveCategoryId] = useState(1);
  const [activeFixedWoId, setActiveFixedWoId] = useState(null);
  const [maintActiveTab, setMaintActiveTab] = useState('employee'); // 'employee' | 'group'
  const [activeSubCategoryFilter, setActiveSubCategoryFilter] = useState('parent'); // 'parent' | sub_category_id
  const [timelineDays, setTimelineDays] = useState(14);

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

  const activeCategory = (reportCategories || []).find(c => c.id === activeCategoryId) || (reportCategories || [])[0];
  const activeTaskType = activeCategory?.loai_cong_viec || 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS';

  // 2. Fetch tracking boards
  const { data: trackingBoards } = useQuery({
    queryKey: ['tracking-boards'],
    queryFn: trackingApi.getBoards,
  });

  // 2b. Fetch fixed WO reports & active stats
  const { data: fixedWoReports } = useQuery({
    queryKey: ['fixed-wo-reports'],
    queryFn: fixedWoApi.getReports,
  });

  const { data: fixedWoStats, isLoading: loadingFixedWoStats } = useQuery({
    queryKey: ['fixed-wo-stats', activeFixedWoId],
    queryFn: () => fixedWoApi.getStats(activeFixedWoId),
    enabled: Boolean(activeFixedWoId && selectedReport === 'fixed_wo'),
  });



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
  const highClosed = highTasks.filter(t => t.trang_thai === 'Đóng').length;
  const highPending = highTasks.filter(t => t.trang_thai && t.trang_thai !== 'Đóng').length;
  const highOverdue = highTasks.filter(t => t.trang_thai !== 'Đóng' && t.thoi_gian_con_lai != null && t.thoi_gian_con_lai < 0).length;
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

  // 3. Stats queries
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

  // Preload maintenance tasks into client-side cache for instant drilldown
  useEffect(() => {
    if (maintSpecial?.active_month) {
      statsApi.preloadMaintenanceTasks(maintSpecial.active_month, maintSpecial.target_task_type);
    }
  }, [maintSpecial?.active_month, maintSpecial?.target_task_type]);

  // Modals handlers
  const handleOpenDrilldown = (metric, metricLabel, row = null, subContext = null) => {
    if (selectedReport === 'fixed_wo') {
      const isOtherRow = Boolean(row?.is_other || row?.key_name === 'Khác' || (row && row.id == null));
      setDrilldownFilter({
        fixedWoReportId: activeFixedWoId,
        metric,
        metricLabel,
        filterType: row ? maintActiveTab : 'all',
        filterId: row?.id ?? null,
        isOther: isOtherRow,
        targetName: row ? row.key_name : (fixedWoStats?.name || 'Báo Cáo Cố Định'),
        activeMonth: fixedWoStats?.active_month,
      });
      return;
    }

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

  const maintSummary = maintSpecial?.summary || {};
  const byEmployee = maintSpecial?.by_employee || [];
  const byGroup = maintSpecial?.by_group || [];

  // Smooth scroll down to table section when a report card is clicked
  const scrollToReport = () => {
    setTimeout(() => {
      const section = document.getElementById('report-detail-section');
      if (section) {
        const navOffset = window.innerWidth <= 768 ? 60 : 76;
        const targetPos = section.getBoundingClientRect().top + window.pageYOffset - navOffset;
        window.scrollTo({
          top: Math.max(0, targetPos),
          behavior: 'smooth'
        });

        // Trigger gentle highlight pulse animation
        section.classList.remove('section-scroll-highlight');
        void section.offsetWidth; // force browser reflow
        section.classList.add('section-scroll-highlight');
      }
    }, 90);
  };

  return (
    <div>
      {/* 1. Mục: WO Trong Trạng Thái Theo Dõi Cao */}
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

      {/* 3. Danh Mục Loại Báo Cáo Selector */}
      <ReportSelectorCards
        reportCategories={reportCategories}
        selectedReport={selectedReport}
        setSelectedReport={setSelectedReport}
        activeCategory={activeCategory}
        setActiveCategoryId={setActiveCategoryId}
        maintSummary={maintSummary}
        fixedWoReports={fixedWoReports}
        activeFixedWoId={activeFixedWoId}
        setActiveFixedWoId={setActiveFixedWoId}
        fixedWoSummary={fixedWoStats?.summary || {}}
        onSelectReport={scrollToReport}
      />

      {/* 4. Vùng Hiển Thị Báo Cáo Chuyên Sâu Theo Danh Mục Được Chọn */}
      <div id="report-detail-section" style={{ scrollMarginTop: '80px', borderRadius: 'var(--radius-lg)' }}>
        {selectedReport === 'maintenance' && (
          <DynamicCategoryReport
          activeCategory={activeCategory}
          maintSpecial={maintSpecial}
          loadingMaint={loadingMaint}
          maintSummary={maintSummary}
          byEmployee={byEmployee}
          byGroup={byGroup}
          maintActiveTab={maintActiveTab}
          setMaintActiveTab={setMaintActiveTab}
          activeSubCategoryFilter={activeSubCategoryFilter || 'parent'}
          setActiveSubCategoryFilter={setActiveSubCategoryFilter}
          selectedBoardId={selectedBoardId}
          setSelectedBoardId={setSelectedBoardId}
          selectedBoard={selectedBoard}
          trackingBoards={trackingBoards}
          handleOpenDrilldown={handleOpenDrilldown}
        />
      )}

      {/* 4b. Vùng Hiển Thị Báo Cáo Cố Định WO Được Chọn */}
      {selectedReport === 'fixed_wo' && activeFixedWoId && (
        <DynamicCategoryReport
          activeCategory={{
            id: activeFixedWoId,
            name: fixedWoStats?.name || 'Báo Cáo Cố Định WO',
            loai_cong_viec: fixedWoStats?.name || 'Báo Cáo Cố Định WO',
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
        />
      )}

      {/* 5. Vùng Hiển Thị Biểu Đồ Phân Tích Khối Lượng Toàn Mạng */}
      {selectedReport === 'overview-charts' && (
        <OverviewChartsSection
          groupChartData={groupChartData}
          empChartData={empChartData}
          timelineData={timelineData}
          timelineDays={timelineDays}
          setTimelineDays={setTimelineDays}
        />
      )}
      </div>

      {/* 6. Drilldown Modal */}
      {drilldownFilter && (
        <TaskDrilldownModal
          isOpen={Boolean(drilldownFilter)}
          onClose={() => setDrilldownFilter(null)}
          filterInfo={drilldownFilter}
          onSelectTask={handleOpenTaskDetail}
        />
      )}

      {/* 7. Task Detail Modal */}
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
