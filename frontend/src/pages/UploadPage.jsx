import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Filter, 
  ArrowRight,
  Database,
  PlusCircle,
  RefreshCw
} from 'lucide-react';
import { importsApi } from '../api/importsApi';

export default function UploadPage({ onNavigateToTasks, onNavigateToDashboard }) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentImportId, setCurrentImportId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef(null);

  // Poll for progress when currentImportId exists and status is PROCESSING or PENDING
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
          }
        } catch (err) {
          console.error('Error polling import status:', err);
        }
      }, 1200);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentImportId, importStatus]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      validateAndSetFile(selected);
    }
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
    } catch (err) {
      setUploading(false);
      setErrorMessage(err.response?.data?.detail || err.message || 'Lỗi tải file');
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Introduction Card */}
      <div 
        style={{ 
          background: 'var(--bg-secondary)', 
          padding: '24px', 
          borderRadius: 'var(--radius-lg)', 
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
          Đồng Bộ & Cập Nhật Dữ Liệu Excel
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Hệ thống hỗ trợ file Excel công việc lên tới <strong>100.000+ dòng</strong>. 
          Dữ liệu được xử lý ngầm (background bulk upsert): tự động loại bỏ các dòng Hệ thống SPM/SPM_VTNET, 
          chuẩn hóa danh mục, phát hiện thay đổi tiến độ để ghi vết lịch sử và bảo toàn nguyên vẹn mọi ghi chú riêng của bạn.
        </p>
      </div>

      {/* Drag & Drop Zone */}
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ marginBottom: '24px' }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx, .xls, .csv"
          style={{ display: 'none' }}
        />

        <div style={{ width: '64px', height: '64px', margin: '0 auto 16px', background: 'var(--brand-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-primary)' }}>
          <UploadCloud size={32} />
        </div>

        {file ? (
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', border: '1px solid var(--brand-primary)', marginBottom: '8px' }}>
              <FileSpreadsheet size={16} style={{ color: 'var(--brand-primary)' }} />
              <strong style={{ fontSize: '0.9rem' }}>{file.name}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bấm để chọn file khác hoặc kéo thả file vào đây</p>
          </div>
        ) : (
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>
              Kéo và thả file Excel vào đây, hoặc <span style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>chọn từ máy tính</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Hỗ trợ định dạng: .xlsx, .xls, .csv (Tối ưu cho file xuất từ hệ thống nguồn)
            </p>
          </div>
        )}
      </div>

      {/* Upload Action Button */}
      {file && !uploading && (!importStatus || importStatus.status !== 'PROCESSING') && (
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <button
            className="btn btn-primary"
            onClick={handleUploadSubmit}
            style={{ padding: '12px 32px', fontSize: '0.95rem' }}
          >
            <Database size={18} /> Bắt Đầu Xử Lý & Đồng Bộ Dữ Liệu
          </button>
        </div>
      )}

      {/* Live Processing Card */}
      {uploading && (
        <div 
          style={{ 
            background: 'var(--bg-secondary)', 
            padding: '24px', 
            borderRadius: 'var(--radius-lg)', 
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} className="spin" style={{ color: 'var(--brand-primary)' }} />
              <strong>Đang đọc và đồng bộ dữ liệu vào cơ sở dữ liệu...</strong>
            </div>
            <span style={{ fontWeight: 800, color: 'var(--brand-primary)' }}>
              {importStatus?.progress_percent || 10}%
            </span>
          </div>

          <div className="progress-bar-outer">
            <div 
              className="progress-bar-inner" 
              style={{ width: `${importStatus?.progress_percent || 10}%` }} 
            />
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Hệ thống đang chuẩn hóa danh mục, kiểm tra các bản ghi và ghi nhận vết thay đổi. Quá trình xử lý chạy ngầm và không làm gián đoạn các thao tác khác.
          </p>
        </div>
      )}

      {/* Completion Report Card */}
      {importStatus && importStatus.status === 'COMPLETED' && (
        <div 
          style={{ 
            background: 'var(--bg-secondary)', 
            padding: '28px', 
            borderRadius: 'var(--radius-lg)', 
            border: '1px solid var(--success)',
            marginBottom: '24px',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Đồng Bộ File Thành Công!
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                File: {importStatus.file_name} • Thời điểm: {new Date(importStatus.imported_at).toLocaleString('vi-VN')}
              </p>
            </div>
          </div>

          {/* Breakdown Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Dòng Gốc</span>
              <strong style={{ fontSize: '1.25rem' }}>{importStatus.total_rows.toLocaleString()}</strong>
            </div>

            <div style={{ background: 'var(--warning-light)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--warning-dark)' }}>
              <span style={{ fontSize: '0.72rem', display: 'block' }}>Loại Bỏ SPM</span>
              <strong style={{ fontSize: '1.25rem' }}>{importStatus.filtered_out_count.toLocaleString()}</strong>
            </div>

            <div style={{ background: 'var(--success-light)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--success-dark)' }}>
              <span style={{ fontSize: '0.72rem', display: 'block' }}>Thêm Mới</span>
              <strong style={{ fontSize: '1.25rem' }}>{importStatus.inserted_count.toLocaleString()}</strong>
            </div>

            <div style={{ background: 'var(--brand-light)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--brand-primary)' }}>
              <span style={{ fontSize: '0.72rem', display: 'block' }}>Cập Nhật (Ghi History)</span>
              <strong style={{ fontSize: '1.25rem' }}>{importStatus.updated_count.toLocaleString()}</strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Giữ Nguyên</span>
              <strong style={{ fontSize: '1.25rem' }}>{importStatus.unchanged_count.toLocaleString()}</strong>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setFile(null);
                setImportStatus(null);
              }}
            >
              Upload File Khác
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onNavigateToTasks && onNavigateToTasks()}
            >
              Xem Danh Sách Công Việc <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Error Report */}
      {(errorMessage || (importStatus && importStatus.status === 'FAILED')) && (
        <div 
          style={{ 
            background: 'var(--danger-light)', 
            color: 'var(--danger-dark)', 
            padding: '20px', 
            borderRadius: 'var(--radius-lg)', 
            marginBottom: '24px' 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <AlertCircle size={20} />
            <strong>Đã xảy ra lỗi trong quá trình xử lý file!</strong>
          </div>
          <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
            {importStatus?.error_message || errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
