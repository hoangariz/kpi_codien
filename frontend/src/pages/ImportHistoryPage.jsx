import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, CheckCircle2, AlertCircle, Clock, FileSpreadsheet } from 'lucide-react';
import { importsApi } from '../api/importsApi';

export default function ImportHistoryPage() {
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['import-logs'],
    queryFn: () => importsApi.getImportLogs(50),
    refetchInterval: 10000,
  });

  const formatDate = (d) => {
    if (!d) return '--';
    if (d instanceof Date) return isNaN(d.getTime()) ? '--' : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const str = String(d).trim();
    const iso = str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)
      ? str
      : (str.includes('T') ? str + 'Z' : str.replace(' ', 'T') + 'Z');
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? d : dt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  };

  const getStatusBadge = (status) => {
    if (status === 'COMPLETED') {
      return (
        <span className="badge badge-success" style={{ gap: '4px' }}>
          <CheckCircle2 size={12} /> Thành công
        </span>
      );
    }
    if (status === 'FAILED') {
      return (
        <span className="badge badge-danger" style={{ gap: '4px' }}>
          <AlertCircle size={12} /> Thất bại
        </span>
      );
    }
    return (
      <span className="badge badge-info" style={{ gap: '4px' }}>
        <Clock size={12} className="spin" /> Đang xử lý
      </span>
    );
  };

  return (
    <div>
      <div className="table-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={18} style={{ color: 'var(--brand-primary)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Lịch Sử Các Lần Đồng Bộ File</h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Lưu vết 50 lần import gần nhất
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>ID</th>
                <th>Tên File</th>
                <th>Thời Điểm Upload</th>
                <th style={{ textAlign: 'center' }}>Tổng Dòng</th>
                <th style={{ textAlign: 'center' }}>Lọc SPM</th>
                <th style={{ textAlign: 'center' }}>Thêm Mới</th>
                <th style={{ textAlign: 'center' }}>Cập Nhật</th>
                <th style={{ textAlign: 'center' }}>Giữ Nguyên</th>
                <th style={{ textAlign: 'right' }}>Trạng Thái</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Đang tải lịch sử import...
                  </td>
                </tr>
              ) : (logs || []).map((log) => (
                <tr key={log.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>#{log.id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileSpreadsheet size={16} style={{ color: 'var(--brand-primary)' }} />
                      <strong>{log.file_name}</strong>
                    </div>
                  </td>
                  <td>{formatDate(log.imported_at)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{log.total_rows.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', color: 'var(--warning-dark)' }}>
                    {log.filtered_out_count > 0 ? log.filtered_out_count.toLocaleString() : '0'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--success-dark)', fontWeight: 600 }}>
                    {log.inserted_count.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--brand-primary)', fontWeight: 600 }}>
                    {log.updated_count.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {log.unchanged_count.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>{getStatusBadge(log.status)}</td>
                </tr>
              ))}
              {!isLoading && (!logs || logs.length === 0) && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Chưa có lịch sử import nào. Hãy tải lên file đầu tiên tại màn hình Import File Mới.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
