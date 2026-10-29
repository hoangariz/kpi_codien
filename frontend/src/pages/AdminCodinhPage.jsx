import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  RotateCcw,
  ArrowLeft,
  Database,
  Clock,
  UploadCloud,
  RefreshCw,
  ArrowRight,
  Users,
  HardDrive,
  Trash2
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';
import { deviceRecallApi } from '../api/deviceRecallApi';
import OrgManager from '../components/codinh/admin/OrgManager';
import QlctktManager from '../components/codinh/admin/QlctktManager';

export default function AdminCodinhPage({ onNavigateToCodinh }) {
  const queryClient = useQueryClient();

  // Active navigation tab inside admin: 'upload_base_wo' | 'upload_cabinets' | 'upload_qlctkt' | 'org' | 'upload_device_recall'
  const [activeTab, setActiveTab] = useState('upload_base_wo');

  // Base WO file upload & live status state
  const [baseWoFile, setBaseWoFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isUploadingChunks, setIsUploadingChunks] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusNotice, setStatusNotice] = useState('');
  const [currentImportId, setCurrentImportId] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);
  const uploadAbortControllerRef = useRef(null);

  // Cabinet upload state
  const [cabinetFile, setCabinetFile] = useState(null);
  const [selectedReportKey, setSelectedReportKey] = useState('thc');
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploadingCabinet, setIsUploadingCabinet] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Device Recall upload state
  const [deviceRecallFile, setDeviceRecallFile] = useState(null);
  const [isUploadingDeviceRecall, setIsUploadingDeviceRecall] = useState(false);
  const [deviceRecallResult, setDeviceRecallResult] = useState(null);
  const [deviceRecallError, setDeviceRecallError] = useState(null);
  const deviceRecallInputRef = useRef(null);

  const { data: recallMeta, refetch: refetchRecallMeta } = useQuery({
    queryKey: ['adminDeviceRecallMeta'],
    queryFn: () => deviceRecallApi.getMeta(),
  });

  const handleDeviceRecallUpload = async (e) => {
    if (e) e.preventDefault();
    if (!deviceRecallFile) {
      alert('Vui lòng chọn file văn bản (.txt) danh sách thu hồi thiết bị!');
      return;
    }
    setIsUploadingDeviceRecall(true);
    setDeviceRecallError(null);
    setDeviceRecallResult(null);
    try {
      const res = await deviceRecallApi.uploadFile(deviceRecallFile);
      setDeviceRecallResult(res.data);
      refetchRecallMeta();
      queryClient.invalidateQueries({ queryKey: ['deviceRecallClusters'] });
      queryClient.invalidateQueries({ queryKey: ['deviceRecallMeta'] });
    } catch (err) {
      setDeviceRecallError(err.response?.data?.detail || err.message || 'Lỗi khi tải file lên!');
    } finally {
      setIsUploadingDeviceRecall(false);
    }
  };

  const handleReloadDefaultRecall = async () => {
    if (!window.confirm('Nạp lại dữ liệu từ file thuhoithietbi_update.txt / thuhoithietbi.txt có sẵn trên máy chủ?')) return;
    setIsUploadingDeviceRecall(true);
    setDeviceRecallError(null);
    try {
      const res = await deviceRecallApi.reloadDefault();
      setDeviceRecallResult(res.data);
      refetchRecallMeta();
      queryClient.invalidateQueries({ queryKey: ['deviceRecallClusters'] });
      queryClient.invalidateQueries({ queryKey: ['deviceRecallMeta'] });
      alert(res.message || 'Nạp thành công!');
    } catch (err) {
      setDeviceRecallError(err.response?.data?.detail || err.message);
    } finally {
      setIsUploadingDeviceRecall(false);
    }
  };

  const { data: importLogs = [], isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['codinh-import-logs'],
    queryFn: () => codinhApi.getImportLogs(50),
    refetchInterval: uploading ? false : 12000,
  });

  // Poll for progress when currentImportId exists and status is PROCESSING or PENDING
  useEffect(() => {
    let timer = null;
    if (currentImportId && (!importStatus || ['PENDING', 'PROCESSING'].includes(importStatus.status))) {
      timer = setInterval(async () => {
        try {
          const status = await codinhApi.getImportStatus(currentImportId);
          setImportStatus(status);
          if (['COMPLETED', 'FAILED'].includes(status.status)) {
            clearInterval(timer);
            setUploading(false);
            setIsUploadingChunks(false);
            setStatusNotice('');
            queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-import-logs'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-org-tree'] });
            queryClient.invalidateQueries({ queryKey: ['codinh-org-unmatched'] });
          }
        } catch (err) {
          console.error('Error polling codinh import status:', err);
        }
      }, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentImportId, importStatus]);

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

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const validateAndSetBaseWoFile = (f) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      alert('Vui lòng chọn file định dạng Excel (.xlsx, .xls) hoặc .csv');
      return;
    }
    setBaseWoFile(f);
    setImportStatus(null);
    setErrorMessage('');
    setUploadProgress(0);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetBaseWoFile(dropped);
  };

  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
    }
    setIsUploadingChunks(false);
    setUploading(false);
    setStatusNotice('');
    setErrorMessage('Đã hủy tải lên. Phiên tải lên đã được lưu, bạn có thể chọn lại file này để tiếp tục gửi các phần còn thiếu bất kỳ lúc nào.');
  };

  // Base WO Upload Submit with Chunked Upload & Progress Bar
  const handleBaseWoUploadSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!baseWoFile) {
      alert('Vui lòng chọn file Excel công việc CĐBR (.xlsx, .xls, .csv)');
      return;
    }

    setUploading(true);
    setIsUploadingChunks(true);
    setErrorMessage('');
    setImportStatus(null);
    setUploadProgress(0);
    setStatusNotice('Bắt đầu kết nối tải lên file CĐBR...');

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    try {
      const res = await codinhApi.uploadWoFile(
        baseWoFile,
        (progress) => {
          setUploadProgress(progress);
        },
        (notice) => {
          setStatusNotice(notice);
        },
        abortController.signal
      );
      setIsUploadingChunks(false);
      setCurrentImportId(res.id);
      setImportStatus(res);
      setStatusNotice('');
      refetchLogs();
    } catch (err) {
      setIsUploadingChunks(false);
      setUploading(false);
      setStatusNotice('');
      if (abortController.signal.aborted || err.message?.includes('hủy')) {
        setErrorMessage('Đã hủy tải lên file.');
        return;
      }
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (err.message || 'Lỗi tải file');
      setErrorMessage(msg + '\n\nMẹo: Hệ thống hỗ trợ tiếp tục (resume). Khi kết nối mạng ổn định lại, bạn hãy chọn lại đúng file này để tiếp tục tải lên các phần còn thiếu.');
    }
  };

  // Kích hoạt / Nạp lại file CĐBR cũ
  const handleActivateFile = async (log) => {
    const ok = window.confirm(
      `Xác nhận nạp lại dữ liệu từ file "${log.file_name}" cho Cố Định Băng Rộng?\n\nToàn bộ dữ liệu công việc CĐBR hiện tại trong database sẽ được thay thế bằng dữ liệu của file này.`
    );
    if (!ok) return;

    setUploading(true);
    setErrorMessage('');
    setCurrentImportId(log.id);
    setImportStatus({ status: 'PROCESSING', progress_percent: 5, file_name: log.file_name });

    try {
      await codinhApi.activateFile(log.id);
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-org-tree'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-org-unmatched'] });
    } catch (err) {
      setUploading(false);
      alert('Lỗi kích hoạt lại file CĐBR: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Xoá file CĐBR cũ khỏi hệ thống
  const handleDeleteFile = async (log) => {
    const isAct = log.is_active === 1;
    const msg = isAct 
      ? `CẢNH BÁO: File "${log.file_name}" đang là file dữ liệu ĐANG SỬ DỤNG của CĐBR!\nNếu xoá, toàn bộ công việc CĐBR hiện tại trong hệ thống sẽ bị xoá trống.\n\nBạn có chắc chắn muốn xoá không?`
      : `Bạn có chắc chắn muốn xoá vĩnh viễn file "${log.file_name}" khỏi máy chủ và cơ sở dữ liệu?`;

    if (!window.confirm(msg)) return;

    try {
      await codinhApi.deleteFile(log.id);
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-org-tree'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-org-unmatched'] });
    } catch (err) {
      alert('Lỗi xoá file: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Cabinet Upload Submit
  const handleCabinetUploadSubmit = async (e) => {
    e.preventDefault();
    if (!cabinetFile) {
      alert('Vui lòng chọn file Excel chi tiết tủ cáp (.xlsx, .xls)');
      return;
    }

    setIsUploadingCabinet(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const res = await codinhApi.uploadCabinetFile(
        cabinetFile,
        selectedReportKey || 'thc'
      );
      setUploadResult(res);
      setCabinetFile(null);
      queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
      queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
    } catch (err) {
      setUploadError(err.response?.data?.detail || err.message);
    } finally {
      setIsUploadingCabinet(false);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
              <Cable size={13} /> QUẢN TRỊ CỐ ĐỊNH BĂNG RỘNG
            </span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Quản Trị Báo Cáo & Nạp Dữ Liệu CĐBR
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Nạp file công việc riêng biệt cho CĐBR, nạp file đối chiếu tủ cáp con và cấu hình các bảng báo cáo
          </p>
        </div>

        {onNavigateToCodinh && (
          <button
            onClick={onNavigateToCodinh}
            className="btn btn-outline"
            style={{ fontSize: '0.85rem', padding: '8px 16px', gap: '8px', borderColor: '#8b5cf6', color: '#8b5cf6' }}
          >
            <ArrowLeft size={16} /> Về Trang Báo Cáo CĐBR
          </button>
        )}
      </div>

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'upload_base_wo' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_base_wo')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'upload_base_wo' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'upload_base_wo' ? '#8b5cf6' : 'var(--border-color)' }}
        >
          <Database size={16} /> 1. Nạp File Gốc WO CĐBR (Riêng Biệt)
        </button>

        <button
          className={`btn ${activeTab === 'upload_cabinets' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_cabinets')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'upload_cabinets' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'upload_cabinets' ? '#8b5cf6' : 'var(--border-color)' }}
        >
          <Upload size={16} /> 2. Nạp File Đối Chiếu Tủ Cáp (THC)
        </button>

        <button
          className={`btn ${activeTab === 'upload_qlctkt' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_qlctkt')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'upload_qlctkt' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'upload_qlctkt' ? '#8b5cf6' : 'var(--border-color)', color: activeTab === 'upload_qlctkt' ? '#fff' : 'var(--text-primary)' }}
        >
          <FileSpreadsheet size={16} /> 3. Nạp File QLCTKT Hằng Ngày
        </button>

        <button
          className={`btn ${activeTab === 'org' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('org')}
          style={{ padding: '8px 18px', fontSize: '0.86rem', gap: '8px', borderRadius: '8px 8px 0 0', background: activeTab === 'org' ? '#8b5cf6' : 'transparent', borderColor: activeTab === 'org' ? '#8b5cf6' : 'var(--border-color)', color: activeTab === 'org' ? '#fff' : 'var(--text-primary)' }}
        >
          <Users size={16} /> 4. Cơ cấu Cụm / Đội / Nhân viên
        </button>

        <button
          className={`btn ${activeTab === 'upload_device_recall' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload_device_recall')}
          style={{
            padding: '8px 18px',
            fontSize: '0.86rem',
            gap: '8px',
            borderRadius: '8px 8px 0 0',
            background: activeTab === 'upload_device_recall' ? '#ef4444' : 'transparent',
            borderColor: activeTab === 'upload_device_recall' ? '#ef4444' : 'var(--border-color)',
            color: activeTab === 'upload_device_recall' ? '#fff' : 'var(--text-primary)',
          }}
        >
          <RotateCcw size={16} /> 5. Thu Hồi Thiết Bị (.txt)
        </button>
      </div>

      {/* ================= TAB 1: NẠP FILE GỐC WO CĐBR RIÊNG BIỆT ================= */}
      {activeTab === 'upload_base_wo' && (
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="table-card" style={{ padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Nạp File Gốc Công Việc (WO) Cố Định Băng Rộng
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  File này lưu trữ <strong>hoàn toàn riêng biệt</strong> cho CĐBR, <strong>KHÔNG</strong> ghi đè hay ảnh hưởng đến dữ liệu bên Tổng Quan (Cơ điện). Hệ thống hỗ trợ xử lý file lớn với cơ chế Chunked Upload, tự động quét tìm dòng tiêu đề.
                </p>
              </div>
            </div>

            {/* Drag & Drop Zone */}
            <div
              className={`upload-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #8b5cf6',
                borderRadius: 'var(--radius-lg)',
                padding: '36px 24px',
                textAlign: 'center',
                background: isDragging ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.03)',
                cursor: 'pointer',
                marginBottom: '18px',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) validateAndSetBaseWoFile(selected);
                }}
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
              />

              <div style={{ width: '56px', height: '56px', margin: '0 auto 12px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
                <UploadCloud size={30} />
              </div>

              {baseWoFile ? (
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', border: '1px solid #8b5cf6', marginBottom: '8px' }}>
                    <FileSpreadsheet size={16} style={{ color: '#8b5cf6' }} />
                    <strong style={{ fontSize: '0.9rem' }}>{baseWoFile.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ({(baseWoFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Bấm để chọn file khác hoặc kéo thả file mới vào đây
                  </p>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Kéo và thả file Excel vào đây, hoặc <span style={{ color: '#8b5cf6', textDecoration: 'underline' }}>chọn từ máy tính</span>
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Định dạng hỗ trợ: .xlsx, .xls, .csv • Tự động quét tìm cột Mã công việc, Loại công việc, Nhân viên, Trạng thái...
                  </p>
                </div>
              )}
            </div>

            {/* Upload Button */}
            {baseWoFile && !uploading && (!importStatus || importStatus.status !== 'PROCESSING') && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginBottom: '16px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setBaseWoFile(null);
                    setImportStatus(null);
                    setErrorMessage('');
                  }}
                  style={{ fontSize: '0.82rem', padding: '8px 16px' }}
                >
                  Hủy chọn
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBaseWoUploadSubmit}
                  style={{ fontSize: '0.86rem', padding: '8px 24px', background: '#8b5cf6', borderColor: '#8b5cf6', gap: '8px' }}
                >
                  <Database size={16} /> Bắt Đầu Xử Lý & Đồng Bộ Dữ Liệu CĐBR
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
                  marginBottom: '20px',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} className="spin" style={{ color: '#8b5cf6' }} />
                    <strong style={{ fontSize: '0.9rem' }}>
                      {importStatus?.status === 'PROCESSING' || importStatus?.status === 'PENDING'
                        ? 'Đang đọc và đồng bộ dữ liệu vào bảng Cố Định Băng Rộng...'
                        : uploadProgress < 100
                          ? `Đang tải lên file CĐBR (${uploadProgress}%)...`
                          : 'Đang chuẩn bị xử lý dữ liệu CĐBR...'
                      }
                    </strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {isUploadingChunks && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleCancelUpload}
                        style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        Hủy
                      </button>
                    )}
                    <span style={{ fontWeight: 800, color: '#8b5cf6' }}>
                      {importStatus?.progress_percent || uploadProgress || 0}%
                    </span>
                  </div>
                </div>

                <div className="progress-bar-outer" style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
                  <div 
                    className="progress-bar-inner" 
                    style={{ 
                      width: `${importStatus?.progress_percent || uploadProgress || 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #a855f7)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease'
                    }} 
                  />
                </div>

                {statusNotice && (
                  <p style={{ fontSize: '0.8rem', color: '#8b5cf6', margin: '0 0 6px 0', fontWeight: 600 }}>
                    {statusNotice}
                  </p>
                )}

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Hệ thống đang chuẩn hóa danh mục, đọc các dòng Excel (quét tiêu đề tự động), ghi vết lịch sử. Quá trình xử lý chạy ngầm và không làm gián đoạn các thao tác khác.
                </p>
              </div>
            )}

            {/* Completion Report Card */}
            {importStatus && importStatus.status === 'COMPLETED' && (
              <div 
                style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '24px', 
                  borderRadius: 'var(--radius-lg)', 
                  border: '1px solid var(--success)',
                  marginBottom: '20px',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Đồng Bộ File CĐBR Thành Công!
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                      File: <strong>{importStatus.file_name}</strong> • Thời điểm: {formatDate(importStatus.imported_at)}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Dòng Gốc</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.total_rows || 0).toLocaleString()}</strong>
                  </div>

                  <div style={{ background: 'var(--success-light)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--success-dark)' }}>
                    <span style={{ fontSize: '0.72rem', display: 'block' }}>Thêm Mới</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.inserted_count || 0).toLocaleString()}</strong>
                  </div>

                  <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: '#8b5cf6' }}>
                    <span style={{ fontSize: '0.72rem', display: 'block' }}>Cập Nhật</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.updated_count || 0).toLocaleString()}</strong>
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Giữ Nguyên</span>
                    <strong style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{(importStatus.unchanged_count || 0).toLocaleString()}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setBaseWoFile(null);
                      setImportStatus(null);
                    }}
                    style={{ fontSize: '0.84rem' }}
                  >
                    Upload File Khác
                  </button>
                  {onNavigateToCodinh && (
                    <button
                      className="btn btn-primary"
                      onClick={onNavigateToCodinh}
                      style={{ fontSize: '0.84rem', background: '#8b5cf6', borderColor: '#8b5cf6', gap: '6px' }}
                    >
                      Xem Bảng Báo Cáo CĐBR <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {(errorMessage || (importStatus && importStatus.status === 'FAILED')) && (
              <div 
                style={{ 
                  background: 'var(--danger-light)', 
                  color: 'var(--danger-dark)', 
                  padding: '16px 20px', 
                  borderRadius: 'var(--radius-lg)', 
                  marginBottom: '20px' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <AlertCircle size={20} />
                  <strong style={{ fontSize: '0.92rem' }}>Đã xảy ra lỗi trong quá trình xử lý file CĐBR!</strong>
                </div>
                <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', margin: '0 0 12px 0' }}>
                  {importStatus?.error_message || errorMessage}
                </p>
                <div>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setErrorMessage('');
                      setImportStatus(null);
                      handleBaseWoUploadSubmit();
                    }}
                    style={{ 
                      borderColor: 'var(--danger)', 
                      color: 'var(--danger-dark)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem'
                    }}
                  >
                    <RefreshCw size={14} /> Thử Lại
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lịch Sử Các File Đã Nạp Lên CĐBR Table */}
          <div className="table-card" style={{ marginTop: '28px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HardDrive size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0 }}>
                    Lịch Sử Các File Đã Nạp Lên CĐBR (Quản Lý Lưu Trữ)
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Dữ liệu riêng biệt của CĐBR. Bạn có thể <strong>Sử dụng lại file cũ</strong> để nạp lại dữ liệu hoặc <strong>Xoá file</strong> giải phóng dung lượng.
                  </p>
                </div>
              </div>
              <button 
                className="btn btn-outline" 
                onClick={() => refetchLogs && refetchLogs()}
                style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
              >
                <RefreshCw size={13} /> Làm mới
              </button>
            </div>

            <div className="table-responsive">
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>ID</th>
                    <th>Tên File</th>
                    <th>Thời Điểm Nạp</th>
                    <th style={{ textAlign: 'center' }}>Dung Lượng</th>
                    <th style={{ textAlign: 'center' }}>Tổng Dòng</th>
                    <th style={{ textAlign: 'center' }}>Đã Nạp</th>
                    <th style={{ textAlign: 'center' }}>Trạng Thái</th>
                    <th style={{ textAlign: 'center', width: '180px' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(importLogs || []).map((log) => {
                    const isActive = log.is_active === 1;
                    const isProcessing = log.status === 'PROCESSING' || log.status === 'PENDING';

                    return (
                      <tr 
                        key={log.id}
                        style={{
                          background: isActive ? 'rgba(139, 92, 246, 0.06)' : undefined
                        }}
                      >
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>#{log.id}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileSpreadsheet size={15} style={{ color: isActive ? '#8b5cf6' : 'var(--text-muted)' }} />
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
                        <td style={{ textAlign: 'center' }}>
                          {isActive ? (
                            <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.72rem' }}>
                              <CheckCircle2 size={12} /> Đang Sử Dụng
                            </span>
                          ) : isProcessing ? (
                            <span className="badge badge-info" style={{ gap: '4px', fontSize: '0.72rem' }}>
                              <Clock size={12} className="spin" /> Đang Nạp ({log.progress_percent || 0}%)
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
                                title="Nạp lại dữ liệu từ file này vào Database CĐBR"
                                style={{ 
                                  padding: '3px 8px', 
                                  fontSize: '0.72rem', 
                                  gap: '4px', 
                                  color: '#8b5cf6',
                                  borderColor: 'rgba(139, 92, 246, 0.3)'
                                }}
                              >
                                <RotateCcw size={12} /> Sử Dụng Lại
                              </button>
                            )}

                            {/* Nút Xoá file */}
                            <button
                              className="btn btn-outline"
                              onClick={() => handleDeleteFile(log)}
                              title="Xoá vĩnh viễn file này khỏi máy chủ và database CĐBR"
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
                      <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        Chưa có file nào được tải lên cho Cố Định Băng Rộng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: NẠP FILE CHI TIẾT TỦ CÁP ================= */}
      {activeTab === 'upload_cabinets' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div className="table-card" style={{ padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cable size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Nạp File Chi Tiết Tủ Cáp (THC) Theo Mã WO
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Hỗ trợ file Excel chứa danh sách các tủ hộp cáp con kèm Mã WO (như file <code>demo_tu_theo_ma_wo_demo.xlsx</code>)
                </p>
              </div>
            </div>

            <form onSubmit={handleCabinetUploadSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Bảng Báo Cáo CĐBR Áp Dụng:
                </label>
                <select
                  value={selectedReportKey}
                  onChange={(e) => setSelectedReportKey(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  <option value="thc">Bảo Dưỡng Tủ Hộp Cáp (THC)</option>
                </select>
              </div>

              <div
                style={{
                  border: '2px dashed #8b5cf6',
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px 24px',
                  textAlign: 'center',
                  background: 'rgba(139, 92, 246, 0.03)',
                  cursor: 'pointer',
                  marginBottom: '18px',
                }}
                onClick={() => document.getElementById('cabinet-file-input').click()}
              >
                <FileSpreadsheet size={44} style={{ color: '#8b5cf6', margin: '0 auto 12px auto' }} />
                <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                  {cabinetFile ? cabinetFile.name : 'Nhấp hoặc kéo thả file Excel tủ cáp vào đây'}
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Định dạng hỗ trợ: .xlsx, .xls • Tự động nhận diện cột Mã đối tượng, Mã WO, Trạng thái THC
                </p>
                {cabinetFile && (
                  <div style={{ marginTop: '10px' }}>
                    <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                      ✓ Đã chọn file: {(cabinetFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
                <input
                  id="cabinet-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCabinetFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                {cabinetFile && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setCabinetFile(null)}
                    style={{ fontSize: '0.82rem', padding: '8px 16px' }}
                  >
                    Hủy chọn
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!cabinetFile || isUploadingCabinet}
                  style={{ fontSize: '0.85rem', padding: '8px 24px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  {isUploadingCabinet ? 'Đang nạp file tủ cáp...' : 'Bắt Đầu Nạp File Tủ Cáp'}
                </button>
              </div>
            </form>

            {uploadError && (
              <div style={{ marginTop: '20px', padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--danger-light)', color: 'var(--danger-dark)', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Lỗi nạp file tủ cáp:</strong> {uploadError}
                </div>
              </div>
            )}

            {uploadResult && (
              <div style={{ marginTop: '24px', padding: '20px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: 'var(--success-dark)' }}>
                      Nạp Thành Công File Tủ Cáp!
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Đã lưu trữ {uploadResult.total_cabinets} tủ cáp của {uploadResult.unique_wos} WO lúc {uploadResult.imported_at_vn}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>TỔNG SỐ TỦ</span>
                    <strong style={{ fontSize: '1.25rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.total_cabinets}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--success-dark)', display: 'block' }}>TỦ HOÀN THÀNH</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.completed_cabinets}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--warning-dark)', display: 'block' }}>CHƯA XONG</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.pending_cabinets}
                    </strong>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#8b5cf6', display: 'block' }}>TỶ LỆ XONG</span>
                    <strong style={{ fontSize: '1.25rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                      {uploadResult.completion_rate}%
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: NẠP FILE QLCTKT HẰNG NGÀY ================= */}
      {activeTab === 'upload_qlctkt' && <QlctktManager />}

      {/* ================= TAB 4: CƠ CẤU CỤM / ĐỘI / NHÂN VIÊN ================= */}
      {activeTab === 'org' && <OrgManager />}

      {/* ================= TAB 5: NẠP THU HỒI THIẾT BỊ (.TXT HÀNG THÁNG) ================= */}
      {activeTab === 'upload_device_recall' && (
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="table-card" style={{ padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Nạp Danh Sách Thu Hồi Thiết Bị (.txt hàng tháng)
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Hệ thống hỗ trợ nạp file văn bản <strong>.txt (hoặc .tsv)</strong> có sẵn tiêu đề cột. Các dòng không có Trung tâm Cụm xã sẽ được tự động lọc bỏ và đồng bộ sang trang <strong>/thuhoithietbi</strong>.
                </p>
              </div>
            </div>

            {/* Thông tin file hiện tại đang lưu trữ */}
            {recallMeta && (
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📦 Dữ Liệu Thu Hồi Thiết Bị Đang Sử Dụng:</span>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/thuhoithietbi');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="btn btn-outline"
                    style={{ fontSize: '0.78rem', padding: '4px 10px', gap: '5px', borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    Xem Trang Thu Hồi Thiết Bị <ArrowRight size={13} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Tên file: </span>
                    <strong style={{ color: 'var(--brand-primary)' }}>{recallMeta.filename || 'Chưa nạp'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Cập nhật: </span>
                    <strong>{recallMeta.last_import_time_vn || 'Chưa có'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Tổng thiết bị: </span>
                    <strong style={{ color: '#ef4444' }}>{recallMeta.total_devices || 0} TB</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Đã thu: </span>
                    <strong style={{ color: '#10b981' }}>{recallMeta.total_collected || 0} TB</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Số thuê bao: </span>
                    <strong>{recallMeta.total_count || 0} TB</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Số cụm xã: </span>
                    <strong>{recallMeta.clusters_count || 0} Cụm</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Số nhân viên FT: </span>
                    <strong>{recallMeta.fts_count || 0} FT</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Upload Zone */}
            <form onSubmit={handleDeviceRecallUpload}>
              <div
                onClick={() => deviceRecallInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-tertiary)',
                  transition: 'all 0.2s ease',
                  marginBottom: '18px',
                }}
              >
                <input
                  ref={deviceRecallInputRef}
                  type="file"
                  accept=".txt,.tsv,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setDeviceRecallFile(e.target.files[0]);
                      setDeviceRecallResult(null);
                      setDeviceRecallError(null);
                    }
                  }}
                  style={{ display: 'none' }}
                />

                <UploadCloud size={40} style={{ color: '#ef4444', marginBottom: '10px' }} />
                <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 6px 0' }}>
                  {deviceRecallFile ? deviceRecallFile.name : 'Chọn hoặc kéo thả file .txt thu hồi thiết bị vào đây'}
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  {deviceRecallFile
                    ? `Dung lượng: ${(deviceRecallFile.size / 1024).toFixed(1)} KB. Bấm "Bắt Đầu Nạp Dữ Liệu" bên dưới.`
                    : 'Định dạng hỗ trợ: File văn bản .txt (hoặc .tsv) phân cách bằng dấu Tab, có chứa dòng tiêu đề'}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleReloadDefaultRecall}
                  disabled={isUploadingDeviceRecall}
                  className="btn btn-outline"
                  style={{ fontSize: '0.82rem', padding: '8px 14px', gap: '6px' }}
                >
                  <RefreshCw size={14} /> Nạp Lại File Mẫu (thuhoithietbi_update.txt)
                </button>

                <button
                  type="submit"
                  disabled={!deviceRecallFile || isUploadingDeviceRecall}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.88rem',
                    padding: '9px 24px',
                    gap: '8px',
                    background: '#ef4444',
                    borderColor: '#ef4444',
                    opacity: !deviceRecallFile || isUploadingDeviceRecall ? 0.6 : 1,
                  }}
                >
                  {isUploadingDeviceRecall ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                      Đang xử lý file...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={16} /> Bắt Đầu Nạp Dữ Liệu Thu Hồi
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Success Message */}
            {deviceRecallResult && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.92rem', marginBottom: '6px' }}>
                  <CheckCircle2 size={18} /> Đồng Bộ File Thu Hồi Thiết Bị Thành Công!
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  • Nạp thành công: <strong>{deviceRecallResult.valid_rows}</strong> thuê bao hợp lệ ({deviceRecallResult.total_devices} thiết bị)<br />
                  • Đã lọc bỏ: <strong>{deviceRecallResult.skipped_no_cluster}</strong> dòng không có Trung tâm Cụm xã<br />
                  • Số Cụm: <strong>{deviceRecallResult.total_clusters}</strong> | Số Nhân viên FT: <strong>{deviceRecallResult.total_fts}</strong>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/thuhoithietbi');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="btn btn-primary"
                    style={{ fontSize: '0.82rem', padding: '6px 16px', gap: '6px' }}
                  >
                    Xem Trang Thu Hồi Thiết Bị <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {deviceRecallError && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '0.86rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '4px' }}>
                  <AlertCircle size={18} /> Đã xảy ra lỗi khi nạp file!
                </div>
                <div>{deviceRecallError}</div>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
