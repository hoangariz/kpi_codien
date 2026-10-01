import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RotateCcw,
  Search,
  Copy,
  Check,
  MapPin,
  Wifi,
  Tv,
  User,
  Download,
  RefreshCw,
  ArrowLeft,
  SlidersHorizontal,
  Package,
  Boxes,
  HelpCircle,
} from 'lucide-react';
import { deviceRecallApi } from '../api/deviceRecallApi';
import { formatGroupName } from '../utils/groupFormat';

function getClusterShortCode(cumXa) {
  if (!cumXa) return '';
  const str = String(cumXa).trim();
  const parts = str.split('-');
  if (parts.length >= 2) {
    return parts[parts.length - 1].trim().toUpperCase();
  }
  return str.slice(-3).toUpperCase();
}

export default function ThuHoiThietBiPage({ onNavigateToCodinh }) {
  const [selectedCluster, setSelectedCluster] = useState('');
  const [selectedFt, setSelectedFt] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [ftSearch, setFtSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const ftSectionRef = useRef(null);

  const handleSelectCluster = (clusterName) => {
    setSelectedCluster(clusterName);
    setTimeout(() => {
      if (ftSectionRef.current) {
        ftSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // 1. Fetch Metadata
  const { data: metaData, refetch: refetchMeta } = useQuery({
    queryKey: ['deviceRecallMeta'],
    queryFn: () => deviceRecallApi.getMeta(),
  });

  // 2. Fetch Clusters
  const {
    data: clusters = [],
    isLoading: loadingClusters,
    refetch: refetchClusters,
  } = useQuery({
    queryKey: ['deviceRecallClusters'],
    queryFn: () => deviceRecallApi.getClusters(),
  });

  // Auto-select first cluster when loaded
  useEffect(() => {
    if (clusters.length > 0 && !selectedCluster) {
      setSelectedCluster(clusters[0].cum_xa);
    }
  }, [clusters, selectedCluster]);

  // 3. Fetch FTs for selected cluster
  const {
    data: fts = [],
    isLoading: loadingFts,
    refetch: refetchFts,
  } = useQuery({
    queryKey: ['deviceRecallFts', selectedCluster],
    queryFn: () => deviceRecallApi.getFtsByCluster(selectedCluster),
    enabled: !!selectedCluster,
  });

  // Auto-select first FT when FT list changes
  useEffect(() => {
    if (fts.length > 0) {
      setSelectedFt(fts[0].ten_ft);
    } else {
      setSelectedFt('');
    }
    setFtSearch('');
  }, [selectedCluster, fts]);

  // 4. Fetch Items for selected cluster + FT
  const {
    data: itemsData,
    isLoading: loadingItems,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ['deviceRecallItems', selectedCluster, selectedFt, searchTerm],
    queryFn: () => deviceRecallApi.getItems(selectedCluster, selectedFt || null, searchTerm || null),
    enabled: !!selectedCluster,
  });

  const items = itemsData?.items || [];
  const summary = itemsData?.summary || {
    total_subscribers: 0,
    total_devices: 0,
    mesh_devices: 0,
    regular_devices: 0,
  };

  // Filter FTs by ftSearch
  const filteredFts = useMemo(() => {
    if (!ftSearch.trim()) return fts;
    const q = ftSearch.toLowerCase().trim();
    return fts.filter(
      (f) =>
        f.ten_ft.toLowerCase().includes(q) ||
        (f.ma_nv && String(f.ma_nv).toLowerCase().includes(q))
    );
  }, [fts, ftSearch]);

  // Handle 1-click copy subscriber ID
  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1800);
  };

  // Handle Export CSV
  const handleExportCsv = () => {
    if (!items.length) {
      alert('Không có dữ liệu để xuất');
      return;
    }
    const headers = [
      'STT',
      'Số Thuê Bao',
      'Dịch Vụ',
      'Địa Chỉ Khách Hàng',
      'Mức Thuê Bao',
      'Mức Thiết Bị',
      'Tổng Tbi Phải Thu',
      'Loại Thiết Bị',
      'Tuổi Thọ Mesh',
      'Số Tbi Mesh Phải Thu',
    ];
    const rows = items.map((it, idx) => [
      idx + 1,
      `"${it.so_thue_bao || ''}"`,
      `"${it.dich_vu || ''}"`,
      `"${(it.dia_chi_khach_hang || '').replace(/"/g, '""')}"`,
      `"${it.muc_thue_bao || ''}"`,
      `"${it.muc_thiet_bi || ''}"`,
      it.tong_tbi_phai_thu || 0,
      `"${it.loai_thiet_bi || ''}"`,
      `"${it.tuoi_tho_mesh || ''}"`,
      `"${it.so_tbi_mesh_phai_thu || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanFt = selectedFt ? `_${selectedFt.replace(/\s+/g, '_')}` : '_TatCa';
    link.download = `ThuHoiThietBi_${selectedCluster}${cleanFt}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRefreshAll = () => {
    refetchMeta();
    refetchClusters();
    refetchFts();
    refetchItems();
  };

  const selectedFtObj = fts.find((f) => f.ten_ft === selectedFt);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* 1. TOP HEADER & NAVIGATION */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (onNavigateToCodinh) {
                onNavigateToCodinh();
              } else {
                window.history.pushState({}, '', '/codinh');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
            className="btn btn-outline"
            style={{
              padding: '6px 14px',
              fontSize: '0.84rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '8px',
            }}
            title="Quay lại Báo Cáo CĐBR"
          >
            <ArrowLeft size={16} /> Quay lại CĐBR
          </button>

          <span
            className="badge badge-purple"
            style={{ fontSize: '0.85rem', fontWeight: 800, padding: '6px 12px', gap: '6px' }}
          >
            <RotateCcw size={15} /> THU HỒI THIẾT BỊ
          </span>

          {metaData?.last_import_time_vn && (
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                background: 'var(--bg-tertiary)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              Cập nhật: {metaData.last_import_time_vn} ({metaData.filename || 'thuhoithietbi.txt'})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExportCsv}
            disabled={items.length === 0}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.84rem', gap: '6px' }}
            title="Xuất file CSV danh sách đang xem"
          >
            <Download size={15} /> Xuất Excel / CSV
          </button>
          <button
            onClick={handleRefreshAll}
            className="btn btn-outline"
            style={{ padding: '6px 12px', fontSize: '0.84rem' }}
            title="Tải lại dữ liệu"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* 2. STEP 1: CHỌN CỤM (Trung tâm Cụm xã) */}
      <div
        className="table-card"
        style={{
          padding: '14px 18px',
          marginBottom: '14px',
          borderRadius: '12px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          style={{
            fontSize: '0.82rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-secondary)',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#8b5cf6',
                color: '#fff',
                fontSize: '0.72rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              1
            </span>
            Chọn Cụm ({clusters.length} Cụm xã)
            {selectedCluster && (
              <span style={{ fontSize: '0.78rem', color: '#8b5cf6', fontWeight: 700, textTransform: 'none' }}>
                — Đang chọn: {selectedCluster}
              </span>
            )}
          </span>
          <span style={{ fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-muted)' }}>
            Đã lọc bỏ các dòng không có Cụm
          </span>
        </div>

        {/* Cluster Selector Pills - Wrap xuống theo UI, chỉ 3 chữ cuối dạng badge */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          {loadingClusters ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Đang tải danh sách cụm...</div>
          ) : clusters.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>
              Chưa có dữ liệu cụm. Vui lòng nạp file trong /admincodinh.
            </div>
          ) : (
            clusters.map((c) => {
              const isSelected = selectedCluster === c.cum_xa;
              const short = getClusterShortCode(c.cum_xa);
              return (
                <button
                  key={c.cum_xa}
                  type="button"
                  onClick={() => handleSelectCluster(c.cum_xa)}
                  title={`Cụm: ${c.cum_xa} (${c.total_devices} thiết bị)`}
                  style={{
                    cursor: 'pointer',
                    background: isSelected ? 'rgb(139, 92, 246)' : 'var(--bg-tertiary)',
                    color: isSelected ? 'rgb(255, 255, 255)' : 'var(--text-secondary)',
                    border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-color)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 6px rgba(139, 92, 246, 0.35)' : 'none',
                  }}
                >
                  {short}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 3. STEP 2: CHỌN TÊN FT */}
      {selectedCluster && (
        <div
          ref={ftSectionRef}
          className="table-card"
          style={{
            padding: '14px 18px',
            marginBottom: '16px',
            borderRadius: '12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            scrollMarginTop: '74px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: '0.72rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                2
              </span>
              Chọn Nhân Viên FT ({fts.length} nhân viên)
            </div>

            {/* Quick search FT input */}
            {fts.length > 5 && (
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  placeholder="Lọc tên FT / MNV..."
                  value={ftSearch}
                  onChange={(e) => setFtSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 10px 5px 28px',
                    fontSize: '0.78rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <Search
                  size={13}
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
              </div>
            )}
          </div>

          {/* FT Chips / Pills Grid */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              maxHeight: '160px',
              overflowY: 'auto',
              padding: '2px',
              scrollbarWidth: 'thin',
            }}
          >
            {/* Option to view all FTs in cluster */}
            <button
              onClick={() => setSelectedFt('')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: selectedFt === '' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                background: selectedFt === '' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-tertiary)',
                color: selectedFt === '' ? '#3b82f6' : 'var(--text-primary)',
                fontWeight: selectedFt === '' ? 700 : 500,
              }}
            >
              <Boxes size={14} /> Tất cả nhân viên trong cụm
            </button>

            {loadingFts ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px' }}>
                Đang tải danh sách FT...
              </div>
            ) : filteredFts.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px' }}>
                Không tìm thấy nhân viên phù hợp.
              </div>
            ) : (
              filteredFts.map((ft) => {
                const isSelected = selectedFt === ft.ten_ft;
                return (
                  <button
                    key={ft.ten_ft}
                    onClick={() => setSelectedFt(ft.ten_ft)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-tertiary)',
                      color: isSelected ? '#3b82f6' : 'var(--text-primary)',
                      fontWeight: isSelected ? 700 : 500,
                      boxShadow: isSelected ? '0 2px 6px rgba(59, 130, 246, 0.2)' : 'none',
                    }}
                  >
                    <User size={13} style={{ opacity: 0.7 }} />
                    <span>{ft.ten_ft}</span>
                    {ft.ma_nv && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.85 }}>
                        ({ft.ma_nv})
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '6px',
                        background: isSelected ? '#3b82f6' : 'rgba(239, 68, 68, 0.1)',
                        color: isSelected ? '#fff' : '#ef4444',
                      }}
                    >
                      {ft.total_devices} TB
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 5. STEP 3: DANH SÁCH THIẾT BỊ CẦN THU HỒI */}
      <div
        className="table-card"
        style={{
          padding: '18px 20px',
          borderRadius: '12px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Header bar of items list */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.98rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Package size={17} style={{ color: '#ef4444' }} />
              <span>
                Thiết Bị Cần Thu Hồi:{' '}
                <span style={{ color: '#3b82f6' }}>{selectedFt || `Tất cả FT (${selectedCluster})`}</span>
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  padding: '3px 8px',
                  borderRadius: '6px',
                }}
              >
                {summary.total_devices} Thiết bị ({items.length} thuê bao)
              </span>
            </div>
            {selectedFtObj && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Mã nhân viên: <strong>{selectedFtObj.ma_nv}</strong> • Cụm: <strong>{selectedCluster}</strong>
              </div>
            )}
          </div>

          {/* Search box for subscribers */}
          <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
            <input
              type="text"
              placeholder="Tìm số thuê bao, địa chỉ, dịch vụ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 32px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
              }}
            />
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* LOADING OR EMPTY STATE */}
        {loadingItems ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px auto' }}></div>
            <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Đang tải danh sách thiết bị cần thu hồi...</p>
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: 'var(--bg-tertiary)',
              borderRadius: '10px',
              border: '1px dashed var(--border-color)',
            }}
          >
            <Package size={36} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '10px' }} />
            <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Không có thiết bị cần thu hồi
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
              {searchTerm
                ? `Không tìm thấy kết quả nào khớp với "${searchTerm}". Vui lòng thử từ khóa khác!`
                : 'Nhân viên này hiện không có thiết bị tồn đọng cần thu hồi trong danh sách.'}
            </p>
          </div>
        ) : (
          <>
            {/* ============================================================== */}
            {/* A. MOBILE CARDS VIEW (Hiển thị thẻ responsive cho Mobile/Tablet) */}
            {/* ============================================================== */}
            <div className="mobile-only-cards" style={{ display: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {items.map((item, idx) => {
                  const isMesh = item.loai_thiet_bi === 'MESH';
                  const isTv = item.dich_vu && item.dich_vu.toLowerCase().includes('tv');
                  const isFtth = item.dich_vu && item.dich_vu.toLowerCase().includes('ftth');

                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        padding: '12px 14px',
                        boxShadow: 'var(--shadow-sm)',
                        position: 'relative',
                        transition: 'transform 0.15s ease',
                      }}
                    >
                      {/* Card Header: Số TB + Badges */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '6px',
                          marginBottom: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              fontSize: '0.92rem',
                              color: 'var(--brand-primary)',
                            }}
                          >
                            {item.so_thue_bao}
                          </span>
                          <button
                            onClick={() => handleCopy(item.so_thue_bao, item.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: '2px 4px',
                              cursor: 'pointer',
                              color: copiedId === item.id ? '#10b981' : 'var(--text-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '4px',
                            }}
                            title="Copy số thuê bao"
                          >
                            {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isTv
                                ? 'rgba(139, 92, 246, 0.15)'
                                : isFtth
                                ? 'rgba(59, 130, 246, 0.15)'
                                : 'var(--bg-secondary)',
                              color: isTv ? '#8b5cf6' : isFtth ? '#3b82f6' : 'var(--text-secondary)',
                            }}
                          >
                            {isTv ? <Tv size={11} style={{ marginRight: '3px' }} /> : isFtth ? <Wifi size={11} style={{ marginRight: '3px' }} /> : null}
                            {item.dich_vu}
                          </span>

                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isMesh ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                              color: isMesh ? '#f59e0b' : 'var(--text-secondary)',
                            }}
                          >
                            {item.loai_thiet_bi}
                          </span>
                        </div>
                      </div>

                      {/* Card Body: Địa chỉ khách hàng */}
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          marginBottom: '10px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                          lineHeight: '1.35',
                        }}
                      >
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--text-muted)' }} />
                        <span>{item.dia_chi_khach_hang}</span>
                      </div>

                      {/* Card Footer: Grid các thông số kỹ thuật & số lượng thu hồi */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '6px',
                          paddingTop: '8px',
                          borderTop: '1px solid var(--border-color)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ background: 'var(--bg-secondary)', padding: '4px', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Mức TB</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.muc_thue_bao}
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '4px', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Mức Tbi</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.muc_thiet_bi}
                          </div>
                        </div>

                        <div
                          style={{
                            background: item.tong_tbi_phai_thu > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
                            padding: '4px',
                            borderRadius: '6px',
                            border: item.tong_tbi_phai_thu > 0 ? '1px solid rgba(239, 68, 68, 0.25)' : 'none',
                          }}
                        >
                          <div style={{ fontSize: '0.66rem', color: item.tong_tbi_phai_thu > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 700 }}>
                            Thu hồi
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: item.tong_tbi_phai_thu > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                            {item.tong_tbi_phai_thu}
                          </div>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '4px', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Tuổi Mesh</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.tuoi_tho_mesh && item.tuoi_tho_mesh !== '-' ? `${item.tuoi_tho_mesh}th` : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ============================================================== */}
            {/* B. DESKTOP TABLE VIEW (Hiển thị Bảng chuẩn Sticky Header)      */}
            {/* ============================================================== */}
            <div className="desktop-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="excel-table" style={{ width: '100%', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
                    <th style={{ minWidth: '150px' }}>Số Thuê Bao</th>
                    <th style={{ minWidth: '130px' }}>Dịch Vụ</th>
                    <th style={{ minWidth: '240px' }}>Địa Chỉ Khách Hàng</th>
                    <th style={{ width: '75px', textAlign: 'center' }}>Mức TB</th>
                    <th style={{ width: '75px', textAlign: 'center' }}>Mức Tbi</th>
                    <th
                      style={{
                        width: '100px',
                        textAlign: 'center',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#ef4444',
                        fontWeight: 800,
                      }}
                    >
                      Tổng Tbi Thu
                    </th>
                    <th style={{ width: '110px', textAlign: 'center' }}>Loại Thiết Bị</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Tuổi Thọ Mesh</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>Mesh Phải Thu</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const isMesh = item.loai_thiet_bi === 'MESH';
                    const isTv = item.dich_vu && item.dich_vu.toLowerCase().includes('tv');
                    const isFtth = item.dich_vu && item.dich_vu.toLowerCase().includes('ftth');

                    return (
                      <tr key={item.id || idx}>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: 'var(--brand-primary)',
                              }}
                            >
                              {item.so_thue_bao}
                            </span>
                            <button
                              onClick={() => handleCopy(item.so_thue_bao, item.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: copiedId === item.id ? '#10b981' : 'var(--text-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                              title="Copy số thuê bao"
                            >
                              {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isTv
                                ? 'rgba(139, 92, 246, 0.1)'
                                : isFtth
                                ? 'rgba(59, 130, 246, 0.1)'
                                : 'var(--bg-tertiary)',
                              color: isTv ? '#8b5cf6' : isFtth ? '#3b82f6' : 'var(--text-secondary)',
                            }}
                          >
                            {isTv ? <Tv size={12} /> : isFtth ? <Wifi size={12} /> : null}
                            {item.dich_vu}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.78rem', lineHeight: '1.3' }}>
                          <span title={item.dia_chi_khach_hang}>{item.dia_chi_khach_hang}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.muc_thue_bao}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.muc_thiet_bi}</td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 800,
                            fontSize: '0.9rem',
                            color: item.tong_tbi_phai_thu > 0 ? '#ef4444' : 'var(--text-muted)',
                            background: item.tong_tbi_phai_thu > 0 ? 'rgba(239, 68, 68, 0.06)' : 'transparent',
                          }}
                        >
                          {item.tong_tbi_phai_thu}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: isMesh ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                              color: isMesh ? '#f59e0b' : 'var(--text-secondary)',
                            }}
                          >
                            {item.loai_thiet_bi}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                          {item.tuoi_tho_mesh && item.tuoi_tho_mesh !== '-' ? `${item.tuoi_tho_mesh} tháng` : '-'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          {item.so_tbi_mesh_phai_thu !== '-' ? item.so_tbi_mesh_phai_thu : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Note at bottom */}
            <div
              style={{
                marginTop: '12px',
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <HelpCircle size={13} />
              <span>
                Theo quy định hiển thị: Cụm ({selectedCluster}), Tên FT ({selectedFt || 'Tất cả'}), MNV không hiển thị
                lại trong các cột của bảng.
              </span>
            </div>
          </>
        )}
      </div>

      {/* Responsive CSS for Mobile view */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-only-cards {
            display: block !important;
          }
          .desktop-table-wrapper {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
