import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  BookmarkCheck, 
  Search, 
  Plus, 
  Eye, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  ListPlus, 
  X, 
  Save, 
  FolderKanban 
} from 'lucide-react';
import { trackingApi } from '../../api/trackingApi';
import { metaApi } from '../../api/metaApi';
import { formatDate } from '../../utils/dateFormat';

export default function AdminBoardsSection() {
  const queryClient = useQueryClient();

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
  const [editingTaskNote, setEditingTaskNote] = useState(null);

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

  const parseTaskCodes = (text) => {
    if (!text) return [];
    return Array.from(new Set(
      text
        .split(/[\n,;\t\s]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0)
    ));
  };

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

  return (
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
                              background: ['Đóng', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(t.trang_thai) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                              color: ['Đóng', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(t.trang_thai) ? 'var(--success-dark)' : 'var(--brand-primary)'
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
    </div>
  );
}
