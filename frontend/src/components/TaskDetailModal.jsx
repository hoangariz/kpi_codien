import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  User, 
  FolderKanban, 
  Radio, 
  Phone, 
  FileText, 
  History, 
  MessageSquare, 
  Send, 
  Calendar,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { tasksApi } from '../api/tasksApi';

export default function TaskDetailModal({ task, onClose, onNoteAdded }) {
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'history' | 'notes'
  const [noteContent, setNoteContent] = useState('');
  const [author, setAuthor] = useState('Điều hành');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [localNotes, setLocalNotes] = useState(task.notes || []);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    setSubmittingNote(true);
    try {
      const newNote = await tasksApi.addTaskNote(task.ma_cong_viec, noteContent, author);
      setLocalNotes([newNote, ...localNotes]);
      setNoteContent('');
      if (onNoteAdded) onNoteAdded(task.ma_cong_viec);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
                {task.ma_cong_viec}
              </span>
              <span className="badge badge-neutral">
                {task.trang_thai || 'Chưa rõ'}
              </span>
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              {task.loai_cong_viec || 'Công việc'}
            </h3>
          </div>

          <button className="btn btn-outline btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div style={{ padding: '0 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
          <div className="modal-tabs" style={{ margin: 0 }}>
            <button 
              className={`modal-tab ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              <FileText size={15} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
              Thông Tin Chi Tiết
            </button>
            <button 
              className={`modal-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={15} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
              Lịch Sử Thay Đổi ({task.history?.length || 0})
            </button>
            <button 
              className={`modal-tab ${activeTab === 'notes' ? 'active' : ''}`}
              onClick={() => setActiveTab('notes')}
            >
              <MessageSquare size={15} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
              Ghi Chú Nghiệp Vụ ({localNotes.length})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {activeTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Key metadata grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Nhân Viên Thực Hiện</span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--brand-primary)' }}>
                    {task.employee_assigned_name || 'Chưa gán'}
                  </strong>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Nhóm Điều Phối</span>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {task.group_name || 'Chưa phân nhóm'}
                  </strong>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Hệ Thống / Mã Trạm</span>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {task.system_name || '--'} / {task.station_code || '--'}
                  </strong>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Thuê Bao / FT Mobile</span>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {task.thue_bao || '--'} {task.ft_mobile ? `(${task.ft_mobile})` : ''}
                  </strong>
                </div>
              </div>

              {/* Timing details */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                  Mốc Thời Gian & Tiến Độ
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.82rem' }}>
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
                    <span style={{ fontWeight: 600, color: task.thoi_gian_con_lai < 0 ? 'var(--danger)' : 'inherit' }}>
                      {formatDate(task.thoi_diem_yeu_cau_ket_thuc)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Thời gian còn lại: </span>
                    <span className={task.thoi_gian_con_lai < 0 ? 'badge badge-danger' : 'badge badge-neutral'}>
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
                <div style={{ background: 'var(--bg-tertiary)', padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {task.noi_dung_cong_viec || '(Không có nội dung)'}
                </div>
              </div>

              {task.ghi_chu && (
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>Mô Tả / Ghi Chú Gốc</h4>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                    {task.ghi_chu}
                  </div>
                </div>
              )}

              {task.ft_comment && (
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>FT Comment</h4>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                    {task.ft_comment}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Ghi nhận tự động biến động trạng thái, nhân viên hoặc nhóm điều phối giữa các lần upload file:
              </p>
              {(!task.history || task.history.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <History size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <p>Chưa có biến động dữ liệu nào được ghi nhận cho công việc này.</p>
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {task.history.map((h) => (
                    <div key={h.id} style={{ position: 'relative' }}>
                      <div 
                        style={{ 
                          position: 'absolute', 
                          left: '-31px', 
                          top: '2px', 
                          width: '12px', 
                          height: '12px', 
                          borderRadius: '50%', 
                          background: 'var(--brand-primary)',
                          border: '2px solid var(--bg-secondary)'
                        }} 
                      />
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                        {formatDate(h.changed_at)}
                      </div>
                      <div style={{ fontSize: '0.875rem' }}>
                        Trường thay đổi: <strong>{h.field_changed}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '0.82rem' }}>
                        <span style={{ padding: '2px 8px', background: 'var(--danger-light)', color: 'var(--danger-dark)', borderRadius: '4px', textDecoration: 'line-through' }}>
                          {h.old_value || '(trống)'}
                        </span>
                        <span>&rarr;</span>
                        <span style={{ padding: '2px 8px', background: 'var(--success-light)', color: 'var(--success-dark)', borderRadius: '4px', fontWeight: 600 }}>
                          {h.new_value || '(trống)'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div>
              {/* Form add note */}
              <form onSubmit={handleAddNote} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Người ghi chú..."
                    style={{
                      width: '180px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    * Ghi chú này sẽ được lưu cố định và KHÔNG bị mất khi upload file mới
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <textarea
                    rows={3}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Nhập nội dung theo dõi, lý do vướng mắc, tiến độ hiện trường..."
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingNote || !noteContent.trim()}
                    style={{ alignSelf: 'flex-end', height: '42px' }}
                  >
                    <Send size={16} /> Lưu Note
                  </button>
                </div>
              </form>

              {/* List of notes */}
              {localNotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  <MessageSquare size={30} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <p>Chưa có ghi chú nào cho mã công việc này.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {localNotes.map((note) => (
                    <div 
                      key={note.id} 
                      style={{ 
                        background: 'var(--bg-tertiary)', 
                        padding: '14px 16px', 
                        borderRadius: 'var(--radius-md)',
                        borderLeft: '4px solid var(--brand-primary)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem' }}>
                        <strong style={{ color: 'var(--brand-primary)' }}>{note.created_by}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>{formatDate(note.created_at)}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{note.note_content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
