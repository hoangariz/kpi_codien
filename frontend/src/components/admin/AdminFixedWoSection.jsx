import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  FileSpreadsheet, 
  Search, 
  Plus, 
  Eye, 
  Pencil, 
  Trash2, 
  Save, 
  X 
} from 'lucide-react';
import { fixedWoApi } from '../../api/fixedWoApi';
import { formatDate } from '../../utils/dateFormat';

export default function AdminFixedWoSection() {
  const queryClient = useQueryClient();

  const [fixedWoName, setFixedWoName] = useState('');
  const [fixedWoDesc, setFixedWoDesc] = useState('');
  const [fixedWoDashboardView, setFixedWoDashboardView] = useState('nhatram');
  const [fixedWoSortOrder, setFixedWoSortOrder] = useState(0);
  const [fixedWoIsPriority, setFixedWoIsPriority] = useState(false);
  const [fixedWoIsAllWo, setFixedWoIsAllWo] = useState(false);
  const [fixedWoCodesText, setFixedWoCodesText] = useState('');
  const [editingFixedWo, setEditingFixedWo] = useState(null);
  const [editFixedWoName, setEditFixedWoName] = useState('');
  const [editFixedWoDesc, setEditFixedWoDesc] = useState('');
  const [editFixedWoDashboardView, setEditFixedWoDashboardView] = useState('nhatram');
  const [editFixedWoSortOrder, setEditFixedWoSortOrder] = useState(0);
  const [editFixedWoIsPriority, setEditFixedWoIsPriority] = useState(false);
  const [editFixedWoIsAllWo, setEditFixedWoIsAllWo] = useState(false);
  const [editFixedWoMode, setEditFixedWoMode] = useState('keep'); // 'keep' | 'append' | 'replace'
  const [editFixedWoCodesText, setEditFixedWoCodesText] = useState('');

  // Viewing WOs Modal
  const [viewingFixedWo, setViewingFixedWo] = useState(null);
  const [viewWoSearch, setViewWoSearch] = useState('');
  const [viewWoFilter, setViewWoFilter] = useState('all'); // 'all' | 'matched' | 'unmatched'

  const { data: fixedWoReports, isLoading: loadingFixedWo, refetch: refetchFixedWo } = useQuery({
    queryKey: ['admin-fixed-wo-reports'],
    queryFn: fixedWoApi.getReports,
  });

  const { data: viewingWoData, isLoading: loadingViewingWo } = useQuery({
    queryKey: ['fixed-wo-codes', viewingFixedWo?.id, viewWoSearch, viewWoFilter],
    queryFn: () => fixedWoApi.listWoCodes(viewingFixedWo.id, {
      search: viewWoSearch.trim() || undefined,
      matched_only: viewWoFilter === 'matched' ? true : viewWoFilter === 'unmatched' ? false : undefined,
    }),
    enabled: Boolean(viewingFixedWo?.id),
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

  const createFixedWoMutation = useMutation({
    mutationFn: (data) => fixedWoApi.createReport(data),
    onSuccess: (res) => {
      setFixedWoName('');
      setFixedWoDesc('');
      setFixedWoDashboardView('nhatram');
      setFixedWoSortOrder(0);
      setFixedWoIsPriority(false);
      setFixedWoIsAllWo(false);
      setFixedWoCodesText('');
      refetchFixedWo();
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-wo-reports'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-wo-reports'] });
      alert(`Đã tạo thành công danh mục báo cáo cố định "${res.name}" với ${res.total_wos} mã WO!`);
    },
    onError: (err) => {
      alert('Lỗi tạo danh mục báo cáo cố định: ' + (err.response?.data?.detail || err.message));
    }
  });

  const updateFixedWoMutation = useMutation({
    mutationFn: ({ id, data }) => fixedWoApi.updateReport(id, data),
    onSuccess: (res) => {
      setEditingFixedWo(null);
      refetchFixedWo();
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-wo-reports'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-wo-reports'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-wo-stats'] });
      alert(`Đã cập nhật báo cáo cố định "${res.name}" thành công!`);
    },
    onError: (err) => {
      alert('Lỗi cập nhật báo cáo cố định: ' + (err.response?.data?.detail || err.message));
    }
  });

  const deleteFixedWoMutation = useMutation({
    mutationFn: (id) => fixedWoApi.deleteReport(id),
    onSuccess: () => {
      refetchFixedWo();
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-wo-reports'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-wo-reports'] });
      alert('Đã xóa báo cáo cố định thành công!');
    },
    onError: (err) => {
      alert('Lỗi xóa báo cáo cố định: ' + (err.response?.data?.detail || err.message));
    }
  });

  return (
    <div 
      id="admin-sec-fixed-wo"
      className="table-card" 
      style={{ 
        padding: '24px', 
        marginBottom: '28px',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        background: 'var(--bg-secondary)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Quản Lý Danh Mục Loại Báo Cáo Cố định WO
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Tạo các bảng báo cáo theo danh sách mã WO cố định được import. Hệ thống tự động tham chiếu dữ liệu sang bảng log để thống kê theo Cụm và Nhân viên.
            </p>
          </div>
        </div>
        {fixedWoReports && (
          <span className="badge badge-warning" style={{ fontSize: '0.78rem', fontWeight: 700, padding: '4px 10px' }}>
            {fixedWoReports.length} danh mục cố định
          </span>
        )}
      </div>

      {/* Form tạo báo cáo cố định WO mới */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const cleanName = fixedWoName.trim();
          const codes = parseTaskCodes(fixedWoCodesText);
          if (!cleanName) {
            alert('Vui lòng nhập tên bảng báo cáo cố định!');
            return;
          }
          if (!fixedWoIsAllWo && codes.length === 0) {
            alert('Vui lòng nhập hoặc dán ít nhất 1 mã WO vào ô import (hoặc tick Báo Cáo All-WO)!');
            return;
          }
          createFixedWoMutation.mutate({
            name: cleanName,
            description: fixedWoDesc.trim() || undefined,
            dashboard_view: fixedWoDashboardView,
            sort_order: Number(fixedWoSortOrder) || 0,
            is_priority: fixedWoIsPriority,
            is_all_wo: fixedWoIsAllWo,
            wo_codes: codes,
          });
        }}
        style={{
          background: 'var(--bg-tertiary)',
          padding: '20px 22px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          border: '1px solid rgba(245, 158, 11, 0.25)'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              TÊN BẢNG BÁO CÁO CỐ ĐỊNH <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              className="select-filter"
              placeholder="VD: All-WO-KH313, Danh Mục WO Tồn..."
              value={fixedWoName}
              onChange={(e) => setFixedWoName(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem' }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              VỊ TRÍ HIỂN THỊ TRÊN DASHBOARD <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              className="select-filter"
              value={fixedWoDashboardView}
              onChange={(e) => setFixedWoDashboardView(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem', fontWeight: 600 }}
            >
              <option value="nhatram">🏢 3. Báo Cáo Nhà Trạm (Mặc định)</option>
              <option value="codien">⚡ 2. Báo Cáo Cơ Điện</option>
              <option value="overview">📊 1. Tổng Quan</option>
              <option value="all">🌐 Tất Cả Các Trang (Cả 3 trang)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              THỨ TỰ SẮP XẾP CARD
            </label>
            <input
              type="number"
              className="select-filter"
              placeholder="0"
              value={fixedWoSortOrder}
              onChange={(e) => setFixedWoSortOrder(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              MÔ TẢ / GHI CHÚ
            </label>
            <input
              type="text"
              className="select-filter"
              placeholder="Ghi chú mục đích của danh mục báo cáo này..."
              value={fixedWoDesc}
              onChange={(e) => setFixedWoDesc(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', fontSize: '0.88rem' }}
            />
          </div>
        </div>

        {/* Checkbox Ưu Tiên & All-WO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={fixedWoIsPriority}
              onChange={(e) => setFixedWoIsPriority(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#f59e0b', cursor: 'pointer' }}
            />
            <span>⭐ Báo Cáo Ưu Tiên (Hiển thị ngay trên Dashboard, tải trước)</span>
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, color: '#8b5cf6' }}>
            <input
              type="checkbox"
              checked={fixedWoIsAllWo}
              onChange={(e) => setFixedWoIsAllWo(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
            />
            <span>🌐 Báo Cáo Nguồn All-WO (Tự động hiển thị ở cả 1. Tổng Quan & 3. Nhà Trạm)</span>
          </label>
        </div>

        {/* Ô import mã WO */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
              Ô IMPORT MÃ WO CỐ ĐỊNH <span style={{ color: 'var(--danger)' }}>*</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {fixedWoCodesText.trim() && (
                <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '2px 8px', fontWeight: 700 }}>
                  ✓ Đã nhận diện {parseTaskCodes(fixedWoCodesText).length.toLocaleString()} mã WO
                </span>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      setFixedWoCodesText(prev => prev ? prev + '\n' + text : text);
                    }
                  } catch {
                    alert('Trình duyệt chưa cấp quyền đọc clipboard. Vui lòng bấm Ctrl + V vào ô bên dưới để dán.');
                  }
                }}
                style={{ padding: '3px 8px', fontSize: '0.74rem' }}
              >
                📋 Dán từ clipboard
              </button>
              {fixedWoCodesText && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setFixedWoCodesText('')}
                  style={{ padding: '3px 8px', fontSize: '0.74rem', color: 'var(--danger-dark)' }}
                >
                  Xóa trắng
                </button>
              )}
            </div>
          </div>

          <textarea
            className="select-filter"
            rows={6}
            value={fixedWoCodesText}
            onChange={(e) => setFixedWoCodesText(e.target.value)}
            placeholder="Dán danh sách mã WO vào đây (hỗ trợ hàng nghìn đến hàng chục nghìn mã WO).&#10;Hệ thống tự động nhận diện mã phân cách bởi xuống dòng, dấu phẩy, chấm phẩy hoặc khoảng trắng...&#10;VD:&#10;WO_CC_SCVT_20260701_170374882&#10;WO_CC_SCVT_20260704_170502557&#10;WO_CC_SCVT_20260704_170540785"
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              resize: 'vertical',
              lineHeight: 1.5
            }}
          />
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
            * Hỗ trợ copy nguyên cột mã công việc từ file Excel và dán trực tiếp. Trùng lặp và khoảng trắng sẽ được tự động lọc sạch.
          </span>
        </div>

        {/* Submit button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createFixedWoMutation.isPending || !fixedWoName.trim() || parseTaskCodes(fixedWoCodesText).length === 0}
            style={{
              padding: '9px 24px',
              fontSize: '0.88rem',
              fontWeight: 700,
              gap: '8px',
              background: '#f59e0b',
              borderColor: '#f59e0b',
              color: '#ffffff'
            }}
          >
            <Plus size={16} />
            {createFixedWoMutation.isPending 
              ? 'Đang tạo và lưu WO...' 
              : `Tạo Báo Cáo Cố Định (${parseTaskCodes(fixedWoCodesText).length.toLocaleString()} WO)`}
          </button>
        </div>
      </form>

      {/* Bảng danh sách các báo cáo cố định WO */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
        <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Thứ Tự</th>
              <th style={{ minWidth: '200px', textAlign: 'left' }}>Tên Báo Cáo Cố Định WO</th>
              <th style={{ width: '135px', textAlign: 'center' }}>Vị Trí Dashboard</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Tổng WO Nạp</th>
              <th style={{ width: '140px', textAlign: 'center' }}>Khớp Trong Log</th>
              <th style={{ width: '120px', textAlign: 'center' }}>Tỉ Lệ Đóng</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Tiến Độ (Đã/Tồn/Quá)</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Ngày Tạo</th>
              <th style={{ width: '170px', textAlign: 'center' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {loadingFixedWo ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Đang tải danh sách báo cáo cố định...
                </td>
              </tr>
            ) : !fixedWoReports || fixedWoReports.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  Chưa có danh mục báo cáo cố định WO nào. Hãy nhập thông tin và danh sách mã WO ở trên để tạo mới.
                </td>
              </tr>
            ) : (
              fixedWoReports.map((rep, idx) => {
                const matched = rep.matched_wos || 0;
                const totalWos = rep.total_wos || 0;
                const unmatched = Math.max(0, totalWos - matched);
                const smm = rep.summary || { total: 0, closed: 0, pending: 0, overdue: 0, completion_rate: 0 };
                return (
                  <tr key={rep.id} className="excel-row">
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{rep.sort_order ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {rep.name}
                          </strong>
                          {rep.is_priority && (
                            <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 800 }} title="Ưu tiên">
                              ⭐
                            </span>
                          )}
                          {rep.is_all_wo && (
                            <span className="badge" style={{ fontSize: '0.68rem', padding: '1px 6px', fontWeight: 800, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                              🌐 All-WO
                            </span>
                          )}
                        </div>
                        {rep.description && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {rep.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {rep.dashboard_view === 'codien' ? (
                        <span className="badge badge-info" style={{ fontSize: '0.74rem', fontWeight: 700 }}>⚡ Cơ Điện</span>
                      ) : rep.dashboard_view === 'overview' ? (
                        <span className="badge badge-primary" style={{ fontSize: '0.74rem', fontWeight: 700 }}>📊 Tổng Quan</span>
                      ) : rep.dashboard_view === 'all' ? (
                        <span className="badge badge-neutral" style={{ fontSize: '0.74rem', fontWeight: 700 }}>🌐 Tất Cả</span>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: '0.74rem', fontWeight: 700 }}>🏢 Nhà Trạm</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.82rem' }}>
                        {totalWos.toLocaleString()} WO
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span className="badge badge-success" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem' }}>
                          ✓ {matched.toLocaleString()} khớp log
                        </span>
                        {unmatched > 0 && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ({unmatched.toLocaleString()} chưa có trong log)
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ 
                        fontWeight: 800, 
                        fontFamily: 'var(--font-mono)',
                        color: (smm.completion_rate >= 80) ? 'var(--success-dark)' : 'var(--brand-primary)' 
                      }}>
                        {smm.completion_rate}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--success-dark)', fontWeight: 700 }} title="Đã hoàn thành đóng">
                          {smm.closed.toLocaleString()}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                        <span style={{ color: 'var(--warning-dark)', fontWeight: 700 }} title="Đang tồn">
                          {smm.pending.toLocaleString()}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                        <span style={{ color: 'var(--danger-dark)', fontWeight: 700 }} title="Quá hạn">
                          {smm.overdue.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {formatDate(rep.created_at)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setViewingFixedWo(rep);
                            setViewWoSearch('');
                            setViewWoFilter('all');
                          }}
                          title="Xem danh sách mã WO"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', gap: '4px' }}
                        >
                          <Eye size={13} /> Xem WO
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            setEditingFixedWo(rep);
                            setEditFixedWoName(rep.name);
                            setEditFixedWoDesc(rep.description || '');
                            setEditFixedWoDashboardView(rep.dashboard_view || 'nhatram');
                            setEditFixedWoSortOrder(rep.sort_order ?? 0);
                            setEditFixedWoIsPriority(Boolean(rep.is_priority));
                            setEditFixedWoIsAllWo(Boolean(rep.is_all_wo));
                            setEditFixedWoMode('keep');
                            setEditFixedWoCodesText('');
                          }}
                          title="Chỉnh sửa báo cáo"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', gap: '4px' }}
                        >
                          <Pencil size={13} /> Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            if (window.confirm(`Bạn có chắc chắn muốn xóa danh mục báo cáo cố định "${rep.name}"?`)) {
                              deleteFixedWoMutation.mutate(rep.id);
                            }
                          }}
                          title="Xóa danh mục báo cáo cố định"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--danger-dark)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Xem Danh Sách Mã WO của Báo Cáo Cố Định */}
      {viewingFixedWo && (
        <div 
          className="modal-overlay" 
          onClick={() => setViewingFixedWo(null)}
          style={{ zIndex: 100 }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              maxWidth: '850px', 
              width: '94vw', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 22px',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="badge badge-warning" style={{ fontSize: '0.8rem', fontWeight: 800, padding: '4px 10px', gap: '5px' }}>
                  <FileSpreadsheet size={14} /> Danh Sách Mã WO
                </span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {viewingFixedWo.name}
                </strong>
              </div>

              <button
                type="button"
                className="btn btn-outline btn-icon"
                onClick={() => setViewingFixedWo(null)}
                style={{ width: '30px', height: '30px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Stat Strip & Search */}
            <div style={{ padding: '14px 22px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>TỔNG MÃ WO NẠP</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {(viewingWoData?.total_wos ?? viewingFixedWo.total_wos ?? 0).toLocaleString()}
                  </strong>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--success-dark)', display: 'block', fontWeight: 600 }}>KHỚP TRONG LOG HIỆN TẠI</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                    {(viewingWoData?.matched_count ?? viewingFixedWo.matched_wos ?? 0).toLocaleString()}
                  </strong>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 600 }}>CHƯA THẤY TRONG LOG</span>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                    {(viewingWoData?.unmatched_count ?? Math.max(0, (viewingFixedWo.total_wos || 0) - (viewingFixedWo.matched_wos || 0))).toLocaleString()}
                  </strong>
                </div>
              </div>

              {/* Search & Filter pills */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '360px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="select-filter"
                    placeholder="Tìm mã WO..."
                    value={viewWoSearch}
                    onChange={(e) => setViewWoSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 12px 6px 32px', fontSize: '0.82rem' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className={`btn ${viewWoFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setViewWoFilter('all')}
                    style={{ padding: '5px 12px', fontSize: '0.76rem' }}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    className={`btn ${viewWoFilter === 'matched' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setViewWoFilter('matched')}
                    style={{ padding: '5px 12px', fontSize: '0.76rem', color: viewWoFilter === 'matched' ? '#fff' : 'var(--success-dark)' }}
                  >
                    ✓ Đã khớp log
                  </button>
                  <button
                    type="button"
                    className={`btn ${viewWoFilter === 'unmatched' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setViewWoFilter('unmatched')}
                    style={{ padding: '5px 12px', fontSize: '0.76rem', color: viewWoFilter === 'unmatched' ? '#fff' : 'var(--warning-dark)' }}
                  >
                    Chưa khớp
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body: List of WO codes */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
              {loadingViewingWo ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Đang tải danh sách mã WO...
                </div>
              ) : !viewingWoData?.items || viewingWoData.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Không tìm thấy mã WO nào phù hợp bộ lọc.
                </div>
              ) : (
                <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                      <th style={{ textAlign: 'left' }}>Mã Công Việc (WO Code)</th>
                      <th style={{ width: '180px', textAlign: 'center' }}>Đối Soát Trong Log</th>
                      <th style={{ width: '130px', textAlign: 'center' }}>Trạng Thái</th>
                      <th style={{ width: '150px', textAlign: 'left' }}>Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingWoData.items.map((it, idx) => (
                      <tr key={it.ma_cong_viec} className="excel-row">
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-primary)', fontSize: '0.86rem' }}>
                          {it.ma_cong_viec}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {it.is_matched ? (
                            <span className="badge badge-success" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
                              ✓ Đã có trong log
                            </span>
                          ) : (
                            <span className="badge badge-neutral" style={{ fontSize: '0.74rem', padding: '2px 8px', color: 'var(--text-muted)' }}>
                              Không có trong log
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {it.is_matched ? (
                            <span className={`badge ${['Đóng', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(it.trang_thai) ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                              {it.trang_thai || 'Đóng'}
                            </span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem', padding: '2px 8px', fontWeight: 700 }}>
                              Đã giao FT
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: !it.is_matched ? 'var(--brand-primary)' : 'var(--text-secondary)', fontWeight: !it.is_matched ? 700 : 400 }}>
                          {it.ghi_chu || (!it.is_matched ? '(IS KL)' : '--')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 22px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Hiển thị tối đa 1,000 mã WO trên trang xem nhanh
              </span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setViewingFixedWo(null)}
                style={{ padding: '6px 16px', fontSize: '0.82rem' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Báo Cáo Cố Định WO */}
      {editingFixedWo && (
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
            padding: '22px 24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} style={{ color: '#f59e0b' }} />
                Chỉnh Sửa Báo Cáo Cố Định WO
              </h3>
              <button
                className="btn btn-outline"
                onClick={() => setEditingFixedWo(null)}
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleanName = editFixedWoName.trim();
                if (!cleanName) {
                  alert('Vui lòng nhập tên báo cáo!');
                  return;
                }
                const extraCodes = editFixedWoMode !== 'keep' ? parseTaskCodes(editFixedWoCodesText) : [];
                if (editFixedWoMode !== 'keep' && extraCodes.length === 0) {
                  alert('Vui lòng nhập mã WO nếu chọn cập nhật danh sách mã!');
                  return;
                }
                updateFixedWoMutation.mutate({
                  id: editingFixedWo.id,
                  data: {
                    name: cleanName,
                    description: editFixedWoDesc.trim() || '',
                    dashboard_view: editFixedWoDashboardView || 'nhatram',
                    sort_order: Number(editFixedWoSortOrder) || 0,
                    is_priority: editFixedWoIsPriority,
                    is_all_wo: editFixedWoIsAllWo,
                    mode: editFixedWoMode,
                    wo_codes: extraCodes,
                  }
                });
              }}
            >
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  TÊN BÁO CÁO CỐ ĐỊNH <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="select-filter"
                  value={editFixedWoName}
                  onChange={(e) => setEditFixedWoName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    VỊ TRÍ HIỂN THỊ <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="select-filter"
                    value={editFixedWoDashboardView}
                    onChange={(e) => setEditFixedWoDashboardView(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem', fontWeight: 600 }}
                  >
                    <option value="nhatram">🏢 3. Báo Cáo Nhà Trạm (Mặc định)</option>
                    <option value="codien">⚡ 2. Báo Cáo Cơ Điện</option>
                    <option value="overview">📊 1. Tổng Quan</option>
                    <option value="all">🌐 Tất Cả Các Trang (Cả 3 trang)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    THỨ TỰ SẮP XẾP
                  </label>
                  <input
                    type="number"
                    className="select-filter"
                    value={editFixedWoSortOrder}
                    onChange={(e) => setEditFixedWoSortOrder(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Checkboxes in Edit Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', border: '1px solid var(--border-color)' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={editFixedWoIsPriority}
                    onChange={(e) => setEditFixedWoIsPriority(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <span>⭐ Báo Cáo Ưu Tiên (Hiển thị đầu trang Dashboard, tải trước)</span>
                </label>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: '#8b5cf6' }}>
                  <input
                    type="checkbox"
                    checked={editFixedWoIsAllWo}
                    onChange={(e) => setEditFixedWoIsAllWo(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                  />
                  <span>🌐 Báo Cáo Nguồn All-WO (Hiển thị ở cả 1. Tổng Quan & 3. Nhà Trạm)</span>
                </label>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  MÔ TẢ / GHI CHÚ
                </label>
                <textarea
                  className="select-filter"
                  value={editFixedWoDesc}
                  onChange={(e) => setEditFixedWoDesc(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  CẬP NHẬT DANH SÁCH MÃ WO (Hiện có {editingFixedWo.total_wos?.toLocaleString()} WO)
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="editFixedWoMode"
                      value="keep"
                      checked={editFixedWoMode === 'keep'}
                      onChange={() => setEditFixedWoMode('keep')}
                    />
                    <span>Giữ nguyên danh sách mã cũ</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="editFixedWoMode"
                      value="append"
                      checked={editFixedWoMode === 'append'}
                      onChange={() => setEditFixedWoMode('append')}
                    />
                    <span>Nạp thêm mã mới vào</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="editFixedWoMode"
                      value="replace"
                      checked={editFixedWoMode === 'replace'}
                      onChange={() => setEditFixedWoMode('replace')}
                    />
                    <span>Thay thế toàn bộ bằng danh sách mới</span>
                  </label>
                </div>

                {editFixedWoMode !== 'keep' && (
                  <div>
                    <textarea
                      className="select-filter"
                      rows={5}
                      value={editFixedWoCodesText}
                      onChange={(e) => setEditFixedWoCodesText(e.target.value)}
                      placeholder="Dán các mã WO vào đây (phân cách bằng xuống dòng, dấu phẩy, khoảng trắng)..."
                      style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingFixedWo(null)}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateFixedWoMutation.isPending || !editFixedWoName.trim()}
                  style={{ padding: '8px 20px', gap: '6px', fontWeight: 700, background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }}
                >
                  <Save size={15} />
                  {updateFixedWoMutation.isPending ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
