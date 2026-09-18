import React from 'react';
import { 
  Flame, 
  Plus, 
  Filter, 
  Search, 
  Eye, 
  Trash2 
} from 'lucide-react';

export default function HighPriorityBoardSection({
  trackingBoards = [],
  activeHighBoardId,
  setActiveHighBoardId,
  activeHighBoard,
  highTasks = [],
  loadingHighBoard = false,
  highTotal = 0,
  highPending = 0,
  highOverdue = 0,
  highClosed = 0,
  highRate = 0,
  quickAddWoCode,
  setQuickAddWoCode,
  addHighTaskMutation,
  removeHighTaskMutation,
  selectedBoardId,
  setSelectedBoardId,
  highTrackingSearch,
  setHighTrackingSearch,
  onOpenTaskDetail
}) {
  return (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Chọn bảng theo dõi:
            </span>
            {trackingBoards.map((b) => {
              const isActive = String(b.id) === String(activeHighBoardId);
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveHighBoardId(isActive ? '' : String(b.id))}
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

          {/* Stats strip + Table: only shown when a board is selected */}
          {activeHighBoardId && (
            <>
          {/* Quick summary stats strip for active board */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            padding: '12px 16px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            marginTop: '14px'
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
                      const isOverdue = t.thoi_gian_con_lai != null && t.thoi_gian_con_lai < 0 && !['Đóng', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(t.trang_thai);
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
                            onClick={() => onOpenTaskDetail(t.ma_cong_viec)}
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
                            onClick={() => onOpenTaskDetail(t.ma_cong_viec)}
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
                                onClick={() => onOpenTaskDetail(t.ma_cong_viec)}
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
            </>
          )}
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
  );
}
