import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Trash2,
  Clock,
  HardDrive,
  Users,
  Check,
} from 'lucide-react';
import { codinhApi } from '../../../api/codinhApi';

export default function QlctktManager() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // 1. Fetch Import History for QLCTKT
  const {
    data: historyList = [],
    isLoading: loadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['qlctkt-history'],
    queryFn: () => codinhApi.getQlctktHistory(20),
  });

  // 2. Fetch Unmatched Names & Org Warnings
  const {
    data: warningsData,
    isLoading: loadingWarnings,
    refetch: refetchWarnings,
  } = useQuery({
    queryKey: ['qlctkt-warnings'],
    queryFn: () => codinhApi.getOrgWarnings(),
  });

  const unmatchedList = warningsData?.unmatched_qlctkt_names || [];
  const duplicateList = warningsData?.duplicate_ho_ten_keys || [];

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setErrorMessage('Vui lòng chọn file định dạng Excel (.xlsx hoặc .xls)');
        return;
      }
      setSelectedFile(file);
      setErrorMessage('');
      setUploadResult(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setErrorMessage('Vui lòng chọn file định dạng Excel (.xlsx hoặc .xls)');
        return;
      }
      setSelectedFile(file);
      setErrorMessage('');
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Vui lòng chọn file Excel QLCTKT trước khi tải lên');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setUploadResult(null);

    try {
      const res = await codinhApi.uploadQlctktFile(selectedFile);
      setUploadResult(res);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      refetchHistory();
      refetchWarnings();
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Lỗi khi nạp file QLCTKT');
    } finally {
      setIsUploading(false);
    }
  };

  const handleActivate = async (logId) => {
    if (!window.confirm('Kích hoạt lại bản nạp QLCTKT này? Dữ liệu hiện tại sẽ được thay thế bằng file đã lưu.')) return;
    try {
      await codinhApi.activateQlctktFile(logId);
      refetchHistory();
      refetchWarnings();
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
      alert('Đã kích hoạt lại bản nạp thành công!');
    } catch (err) {
      alert('Lỗi kích hoạt lại: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (logId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi lịch sử nạp này?')) return;
    try {
      await codinhApi.deleteQlctktFile(logId);
      refetchHistory();
      alert('Đã xóa bản ghi thành công!');
    } catch (err) {
      alert('Lỗi xóa: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Upload Card */}
      <div className="table-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Nạp File QLCTKT Hằng Ngày
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
              Mỗi lần nạp là một ảnh chụp đầy đủ 30 ngày gần nhất. Hệ thống sẽ thay thế toàn bộ dữ liệu bảng <code>qlctkt_tasks</code> và khớp nhân sự theo Họ Tên.
            </p>
          </div>
        </div>

        {/* Drag & Drop Upload Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: isDragging ? '2px dashed #8b5cf6' : '2px dashed var(--border-color)',
            background: isDragging ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-lg)',
            padding: '36px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '16px',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
          />

          <UploadCloud size={44} style={{ color: selectedFile ? '#8b5cf6' : 'var(--text-muted)', marginBottom: '10px' }} />

          {selectedFile ? (
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#8b5cf6', marginBottom: '4px' }}>
                📄 {selectedFile.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Dung lượng: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Nhấn để chọn file khác
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Kéo thả file Excel QLCTKT vào đây, hoặc nhấn để chọn file
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Hỗ trợ file .xlsx, .xls (Tự động nhận diện header chứa STT và Tiến độ công việc)
              </div>
            </div>
          )}
        </div>

        {/* Action button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
          {selectedFile && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              style={{ fontSize: '0.84rem', padding: '6px 14px' }}
            >
              Hủy chọn
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            style={{
              fontSize: '0.86rem',
              padding: '7px 20px',
              gap: '6px',
              background: '#8b5cf6',
              borderColor: '#8b5cf6',
            }}
          >
            {isUploading ? (
              <>
                <RotateCcw size={15} className="spin" /> Đang xử lý &amp; nạp dữ liệu...
              </>
            ) : (
              <>
                <UploadCloud size={16} /> Bắt đầu nạp file
              </>
            )}
          </button>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--danger-dark)',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Upload Result Card */}
        {uploadResult && (
          <div
            style={{
              marginTop: '20px',
              padding: '16px 20px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <CheckCircle2 size={20} style={{ color: 'var(--success-dark)' }} />
              <strong style={{ fontSize: '0.96rem', color: 'var(--success-dark)' }}>
                Nạp file QLCTKT thành công! Dữ liệu đã được cập nhật.
              </strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px',
                fontSize: '0.84rem',
              }}
            >
              <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Tổng dòng đọc</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {uploadResult.total_rows?.toLocaleString() || 0}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--success-dark)', display: 'block' }}>Số dòng đã nạp</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                  {uploadResult.inserted_count?.toLocaleString() || 0}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: '#8b5cf6', display: 'block' }}>Loại CSKH_2022</span>
                <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                  {uploadResult.cskh_2022_count ?? 0}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--warning-dark)', display: 'block' }}>Chưa khớp danh mục</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                  {uploadResult.unmatched_employees?.length || 0} NV ({uploadResult.unmatched_total_rows || 0} dòng)
                </strong>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Thời gian thực hiện</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {uploadResult.duration_seconds || 0}s
                </strong>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Cập nhật lúc</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  {uploadResult.data_updated_at || '--'}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Cảnh báo trùng họ tên trong danh mục (Duplicate Active Names) */}
      {duplicateList.length > 0 && (
        <div
          className="table-card"
          style={{
            padding: '18px 22px',
            border: '1.5px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <AlertTriangle size={22} style={{ color: '#ef4444' }} />
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>
              Cảnh báo: Có {duplicateList.length} Họ Tên bị trùng lặp giữa các nhân viên Active trong Danh Mục!
            </h4>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
            Hệ thống QLCTKT không gán bừa WO cho các nhân viên trùng tên. Toàn bộ công việc thuộc các tên sau đã được tự động đưa vào mục <strong>Chưa phân đội</strong> để bảo đảm tính chuẩn xác. Vui lòng vào tab <em>Cơ Cấu Cụm / Đội / Nhân Viên</em> để hiệu chỉnh phân biệt tên:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {duplicateList.map((k) => (
              <span
                key={k}
                className="badge badge-danger"
                style={{ fontSize: '0.8rem', padding: '3px 10px', textTransform: 'capitalize' }}
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Danh sách nhân viên trong file chưa có trong danh mục */}
      <div className="table-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Tên Nhân Viên Trong File Chưa Có Trong Danh Mục ({unmatchedList.length})
            </h4>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Các nhân viên này chưa được khai báo trong danh mục nhân sự CĐBR. Công việc tương ứng hiển thị ở dòng "Chưa phân đội".
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => refetchWarnings()}
            style={{ fontSize: '0.78rem', padding: '4px 10px', gap: '4px' }}
          >
            <RotateCcw size={13} /> Làm mới
          </button>
        </div>

        {unmatchedList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
            <Check size={20} style={{ color: 'var(--success-dark)', margin: '0 auto 6px auto', display: 'block' }} />
            Tất cả nhân viên trong file QLCTKT đều đã khớp 100% với danh mục!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="excel-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>STT</th>
                  <th style={{ textAlign: 'left' }}>Họ Tên Trên File QLCTKT</th>
                  <th style={{ textAlign: 'right', width: '140px' }}>Số Công Việc (WO)</th>
                  <th style={{ textAlign: 'left', width: '220px' }}>Xử Lý Hiện Tại</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedList.map((item, idx) => (
                  <tr key={item.name} className="excel-row">
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {item.name}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--warning-dark)' }}>
                      {item.count?.toLocaleString() || 0}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Gán vào mục <strong>Chưa phân đội</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Lịch sử nạp file QLCTKT hằng ngày */}
      <div className="table-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Lịch Sử Các Lần Nạp File QLCTKT
            </h4>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Danh sách các bản chụp file đã nạp. Bạn có thể kích hoạt lại file cũ hoặc xóa bản ghi không dùng.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => refetchHistory()}
            style={{ fontSize: '0.78rem', padding: '4px 10px', gap: '4px' }}
          >
            <RotateCcw size={13} /> Làm mới
          </button>
        </div>

        {loadingHistory ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
            <RotateCcw size={22} className="spin" style={{ margin: '0 auto 6px auto', display: 'block' }} />
            Đang tải lịch sử...
          </div>
        ) : historyList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
            Chưa có lịch sử nạp file QLCTKT nào.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="excel-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>STT</th>
                  <th style={{ textAlign: 'left' }}>Tên File</th>
                  <th style={{ textAlign: 'right', width: '100px' }}>Dung Lượng</th>
                  <th style={{ textAlign: 'center', width: '150px' }}>Thời Điểm Nạp</th>
                  <th style={{ textAlign: 'right', width: '110px' }}>Số Dòng</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Trạng Thái</th>
                  <th style={{ textAlign: 'center', width: '160px' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {historyList.map((log, idx) => {
                  const sizeMb = log.file_size_bytes ? (log.file_size_bytes / (1024 * 1024)).toFixed(2) : '--';
                  return (
                    <tr key={log.id} className="excel-row">
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{log.file_name}</strong>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {sizeMb} MB
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {log.imported_at || '--'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {log.inserted_count?.toLocaleString() || log.total_rows?.toLocaleString() || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {log.is_active ? (
                          <span className="badge badge-success" style={{ fontSize: '0.74rem', fontWeight: 800 }}>
                            <Check size={12} /> Đang Sử Dụng
                          </span>
                        ) : log.status === 'SUCCESS' ? (
                          <span className="badge badge-neutral" style={{ fontSize: '0.74rem' }}>
                            Đã Lưu Trữ
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: '0.74rem' }}>
                            {log.status}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {!log.is_active && (
                            <button
                              type="button"
                              onClick={() => handleActivate(log.id)}
                              className="btn btn-outline"
                              style={{ fontSize: '0.74rem', padding: '3px 8px', borderColor: '#8b5cf6', color: '#8b5cf6' }}
                              title="Kích hoạt lại bản nạp này"
                            >
                              Kích hoạt
                            </button>
                          )}
                          {!log.is_active && (
                            <button
                              type="button"
                              onClick={() => handleDelete(log.id)}
                              className="btn btn-outline"
                              style={{ fontSize: '0.74rem', padding: '3px 8px', borderColor: '#ef4444', color: '#ef4444' }}
                              title="Xóa bản ghi này"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
