import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Settings, 
  Calendar, 
  UploadCloud, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  History, 
  FileSpreadsheet, 
  Clock, 
  Database,
  ArrowRight,
  Info,
  RotateCcw,
  Trash2,
  FileCheck,
  HardDrive,
  FolderKanban,
  Plus,
  X,
  Eye,
  BookmarkCheck,
  Search,
  Pencil,
  ListPlus,
  RefreshCw,
  Layers
} from 'lucide-react';

import { settingsApi } from '../api/settingsApi';
import { importsApi } from '../api/importsApi';
import { statsApi } from '../api/statsApi';
import { trackingApi } from '../api/trackingApi';
import { metaApi } from '../api/metaApi';
import { reportCategoryApi } from '../api/reportCategoryApi';

export default function AdminPage({ onNavigateToDashboard }) {
  const queryClient = useQueryClient();

  // Settings State
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Left Navbar Active Tab ('month' | 'categories' | 'boards' | 'files' | 'all')
  const [activeAdminNav, setActiveAdminNav] = useState('month');

  // File Upload State
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentImportId, setCurrentImportId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 1. Fetch current settings
  const { data: settingsData, isLoading: loadingSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: settingsApi.getSettings,
  });

  useEffect(() => {
    if (settingsData?.current_month) {
      setSelectedMonth(settingsData.current_month);
    }
  }, [settingsData]);

  // 2. Fetch import logs (50 latest)
  const { data: importLogs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['admin-import-logs'],
    queryFn: () => importsApi.getImportLogs(50),
    refetchInterval: uploading ? 1500 : 12000,
  });

  // Save month mutation
  const saveMonthMutation = useMutation({
    mutationFn: (newMonth) => settingsApi.updateSetting('current_month', newMonth, 'Tháng báo cáo hiện tại'),
    onSuccess: () => {
      statsApi.clearMaintenanceCache();
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-summary'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err) => {
      alert('Lỗi lưu cấu hình: ' + (err.response?.data?.detail || err.message));
    }
  });

  const handleSaveMonth = (e) => {
    e.preventDefault();
    saveMonthMutation.mutate(selectedMonth);
  };

  // Helper parse danh sách mã WO từ văn bản (phân tách bởi dòng mới, phẩy, chấm phẩy, tab, khoảng trắng)
  const parseTaskCodes = (text) => {
    if (!text) return [];
    return Array.from(new Set(
      text
        .split(/[\n,;\t\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0)
    ));
  };

  // Tracking Boards State
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [newBoardTaskType, setNewBoardTaskType] = useState('');
  const [newBoardTaskCodesText, setNewBoardTaskCodesText] = useState('');
  const [newBoardNote, setNewBoardNote] = useState('');
  const [selectedBoardForTasks, setSelectedBoardForTasks] = useState(null);
  const [boardSearchTerm, setBoardSearchTerm] = useState('');
  const [manualTaskCode, setManualTaskCode] = useState('');
  const [editingBoard, setEditingBoard] = useState(null);
  const [boardListFilter, setBoardListFilter] = useState('');
  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [taskAddMode, setTaskAddMode] = useState('single'); // 'single' | 'bulk'
  const [quickAddBoardModal, setQuickAddBoardModal] = useState(null);
  const [quickAddInputText, setQuickAddInputText] = useState('');
  const [quickAddNote, setQuickAddNote] = useState('');
  const [editingTaskNote, setEditingTaskNote] = useState(null); // { ma_cong_viec, note }

  // Report Categories State
  const [newCatName, setNewCatName] = useState('');
  const [newCatTaskType, setNewCatTaskType] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatExcludeClosedPrior, setNewCatExcludeClosedPrior] = useState(true);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catSearchFilter, setCatSearchFilter] = useState('');

  // Sub-categories State
  const [selectedCatForSub, setSelectedCatForSub] = useState(null);
  const [newSubName, setNewSubName] = useState('');
  const [newSubKeyword, setNewSubKeyword] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');
  const [subKeywordError, setSubKeywordError] = useState('');

  // Fetch report categories
  const { data: reportCategories, isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ['report-categories', selectedMonth],
    queryFn: () => reportCategoryApi.getCategories(selectedMonth),
  });

  const filteredCategories = (reportCategories || []).filter(c => {
    if (!catSearchFilter.trim()) return true;
    const term = catSearchFilter.trim().toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.loai_cong_viec || '').toLowerCase().includes(term) ||
      (c.description || '').toLowerCase().includes(term)
    );
  });

  // Create Category Mutation
  const createCategoryMutation = useMutation({
    mutationFn: (data) => reportCategoryApi.createCategory(data),
    onSuccess: (res) => {
      setNewCatName('');
      setNewCatTaskType('');
      setNewCatDesc('');
      setNewCatExcludeClosedPrior(true);
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      alert(`Đã tạo thành công bảng báo cáo "${res.name}"!`);
    },
    onError: (err) => {
      alert('Lỗi tạo bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Update Category Mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }) => reportCategoryApi.updateCategory(id, data),
    onSuccess: (res) => {
      setEditingCategory(null);
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      alert(`Đã cập nhật bảng báo cáo "${res.name}" thành công!`);
    },
    onError: (err) => {
      alert('Lỗi cập nhật bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Delete Category Mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => reportCategoryApi.deleteCategory(id),
    onSuccess: () => {
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      alert('Đã xoá bảng báo cáo thành công!');
    },
    onError: (err) => {
      alert('Lỗi xoá bảng báo cáo: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Create Sub-category Mutation
  const createSubCategoryMutation = useMutation({
    mutationFn: ({ categoryId, data }) => reportCategoryApi.createSubCategory(categoryId, data),
    onSuccess: (res) => {
      setNewSubName('');
      setNewSubKeyword('');
      setNewSubDesc('');
      setSubKeywordError('');
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert(`Đã thêm thành công đầu việc con "${res.name}" với từ khóa "${res.keyword}"!`);
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || err.message;
      setSubKeywordError(detail);
      alert('Lỗi thêm đầu việc con: ' + detail);
    }
  });

  // Delete Sub-category Mutation
  const deleteSubCategoryMutation = useMutation({
    mutationFn: (subId) => reportCategoryApi.deleteSubCategory(subId),
    onSuccess: () => {
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['report-categories'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert('Đã xoá đầu việc con thành công!');
    },
    onError: (err) => {
      alert('Lỗi xoá đầu việc con: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Handler for adding sub-category with duplicate check
  const handleAddSubCategory = (cat) => {
    setSubKeywordError('');
    const cleanName = newSubName.trim();
    const cleanKw = newSubKeyword.trim();
    if (!cleanName || !cleanKw) {
      alert('Vui lòng nhập đầy đủ tên đầu việc con và từ khóa phân loại!');
      return;
    }

    // Client-side validation: Check duplicate keyword within this category
    const existingSubs = cat.sub_categories || [];
    const duplicate = existingSubs.find(s => (s.keyword || '').trim().toLowerCase() === cleanKw.toLowerCase());
    if (duplicate) {
      const msg = `Lỗi: Từ khóa "${cleanKw}" đã tồn tại ở đầu việc con "${duplicate.name}"! Mỗi đầu việc con phải có từ khóa riêng biệt để phân loại chính xác, không được trùng nhau.`;
      setSubKeywordError(msg);
      alert(msg);
      return;
    }

    createSubCategoryMutation.mutate({
      categoryId: cat.id,
      data: {
        name: cleanName,
        keyword: cleanKw,
        description: newSubDesc.trim() || undefined
      }
    });
  };

  // Fetch filter options (for task_types dropdown)
  const { data: filterOptions } = useQuery({
    queryKey: ['meta-filters'],
    queryFn: metaApi.getFilters,
  });
  const taskTypesList = filterOptions?.task_types || [];

  // Fetch tracking boards
  const { data: trackingBoards, isLoading: loadingBoards, refetch: refetchBoards } = useQuery({
    queryKey: ['tracking-boards'],
    queryFn: trackingApi.getBoards,
  });

  // Filtered boards based on search filter
  const filteredBoards = (trackingBoards || []).filter(b => {
    if (!boardListFilter.trim()) return true;
    const term = boardListFilter.trim().toLowerCase();
    return (
      (b.name || '').toLowerCase().includes(term) || 
      (b.description || '').toLowerCase().includes(term) ||
      (b.loai_cong_viec || '').toLowerCase().includes(term)
    );
  });

  // Fetch board details if selected
  const { data: boardDetail, isLoading: loadingBoardDetail, refetch: refetchBoardDetail } = useQuery({
    queryKey: ['tracking-board-detail', selectedBoardForTasks?.id],
    queryFn: () => trackingApi.getBoardDetail(selectedBoardForTasks.id),
    enabled: Boolean(selectedBoardForTasks?.id),
  });

  // Create board mutation
  const createBoardMutation = useMutation({
    mutationFn: ({ name, description, loai_cong_viec, task_codes, note }) => 
      trackingApi.createBoard({ name, description, loai_cong_viec, task_codes, note }),
    onSuccess: (res) => {
      const count = res.task_count || 0;
      setNewBoardName('');
      setNewBoardDesc('');
      setNewBoardTaskType('');
      setNewBoardTaskCodesText('');
      setNewBoardNote('');
      refetchBoards();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      alert(`Đã tạo thành công bảng "${res.name}"` + (count > 0 ? ` với ${count} mã WO theo dõi!` : '!'));
    },
    onError: (err) => {
      alert('Lỗi tạo bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Update board mutation
  const updateBoardMutation = useMutation({
    mutationFn: ({ boardId, name, description, loai_cong_viec, task_codes_to_add, note }) => 
      trackingApi.updateBoard(boardId, { name, description, loai_cong_viec, task_codes_to_add, note }),
    onSuccess: (updated) => {
      setEditingBoard(null);
      refetchBoards();
      if (selectedBoardForTasks?.id === updated.id) {
        setSelectedBoardForTasks(prev => ({ 
          ...prev, 
          name: updated.name, 
          description: updated.description,
          loai_cong_viec: updated.loai_cong_viec
        }));
        refetchBoardDetail();
      }
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      alert(`Đã cập nhật bảng "${updated.name}" thành công!`);
    },
    onError: (err) => {
      alert('Lỗi cập nhật bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Sync board tasks mutation
  const syncBoardMutation = useMutation({
    mutationFn: (boardId) => trackingApi.syncBoard(boardId),
    onSuccess: (res) => {
      alert(res.message || `Đồng bộ thành công, thêm ${res.added_count} công việc!`);
      refetchBoards();
      if (selectedBoardForTasks?.id === res.board_id) {
        refetchBoardDetail();
      }
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi đồng bộ bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Quick bulk add mutation from table row
  const quickBulkAddMutation = useMutation({
    mutationFn: ({ boardId, taskCodes, note }) => trackingApi.bulkAddTasksToBoard(boardId, taskCodes, note),
    onSuccess: (res) => {
      alert(res.message || `Đã thêm thành công ${res.added_count} công việc vào bảng`);
      setQuickAddBoardModal(null);
      setQuickAddInputText('');
      setQuickAddNote('');
      refetchBoards();
      if (selectedBoardForTasks?.id === quickAddBoardModal?.id) {
        refetchBoardDetail();
      }
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi thêm danh sách WO: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Update note for a task in board
  const updateTaskNoteMutation = useMutation({
    mutationFn: ({ boardId, ma_cong_viec, note }) => trackingApi.updateTaskNoteInBoard(boardId, ma_cong_viec, note),
    onSuccess: () => {
      setEditingTaskNote(null);
      refetchBoardDetail();
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi cập nhật ghi chú WO: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Delete board mutation
  const deleteBoardMutation = useMutation({
    mutationFn: (boardId) => trackingApi.deleteBoard(boardId),
    onSuccess: () => {
      if (selectedBoardForTasks?.id) setSelectedBoardForTasks(null);
      refetchBoards();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
    },
    onError: (err) => {
      alert('Lỗi xoá bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Remove task from board mutation
  const removeTaskMutation = useMutation({
    mutationFn: ({ boardId, ma_cong_viec }) => trackingApi.removeTaskFromBoard(boardId, ma_cong_viec),
    onSuccess: () => {
      refetchBoardDetail();
      refetchBoards();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi bỏ WO khỏi bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Add single task to board mutation
  const addTaskMutation = useMutation({
    mutationFn: ({ boardId, ma_cong_viec }) => trackingApi.addTaskToBoard(boardId, ma_cong_viec),
    onSuccess: () => {
      setManualTaskCode('');
      refetchBoardDetail();
      refetchBoards();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi thêm WO vào bảng: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Bulk add tasks mutation
  const bulkAddMutation = useMutation({
    mutationFn: ({ boardId, taskCodes, note }) => trackingApi.bulkAddTasksToBoard(boardId, taskCodes, note),
    onSuccess: (res) => {
      alert(res.message || `Đã thêm thành công ${res.added_count} công việc vào bảng`);
      setBulkInputText('');
      setBulkNote('');
      refetchBoardDetail();
      refetchBoards();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi thêm hàng loạt: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Clear all tasks from board mutation
  const clearAllTasksMutation = useMutation({
    mutationFn: (boardId) => trackingApi.clearAllTasksFromBoard(boardId),
    onSuccess: (res) => {
      alert(res.message || 'Đã xoá toàn bộ công việc khỏi bảng');
      refetchBoardDetail();
      refetchBoards();
      queryClient.invalidateQueries({ queryKey: ['tracking-boards'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
    },
    onError: (err) => {
      alert('Lỗi xoá toàn bộ WO: ' + (err.response?.data?.detail || err.message));
    }
  });

  // Poll for progress when currentImportId exists
  useEffect(() => {
    let timer = null;
    if (currentImportId && (!importStatus || ['PENDING', 'PROCESSING'].includes(importStatus.status))) {
      timer = setInterval(async () => {
        try {
          const status = await importsApi.getImportStatus(currentImportId);
          setImportStatus(status);
          if (['COMPLETED', 'FAILED'].includes(status.status)) {
            clearInterval(timer);
            setUploading(false);
            statsApi.clearMaintenanceCache();
            refetchLogs();
            queryClient.invalidateQueries();
          }
        } catch (err) {
          console.error('Error polling import status:', err);
        }
      }, 1200);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentImportId, importStatus, queryClient, refetchLogs]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const validateAndSetFile = (f) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      alert('Vui lòng chọn file định dạng Excel (.xlsx, .xls) hoặc .csv');
      return;
    }
    setFile(f);
    setImportStatus(null);
    setErrorMessage('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleUploadSubmit = async () => {
    if (!file) return;

    setUploading(true);
    setErrorMessage('');
    setImportStatus(null);

    try {
      const res = await importsApi.uploadFile(file);
      setCurrentImportId(res.id);
      setImportStatus(res);
      refetchLogs();
    } catch (err) {
      setUploading(false);
      setErrorMessage(err.response?.data?.detail || err.message || 'Lỗi tải file');
    }
  };

  // Kích hoạt / Nạp lại file cũ
  const handleActivateFile = async (log) => {
    const ok = window.confirm(
      `Xác nhận nạp lại dữ liệu từ file "${log.file_name}"?\n\nToàn bộ dữ liệu công việc hiện tại trong database sẽ được thay thế bằng dữ liệu của file này.`
    );
    if (!ok) return;

    setUploading(true);
    setErrorMessage('');
    setCurrentImportId(log.id);
    setImportStatus({ status: 'PROCESSING', progress_percent: 5, file_name: log.file_name });

    try {
      await importsApi.activateFile(log.id);
      statsApi.clearMaintenanceCache();
      refetchLogs();
      queryClient.invalidateQueries();
    } catch (err) {
      setUploading(false);
      alert('Lỗi kích hoạt lại file: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Xoá file cũ khỏi hệ thống
  const handleDeleteFile = async (log) => {
    const isAct = log.is_active === 1;
    const msg = isAct 
      ? `CẢNH BÁO: File "${log.file_name}" đang là file dữ liệu ĐANG SỬ DỤNG trong database!\nNếu xoá, toàn bộ công việc hiện tại trong hệ thống sẽ bị xoá trống.\n\nBạn có chắc chắn muốn xoá không?`
      : `Bạn có chắc chắn muốn xoá vĩnh viễn file "${log.file_name}" khỏi máy chủ và cơ sở dữ liệu để giải phóng dung lượng?`;

    if (!window.confirm(msg)) return;

    try {
      await importsApi.deleteFile(log.id);
      statsApi.clearMaintenanceCache();
      refetchLogs();
      queryClient.invalidateQueries();
    } catch (err) {
      alert('Lỗi xoá file: ' + (err.response?.data?.detail || err.message));
    }
  };

  const monthOptions = [
    { value: '2026-07', label: 'Tháng 07/2026' },
    { value: '2026-08', label: 'Tháng 08/2026' },
    { value: '2026-09', label: 'Tháng 09/2026 (Hiện tại)' },
    { value: '2026-10', label: 'Tháng 10/2026' },
    { value: '2026-11', label: 'Tháng 11/2026' },
    { value: '2026-12', label: 'Tháng 12/2026' },
  ];

  const formatDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleString('vi-VN');
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const adminNavItems = [
    {
      id: 'month',
      label: 'Cấu Hình Tháng Báo Cáo Hiện Tại',
      icon: Calendar,
      color: '#0284c7',
      badge: selectedMonth,
    },
    {
      id: 'categories',
      label: 'Quản Lý Danh Mục Loại Báo Cáo (Hiển Thị Trên Dashboard)',
      icon: Layers,
      color: '#0284c7',
      badge: reportCategories ? `${reportCategories.length} danh mục` : null,
    },
    {
      id: 'boards',
      label: 'Quản Lý Bảng WO Cần Theo Dõi',
      icon: BookmarkCheck,
      color: '#8b5cf6',
      badge: trackingBoards ? `${trackingBoards.length} bảng` : null,
    },
    {
      id: 'files',
      label: 'Quản lý file',
      icon: UploadCloud,
      color: '#10b981',
      badge: importLogs ? `${importLogs.length} file` : null,
    },
  ];

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 16px' }}>
      {/* Title & Navigation */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={24} style={{ color: 'var(--brand-primary)' }} />
            Trang Quản Trị Hệ Thống (/admin)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Cấu hình tháng báo cáo, quản lý danh mục loại báo cáo, bảng WO theo dõi và quản lý file.
          </p>
        </div>

        <button
          className="btn btn-outline"
          onClick={() => {
            if (onNavigateToDashboard) onNavigateToDashboard();
            else window.location.href = '/';
          }}
          style={{ gap: '6px' }}
        >
          ⬅ Về Trang Tổng Quan
        </button>
      </div>

      {/* 2-Column Grid Layout: Left Navbar + Right Content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
        {/* Left Sticky Navbar */}
        <aside
          style={{
            width: '300px',
            flexShrink: 0,
            position: 'sticky',
            top: '16px',
            zIndex: 10
          }}
        >
          <div
            className="table-card"
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                DANH MỤC QUẢN TRỊ
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', background: 'var(--brand-light)', padding: '2px 8px', borderRadius: '10px' }}>
                Admin
              </span>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {adminNavItems.map(item => {
                const isActive = activeAdminNav === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveAdminNav(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      width: '100%',
                      padding: '11px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: isActive ? `1.5px solid ${item.color}` : '1.5px solid transparent',
                      background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
                    }}
                  >
                    <div 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: 'var(--radius-sm)', 
                        background: isActive ? `${item.color}20` : 'var(--bg-tertiary)', 
                        color: item.color,
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '1px'
                      }}
                    >
                      <IconComp size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: '0.82rem', 
                        fontWeight: isActive ? 700 : 600, 
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        lineHeight: 1.35,
                        marginBottom: '3px'
                      }}>
                        {item.label}
                      </div>
                      {item.badge && (
                        <span 
                          style={{ 
                            display: 'inline-block',
                            fontSize: '0.68rem', 
                            fontWeight: 700, 
                            color: item.color,
                            background: `${item.color}15`,
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 0' }} />

              <button
                type="button"
                onClick={() => setActiveAdminNav('all')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: activeAdminNav === 'all' ? '1.5px solid var(--brand-primary)' : '1.5px solid transparent',
                  background: activeAdminNav === 'all' ? 'var(--brand-light)' : 'transparent',
                  color: activeAdminNav === 'all' ? 'var(--brand-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: activeAdminNav === 'all' ? 700 : 600,
                  transition: 'all var(--transition-fast)'
                }}
              >
                <Eye size={14} />
                <span>Xem Tất Cả Các Mục</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* Right Main Content Panel */}
        <main style={{ flex: '1 1 700px', minWidth: 0 }}>
          {/* 1. Month Setting Card */}
          {(activeAdminNav === 'all' || activeAdminNav === 'month') && (
            <div 
              id="admin-sec-month"
              className="table-card" 
              style={{ 
                padding: '24px', 
                marginBottom: '28px',
                border: '1px solid rgba(2, 132, 199, 0.3)'
              }}
            >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Cấu Hình Tháng Báo Cáo Hiện Tại
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Áp dụng trực tiếp vào quy tắc tính toán của bảng Bảo Dưỡng Cơ Điện
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveMonth} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Tháng hiện tại:</label>
          <select
            className="select-filter"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ width: '220px', fontSize: '0.9rem', fontWeight: 600, padding: '8px 12px' }}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saveMonthMutation.isPending}
            style={{ padding: '8px 20px', gap: '6px' }}
          >
            <Save size={16} />
            {saveMonthMutation.isPending ? 'Đang lưu...' : 'Lưu Cấu Hình Tháng'}
          </button>

          {saveSuccess && (
            <span style={{ fontSize: '0.82rem', color: 'var(--success-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={16} /> Đã cập nhật thành công!
            </span>
          )}
        </form>

        {/* Rule explanation box */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '14px 16px', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--brand-primary)', fontSize: '0.82rem', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={15} /> Quy tắc lọc tự động theo tháng:
          </div>
          <p>
            Khi chọn <strong>{monthOptions.find(o => o.value === selectedMonth)?.label || selectedMonth}</strong>: 
            Tất cả các công việc có <em>Thời điểm yêu cầu kết thúc</em> thuộc các tháng trước đã có trạng thái <strong>Đóng</strong> sẽ 
            <strong> tự động bị loại bỏ</strong> khỏi bảng Bảo Dưỡng Cơ Điện.
            Hệ thống chỉ giữ lại các việc của tháng này và các công việc tồn đọng chưa hoàn thành từ các tháng trước mang sang.
          </p>
        </div>
      </div>
      )}

      {/* 2. Quản Lý Danh Mục Loại Báo Cáo Card */}
      {(activeAdminNav === 'all' || activeAdminNav === 'categories') && (
        <div 
          id="admin-sec-categories"
          className="table-card" 
          style={{ 
            padding: '24px', 
            marginBottom: '28px',
            border: '1px solid rgba(2, 132, 199, 0.35)',
            background: 'var(--bg-secondary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'rgba(2, 132, 199, 0.12)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                Quản Lý Danh Mục Loại Báo Cáo (Hiển Thị Trên Dashboard)
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Cấu hình các bảng báo cáo theo loại công việc (hiển thị cùng cấp với <strong>Bảo Dưỡng Cứng Cơ Điện</strong> trên Dashboard). Tự động lọc các việc tháng hiện tại hoặc việc tồn tháng cũ chưa đóng.
              </p>
            </div>
          </div>
        </div>

        {/* Form tạo loại báo cáo mới */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCatName.trim() || !newCatTaskType.trim()) return;
            createCategoryMutation.mutate({
              name: newCatName.trim(),
              loai_cong_viec: newCatTaskType.trim(),
              description: newCatDesc.trim() || undefined,
              exclude_closed_prior_months: newCatExcludeClosedPrior
            });
          }}
          style={{ 
            background: 'var(--bg-tertiary)', 
            padding: '18px 20px', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            border: '1px solid rgba(2, 132, 199, 0.2)'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                TÊN BẢNG BÁO CÁO <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                className="select-filter"
                placeholder="VD: Báo Hỏng Hạ Tầng Mạng Lưới, Bảo Dưỡng Trạm BTS..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                required
              />
            </div>

            <div style={{ flex: '1 1 320px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                LOẠI CÔNG VIỆC TRONG DB (TASK.LOAI_CONG_VIEC) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                list="report-category-task-types-datalist"
                className="select-filter"
                placeholder="Chọn từ 84 loại công việc có sẵn hoặc nhập..."
                value={newCatTaskType}
                onChange={(e) => setNewCatTaskType(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                required
              />
              <datalist id="report-category-task-types-datalist">
                {taskTypesList.map((tt) => (
                  <option key={tt} value={tt} />
                ))}
              </datalist>
            </div>

            <div style={{ flex: '2 1 280px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                MÔ TẢ BÁO CÁO (TÙY CHỌN)
              </label>
              <input
                type="text"
                className="select-filter"
                placeholder="Ghi chú mục đích của bảng báo cáo..."
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Setting: Lọc bỏ WO đóng tháng trước */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              id="newCatExcludeClosedPrior"
              checked={newCatExcludeClosedPrior}
              onChange={(e) => setNewCatExcludeClosedPrior(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
            />
            <label htmlFor="newCatExcludeClosedPrior" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
              Loại bỏ các công việc đã đóng của tháng trước (Mặc định: <strong>BẬT</strong> - Chỉ tính các công việc có hạn tháng này và các công việc tồn đọng quá hạn chưa đóng)
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ⚡ Cấu hình thời gian áp dụng đồng bộ cho cả Dashboard tổng hợp và Bảng chi tiết.
            </span>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createCategoryMutation.isPending || !newCatName.trim() || !newCatTaskType.trim()}
              style={{ padding: '8px 20px', gap: '6px', fontWeight: 700 }}
            >
              <Plus size={16} />
              {createCategoryMutation.isPending ? 'Đang tạo...' : 'Tạo Bảng Báo Cáo Mới'}
            </button>
          </div>
        </form>

        {/* Danh sách bảng báo cáo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Danh sách loại báo cáo hiện có ({filteredCategories.length})
          </span>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="select-filter"
              placeholder="Lọc theo tên hoặc loại công việc..."
              value={catSearchFilter}
              onChange={(e) => setCatSearchFilter(e.target.value)}
              style={{ padding: '6px 10px 6px 30px', fontSize: '0.82rem', width: '100%' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>STT</th>
                <th style={{ minWidth: '220px', textAlign: 'left' }}>Tên Bảng Báo Cáo</th>
                <th style={{ minWidth: '220px', textAlign: 'left' }}>Loại Công Việc (Task.loai_cong_viec)</th>
                <th style={{ minWidth: '160px', textAlign: 'left' }}>Mô Tả</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Lọc Đóng Tháng Trước</th>
                <th style={{ width: '220px', textAlign: 'center' }}>Số Liệu Tháng Này</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingCategories ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    Đang tải danh mục báo cáo...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    Không có loại báo cáo nào.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((c, idx) => (
                  <React.Fragment key={c.id}>
                    <tr className="excel-row" style={{ background: selectedCatForSub === c.id ? 'rgba(2, 132, 199, 0.05)' : undefined }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📊</span>
                          <span>{c.name}</span>
                          {c.is_default && (
                            <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                              Mặc Định
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.74rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }} title={c.loai_cong_viec}>
                          🔍 {c.loai_cong_viec}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {c.description || '--'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {c.exclude_closed_prior_months !== false ? (
                          <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '3px 8px' }} title="Tự động loại bỏ các công việc đã đóng của tháng trước">
                            ✓ Có (Lọc bỏ)
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '3px 8px' }} title="Không loại bỏ - Thống kê toàn bộ việc">
                            ✕ Không lọc
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {c.summary ? (
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            <strong>{c.summary.total}</strong> việc (Đóng: {c.summary.closed} | Tồn: {c.summary.pending} | Quá hạn: {c.summary.overdue})
                          </span>
                        ) : '--'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={`btn ${selectedCatForSub === c.id ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => {
                              setSelectedCatForSub(prev => prev === c.id ? null : c.id);
                              setSubKeywordError('');
                            }}
                            title="Cấu hình các đầu việc con sinh bảng thống kê riêng"
                            style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px' }}
                          >
                            <FolderKanban size={12} />
                            Đầu việc con ({c.sub_categories?.length || 0})
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setEditingCategory({ 
                              id: c.id, 
                              name: c.name, 
                              loai_cong_viec: c.loai_cong_viec, 
                              description: c.description || '',
                              exclude_closed_prior_months: c.exclude_closed_prior_months !== false
                            })}
                            title="Sửa tên hoặc cấu hình báo cáo này"
                            style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: 'var(--brand-primary)', borderColor: 'rgba(2, 132, 199, 0.3)' }}
                          >
                            <Pencil size={12} /> Sửa
                          </button>
                          {!c.is_default && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                if (window.confirm(`Bạn có chắc chắn muốn xoá bảng báo cáo "${c.name}"?`)) {
                                  deleteCategoryMutation.mutate(c.id);
                                }
                              }}
                              title="Xoá bảng báo cáo này"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            >
                              <Trash2 size={12} /> Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Drawer for Sub-categories Configuration */}
                    {selectedCatForSub === c.id && (
                      <tr style={{ background: 'var(--bg-tertiary)' }}>
                        <td colSpan={7} style={{ padding: '16px 20px', borderBottom: '2px solid var(--border-color)' }}>
                          <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(2, 132, 199, 0.3)', borderRadius: 'var(--radius-md)', padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                              <div>
                                <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span>📂 Cấu Hình Đầu Việc Con Cho:</span>
                                  <span style={{ color: 'var(--brand-primary)' }}>{c.name}</span>
                                </h4>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                                  Mỗi đầu việc con sẽ sinh thêm 1 bảng con để thống kê bên dưới bảng mẹ trên Dashboard. Tự động gom theo từ khóa trong cột <strong>"Nội dung công việc"</strong>. Các công việc không trùng từ khóa nào sẽ tự động vào bảng <strong>"Còn lại / Khác"</strong>.
                                </p>
                              </div>

                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setSelectedCatForSub(null)}
                                style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                              >
                                Đóng
                              </button>
                            </div>

                            {/* Error banner if keyword duplicate */}
                            {subKeywordError && (
                              <div style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid var(--danger)',
                                color: 'var(--danger-dark)',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}>
                                <AlertCircle size={16} />
                                <span>{subKeywordError}</span>
                              </div>
                            )}

                            {/* Danh sách đầu việc con hiện có */}
                            <div style={{ marginBottom: '16px' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                                ĐẦU VIỆC CON ĐÃ CẤU HÌNH ({(c.sub_categories || []).length}):
                              </span>
                              {(c.sub_categories || []).length === 0 ? (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                                  Chưa có đầu việc con nào. Mọi công việc hiện tại sẽ hiển thị ở bảng mẹ. Thêm đầu việc con bên dưới để tách bảng.
                                </p>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                                  {(c.sub_categories || []).map((sub) => (
                                    <div 
                                      key={sub.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 14px',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)'
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{sub.name}</strong>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Từ khóa:</span>
                                          <span 
                                            style={{
                                              padding: '1px 6px',
                                              borderRadius: '4px',
                                              background: 'rgba(2, 132, 199, 0.15)',
                                              color: 'var(--brand-primary)',
                                              fontFamily: 'var(--font-mono)',
                                              fontSize: '0.74rem',
                                              fontWeight: 800
                                            }}
                                          >
                                            {sub.keyword}
                                          </span>
                                        </div>
                                        {sub.description && (
                                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                                            {sub.description}
                                          </span>
                                        )}
                                      </div>

                                      <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => {
                                          if (window.confirm(`Xoá đầu việc con "${sub.name}" (từ khóa: ${sub.keyword})? Các công việc sẽ chuyển về bảng "Còn lại / Khác".`)) {
                                            deleteSubCategoryMutation.mutate(sub.id);
                                          }
                                        }}
                                        title="Xoá đầu việc con này"
                                        style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Form thêm đầu việc con mới */}
                            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(2, 132, 199, 0.3)' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--brand-primary)', display: 'block', marginBottom: '8px' }}>
                                + THÊM ĐẦU VIỆC CON MỚI (TỰ ĐỘNG BÁO LỖI NẾU TRÙNG TỪ KHÓA):
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                                <div style={{ flex: '1 1 200px' }}>
                                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '3px', color: 'var(--text-secondary)' }}>
                                    TÊN ĐẦU VIỆC CON <span style={{ color: 'var(--danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="select-filter"
                                    placeholder="VD: Bảo dưỡng điều hòa..."
                                    value={newSubName}
                                    onChange={(e) => setNewSubName(e.target.value)}
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem' }}
                                  />
                                </div>

                                <div style={{ flex: '1 1 220px' }}>
                                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '3px', color: 'var(--text-secondary)' }}>
                                    TỪ KHÓA TRONG NỘI DUNG (KEYWORD) <span style={{ color: 'var(--danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="select-filter"
                                    placeholder="VD: CONDITIONER..."
                                    value={newSubKeyword}
                                    onChange={(e) => {
                                      setNewSubKeyword(e.target.value);
                                      setSubKeywordError('');
                                    }}
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
                                  />
                                </div>

                                <div style={{ flex: '2 1 200px' }}>
                                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '3px', color: 'var(--text-secondary)' }}>
                                    MÔ TẢ (TÙY CHỌN)
                                  </label>
                                  <input
                                    type="text"
                                    className="select-filter"
                                    placeholder="Ghi chú thêm..."
                                    value={newSubDesc}
                                    onChange={(e) => setNewSubDesc(e.target.value)}
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem' }}
                                  />
                                </div>

                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => handleAddSubCategory(c)}
                                  disabled={createSubCategoryMutation.isPending || !newSubName.trim() || !newSubKeyword.trim()}
                                  style={{ padding: '7px 16px', fontSize: '0.82rem', gap: '6px', fontWeight: 700, whiteSpace: 'nowrap' }}
                                >
                                  <Plus size={15} />
                                  {createSubCategoryMutation.isPending ? 'Đang thêm...' : 'Thêm Đầu Việc Con'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 3. Quản Lý Bảng WO Cần Theo Dõi Card */}
      {(activeAdminNav === 'all' || activeAdminNav === 'boards') && (
        <div 
          id="admin-sec-boards"
          className="table-card" 
          style={{ 
            padding: '24px', 
            marginBottom: '28px',
            border: '1px solid rgba(139, 92, 246, 0.3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookmarkCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                Quản Lý Bảng WO Cần Theo Dõi
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Tạo các bảng theo dõi tùy chỉnh (ví dụ: Bảng tồn tháng 8, WO trọng điểm...). Khi xem báo cáo Tổng Quan, bạn có thể lọc chỉ thống kê những WO này.
              </p>
            </div>
          </div>
        </div>

        {/* Form tạo bảng mới */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (!newBoardName.trim()) return;
            const parsedCodes = parseTaskCodes(newBoardTaskCodesText);
            createBoardMutation.mutate({ 
              name: newBoardName.trim(), 
              description: newBoardDesc.trim(),
              loai_cong_viec: newBoardTaskType.trim() || undefined,
              task_codes: parsedCodes.length > 0 ? parsedCodes : undefined,
              note: newBoardNote.trim() || undefined
            });
          }}
          style={{ 
            background: 'var(--bg-tertiary)', 
            padding: '18px 20px', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            border: '1px solid rgba(139, 92, 246, 0.2)'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                TÊN BẢNG THEO DÕI <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                className="select-filter"
                placeholder="VD: Bảng Bảo Dưỡng Cơ Điện, Bảng WO Điều Hòa..."
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                required
              />
            </div>

            <div style={{ flex: '1 1 300px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                LOẠI CÔNG VIỆC TỰ ĐỘNG LỌC (TASK.LOAI_CONG_VIEC)
              </label>
              <input
                type="text"
                list="task-types-datalist"
                className="select-filter"
                placeholder="Chọn hoặc gõ loại công việc (VD: Bảo dưỡng cứng cơ điện...)"
                value={newBoardTaskType}
                onChange={(e) => setNewBoardTaskType(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              />
              <datalist id="task-types-datalist">
                {taskTypesList.map((tt) => (
                  <option key={tt} value={tt} />
                ))}
              </datalist>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                💡 Khi chọn loại công việc, hệ thống sẽ tự động lọc các việc tháng này hoặc việc tồn chưa đóng.
              </span>
            </div>

            <div style={{ flex: '2 1 260px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                MÔ TẢ (TÙY CHỌN)
              </label>
              <input
                type="text"
                className="select-filter"
                placeholder="Ghi chú mục đích theo dõi..."
                value={newBoardDesc}
                onChange={(e) => setNewBoardDesc(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>DANH SÁCH MÃ WO BỔ SUNG THỦ CÔNG (TÙY CHỌN - DÁN CỘT TỪ EXCEL, DÒNG MỚI, DẤU PHẨY)</span>
              </label>
              {parseTaskCodes(newBoardTaskCodesText).length > 0 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                  ✓ Đã nhận diện {parseTaskCodes(newBoardTaskCodesText).length} mã WO hợp lệ
                </span>
              )}
            </div>
            <textarea
              className="select-filter"
              rows={2}
              placeholder="Dán danh sách mã WO vào đây (Ví dụ: WO_123, WO_456 hoặc copy cả cột mã từ file Excel)..."
              value={newBoardTaskCodesText}
              onChange={(e) => setNewBoardTaskCodesText(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                className="select-filter"
                placeholder="Ghi chú mặc định cho các WO này (tùy chọn)..."
                value={newBoardNote}
                onChange={(e) => setNewBoardNote(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {(newBoardName || newBoardDesc || newBoardTaskType || newBoardTaskCodesText) && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setNewBoardName('');
                    setNewBoardDesc('');
                    setNewBoardTaskType('');
                    setNewBoardTaskCodesText('');
                    setNewBoardNote('');
                  }}
                  style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                >
                  Làm mới
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createBoardMutation.isPending || !newBoardName.trim()}
                style={{ padding: '8px 18px', gap: '6px', background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 700 }}
              >
                <Plus size={16} />
                {createBoardMutation.isPending 
                  ? 'Đang tạo...' 
                  : parseTaskCodes(newBoardTaskCodesText).length > 0 
                    ? `Tạo Bảng Kèm ${parseTaskCodes(newBoardTaskCodesText).length} WO` 
                    : newBoardTaskType.trim()
                      ? `Tạo Bảng Theo Loại CV`
                      : 'Tạo Bảng Mới'}
              </button>
            </div>
          </div>
        </form>

        {/* Thanh tìm kiếm & lọc danh sách bảng */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Danh sách bảng hiện có ({filteredBoards.length})
          </span>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="select-filter"
              placeholder="Lọc bảng theo tên hoặc mô tả..."
              value={boardListFilter}
              onChange={(e) => setBoardListFilter(e.target.value)}
              style={{ padding: '6px 10px 6px 30px', fontSize: '0.82rem', width: '100%' }}
            />
          </div>
        </div>

        {/* Danh sách bảng hiện có */}
        <div style={{ overflowX: 'auto' }}>
          <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>STT</th>
                <th style={{ minWidth: '170px', textAlign: 'left' }}>Tên Bảng Theo Dõi</th>
                <th style={{ minWidth: '200px', textAlign: 'left' }}>Loại Công Việc (Bộ Lọc)</th>
                <th style={{ minWidth: '180px', textAlign: 'left' }}>Mô Tả</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Số WO Theo Dõi</th>
                <th style={{ width: '130px', textAlign: 'left' }}>Ngày Tạo</th>
                <th style={{ width: '270px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingBoards ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    Đang tải danh sách bảng...
                  </td>
                </tr>
              ) : filteredBoards.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    {boardListFilter ? 'Không tìm thấy bảng nào phù hợp với từ khóa tìm kiếm.' : 'Chưa có bảng theo dõi nào. Hãy tạo bảng đầu tiên ở form phía trên!'}
                  </td>
                </tr>
              ) : (
                filteredBoards.map((b, idx) => (
                  <tr key={b.id} className="excel-row">
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#8b5cf6' }}>📌</span>
                        {b.name}
                      </span>
                    </td>
                    <td>
                      {b.loai_cong_viec ? (
                        <span 
                          className="badge badge-info" 
                          style={{ 
                            fontSize: '0.74rem', 
                            fontWeight: 600, 
                            maxWidth: '240px', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap', 
                            display: 'inline-block' 
                          }} 
                          title={b.loai_cong_viec}
                        >
                          🔍 {b.loai_cong_viec}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-- (Thủ công)</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {b.description || '--'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span 
                        style={{ 
                          display: 'inline-block',
                          padding: '2px 10px', 
                          borderRadius: '12px', 
                          background: b.task_count > 0 ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-tertiary)',
                          color: b.task_count > 0 ? '#8b5cf6' : 'var(--text-muted)',
                          fontWeight: 700,
                          fontSize: '0.82rem'
                        }}
                      >
                        {b.task_count} WO
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {formatDate(b.created_at)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {b.loai_cong_viec && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={syncBoardMutation.isPending}
                            onClick={() => syncBoardMutation.mutate(b.id)}
                            title="Đồng bộ tự động các WO theo Loại công việc & quy tắc thời gian"
                            style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: '#0284c7', borderColor: 'rgba(2, 132, 199, 0.4)', background: 'rgba(2, 132, 199, 0.06)', fontWeight: 600 }}
                          >
                            <RefreshCw size={12} className={syncBoardMutation.isPending ? "spin" : ""} /> Đồng bộ
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setQuickAddBoardModal(b);
                            setQuickAddInputText('');
                            setQuickAddNote('');
                          }}
                          title="Thêm nhanh danh sách mã WO vào bảng này"
                          style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: '#7c3aed', background: 'rgba(139, 92, 246, 0.08)', borderColor: 'rgba(139, 92, 246, 0.4)', fontWeight: 600 }}
                        >
                          <ListPlus size={13} /> + List WO
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setSelectedBoardForTasks(b)}
                          title="Xem và quản lý các WO trong bảng này"
                          style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                        >
                          <Eye size={13} /> Xem ({b.task_count})
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setEditingBoard({ 
                            id: b.id, 
                            name: b.name, 
                            description: b.description || '', 
                            loai_cong_viec: b.loai_cong_viec || '', 
                            task_codes_to_add_text: '' 
                          })}
                          title="Chỉnh sửa tên, loại công việc và mô tả bảng này"
                          style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: 'var(--brand-primary)', borderColor: 'rgba(2, 132, 199, 0.3)' }}
                        >
                          <Pencil size={12} /> Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            if (window.confirm(`Bạn có chắc chắn muốn xoá bảng theo dõi "${b.name}"?`)) {
                              deleteBoardMutation.mutate(b.id);
                            }
                          }}
                          title="Xoá bảng theo dõi này"
                          style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                        >
                          <Trash2 size={12} /> Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 4. Quản lý file (Upload & Lịch sử) */}
      {(activeAdminNav === 'all' || activeAdminNav === 'files') && (
        <div id="admin-sec-files">
          {/* Import File Card */}
          <div 
            className="table-card" 
            style={{ 
              padding: '24px', 
              marginBottom: '28px' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--success-light)', color: 'var(--success-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UploadCloud size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Tải Lên File Excel / CSV Mới (Thay Thế Snapshot Hiện Tại)
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Tự động làm sạch dữ liệu cũ trong DB để nạp mới toàn bộ WO và trạng thái mới nhất từ file nguồn
            </p>
          </div>
        </div>

        {/* Note banner */}
        <div style={{ background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.25)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
          <span>
            <strong>Cơ chế nạp nhanh:</strong> Khi tải file mới lên, hệ thống sẽ <strong>xoá sạch danh sách WO cũ trong database</strong> để nạp toàn bộ danh sách mới nhất từ file này, không cần so sánh diff giúp tốc độ nạp cực nhanh và tránh sai lệch trạng thái.
          </span>
        </div>

        {/* Dropzone */}
        <div
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('admin-file-input')?.click()}
          style={{ padding: '30px 20px', marginBottom: '16px' }}
        >
          <input
            id="admin-file-input"
            type="file"
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
          />

          <UploadCloud size={32} style={{ color: 'var(--brand-primary)', margin: '0 auto 10px' }} />

          {file ? (
            <div>
              <span className="badge badge-info" style={{ fontSize: '0.88rem', padding: '4px 12px', gap: '6px' }}>
                <FileSpreadsheet size={15} /> {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>Bấm để chọn file khác</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Kéo thả file Excel vào đây hoặc <span style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>chọn file</span>
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hỗ trợ file nguồn .xlsx, .xls, .csv (~100.000 dòng)</p>
            </div>
          )}
        </div>

        {file && !uploading && (!importStatus || importStatus.status !== 'PROCESSING') && (
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <button
              className="btn btn-primary"
              onClick={handleUploadSubmit}
              style={{ padding: '10px 28px', fontSize: '0.9rem' }}
            >
              <Database size={16} /> Nạp Dữ Liệu File Mới Vào Hệ Thống
            </button>
          </div>
        )}

        {/* Processing Indicator */}
        {uploading && (
          <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} className="spin" style={{ color: 'var(--brand-primary)' }} />
                Đang làm sạch dữ liệu cũ và nạp file mới vào database...
              </span>
              <span style={{ fontWeight: 800, color: 'var(--brand-primary)' }}>
                {importStatus?.progress_percent || 15}%
              </span>
            </div>
            <div className="progress-bar-outer">
              <div className="progress-bar-inner" style={{ width: `${importStatus?.progress_percent || 15}%` }} />
            </div>
          </div>
        )}

        {/* Success Breakdown */}
        {importStatus && importStatus.status === 'COMPLETED' && (
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid var(--success)', padding: '18px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <CheckCircle2 size={18} style={{ color: 'var(--success-dark)' }} />
              <strong style={{ color: 'var(--success-dark)' }}>Đồng bộ dữ liệu file thành công!</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>({importStatus.file_name})</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '0.82rem' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Tổng dòng file</span>
                <strong>{importStatus.total_rows?.toLocaleString()}</strong>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '4px', textAlign: 'center', color: 'var(--warning-dark)' }}>
                <span style={{ display: 'block', fontSize: '0.7rem' }}>Lọc SPM/VTNET</span>
                <strong>{importStatus.filtered_out_count?.toLocaleString()}</strong>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '4px', textAlign: 'center', color: 'var(--success-dark)' }}>
                <span style={{ display: 'block', fontSize: '0.7rem' }}>Công việc đã nạp</span>
                <strong>{importStatus.inserted_count?.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Error Report */}
        {(errorMessage || (importStatus && importStatus.status === 'FAILED')) && (
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid var(--danger)', padding: '16px 20px', borderRadius: 'var(--radius-md)', marginBottom: '16px', color: 'var(--danger-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} style={{ color: 'var(--danger-dark)', flexShrink: 0 }} />
                <strong style={{ fontSize: '0.95rem' }}>Quá trình xử lý file gặp lỗi!</strong>
              </div>
              <button 
                className="btn btn-outline" 
                onClick={() => {
                  setErrorMessage('');
                  setImportStatus(null);
                }}
                style={{ padding: '2px 8px', fontSize: '0.72rem', borderColor: 'var(--danger)', color: 'var(--danger-dark)' }}
              >
                Đóng thông báo
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', margin: '0 0 10px 0', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {importStatus?.error_message || errorMessage}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {file && (
                <button
                  className="btn btn-primary"
                  onClick={handleUploadSubmit}
                  style={{ padding: '6px 14px', fontSize: '0.8rem', gap: '6px', background: 'var(--danger-dark)' }}
                >
                  <RotateCcw size={14} /> Thử Nạp Lại File Này
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Danh Sách Các File Đã Tải Lên - Quản Lý & Tái Sử Dụng */}
      <div className="table-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={18} style={{ color: 'var(--brand-primary)' }} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Danh Sách Các File Đã Tải Lên (Quản Lý Lưu Trữ)</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Bạn có thể <strong>Sử dụng lại file cũ</strong> để nạp lại dữ liệu hoặc <strong>Xoá file</strong> để giảm dung lượng hệ thống
              </p>
            </div>
          </div>
          <button 
            className="btn btn-outline" 
            onClick={() => refetchLogs && refetchLogs()}
            style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
          >
            Làm mới danh sách
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ width: '35px', textAlign: 'center' }}>ID</th>
                <th>Tên File</th>
                <th>Thời Điểm Tải</th>
                <th style={{ textAlign: 'center' }}>Dung Lượng</th>
                <th style={{ textAlign: 'center' }}>Tổng Dòng</th>
                <th style={{ textAlign: 'center' }}>Đã Nạp</th>
                <th style={{ textAlign: 'center' }}>Lọc SPM</th>
                <th style={{ textAlign: 'center' }}>Trạng Thái</th>
                <th style={{ textAlign: 'center', width: '190px' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {(importLogs || []).map((log) => {
                const isActive = log.is_active === 1;
                const isProcessing = log.status === 'PROCESSING';

                return (
                  <tr 
                    key={log.id}
                    style={{
                      background: isActive ? 'rgba(16, 185, 129, 0.06)' : undefined
                    }}
                  >
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>#{log.id}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileSpreadsheet size={15} style={{ color: isActive ? 'var(--success-dark)' : 'var(--text-muted)' }} />
                        <strong>{log.file_name}</strong>
                      </div>
                    </td>
                    <td>{formatDate(log.imported_at)}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      {formatBytes(log.file_size_bytes)}
                    </td>
                    <td style={{ textAlign: 'center' }}>{log.total_rows?.toLocaleString() || '--'}</td>
                    <td style={{ textAlign: 'center', color: 'var(--success-dark)', fontWeight: 600 }}>
                      {log.inserted_count?.toLocaleString() || '--'}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--warning-dark)' }}>
                      {log.filtered_out_count?.toLocaleString() || '--'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isActive ? (
                        <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.72rem' }}>
                          <CheckCircle2 size={12} /> Đang Sử Dụng
                        </span>
                      ) : isProcessing ? (
                        <span className="badge badge-info" style={{ gap: '4px', fontSize: '0.72rem' }}>
                          <Clock size={12} className="spin" /> Đang Nạp...
                        </span>
                      ) : log.status === 'FAILED' ? (
                        <span 
                          className="badge badge-danger" 
                          style={{ fontSize: '0.72rem', cursor: 'pointer', gap: '3px' }}
                          title={log.error_message ? `Bấm để xem chi tiết lỗi: ${log.error_message}` : 'Xử lý thất bại. Bấm để xem.'}
                          onClick={() => {
                            alert(`Chi tiết lỗi của file "${log.file_name}":\n\n${log.error_message || 'Không có mô tả lỗi cụ thể.'}`);
                          }}
                        >
                          <AlertCircle size={11} /> Thất bại ℹ️
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>Đã lưu trữ</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {/* Nút Thử lại khi file lỗi */}
                        {log.status === 'FAILED' && (
                          <button
                            className="btn btn-outline"
                            onClick={() => handleActivateFile(log)}
                            title="Thử nạp lại file này"
                            style={{ 
                              padding: '3px 8px', 
                              fontSize: '0.72rem', 
                              gap: '4px', 
                              color: 'var(--warning-dark)',
                              borderColor: 'rgba(217, 119, 6, 0.4)'
                            }}
                          >
                            <RotateCcw size={12} /> Thử Lại
                          </button>
                        )}

                        {/* Nút Sử dụng lại file này */}
                        {!isActive && log.status === 'COMPLETED' && (
                          <button
                            className="btn btn-outline"
                            onClick={() => handleActivateFile(log)}
                            title="Nạp lại dữ liệu từ file này vào Database"
                            style={{ 
                              padding: '3px 8px', 
                              fontSize: '0.72rem', 
                              gap: '4px', 
                              color: 'var(--brand-primary)',
                              borderColor: 'rgba(2, 132, 199, 0.3)'
                            }}
                          >
                            <RotateCcw size={12} /> Sử Dụng Lại
                          </button>
                        )}

                        {/* Nút Xoá file */}
                        <button
                          className="btn btn-outline"
                          onClick={() => handleDeleteFile(log)}
                          title="Xoá vĩnh viễn file này khỏi máy chủ và database"
                          style={{ 
                            padding: '3px 8px', 
                            fontSize: '0.72rem', 
                            gap: '4px', 
                            color: 'var(--danger-dark)',
                            borderColor: 'rgba(239, 68, 68, 0.3)'
                          }}
                        >
                          <Trash2 size={12} /> Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {(!importLogs || importLogs.length === 0) && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Chưa có file nào được tải lên hệ thống.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    )}
        </main>
      </div>

      {/* Modal Quản Lý Danh Sách WO Trong Bảng */}
      {selectedBoardForTasks && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookmarkCheck size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                      Danh Sách WO: {selectedBoardForTasks.name}
                    </h3>
                    {(boardDetail?.loai_cong_viec || selectedBoardForTasks.loai_cong_viec) && (
                      <span className="badge badge-info" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
                        🔍 {boardDetail?.loai_cong_viec || selectedBoardForTasks.loai_cong_viec}
                      </span>
                    )}
                    {(boardDetail?.loai_cong_viec || selectedBoardForTasks.loai_cong_viec) && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={syncBoardMutation.isPending}
                        onClick={() => syncBoardMutation.mutate(selectedBoardForTasks.id)}
                        style={{ padding: '2px 8px', fontSize: '0.72rem', gap: '4px', color: '#0284c7', borderColor: 'rgba(2, 132, 199, 0.4)' }}
                        title="Đồng bộ tự động các việc mới thuộc loại công việc này"
                      >
                        <RefreshCw size={11} className={syncBoardMutation.isPending ? "spin" : ""} /> Đồng bộ
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setEditingBoard({ 
                        id: selectedBoardForTasks.id, 
                        name: selectedBoardForTasks.name, 
                        description: selectedBoardForTasks.description || '',
                        loai_cong_viec: boardDetail?.loai_cong_viec || selectedBoardForTasks.loai_cong_viec || ''
                      })}
                      style={{ padding: '2px 8px', fontSize: '0.72rem', gap: '4px', color: 'var(--brand-primary)' }}
                      title="Sửa tên, loại công việc hoặc mô tả bảng này"
                    >
                      <Pencil size={11} /> Sửa
                    </button>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    {selectedBoardForTasks.description || 'Không có mô tả'} • {boardDetail?.tasks?.length || 0} công việc
                  </p>
                </div>
              </div>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setSelectedBoardForTasks(null);
                  setBoardSearchTerm('');
                  setManualTaskCode('');
                  setBulkInputText('');
                }}
                style={{ padding: '6px', borderRadius: '50%' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Mode switch between single add and bulk add */}
            <div style={{
              padding: '8px 20px',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`btn ${taskAddMode === 'single' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTaskAddMode('single')}
                  style={{ padding: '4px 10px', fontSize: '0.78rem', gap: '4px' }}
                >
                  <Plus size={13} /> Thêm 1 mã WO
                </button>
                <button
                  type="button"
                  className={`btn ${taskAddMode === 'bulk' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTaskAddMode('bulk')}
                  style={{ padding: '4px 10px', fontSize: '0.78rem', gap: '4px' }}
                >
                  <ListPlus size={13} /> Thêm hàng loạt (Bulk)
                </button>
              </div>

              {boardDetail?.tasks?.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    if (window.confirm(`Bạn có chắc chắn muốn xoá TẤT CẢ ${boardDetail.tasks.length} công việc khỏi bảng "${selectedBoardForTasks.name}"?`)) {
                      clearAllTasksMutation.mutate(selectedBoardForTasks.id);
                    }
                  }}
                  style={{ padding: '3px 10px', fontSize: '0.75rem', gap: '4px', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                >
                  <Trash2 size={12} /> Xoá tất cả WO khỏi bảng
                </button>
              )}
            </div>

            {/* Form Thêm WO theo chế độ đã chọn */}
            {taskAddMode === 'single' ? (
              <div style={{
                padding: '12px 20px',
                background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!manualTaskCode.trim()) return;
                    addTaskMutation.mutate({
                      boardId: selectedBoardForTasks.id,
                      ma_cong_viec: manualTaskCode.trim()
                    });
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <input
                    type="text"
                    className="select-filter"
                    placeholder="Nhập mã công việc (WO)..."
                    value={manualTaskCode}
                    onChange={(e) => setManualTaskCode(e.target.value)}
                    style={{ width: '220px', padding: '6px 10px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addTaskMutation.isPending || !manualTaskCode.trim()}
                    style={{ padding: '6px 12px', fontSize: '0.82rem', gap: '4px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                  >
                    <Plus size={14} /> {addTaskMutation.isPending ? 'Đang thêm...' : 'Thêm WO vào bảng'}
                  </button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="select-filter"
                    placeholder="Lọc mã, người thực hiện, trạm..."
                    value={boardSearchTerm}
                    onChange={(e) => setBoardSearchTerm(e.target.value)}
                    style={{ padding: '6px 10px 6px 30px', fontSize: '0.82rem', width: '220px' }}
                  />
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const codes = parseTaskCodes(bulkInputText);
                  if (!codes.length) return;
                  bulkAddMutation.mutate({
                    boardId: selectedBoardForTasks.id,
                    taskCodes: codes,
                    note: bulkNote.trim() || undefined
                  });
                }}
                style={{ padding: '14px 20px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    NHẬP HOẶC DÁN DANH SÁCH MÃ WO (HỖ TRỢ COPY TỪ EXCEL, DÒNG MỚI, PHẨY, KHOẢNG TRẮNG):
                  </label>
                  {parseTaskCodes(bulkInputText).length > 0 && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                      ✓ Đã nhận diện {parseTaskCodes(bulkInputText).length} mã WO hợp lệ
                    </span>
                  )}
                </div>
                <textarea
                  className="select-filter"
                  placeholder="Ví dụ:&#10;WO_TT_20260913_123&#10;WO_TT_20260913_456&#10;WO_TT_20260913_789"
                  rows={3}
                  value={bulkInputText}
                  onChange={(e) => setBulkInputText(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', resize: 'vertical', marginBottom: '8px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <input
                    type="text"
                    className="select-filter"
                    placeholder="Ghi chú theo dõi chung cho các WO này (tùy chọn)..."
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    style={{ flex: '1 1 260px', padding: '6px 10px', fontSize: '0.8rem' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={bulkAddMutation.isPending || parseTaskCodes(bulkInputText).length === 0}
                    style={{ padding: '6px 16px', fontSize: '0.82rem', gap: '5px', background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 700 }}
                  >
                    <ListPlus size={14} /> 
                    {bulkAddMutation.isPending 
                      ? 'Đang thêm...' 
                      : `Thêm ${parseTaskCodes(bulkInputText).length} mã WO vào bảng`}
                  </button>
                </div>
              </form>
            )}

            {/* Modal Body: Task List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {loadingBoardDetail ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Đang tải danh sách công việc trong bảng...
                </div>
              ) : !boardDetail?.tasks || boardDetail.tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <FolderKanban size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Chưa có công việc nào trong bảng này</p>
                  <p style={{ fontSize: '0.8rem' }}>
                    Bạn có thể mở chi tiết bất kỳ công việc nào trên Bảng Tổng Quan và nhấn <strong>"Thêm vào bảng theo dõi"</strong>, hoặc nhập trực tiếp mã công việc ở ô phía trên.
                  </p>
                </div>
              ) : (
                <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '160px', textAlign: 'left' }}>Ghi Chú</th>
                      <th style={{ width: '130px', textAlign: 'left' }}>Mã Công Việc</th>
                      <th style={{ minWidth: '160px', textAlign: 'left' }}>Người Thực Hiện</th>
                      <th style={{ width: '90px', textAlign: 'left' }}>Trạm</th>
                      <th style={{ width: '100px', textAlign: 'left' }}>Trạng Thái</th>
                      <th style={{ width: '140px', textAlign: 'left' }}>Thời Gian Còn Lại</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boardDetail.tasks
                      .filter(t => {
                        if (!boardSearchTerm.trim()) return true;
                        const term = boardSearchTerm.trim().toLowerCase();
                        return (
                          (t.ma_cong_viec || '').toLowerCase().includes(term) ||
                          (t.employee_assigned_name || '').toLowerCase().includes(term) ||
                          (t.station_code || '').toLowerCase().includes(term) ||
                          (t.trang_thai || '').toLowerCase().includes(term) ||
                          (t.latest_note || '').toLowerCase().includes(term) ||
                          (t.note || '').toLowerCase().includes(term)
                        );
                      })
                      .map((t, idx) => (
                        <tr key={t.id || t.ma_cong_viec} className="excel-row">
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          
                          {/* Ghi chú */}
                          <td 
                            style={{ 
                              maxWidth: '180px',
                              fontSize: '0.8rem'
                            }}
                          >
                            {editingTaskNote?.ma_cong_viec === t.ma_cong_viec ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="text"
                                  className="select-filter"
                                  value={editingTaskNote.note}
                                  onChange={(e) => setEditingTaskNote({ ...editingTaskNote, note: e.target.value })}
                                  style={{ padding: '2px 6px', fontSize: '0.78rem', width: '110px' }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateTaskNoteMutation.mutate({
                                        boardId: selectedBoardForTasks.id,
                                        ma_cong_viec: t.ma_cong_viec,
                                        note: editingTaskNote.note
                                      });
                                    } else if (e.key === 'Escape') {
                                      setEditingTaskNote(null);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={updateTaskNoteMutation.isPending}
                                  onClick={() => {
                                    updateTaskNoteMutation.mutate({
                                      boardId: selectedBoardForTasks.id,
                                      ma_cong_viec: t.ma_cong_viec,
                                      note: editingTaskNote.note
                                    });
                                  }}
                                  style={{ padding: '2px 6px', fontSize: '0.7rem', background: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' }}
                                  title="Lưu ghi chú"
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => setEditingTaskNote(null)}
                                  style={{ padding: '2px 5px', fontSize: '0.7rem' }}
                                  title="Huỷ"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                <span 
                                  style={{ 
                                    whiteSpace: 'nowrap', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    maxWidth: '130px',
                                    color: (t.note || t.latest_note) ? 'var(--text-primary)' : 'var(--text-muted)',
                                    fontStyle: (t.note || t.latest_note) ? 'normal' : 'italic'
                                  }}
                                  title={t.note ? `Ghi chú bảng: ${t.note}` : t.latest_note ? `Ghi chú WO: ${t.latest_note}` : 'Chưa có ghi chú'}
                                >
                                  {(t.note || t.latest_note) ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ color: t.note ? '#8b5cf6' : 'var(--brand-primary)', fontSize: '11px' }}>📝</span>
                                      <span>{t.note || t.latest_note}</span>
                                    </span>
                                  ) : '--'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditingTaskNote({ ma_cong_viec: t.ma_cong_viec, note: t.note || t.latest_note || '' })}
                                  title="Sửa ghi chú cho WO này"
                                  style={{ padding: '2px 4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                                >
                                  <Pencil size={11} />
                                </button>
                              </div>
                            )}
                          </td>

                          <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                            {t.ma_cong_viec}
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>
                            {t.employee_assigned_name || '--'}
                          </td>
                          <td style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                            {t.station_code || '--'}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: t.trang_thai === 'Đóng' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                              color: t.trang_thai === 'Đóng' ? 'var(--success-dark)' : 'var(--brand-primary)'
                            }}>
                              {t.trang_thai || '--'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: (t.thoi_gian_con_lai < 0) ? 'var(--danger)' : 'var(--text-secondary)' }}>
                            {t.thoi_gian_con_lai != null ? `${t.thoi_gian_con_lai}h` : '--'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                removeTaskMutation.mutate({
                                  boardId: selectedBoardForTasks.id,
                                  ma_cong_viec: t.ma_cong_viec
                                });
                              }}
                              title="Bỏ công việc này khỏi bảng theo dõi"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            >
                              <Trash2 size={12} /> Bỏ
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setSelectedBoardForTasks(null);
                  setBoardSearchTerm('');
                  setManualTaskCode('');
                  setBulkInputText('');
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Bảng Theo Dõi */}
      {editingBoard && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '520px',
            padding: '22px 24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} style={{ color: 'var(--brand-primary)' }} />
                Chỉnh Sửa Bảng Theo Dõi
              </h3>
              <button
                className="btn btn-outline"
                onClick={() => setEditingBoard(null)}
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingBoard.name?.trim()) return;
                const codes = parseTaskCodes(editingBoard.task_codes_to_add_text || '');
                updateBoardMutation.mutate({
                  boardId: editingBoard.id,
                  name: editingBoard.name.trim(),
                  description: editingBoard.description?.trim() || '',
                  loai_cong_viec: editingBoard.loai_cong_viec !== undefined ? (editingBoard.loai_cong_viec?.trim() || '') : undefined,
                  task_codes_to_add: codes.length > 0 ? codes : undefined
                });
              }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  TÊN BẢNG THEO DÕI <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="select-filter"
                  value={editingBoard.name}
                  onChange={(e) => setEditingBoard({ ...editingBoard, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  LOẠI CÔNG VIỆC TỰ ĐỘNG LỌC (TASK.LOAI_CONG_VIEC)
                </label>
                <input
                  type="text"
                  list="edit-task-types-datalist"
                  className="select-filter"
                  placeholder="Chọn hoặc gõ loại công việc (VD: Bảo dưỡng cứng cơ điện...)"
                  value={editingBoard.loai_cong_viec || ''}
                  onChange={(e) => setEditingBoard({ ...editingBoard, loai_cong_viec: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
                <datalist id="edit-task-types-datalist">
                  {taskTypesList.map((tt) => (
                    <option key={tt} value={tt} />
                  ))}
                </datalist>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                  💡 Khi cấu hình loại công việc, bạn có thể bấm nút "Đồng bộ" ngoài danh sách bảng để tự động nạp WO.
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  MÔ TẢ
                </label>
                <textarea
                  className="select-filter"
                  value={editingBoard.description}
                  onChange={(e) => setEditingBoard({ ...editingBoard, description: e.target.value })}
                  rows={2}
                  placeholder="Ghi chú mục đích theo dõi..."
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    BỔ SUNG DANH SÁCH MÃ WO VÀO BẢNG (TÙY CHỌN)
                  </label>
                  {parseTaskCodes(editingBoard.task_codes_to_add_text || '').length > 0 && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.12)', padding: '1px 8px', borderRadius: '10px' }}>
                      + {parseTaskCodes(editingBoard.task_codes_to_add_text || '').length} WO
                    </span>
                  )}
                </div>
                <textarea
                  className="select-filter"
                  value={editingBoard.task_codes_to_add_text || ''}
                  onChange={(e) => setEditingBoard({ ...editingBoard, task_codes_to_add_text: e.target.value })}
                  rows={2}
                  placeholder="Dán thêm các mã WO cần bổ sung vào bảng (phân tách bởi dòng mới, phẩy, khoảng trắng)..."
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingBoard(null)}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateBoardMutation.isPending || !editingBoard.name?.trim()}
                  style={{ padding: '8px 20px', gap: '6px', background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 700 }}
                >
                  <Save size={15} />
                  {updateBoardMutation.isPending ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Thêm Nhanh Danh Sách Mã WO vào Bảng (Quick Bulk Add Modal) */}
      {quickAddBoardModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ListPlus size={20} style={{ color: '#8b5cf6' }} />
                  Thêm Danh Sách Mã WO Vào Bảng
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    📌 {quickAddBoardModal.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    (Hiện có {quickAddBoardModal.task_count || 0} WO)
                  </span>
                </div>
              </div>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setQuickAddBoardModal(null);
                  setQuickAddInputText('');
                  setQuickAddNote('');
                }}
                style={{ padding: '6px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const codes = parseTaskCodes(quickAddInputText);
                if (!codes.length) return;
                quickBulkAddMutation.mutate({
                  boardId: quickAddBoardModal.id,
                  taskCodes: codes,
                  note: quickAddNote.trim() || undefined
                });
              }}
            >
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    DANH SÁCH MÃ WO CẦN THÊM <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  {parseTaskCodes(quickAddInputText).length > 0 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.12)', padding: '2px 8px', borderRadius: '10px' }}>
                      ✓ Đã nhận diện {parseTaskCodes(quickAddInputText).length} mã WO hợp lệ
                    </span>
                  )}
                </div>
                <textarea
                  className="select-filter"
                  placeholder="Dán danh sách mã WO vào đây (hỗ trợ copy cả cột từ file Excel, phân tách bởi dấu phẩy, khoảng trắng hoặc xuống dòng)...&#10;Ví dụ:&#10;WO_TT_123&#10;WO_TT_456&#10;WO_TT_789"
                  rows={6}
                  value={quickAddInputText}
                  onChange={(e) => setQuickAddInputText(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                  required
                  autoFocus
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Hệ thống tự động lọc trùng lặp và bỏ qua các mã đã có sẵn trong bảng.
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  GHI CHÚ THEO DÕI CHO CÁC MÃ WO NÀY (TÙY CHỌN)
                </label>
                <input
                  type="text"
                  className="select-filter"
                  placeholder="VD: Cần đôn đốc đóng trước ngày 20, Trạm lỗi nguồn..."
                  value={quickAddNote}
                  onChange={(e) => setQuickAddNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setQuickAddBoardModal(null);
                    setQuickAddInputText('');
                    setQuickAddNote('');
                  }}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={quickBulkAddMutation.isPending || parseTaskCodes(quickAddInputText).length === 0}
                  style={{ padding: '8px 20px', gap: '6px', background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 700 }}
                >
                  <ListPlus size={16} />
                  {quickBulkAddMutation.isPending 
                    ? 'Đang thêm...' 
                    : `Thêm ${parseTaskCodes(quickAddInputText).length} Mã WO Vào Bảng`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Bảng Báo Cáo */}
      {editingCategory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '520px',
            padding: '22px 24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} style={{ color: 'var(--brand-primary)' }} />
                Chỉnh Sửa Bảng Báo Cáo
              </h3>
              <button
                className="btn btn-outline"
                onClick={() => setEditingCategory(null)}
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingCategory.name?.trim() || !editingCategory.loai_cong_viec?.trim()) return;
                updateCategoryMutation.mutate({
                  id: editingCategory.id,
                  data: {
                    name: editingCategory.name.trim(),
                    loai_cong_viec: editingCategory.loai_cong_viec.trim(),
                    description: editingCategory.description?.trim() || '',
                    exclude_closed_prior_months: editingCategory.exclude_closed_prior_months !== false
                  }
                });
              }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  TÊN BẢNG BÁO CÁO <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="select-filter"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  LOẠI CÔNG VIỆC TRONG DB (TASK.LOAI_CONG_VIEC) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  list="edit-report-cat-types-datalist"
                  className="select-filter"
                  value={editingCategory.loai_cong_viec}
                  onChange={(e) => setEditingCategory({ ...editingCategory, loai_cong_viec: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                  required
                />
                <datalist id="edit-report-cat-types-datalist">
                  {taskTypesList.map((tt) => (
                    <option key={tt} value={tt} />
                  ))}
                </datalist>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  MÔ TẢ BÁO CÁO
                </label>
                <textarea
                  className="select-filter"
                  value={editingCategory.description}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  rows={2}
                  placeholder="Ghi chú mục đích báo cáo..."
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Checkbox cấu hình lọc đóng tháng trước */}
              <div style={{ marginBottom: '18px', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="editCatExcludeClosedPrior"
                  checked={editingCategory.exclude_closed_prior_months !== false}
                  onChange={(e) => setEditingCategory({ ...editingCategory, exclude_closed_prior_months: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                />
                <label htmlFor="editCatExcludeClosedPrior" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  Loại bỏ các công việc đã đóng của tháng trước (Mặc định: <strong>BẬT</strong>)
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingCategory(null)}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateCategoryMutation.isPending || !editingCategory.name?.trim() || !editingCategory.loai_cong_viec?.trim()}
                  style={{ padding: '8px 20px', gap: '6px', fontWeight: 700 }}
                >
                  <Save size={15} />
                  {updateCategoryMutation.isPending ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
