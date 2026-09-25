import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Layers,
  Settings,
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  Users,
  Building2,
  Calendar,
  Download,
  ExternalLink,
  Eye,
  Box,
  CheckCircle,
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';
import { importsApi } from '../api/importsApi';
import { tasksApi } from '../api/tasksApi';
import TaskDetailModal from '../components/TaskDetailModal';
import { formatDataTimestamp } from '../utils/dateFormat';
import { formatGroupName } from '../utils/groupFormat';

export default function CodinhPage({ onNavigateToAdminCodinh }) {
  const queryClient = useQueryClient();

  // Active view tab: 'by_employee' | 'by_group' | 'by_wos'
  const [viewMode, setViewMode] = useState('by_employee');

  // Filter states
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // 'ALL' | 'PENDING' | 'CLOSED' | 'OVERDUE'
  const [selectedFtFilter, setSelectedFtFilter] = useState('');

  // Expanded WO rows in detail view
  const [expandedWos, setExpandedWos] = useState({});

  // Modal detail task
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);
  const [loadingDetailTask, setLoadingDetailTask] = useState(false);

  // 1. Fetch categories for CĐBR
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['codinh-categories'],
    queryFn: () => codinhApi.getCategories(null, true),
  });

  // Effective category id: use selected or first available
  const effectiveCatId = useMemo(() => {
    if (selectedCatId) return selectedCatId;
    if (categories.length > 0) {
      const def = categories.find((c) => c.is_default) || categories[0];
      return def?.id;
    }
    return null;
  }, [selectedCatId, categories]);

  // 2. Fetch stats for the effective category
  const { data: statsData, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['codinh-stats', effectiveCatId],
    queryFn: () => codinhApi.getStats(effectiveCatId),
    enabled: effectiveCatId !== null,
  });

  // 3. Fetch latest import log for data freshness timestamp
  const { data: importLogs } = useQuery({
    queryKey: ['import-logs-latest'],
    queryFn: () => importsApi.getImportLogs(5),
    staleTime: 5 * 60 * 1000,
  });

  const latestImport =
    (importLogs || []).find((l) => l.is_active === 1) ||
    (importLogs || []).find((l) => l.status === 'COMPLETED') ||
    (importLogs && importLogs.length > 0 ? importLogs[0] : null);
  const lastDataUpdate = latestImport?.imported_at || null;

  // Toggle single WO row expansion
  const toggleWoExpand = (woCode) => {
    setExpandedWos((prev) => ({
      ...prev,
      [woCode]: !prev[woCode],
    }));
  };

  // Expand all / Collapse all WOs
  const handleToggleAllWos = (expand) => {
    if (!statsData?.wos) return;
    const next = {};
    if (expand) {
      statsData.wos.forEach((w) => {
        if (w.cabinets && w.cabinets.length > 0) {
          next[w.ma_cong_viec] = true;
        }
      });
    }
    setExpandedWos(next);
  };

  // Open Task Detail Modal
  const handleOpenTaskDetail = async (ma_cong_viec) => {
    try {
      setLoadingDetailTask(true);
      const detail = await tasksApi.getTaskDetail(ma_cong_viec);
      setSelectedDetailTask(detail);
    } catch (err) {
      console.error('Failed to load task detail:', err);
      alert('Không thể tải chi tiết công việc: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingDetailTask(false);
    }
  };

  // Extract unique groups for filter dropdown
  const groupOptions = useMemo(() => {
    if (!statsData?.by_group) return [];
    return statsData.by_group
      .map((g) => g.key_name)
      .filter((name) => name && name !== 'Chưa phân nhóm');
  }, [statsData]);

  // Filtered Employees
  const filteredEmployees = useMemo(() => {
    if (!statsData?.by_employee) return [];
    return statsData.by_employee.filter((emp) => {
      // Group filter
      if (selectedGroup !== 'ALL' && emp.group_name !== selectedGroup) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mName = (emp.key_name || '').toLowerCase().includes(q);
        const mGrp = (emp.group_name || '').toLowerCase().includes(q);
        if (!mName && !mGrp) return false;
      }
      return true;
    });
  }, [statsData, selectedGroup, searchQuery]);

  // Filtered Groups
  const filteredGroups = useMemo(() => {
    if (!statsData?.by_group) return [];
    return statsData.by_group.filter((grp) => {
      if (selectedGroup !== 'ALL' && grp.key_name !== selectedGroup) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!(grp.key_name || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [statsData, selectedGroup, searchQuery]);

  // Filtered WOs
  const filteredWos = useMemo(() => {
    if (!statsData?.wos) return [];
    return statsData.wos.filter((w) => {
      // FT Filter
      if (selectedFtFilter && w.employee_assigned_name !== selectedFtFilter) return false;
      // Group filter
      if (selectedGroup !== 'ALL' && w.group_name !== selectedGroup) return false;
      // Status filter
      if (selectedStatus === 'PENDING' && w.is_closed) return false;
      if (selectedStatus === 'CLOSED' && !w.is_closed) return false;
      if (selectedStatus === 'OVERDUE' && !w.is_overdue) return false;
      // Search query (Mã WO, Mã trạm, FT, Nội dung, Mã THC)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mWo = (w.ma_cong_viec || '').toLowerCase().includes(q);
        const mStation = (w.station_code || '').toLowerCase().includes(q);
        const mFt = (w.employee_assigned_name || '').toLowerCase().includes(q);
        const mContent = (w.noi_dung_cong_viec || '').toLowerCase().includes(q);
        const mCab = (w.cabinets || []).some(
          (c) =>
            (c.ma_doi_tuong || '').toLowerCase().includes(q) ||
            (c.ma_tram || '').toLowerCase().includes(q)
        );
        if (!mWo && !mStation && !mFt && !mContent && !mCab) return false;
      }
      return true;
    });
  }, [statsData, selectedFtFilter, selectedGroup, selectedStatus, searchQuery]);

  const activeCategory = statsData?.active_category;
  const summary = statsData?.summary || {
    total_wos: 0,
    closed_wos: 0,
    pending_wos: 0,
    overdue_wos: 0,
    closed_today_wos: 0,
    closed_yesterday_wos: 0,
    wo_rate: 0,
    total_cabinets: 0,
    completed_cabinets: 0,
    pending_cabinets: 0,
    cabinet_rate: 0,
    has_cabinets: false,
  };

  const hasCabinets = summary.has_cabinets;

  // Export CSV
  const handleExportCsv = () => {
    if (!statsData?.wos || statsData.wos.length === 0) {
      alert('Không có dữ liệu để xuất');
      return;
    }
    const headers = [
      'Mã WO',
      'Mã Trạm',
      'Nhân Viên (FT)',
      'Cụm / Nhóm',
      'Trạng Thái WO',
      'Quá Hạn',
      'Tổng Tủ THC',
      'Tủ Hoàn Thành',
      'Mã Các Tủ THC',
    ];
    const rows = filteredWos.map((w) => [
      `"${w.ma_cong_viec}"`,
      `"${w.station_code || ''}"`,
      `"${w.employee_assigned_name || ''}"`,
      `"${formatGroupName(w.group_name) || ''}"`,
      `"${w.trang_thai || ''}"`,
      `"${w.is_overdue ? 'Quá hạn' : 'Đúng hạn'}"`,
      w.total_cabinets || 0,
      w.completed_cabinets || 0,
      `"${(w.cabinets || []).map((c) => c.ma_doi_tuong).join(', ')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Bao_cao_CDBR_${activeCategory?.name || 'THC'}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* 1. Header Banner & Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              className="badge badge-purple"
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Cable size={14} /> CỐ ĐỊNH BĂNG RỘNG (CĐBR)
            </span>

            {lastDataUpdate && (
              <span
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'var(--bg-tertiary)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                <Clock size={12} /> Dữ liệu cập nhật đến: {formatDataTimestamp(lastDataUpdate)}
              </span>
            )}
          </div>

          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            {activeCategory?.name || 'Báo Cáo Cố Định Băng Rộng'}
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Theo dõi song song số lượng công việc (WO) và chi tiết đối chiếu từng tủ cáp con (THC) theo nhân viên và tuyến cụm
          </p>
        </div>

        {/* Top Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {onNavigateToAdminCodinh && (
            <button
              onClick={onNavigateToAdminCodinh}
              className="btn btn-outline"
              style={{
                fontSize: '0.84rem',
                padding: '8px 16px',
                gap: '8px',
                borderColor: '#8b5cf6',
                color: '#8b5cf6',
                fontWeight: 700,
              }}
              title="Vào trang quản trị CĐBR để tạo bảng theo đầu việc / hệ thống hoặc nạp file chi tiết tủ cáp"
            >
              <Settings size={15} /> Quản Trị & Nạp File CĐBR
            </button>
          )}

          <button
            onClick={() => refetchStats()}
            className="btn btn-outline"
            style={{ fontSize: '0.84rem', padding: '8px 14px' }}
            title="Tải lại số liệu mới nhất"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* 2. Category Selector Ribbon */}
      {categories.length > 0 && (
        <div style={{ marginBottom: '22px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Chọn Danh Mục Báo Cáo CĐBR ({categories.length})
            </span>
            {onNavigateToAdminCodinh && (
              <span
                onClick={onNavigateToAdminCodinh}
                style={{
                  fontSize: '0.78rem',
                  color: '#8b5cf6',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                + Thêm bảng báo cáo khác
              </span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              overflowX: 'auto',
              paddingBottom: '6px',
            }}
          >
            {categories.map((cat) => {
              const isSelected = String(cat.id) === String(effectiveCatId);
              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCatId(cat.id)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(59, 130, 246, 0.08))'
                      : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    minWidth: '220px',
                    maxWidth: '300px',
                    flexShrink: 0,
                    boxShadow: isSelected ? '0 0 10px rgba(139, 92, 246, 0.2)' : 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: isSelected ? '#8b5cf6' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {cat.filter_mode === 'by_system' ? 'Theo Hệ Thống' : 'Theo Đầu Việc'}
                    </span>
                    {cat.is_default && (
                      <span
                        className="badge badge-success"
                        style={{ fontSize: '0.62rem', padding: '1px 5px' }}
                      >
                        Mặc định
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 800,
                      color: isSelected ? '#8b5cf6' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cat.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading state for stats */}
      {loadingStats ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div className="spin" style={{ display: 'inline-block', marginBottom: '12px' }}>
            <RotateCcw size={28} />
          </div>
          <div>Đang tính toán số liệu báo cáo Cố Định Băng Rộng...</div>
        </div>
      ) : (
        <>
          {/* 3. DUAL KPI SUMMARY STRIP */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '14px',
              marginBottom: '24px',
            }}
          >
            {/* KPI Card 1: Tổng số WO */}
            <div
              className="table-card"
              style={{
                padding: '18px',
                borderLeft: '4px solid #3b82f6',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  Công Việc (WO)
                </span>
                <span
                  className="badge badge-purple"
                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                >
                  Tỷ lệ {summary.wo_rate}%
                </span>
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 900,
                  color: 'var(--text-primary)',
                  lineHeight: 1.1,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {summary.total_wos.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginTop: '10px',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <span>
                  Đã đóng:{' '}
                  <strong style={{ color: 'var(--success)' }}>
                    {summary.closed_wos.toLocaleString()}
                  </strong>
                </span>
                <span>
                  Đang tồn:{' '}
                  <strong style={{ color: 'var(--warning-dark)' }}>
                    {summary.pending_wos.toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>

            {/* KPI Card 2: Tổng số Tủ Cáp THC (Nếu có) */}
            {hasCabinets ? (
              <div
                className="table-card"
                style={{
                  padding: '18px',
                  borderLeft: '4px solid #8b5cf6',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Tủ Cáp Con (THC)
                  </span>
                  <span
                    className="badge badge-success"
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  >
                    Xong {summary.cabinet_rate}%
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    color: '#8b5cf6',
                    lineHeight: 1.1,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {summary.total_cabinets.toLocaleString()}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    marginTop: '10px',
                    display: 'flex',
                    gap: '12px',
                  }}
                >
                  <span>
                    Hoàn thành:{' '}
                    <strong style={{ color: 'var(--success)' }}>
                      {summary.completed_cabinets.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Chưa xong:{' '}
                    <strong style={{ color: 'var(--warning-dark)' }}>
                      {summary.pending_cabinets.toLocaleString()}
                    </strong>
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="table-card"
                style={{
                  padding: '18px',
                  borderLeft: '4px solid #10b981',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    WO Đã Hoàn Thành
                  </span>
                  <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    color: 'var(--success)',
                    lineHeight: 1.1,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {summary.closed_wos.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                  Tỷ lệ đạt {summary.wo_rate}% tổng số WO
                </div>
              </div>
            )}

            {/* KPI Card 3: Tiến độ hoàn thành (Visual progress) */}
            <div
              className="table-card"
              style={{
                padding: '18px',
                borderLeft: '4px solid #10b981',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {hasCabinets ? 'Tiến Độ Bảo Dưỡng Tủ' : 'Tiến Độ Đóng WO'}
                </span>
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 900,
                    color: hasCabinets ? '#8b5cf6' : 'var(--brand-primary)',
                  }}
                >
                  {hasCabinets ? `${summary.cabinet_rate}%` : `${summary.wo_rate}%`}
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: '10px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden',
                  margin: '8px 0',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(hasCabinets ? summary.cabinet_rate : summary.wo_rate, 100)}%`,
                    background: hasCabinets
                      ? 'linear-gradient(90deg, #8b5cf6, #10b981)'
                      : 'linear-gradient(90deg, #0284c7, #10b981)',
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                {hasCabinets ? (
                  <>
                    <span>
                      Đã xong: {summary.completed_cabinets} / {summary.total_cabinets} tủ
                    </span>
                    <span>Còn {summary.pending_cabinets} tủ</span>
                  </>
                ) : (
                  <>
                    <span>
                      Đã đóng: {summary.closed_wos} / {summary.total_wos} WO
                    </span>
                    <span>Tồn: {summary.pending_wos} WO</span>
                  </>
                )}
              </div>
            </div>

            {/* KPI Card 4: Quá Hạn & Hoạt Động Gần Đây */}
            <div
              className="table-card"
              style={{
                padding: '18px',
                borderLeft: summary.overdue_wos > 0 ? '4px solid var(--danger)' : '4px solid #64748b',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  Cảnh Báo & Biến Động
                </span>
                {summary.overdue_wos > 0 ? (
                  <span
                    className="badge badge-danger"
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  >
                    Quá Hạn
                  </span>
                ) : (
                  <span
                    className="badge badge-success"
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  >
                    Tốt
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 900,
                  color: summary.overdue_wos > 0 ? 'var(--danger)' : 'var(--text-primary)',
                  lineHeight: 1.1,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {summary.overdue_wos.toLocaleString()}
                <span style={{ fontSize: '0.88rem', fontWeight: 600, marginLeft: '6px' }}>
                  WO quá hạn
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginTop: '10px',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <span>
                  Hôm nay:{' '}
                  <strong style={{ color: 'var(--brand-primary)' }}>
                    +{summary.closed_today_wos}
                  </strong>
                </span>
                <span>
                  Hôm qua:{' '}
                  <strong style={{ color: 'var(--text-secondary)' }}>
                    +{summary.closed_yesterday_wos}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* 4. CONTROLS BAR: View Tabs & Filters */}
          <div
            className="table-card"
            style={{
              padding: '14px 18px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Left: View Tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                className={`btn ${viewMode === 'by_employee' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setViewMode('by_employee')}
                style={{ fontSize: '0.84rem', padding: '7px 14px', gap: '6px' }}
              >
                <User size={15} /> Theo Nhân Viên ({filteredEmployees.length})
              </button>

              <button
                className={`btn ${viewMode === 'by_group' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setViewMode('by_group')}
                style={{ fontSize: '0.84rem', padding: '7px 14px', gap: '6px' }}
              >
                <Building2 size={15} /> Theo Cụm / Tuyến ({filteredGroups.length})
              </button>

              <button
                className={`btn ${viewMode === 'by_wos' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setViewMode('by_wos')}
                style={{
                  fontSize: '0.84rem',
                  padding: '7px 14px',
                  gap: '6px',
                  background: viewMode === 'by_wos' ? '#8b5cf6' : 'transparent',
                  borderColor: viewMode === 'by_wos' ? '#8b5cf6' : 'var(--border-color)',
                }}
              >
                <Layers size={15} /> Chi Tiết WO & Tủ Con ({filteredWos.length})
              </button>
            </div>

            {/* Right: Search, Filter Dropdowns, Export */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                flex: 1,
                justifyContent: 'flex-end',
              }}
            >
              {/* Search box */}
              <div style={{ position: 'relative', minWidth: '220px', maxWidth: '300px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Tìm nhân viên, cụm, WO, tủ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    fontSize: '0.82rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Group Filter */}
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.82rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="ALL">-- Tất cả cụm --</option>
                {groupOptions.map((grp, idx) => (
                  <option key={idx} value={grp}>
                    {formatGroupName(grp)} ({grp})
                  </option>
                ))}
              </select>

              {/* Status Filter (applicable to WO list) */}
              {viewMode === 'by_wos' && (
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.82rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="ALL">-- Tất cả trạng thái --</option>
                  <option value="PENDING">Chỉ WO đang tồn</option>
                  <option value="CLOSED">Chỉ WO đã đóng</option>
                  <option value="OVERDUE">Chỉ WO quá hạn</option>
                </select>
              )}

              {/* Active FT tag if filtered from employee row */}
              {selectedFtFilter && (
                <span
                  className="badge badge-purple"
                  style={{
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  FT: {selectedFtFilter}
                  <span
                    onClick={() => setSelectedFtFilter('')}
                    style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '2px' }}
                  >
                    ×
                  </span>
                </span>
              )}

              {/* Export Button */}
              <button
                onClick={handleExportCsv}
                className="btn btn-outline"
                style={{ fontSize: '0.82rem', padding: '6px 12px', gap: '6px' }}
                title="Xuất danh sách công việc và tủ cáp ra file Excel/CSV"
              >
                <Download size={14} /> Xuất CSV
              </button>
            </div>
          </div>

          {/* 5. MAIN CONTENT TABLES ACCORDING TO VIEW MODE */}

          {/* ================= VIEW 1: THEO NHÂN VIÊN ================= */}
          {viewMode === 'by_employee' && (
            <div className="table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                      <th style={{ minWidth: '180px' }}>Nhân Viên (FT)</th>
                      <th style={{ minWidth: '110px' }}>Cụm / Tuyến</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Tổng WO</th>
                      <th style={{ width: '90px', textAlign: 'right', color: 'var(--success)' }}>
                        WO Đã Đóng
                      </th>
                      <th style={{ width: '90px', textAlign: 'right', color: 'var(--warning-dark)' }}>
                        WO Đang Tồn
                      </th>
                      <th style={{ width: '90px', textAlign: 'right', color: 'var(--danger)' }}>
                        WO Quá Hạn
                      </th>
                      {hasCabinets && (
                        <>
                          <th style={{ width: '95px', textAlign: 'right', color: '#8b5cf6' }}>
                            Tổng Tủ THC
                          </th>
                          <th style={{ width: '95px', textAlign: 'right', color: 'var(--success)' }}>
                            Tủ Đã Xong
                          </th>
                          <th style={{ width: '95px', textAlign: 'right' }}>Tủ Chưa Xong</th>
                          <th style={{ width: '140px', textAlign: 'center' }}>Tỷ Lệ Tủ (%)</th>
                        </>
                      )}
                      <th style={{ width: '90px', textAlign: 'center' }}>Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hasCabinets ? 12 : 8}
                          style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}
                        >
                          Không tìm thấy nhân viên nào phù hợp bộ lọc
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp, idx) => {
                        const isOverdue = emp.overdue_wos > 0;
                        return (
                          <tr key={idx} className={emp.is_other ? 'row-muted' : ''}>
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                              {idx + 1}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                {emp.key_name}
                              </div>
                            </td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.72rem',
                                  background: 'var(--bg-tertiary)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {formatGroupName(emp.group_name)}
                              </span>
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {emp.total_wos}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                color: 'var(--success)',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {emp.closed_wos}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                color: emp.pending_wos > 0 ? 'var(--warning-dark)' : 'var(--text-muted)',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {emp.pending_wos}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                color: isOverdue ? 'var(--danger)' : 'var(--text-muted)',
                                fontWeight: isOverdue ? 900 : 400,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {emp.overdue_wos}
                            </td>

                            {hasCabinets && (
                              <>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: '#8b5cf6',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {emp.total_cabinets}
                                </td>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: 'var(--success)',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {emp.completed_cabinets}
                                </td>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    color:
                                      emp.pending_cabinets > 0
                                        ? 'var(--warning-dark)'
                                        : 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {emp.pending_cabinets}
                                </td>
                                <td>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: '60px',
                                        height: '6px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '3px',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: '100%',
                                          width: `${Math.min(emp.cabinet_rate, 100)}%`,
                                          background:
                                            emp.cabinet_rate >= 100
                                              ? 'var(--success)'
                                              : emp.cabinet_rate > 50
                                              ? '#8b5cf6'
                                              : 'var(--warning)',
                                        }}
                                      />
                                    </div>
                                    <span
                                      style={{
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        fontFamily: 'var(--font-mono)',
                                        color:
                                          emp.cabinet_rate >= 100
                                            ? 'var(--success)'
                                            : 'var(--text-primary)',
                                      }}
                                    >
                                      {emp.cabinet_rate}%
                                    </span>
                                  </div>
                                </td>
                              </>
                            )}

                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-outline"
                                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                                onClick={() => {
                                  setSelectedFtFilter(emp.key_name);
                                  setViewMode('by_wos');
                                }}
                                title={`Xem danh sách WO của ${emp.key_name}`}
                              >
                                Xem WO
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= VIEW 2: THEO CỤM / TUYẾN ================= */}
          {viewMode === 'by_group' && (
            <div className="table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                      <th style={{ minWidth: '220px' }}>Cụm / Nhóm Đơn Vị</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Mã Ngắn</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Tổng WO</th>
                      <th style={{ width: '100px', textAlign: 'right', color: 'var(--success)' }}>
                        WO Đã Đóng
                      </th>
                      <th style={{ width: '100px', textAlign: 'right', color: 'var(--warning-dark)' }}>
                        WO Đang Tồn
                      </th>
                      <th style={{ width: '100px', textAlign: 'right', color: 'var(--danger)' }}>
                        WO Quá Hạn
                      </th>
                      {hasCabinets && (
                        <>
                          <th style={{ width: '110px', textAlign: 'right', color: '#8b5cf6' }}>
                            Tổng Tủ THC
                          </th>
                          <th style={{ width: '110px', textAlign: 'right', color: 'var(--success)' }}>
                            Tủ Đã Xong
                          </th>
                          <th style={{ width: '140px', textAlign: 'center' }}>Tỷ Lệ Tủ (%)</th>
                        </>
                      )}
                      <th style={{ width: '90px', textAlign: 'center' }}>Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hasCabinets ? 11 : 8}
                          style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}
                        >
                          Không tìm thấy cụm đơn vị nào phù hợp bộ lọc
                        </td>
                      </tr>
                    ) : (
                      filteredGroups.map((grp, idx) => (
                        <tr key={idx} className={grp.is_other ? 'row-muted' : ''}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            {idx + 1}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {grp.key_name}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.74rem',
                                background: 'var(--brand-light)',
                                color: 'var(--brand-primary)',
                                fontWeight: 700,
                              }}
                            >
                              {formatGroupName(grp.key_name)}
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {grp.total_wos}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              color: 'var(--success)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {grp.closed_wos}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              color: grp.pending_wos > 0 ? 'var(--warning-dark)' : 'var(--text-muted)',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {grp.pending_wos}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              color: grp.overdue_wos > 0 ? 'var(--danger)' : 'var(--text-muted)',
                              fontWeight: grp.overdue_wos > 0 ? 900 : 400,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {grp.overdue_wos}
                          </td>

                          {hasCabinets && (
                            <>
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: '#8b5cf6',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {grp.total_cabinets}
                              </td>
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: 'var(--success)',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {grp.completed_cabinets}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: '60px',
                                      height: '6px',
                                      background: 'var(--bg-tertiary)',
                                      borderRadius: '3px',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: '100%',
                                        width: `${Math.min(grp.cabinet_rate, 100)}%`,
                                        background:
                                          grp.cabinet_rate >= 100
                                            ? 'var(--success)'
                                            : grp.cabinet_rate > 50
                                            ? '#8b5cf6'
                                            : 'var(--warning)',
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    {grp.cabinet_rate}%
                                  </span>
                                </div>
                              </td>
                            </>
                          )}

                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              onClick={() => {
                                setSelectedGroup(grp.key_name);
                                setViewMode('by_wos');
                              }}
                              title={`Xem danh sách WO của cụm ${grp.key_name}`}
                            >
                              Xem WO
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= VIEW 3: CHI TIẾT TỪNG WO & TỦ CÁP CON (ACCORDION) ================= */}
          {viewMode === 'by_wos' && (
            <div className="table-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Accordion helper strip */}
              <div
                style={{
                  padding: '10px 16px',
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Hiển thị <strong>{filteredWos.length}</strong> công việc (WO). Bấm vào dấu{' '}
                  <strong style={{ color: '#8b5cf6' }}>[ + ]</strong> ở đầu dòng để xem chi tiết các tủ cáp con đối chiếu bên trong WO.
                </div>

                {hasCabinets && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => handleToggleAllWos(true)}
                    >
                      Mở rộng tất cả tủ
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => handleToggleAllWos(false)}
                    >
                      Thu gọn tất cả
                    </button>
                  </div>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {hasCabinets && <th style={{ width: '40px', textAlign: 'center' }}></th>}
                      <th style={{ width: '50px', textAlign: 'center' }}>STT</th>
                      <th style={{ minWidth: '150px' }}>Mã WO</th>
                      <th style={{ minWidth: '110px' }}>Mã Trạm</th>
                      <th style={{ minWidth: '150px' }}>Nhân Viên (FT)</th>
                      <th style={{ minWidth: '90px' }}>Cụm</th>
                      <th style={{ minWidth: '180px' }}>Loại Việc / Nội Dung</th>
                      <th style={{ width: '110px', textAlign: 'center' }}>Trạng Thái WO</th>
                      <th style={{ width: '130px', textAlign: 'center' }}>Hạn Xử Lý</th>
                      {hasCabinets && (
                        <th style={{ minWidth: '140px', textAlign: 'center' }}>Chi Tiết Tủ (THC)</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hasCabinets ? 10 : 8}
                          style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}
                        >
                          Không có công việc nào khớp với điều kiện tìm kiếm
                        </td>
                      </tr>
                    ) : (
                      filteredWos.map((w, idx) => {
                        const isExpanded = Boolean(expandedWos[w.ma_cong_viec]);
                        const cabCount = (w.cabinets || []).length;
                        const isOverdue = w.is_overdue;

                        return (
                          <React.Fragment key={w.ma_cong_viec || idx}>
                            <tr
                              style={{
                                background: isExpanded
                                  ? 'rgba(139, 92, 246, 0.04)'
                                  : isOverdue
                                  ? 'rgba(239, 68, 68, 0.04)'
                                  : undefined,
                              }}
                            >
                              {/* Accordion toggle button */}
                              {hasCabinets && (
                                <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                                  {cabCount > 0 ? (
                                    <button
                                      onClick={() => toggleWoExpand(w.ma_cong_viec)}
                                      style={{
                                        border: 'none',
                                        background: isExpanded ? '#8b5cf6' : 'var(--bg-tertiary)',
                                        color: isExpanded ? '#fff' : 'var(--text-primary)',
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease',
                                      }}
                                      title={isExpanded ? 'Thu gọn danh sách tủ' : `Mở rộng ${cabCount} tủ con`}
                                    >
                                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                                  )}
                                </td>
                              )}

                              {/* STT */}
                              <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                {idx + 1}
                              </td>

                              {/* Mã WO (Clickable to open Detail Sheet Modal) */}
                              <td>
                                <span
                                  onClick={() => handleOpenTaskDetail(w.ma_cong_viec)}
                                  style={{
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)',
                                    color: isOverdue ? 'var(--danger)' : 'var(--brand-primary)',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    textUnderlineOffset: '3px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title="Bấm để xem lịch sử và chi tiết WO"
                                >
                                  {w.ma_cong_viec}
                                </span>
                              </td>

                              {/* Mã Trạm */}
                              <td>
                                {w.station_code ? (
                                  <span
                                    className="badge"
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '0.75rem',
                                      background: 'var(--bg-tertiary)',
                                    }}
                                  >
                                    {w.station_code}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                                )}
                              </td>

                              {/* Nhân viên FT (Red text if overdue) */}
                              <td>
                                <span
                                  style={{
                                    fontWeight: isOverdue ? 800 : 600,
                                    color: isOverdue ? 'var(--danger)' : 'var(--text-primary)',
                                  }}
                                >
                                  {w.employee_assigned_name}
                                </span>
                              </td>

                              {/* Cụm */}
                              <td>
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.72rem',
                                    background: 'var(--bg-tertiary)',
                                  }}
                                >
                                  {formatGroupName(w.group_name)}
                                </span>
                              </td>

                              {/* Nội dung / Loại việc */}
                              <td>
                                <div
                                  style={{
                                    fontSize: '0.82rem',
                                    color: 'var(--text-primary)',
                                    maxWidth: '260px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={w.noi_dung_cong_viec || w.loai_cong_viec}
                                >
                                  {w.noi_dung_cong_viec || w.loai_cong_viec}
                                </div>
                              </td>

                              {/* Trạng thái WO */}
                              <td style={{ textAlign: 'center' }}>
                                {w.is_closed ? (
                                  <span
                                    className="badge badge-success"
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                  >
                                    Đã Đóng
                                  </span>
                                ) : (
                                  <span
                                    className="badge badge-warning"
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                  >
                                    {w.trang_thai || 'Đang xử lý'}
                                  </span>
                                )}
                              </td>

                              {/* Hạn xử lý / Quá hạn */}
                              <td style={{ textAlign: 'center' }}>
                                {isOverdue ? (
                                  <span
                                    style={{
                                      fontSize: '0.75rem',
                                      fontWeight: 800,
                                      color: 'var(--danger)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <AlertTriangle size={13} /> Quá hạn
                                  </span>
                                ) : w.is_closed ? (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                                    Đã hoàn thành
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Còn trong hạn
                                  </span>
                                )}
                              </td>

                              {/* Tiến độ tủ con badge */}
                              {hasCabinets && (
                                <td style={{ textAlign: 'center' }}>
                                  {cabCount > 0 ? (
                                    <div
                                      onClick={() => toggleWoExpand(w.ma_cong_viec)}
                                      style={{
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '2px 8px',
                                        borderRadius: 'var(--radius-full)',
                                        background:
                                          w.completed_cabinets === cabCount
                                            ? 'var(--success-light)'
                                            : 'rgba(139, 92, 246, 0.12)',
                                        color:
                                          w.completed_cabinets === cabCount
                                            ? 'var(--success-dark)'
                                            : '#8b5cf6',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                      }}
                                      title="Bấm để mở chi tiết các tủ"
                                    >
                                      <Box size={12} />
                                      {w.completed_cabinets}/{cabCount} Tủ Xong
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      Chưa nạp tủ
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>

                            {/* ================= SUB-ROW: DANH SÁCH TỦ CON ================= */}
                            {hasCabinets && isExpanded && (
                              <tr style={{ background: 'var(--bg-tertiary)' }}>
                                <td colSpan={10} style={{ padding: '12px 18px 16px 48px' }}>
                                  <div
                                    style={{
                                      background: 'var(--bg-secondary)',
                                      borderRadius: 'var(--radius-md)',
                                      border: '1px solid var(--border-color)',
                                      padding: '14px',
                                      boxShadow: 'var(--shadow-sm)',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: '10px',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Cable size={15} style={{ color: '#8b5cf6' }} />
                                        <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                                          Danh Sách Tủ Cáp Con Của WO: {w.ma_cong_viec}
                                        </strong>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                          ({cabCount} tủ đối chiếu)
                                        </span>
                                      </div>
                                    </div>

                                    {/* Nested table */}
                                    <table
                                      style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: '0.8rem',
                                      }}
                                    >
                                      <thead>
                                        <tr
                                          style={{
                                            borderBottom: '1px solid var(--border-color)',
                                            color: 'var(--text-muted)',
                                            textAlign: 'left',
                                          }}
                                        >
                                          <th style={{ padding: '6px 8px', width: '40px' }}>STT</th>
                                          <th style={{ padding: '6px 8px' }}>Mã Đối Tượng (Tủ THC)</th>
                                          <th style={{ padding: '6px 8px' }}>Mã Trạm THC</th>
                                          <th style={{ padding: '6px 8px' }}>Trạng Thái THC</th>
                                          <th style={{ padding: '6px 8px' }}>Tỉnh / Khu Vực</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {w.cabinets.map((cab, cIdx) => (
                                          <tr
                                            key={cab.id || cIdx}
                                            style={{
                                              borderBottom: '1px solid var(--border-subtle)',
                                            }}
                                          >
                                            <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                                              {cIdx + 1}
                                            </td>
                                            <td
                                              style={{
                                                padding: '6px 8px',
                                                fontWeight: 700,
                                                fontFamily: 'var(--font-mono)',
                                                color: '#8b5cf6',
                                              }}
                                            >
                                              {cab.ma_doi_tuong}
                                            </td>
                                            <td
                                              style={{
                                                padding: '6px 8px',
                                                fontFamily: 'var(--font-mono)',
                                                color: 'var(--text-secondary)',
                                              }}
                                            >
                                              {cab.ma_tram || '-'}
                                            </td>
                                            <td style={{ padding: '6px 8px' }}>
                                              {cab.is_completed ? (
                                                <span
                                                  className="badge badge-success"
                                                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                                >
                                                  <CheckCircle2 size={12} /> {cab.trang_thai_thc}
                                                </span>
                                              ) : (
                                                <span
                                                  className="badge badge-warning"
                                                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                                >
                                                  <Clock size={12} /> {cab.trang_thai_thc || 'Đang thực hiện'}
                                                </span>
                                              )}
                                            </td>
                                            <td
                                              style={{
                                                padding: '6px 8px',
                                                color: 'var(--text-muted)',
                                              }}
                                            >
                                              {cab.tinh || ''} {cab.khu_vuc ? `(${cab.khu_vuc})` : ''}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 6. Task Detail Sheet Modal with Notes & History */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onNoteAdded={async (ma_cong_viec) => {
            try {
              const updated = await tasksApi.getTaskDetail(ma_cong_viec);
              setSelectedDetailTask(updated);
              queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
