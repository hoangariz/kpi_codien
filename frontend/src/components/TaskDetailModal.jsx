import React, { useState, useEffect } from 'react';
import { 
  X, 
  Clock, 
  User, 
  FolderKanban, 
  FileText, 
  MessageSquare, 
  Send, 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  BookmarkPlus,
  BookmarkCheck,
  Plus,
  Trash2
} from 'lucide-react';
import { tasksApi } from '../api/tasksApi';
import { trackingApi } from '../api/trackingApi';
import { statsApi } from '../api/statsApi';

export default function TaskDetailModal({ task, onClose, onNoteAdded }) {
  const [noteContent, setNoteContent] = useState('');
  const [author, setAuthor] = useState('Điều hành');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [localNotes, setLocalNotes] = useState(task.notes || []);

  // Tracking Boards state
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);
  const [allBoards, setAllBoards] = useState([]);
  const [taskBoardIds, setTaskBoardIds] = useState(new Set());
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);

  // Load tracking boards and task's board memberships
  useEffect(() => {
    let isMounted = true;
    const loadBoards = async () => {
      setLoadingBoards(true);
      try {
        const [boardsList, taskBoards] = await Promise.all([
          trackingApi.getBoards(),
          trackingApi.getBoardsForTask(task.ma_cong_viec)
        ]);
        if (isMounted) {
          setAllBoards(boardsList || []);
          setTaskBoardIds(new Set((taskBoards || []).map(b => b.id)));
        }
      } catch (err) {
        console.warn('Error loading tracking boards:', err);
      } finally {
        if (isMounted) setLoadingBoards(false);
      }
    };
    loadBoards();
    return () => { isMounted = false; };
  }, [task.ma_cong_viec]);

  const handleToggleBoard = async (boardId) => {
    const isCurrentlyIn = taskBoardIds.has(boardId);
    try {
      if (isCurrentlyIn) {
        await trackingApi.removeTaskFromBoard(boardId, task.ma_cong_viec);
        setTaskBoardIds(prev => {
          const next = new Set(prev);
          next.delete(boardId);
          return next;
        });
      } else {
        await trackingApi.addTaskToBoard(boardId, task.ma_cong_viec);
        setTaskBoardIds(prev => {
          const next = new Set(prev);
          next.add(boardId);
          return next;
        });
      }
    } catch (err) {
      alert('Lỗi cập nhật bảng theo dõi: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleCreateQuickBoard = async (e) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    setCreatingBoard(true);
    try {
      const created = await trackingApi.createBoard({ name: newBoardName.trim() });
      await trackingApi.addTaskToBoard(created.id, task.ma_cong_viec);
      setAllBoards(prev => [created, ...prev]);
      setTaskBoardIds(prev => new Set(prev).add(created.id));
      setNewBoardName('');
    } catch (err) {
      alert('Lỗi tạo bảng theo dõi: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    setSubmittingNote(true);
    try {
      const newNote = await tasksApi.addTaskNote(task.ma_cong_viec, noteContent, author);
      const updatedNotes = [newNote, ...localNotes];
      setLocalNotes(updatedNotes);
      setNoteContent('');

      // Update in memory cache
      statsApi.updateTaskNoteInCache(task.ma_cong_viec, newNote.note_content);

      if (onNoteAdded) {
        onNoteAdded(task.ma_cong_viec, newNote.note_content);
      }
    } catch (err) {
      alert('Không thể lưu ghi chú: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmittingNote(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleString('vi-VN');
  };

  const activeBoardsCount = taskBoardIds.size;
  const isOverdue = task.thoi_gian_con_lai < 0;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '900px',
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div 
          className="modal-header" 
          style={{ 
            padding: '16px 24px', 
            background: 'var(--bg-secondary)', 
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span 
                className={`badge ${isOverdue ? 'badge-danger' : 'badge-info'}`} 
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.85rem' }}
              >
                {task.ma_cong_viec}
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '0.8rem' }}>
                {task.trang_thai || 'Chưa rõ'}
              </span>
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {task.loai_cong_viec || 'Công việc'}
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Button: Thêm vào bảng theo dõi */}
            <div style={{ position: 'relative' }}>
              <button 
                type="button"
                className={`btn ${activeBoardsCount > 0 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowBoardDropdown(!showBoardDropdown)}
                style={{ fontSize: '0.8rem', padding: '6px 12px', gap: '6px' }}
                title="Quản lý gán công việc này vào các Bảng WO Cần Theo Dõi"
              >
                {activeBoardsCount > 0 ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
                <span>Theo dõi ({activeBoardsCount})</span>
              </button>

              {/* Dropdown Menu for Tracking Boards */}
              {showBoardDropdown && (
                <div 
                  style={{
                    position: 'absolute',
                    top: '110%',
                    right: 0,
                    width: '320px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.4)',
                    padding: '12px',
                    zIndex: 120,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <strong style={{ fontSize: '0.85rem' }}>Bảng WO Cần Theo Dõi</strong>
                    <button 
                      className="btn btn-outline btn-icon" 
                      onClick={() => setShowBoardDropdown(false)}
                      style={{ width: '24px', height: '24px' }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {loadingBoards ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Đang tải danh sách bảng...
                    </div>
                  ) : allBoards.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 4px' }}>
                      Chưa có bảng theo dõi nào được tạo.
                    </div>
                  ) : (
                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {allBoards.map((b) => {
                        const isIn = taskBoardIds.has(b.id);
                        return (
                          <label 
                            key={b.id} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px', 
                              padding: '6px 8px', 
                              borderRadius: 'var(--radius-sm)',
                              background: isIn ? 'rgba(2, 132, 199, 0.1)' : 'transparent',
                              cursor: 'pointer',
                              fontSize: '0.82rem'
                            }}
                          >
                            <input 
                              type="checkbox" 
                              checked={isIn}
                              onChange={() => handleToggleBoard(b.id)}
                            />
                            <span style={{ fontWeight: isIn ? 700 : 400, flex: 1 }}>{b.name}</span>
                            {isIn && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Đã gán</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Form quick create board */}
                  <form onSubmit={handleCreateQuickBoard} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', display: 'flex', gap: '6px' }}>
                    <input 
                      type="text"
                      placeholder="Tạo bảng mới nhanh..."
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '0.78rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      disabled={creatingBoard || !newBoardName.trim()}
                      style={{ padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
                    >
                      <Plus size={12} /> Thêm
                    </button>
                  </form>
                </div>
              )}
            </div>

            <button 
              className="btn btn-outline btn-icon" 
              onClick={onClose}
              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
              title="Đóng cửa sổ"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: Single Clean Scrollable Content */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Key metadata grid (Full sheet information) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Nhân viên (FT)</span>
              <strong style={{ fontSize: '0.92rem', color: isOverdue ? 'var(--danger-dark)' : 'var(--brand-primary)' }}>
                {task.employee_assigned_name || 'Chưa gán'}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Nhóm Điều Phối (Cụm)</span>
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                {task.group_name || 'Chưa phân nhóm'}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Mã Trạm / Hệ Thống</span>
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {task.station_code || '--'} {task.system_name ? `(${task.system_name})` : ''}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Mã WO Cha / Đơn Vị</span>
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {task.ma_cong_viec_cha || '--'} {task.unit_name ? `• ${task.unit_name}` : ''}
              </strong>
            </div>

            {task.thue_bao && (
              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Thuê Bao / Thiết Bị</span>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  {task.thue_bao}
                </strong>
              </div>
            )}

            {task.ft_mobile && (
              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Số Điện Thoại FT</span>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {task.ft_mobile}
                </strong>
              </div>
            )}

            {task.loi && (
              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Mức Độ Lỗi / Ưu Tiên</span>
                <strong style={{ fontSize: '0.92rem', color: 'var(--warning-dark)' }}>
                  {task.loi}
                </strong>
              </div>
            )}
          </div>

          {/* Timing details */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-secondary)' }}>
              Mốc Thời Gian & Tiến Độ
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Thời điểm tạo: </span>
                <span>{formatDate(task.thoi_diem_tao)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Bắt đầu thực hiện: </span>
                <span>{formatDate(task.thoi_diem_bat_dau_thuc_hien)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Yêu cầu kết thúc: </span>
                <span style={{ fontWeight: 600, color: task.thoi_gian_con_lai < 0 ? 'var(--danger-dark)' : 'inherit' }}>
                  {formatDate(task.thoi_diem_yeu_cau_ket_thuc)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Thời gian còn lại: </span>
                <span className={task.thoi_gian_con_lai < 0 ? 'badge badge-danger' : 'badge badge-neutral'} style={{ fontWeight: 700 }}>
                  {task.thoi_gian_con_lai != null ? `${task.thoi_gian_con_lai} giờ` : '--'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>FT hoàn thành: </span>
                <span>{formatDate(task.thoi_diem_ft_hoan_thanh)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>CĐ đóng: </span>
                <span>{formatDate(task.thoi_diem_cd_dong)}</span>
              </div>
            </div>
          </div>

          {/* Content / Notes from Excel */}
          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>Nội Dung Công Việc</h4>
            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.6, border: '1px solid var(--border-color)' }}>
              {task.noi_dung_cong_viec || '(Không có nội dung)'}
            </div>
          </div>

          {task.ghi_chu && (
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>Mô Tả / Ghi Chú Gốc</h4>
              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', border: '1px solid var(--border-color)' }}>
                {task.ghi_chu}
              </div>
            </div>
          )}

          {task.ft_comment && (
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>FT Comment</h4>
              <div style={{ background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', border: '1px solid var(--border-color)' }}>
                {task.ft_comment}
              </div>
            </div>
          )}

          {/* DƯỚI CÙNG: PHẦN GHI CHÚ (NOTES SECTION) */}
          <div style={{ borderTop: '2px dashed var(--border-color)', paddingTop: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                <MessageSquare size={17} style={{ color: 'var(--brand-primary)' }} />
                Ghi Chú Theo Dõi ({localNotes.length})
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                * Ghi chú này được lưu cố định và tự động hiển thị ở cột Ghi chú bảng ngoài
              </span>
            </div>

            {/* Form add note */}
            <form onSubmit={handleAddNote} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Người ghi chú..."
                  style={{
                    width: '180px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <textarea
                  rows={2}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Nhập nội dung ghi chú theo dõi, vướng mắc, hẹn ngày xong..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingNote || !noteContent.trim()}
                  style={{ alignSelf: 'flex-end', height: '36px', padding: '0 16px', gap: '6px', fontSize: '0.82rem' }}
                >
                  <Send size={14} /> Lưu Ghi Chú
                </button>
              </div>
            </form>

            {/* List of notes */}
            {localNotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <MessageSquare size={26} style={{ opacity: 0.3, marginBottom: '6px' }} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Chưa có ghi chú nào cho mã công việc này. Nhập nội dung bên trên để lưu ghi chú.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {localNotes.map((note) => (
                  <div 
                    key={note.id} 
                    style={{ 
                      background: 'var(--bg-tertiary)', 
                      padding: '10px 14px', 
                      borderRadius: 'var(--radius-md)',
                      borderLeft: '4px solid var(--brand-primary)',
                      border: '1px solid var(--border-color)',
                      borderLeftWidth: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem' }}>
                      <strong style={{ color: 'var(--brand-primary)' }}>{note.created_by}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>{formatDate(note.created_at)}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.note_content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
