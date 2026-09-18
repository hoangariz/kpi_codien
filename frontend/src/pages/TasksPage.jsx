import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  History, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Wrench,
  Eye
} from 'lucide-react';
import { tasksApi } from '../api/tasksApi';
import { metaApi } from '../api/metaApi';
import TaskDetailModal from '../components/TaskDetailModal';

const MAINTENANCE_TYPE = "Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS";

export default function TasksPage({ initialFilters = {} }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(initialFilters.group_id || '');
  const [selectedEmployee, setSelectedEmployee] = useState(initialFilters.assigned_to_id || '');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState(initialFilters.task_type || '');
  const [isOverdue, setIsOverdue] = useState('');

  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Sync initialFilters if passed
  useEffect(() => {
    if (initialFilters.group_id) setSelectedGroup(initialFilters.group_id);
    if (initialFilters.assigned_to_id) setSelectedEmployee(initialFilters.assigned_to_id);
    if (initialFilters.task_type) setSelectedType(initialFilters.task_type);
  }, [initialFilters]);

  // Load filter options
  const { data: filtersMeta } = useQuery({
    queryKey: ['meta-filters'],
    queryFn: metaApi.getFilters,
  });

  // Query paginated tasks
  const { data: tasksData, isLoading, refetch } = useQuery({
    queryKey: ['tasks-list', page, pageSize, search, selectedGroup, selectedEmployee, selectedStatus, selectedType, isOverdue],
    queryFn: () => tasksApi.getTasks({
      page,
      page_size: pageSize,
      search: search || undefined,
      group_id: selectedGroup || undefined,
      assigned_to_id: selectedEmployee || undefined,
      trang_thai: selectedStatus || undefined,
      loai_cong_viec: selectedType || undefined,
      is_overdue: isOverdue === 'true' ? true : isOverdue === 'false' ? false : undefined,
    }),
    placeholderData: (prev) => prev,
  });

  const handleOpenDetail = async (ma_cong_viec) => {
    setSelectedTaskId(ma_cong_viec);
    setLoadingDetail(true);
    try {
      const detail = await tasksApi.getTaskDetail(ma_cong_viec);
      setDetailTask(detail);
    } catch (err) {
      alert('Không thể tải chi tiết công việc: ' + err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedGroup('');
    setSelectedEmployee('');
    setSelectedStatus('');
    setSelectedType('');
    setIsOverdue('');
    setPage(1);
  };

  const formatDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('vi-VN');
  };

  const getStatusBadge = (status) => {
    if (!status) return <span className="badge badge-neutral">--</span>;
    if (['Đóng', 'Hoàn thành', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(status)) return <span className="badge badge-success">{status}</span>;
    if (['Đã giao FT', 'FT Tiếp nhận'].includes(status)) return <span className="badge badge-warning">{status}</span>;
    if (['FT Đang thực hiện', 'Đang thực hiện'].includes(status)) return <span className="badge badge-info">{status}</span>;
    return <span className="badge badge-neutral">{status}</span>;
  };

  return (
    <div>
      {/* Filter Card */}
      <div className="table-card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} style={{ color: 'var(--brand-primary)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Bộ Lọc Dữ Liệu</h3>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Quick 1-click button for maintenance */}
            <button
              className={`btn ${selectedType === MAINTENANCE_TYPE ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              onClick={() => {
                setSelectedType(selectedType === MAINTENANCE_TYPE ? '' : MAINTENANCE_TYPE);
                setPage(1);
              }}
            >
              <Wrench size={14} />
              Bảo Dưỡng Cơ Điện ICMS
            </button>

            <button
              className="btn btn-outline"
              style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              onClick={handleResetFilters}
            >
              <RotateCcw size={14} />
              Đặt Lại
            </button>
          </div>
        </div>

        <div className="filter-group">
          {/* Search box */}
          <div className="search-input-box" style={{ width: '260px' }}>
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Mã việc, thuê bao, nội dung..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Group dropdown */}
          <select
            className="select-filter"
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả Nhóm điều phối</option>
            {(filtersMeta?.groups || []).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          {/* Employee dropdown */}
          <select
            className="select-filter"
            value={selectedEmployee}
            onChange={(e) => {
              setSelectedEmployee(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả Nhân viên thực hiện</option>
            {(filtersMeta?.employees || []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          {/* Status dropdown */}
          <select
            className="select-filter"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả Trạng thái</option>
            {(filtersMeta?.statuses || []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Task Type dropdown */}
          <select
            className="select-filter"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: '240px' }}
          >
            <option value="">Tất cả Loại công việc</option>
            {(filtersMeta?.task_types || []).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Overdue filter */}
          <select
            className="select-filter"
            value={isOverdue}
            onChange={(e) => {
              setIsOverdue(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Hạn xử lý (Tất cả)</option>
            <option value="true">Chỉ việc Trễ hạn</option>
            <option value="false">Trong hạn / Đã hoàn thành</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="table-card">
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Tìm thấy <strong>{tasksData?.total || 0}</strong> công việc
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <span>Số dòng/trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>STT</th>
                <th>Mã Công Việc</th>
                <th>Loại Công Việc</th>
                <th>Trạng Thái</th>
                <th>Nhân Viên Thực Hiện</th>
                <th>Nhóm Điều Phối</th>
                <th>Hạn Kết Thúc</th>
                <th style={{ textAlign: 'center' }}>Theo Dõi</th>
                <th style={{ textAlign: 'right' }}>Chi Tiết</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Đang tải danh sách công việc...
                  </td>
                </tr>
              ) : (tasksData?.items || []).map((task, idx) => (
                <tr key={task.ma_cong_viec} onClick={() => handleOpenDetail(task.ma_cong_viec)}>
                  <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--brand-primary)' }}>
                      {task.ma_cong_viec}
                    </span>
                    {task.thue_bao && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        TB: {task.thue_bao}
                      </span>
                    )}
                  </td>
                  <td style={{ maxWidth: '240px' }}>
                    <span 
                      style={{ 
                        fontWeight: task.loai_cong_viec === MAINTENANCE_TYPE ? 700 : 500,
                        color: task.loai_cong_viec === MAINTENANCE_TYPE ? 'var(--brand-primary)' : 'inherit'
                      }}
                      title={task.loai_cong_viec}
                    >
                      {task.loai_cong_viec || '--'}
                    </span>
                  </td>
                  <td>{getStatusBadge(task.trang_thai)}</td>
                  <td>
                    <strong>{task.employee_assigned_name || 'Chưa gán'}</strong>
                  </td>
                  <td style={{ maxWidth: '200px', fontSize: '0.8rem' }}>
                    {task.group_name || '--'}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: task.thoi_gian_con_lai < 0 ? 'var(--danger)' : 'inherit' }}>
                      {formatDate(task.thoi_diem_yeu_cau_ket_thuc)}
                    </span>
                    {task.thoi_gian_con_lai != null && (
                      <span className={task.thoi_gian_con_lai < 0 ? 'badge badge-danger' : 'badge badge-neutral'} style={{ marginLeft: '6px', fontSize: '0.7rem' }}>
                        {task.thoi_gian_con_lai}h
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      {task.note_count > 0 && (
                        <span className="badge badge-info" title={`${task.note_count} ghi chú`}>
                          <MessageSquare size={11} style={{ marginRight: '2px' }} /> {task.note_count}
                        </span>
                      )}
                      {task.history_count > 0 && (
                        <span className="badge badge-neutral" title={`${task.history_count} lần thay đổi`}>
                          <History size={11} style={{ marginRight: '2px' }} /> {task.history_count}
                        </span>
                      )}
                      {task.note_count === 0 && task.history_count === 0 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>--</span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(task.ma_cong_viec);
                      }}
                    >
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && (!tasksData?.items || tasksData.items.length === 0) && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Không tìm thấy công việc nào thỏa mãn điều kiện lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="pagination-bar">
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Trang {page} / {tasksData?.total_pages || 1}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <ChevronLeft size={16} /> Trang trước
            </button>
            <button
              className="btn btn-outline"
              disabled={page >= (tasksData?.total_pages || 1)}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              Trang sau <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Task Detail Modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onNoteAdded={() => refetch()}
        />
      )}
    </div>
  );
}
