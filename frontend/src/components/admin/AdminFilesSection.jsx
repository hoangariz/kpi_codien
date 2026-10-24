import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Info, 
  Filter, 
  Database, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  HardDrive, 
  Trash2 
} from 'lucide-react';
import { importsApi } from '../../api/importsApi';
import { statsApi } from '../../api/statsApi';
import { formatDate, formatBytes } from '../../utils/dateFormat';

export default function AdminFilesSection() {
  const queryClient = useQueryClient();

  // File Upload State
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentImportId, setCurrentImportId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterSpm, setFilterSpm] = useState(false);

  // Fetch import logs (50 latest) - pause polling completely while uploading
  const { data: importLogs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['admin-import-logs'],
    queryFn: () => importsApi.getImportLogs(50),
    refetchInterval: uploading ? false : 12000,
  });

  // Poll for progress when currentImportId exists (poll every 2s until COMPLETED or FAILED)
  useEffect(() => {
    let timer = null;
    if (currentImportId && importStatus && ['PENDING', 'PROCESSING'].includes(importStatus.status)) {
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
      }, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentImportId, importStatus, queryClient, refetchLogs]);

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

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
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
      const res = await importsApi.uploadFile(file, filterSpm);
      setCurrentImportId(res.id);
      setImportStatus(res);
      refetchLogs();
    } catch (err) {
      setUploading(false);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (err.message || 'Lỗi tải file');
      setErrorMessage(msg);
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

  return (
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
            {/* SPM toggle */}
            <div 
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '6px 14px', 
                background: filterSpm ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)', 
                borderRadius: 'var(--radius-md)', 
                border: `1px solid ${filterSpm ? 'var(--warning)' : 'var(--border-color)'}`,
                marginBottom: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                userSelect: 'none'
              }}
              onClick={() => setFilterSpm(!filterSpm)}
            >
              <input 
                type="checkbox" 
                checked={filterSpm}
                onChange={() => setFilterSpm(!filterSpm)}
                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--warning-dark)' }}
              />
              <Filter size={13} style={{ color: filterSpm ? 'var(--warning-dark)' : 'var(--text-muted)' }} />
              <span style={{ 
                fontSize: '0.78rem', 
                fontWeight: 600,
                color: filterSpm ? 'var(--warning-dark)' : 'var(--text-secondary)'
              }}>
                Lọc bỏ SPM / SPM_VTNET {filterSpm ? '(Đang lọc)' : '(Không lọc)'}
              </span>
            </div>
            <br />
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
  );
}
