import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  FileSpreadsheet,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertTriangle,
  Search,
  Download,
  HelpCircle,
  Filter,
  ArrowUpDown,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import { fixedWoApi } from '../api/fixedWoApi';
import { exportSingleSheetXlsx } from '../utils/excelExport';
import { formatGroupName } from '../utils/groupFormat';
import TaskDrilldownModal from '../components/TaskDrilldownModal';

export default function KpiFtPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedBranch, setSelectedBranch] = useState('ALL'); // 'ALL' | 'DU_DINH_MUC' | 'IT_VIEC'
  const [selectedTier, setSelectedTier] = useState('ALL'); // 'ALL' | 'XUAT_SAC' | 'DAT_CHUAN' | 'KHA' | 'CAN_CO_GANG'
  const [sortKey, setSortKey] = useState('kpi_score');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [excludeTuChoi, setExcludeTuChoi] = useState(false);

  // Drilldown modal state
  const [drilldownFilter, setDrilldownFilter] = useState(null);

  // Fetch KPI evaluation from backend
  const { data: kpiData, isLoading, isError, refetch } = useQuery({
    queryKey: ['kpi-ft-all-wo-hth', excludeTuChoi],
    queryFn: () => fixedWoApi.getKpiFt({ target_quota: 125, min_wos: 40, exclude_tu_choi: excludeTuChoi }),
  });

  const summary = kpiData?.summary || {};
  const items = kpiData?.items || [];
  const excludedItems = kpiData?.excluded_items || [];

  // Unique groups for filter dropdown
  const groupOptions = useMemo(() => {
    const set = new Set();
    items.forEach(it => {
      if (it.group_name && it.group_name !== 'Chưa phân cụm' && it.group_name !== 'Khác') {
        set.add(it.group_name);
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtering
  const filteredItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(it =>
        (it.key_name || '').toLowerCase().includes(q) ||
        (it.group_name || '').toLowerCase().includes(q)
      );
    }

    if (selectedGroup !== 'ALL') {
      result = result.filter(it => it.group_name === selectedGroup);
    }

    if (selectedBranch !== 'ALL') {
      result = result.filter(it => it.branch === selectedBranch);
    }

    if (selectedTier !== 'ALL') {
      result = result.filter(it => it.tier === selectedTier);
    }

    // Sorting
    result.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (sortKey === 'key_name' || sortKey === 'group_name') {
        valA = (valA || '').toLowerCase();
        valB = (valB || '').toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      valA = Number(valA || 0);
      valB = Number(valB || 0);
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [items, searchQuery, selectedGroup, selectedBranch, selectedTier, sortKey, sortOrder]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'key_name' ? 'asc' : 'desc');
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <span style={{ opacity: 0.25, fontSize: '0.72rem', marginLeft: '4px' }}>↕</span>;
    }
    return (
      <span style={{ color: 'var(--brand-primary)', fontWeight: 850, fontSize: '0.75rem', marginLeft: '4px' }}>
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Open drilldown for specific employee
  const handleOpenEmpDrilldown = (emp, metric = 'total', metricLabel = 'Danh Sách WO Của Nhân Viên') => {
    setDrilldownFilter({
      metric,
      metricLabel: `${metricLabel}: ${emp.key_name}`,
      filterType: 'employee',
      filterId: emp.id,
      targetName: emp.key_name,
      fixedWoReportId: summary.report_id,
      activeMonth: summary.active_month,
      exclude_tu_choi: excludeTuChoi,
    });
  };

  // Export Excel handler
  const handleExportExcel = async () => {
    if (!filteredItems.length) return;
    const filename = `KPI_FT_All_Wo_HTH_${summary.active_month || '2026'}`;
    const sheetName = 'KPI FT All-WO';

    const headers = [
      'Hạng',
      'Tên Nhân Viên FT',
      'Cụm / Đội Quản Lý',
      'Tổng WO (N)',
      'Đã Hoàn Thành (A)',
      'Quá Hạn (B)',
      'Tồn Việc',
      'Tỉ Lệ Đóng (%)',
      'Phân Nhóm',
      'Đánh Giá Chi Tiết',
      'Hệ Số KPI (0.8 - 1.2)',
      'Xếp Loại'
    ];

    const rows = filteredItems.map((it, idx) => [
      idx + 1,
      it.key_name,
      formatGroupName(it.group_name),
      it.n_total,
      it.a_closed,
      it.b_overdue,
      it.pending,
      `${it.completion_rate}%`,
      it.branch === 'DU_DINH_MUC' ? 'Đủ định mức (N >= 125)' : 'Ít việc (N < 125)',
      it.evaluation,
      Number(it.kpi_score).toFixed(3),
      it.tier === 'XUAT_SAC' ? 'Xuất Sắc (Thưởng)' : it.tier === 'DAT_CHUAN' ? 'Đạt Chuẩn (1.0)' : it.tier === 'KHA' ? 'Khá' : 'Cần Cải Thiện'
    ]);

    await exportSingleSheetXlsx(filename, sheetName, headers, rows);
  };

  // Tier badge color helper
  const getTierBadge = (tier, score) => {
    if (tier === 'XUAT_SAC' || score >= 1.10) {
      return {
        bg: 'rgba(16, 185, 129, 0.12)',
        color: '#059669',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        text: 'Xuất Sắc (Thưởng)'
      };
    }
    if (tier === 'DAT_CHUAN' || (score >= 1.0 && score < 1.10)) {
      return {
        bg: 'rgba(14, 165, 233, 0.12)',
        color: '#0284c7',
        border: '1px solid rgba(14, 165, 233, 0.35)',
        text: 'Đạt Chuẩn (1.0)'
      };
    }
    if (tier === 'KHA' || (score >= 0.90 && score < 1.0)) {
      return {
        bg: 'rgba(245, 158, 11, 0.12)',
        color: '#d97706',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        text: 'Khá'
      };
    }
    return {
      bg: 'rgba(239, 68, 68, 0.12)',
      color: '#dc2626',
      border: '1px solid rgba(239, 68, 68, 0.35)',
      text: 'Cần Cải Thiện'
    };
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ============================================================ */}
      {/* 1. TOP HEADER & KPI TITLE BANNER                             */}
      {/* ============================================================ */}
      <div
        className="card"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
          border: '1.5px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 4px 20px -2px rgba(16, 185, 129, 0.12)',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                flexShrink: 0
              }}
            >
              <Award size={24} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 850, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  BẢNG ĐÁNH GIÁ KPI FT — ALL-WO-HTH
                </h2>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#059669',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    fontWeight: 750,
                    fontSize: '0.74rem'
                  }}
                >
                  ⚡ Hệ số: 0.800 – 1.200
                </span>
                {summary.active_month && (
                  <span className="badge badge-success" style={{ fontSize: '0.74rem', padding: '2px 8px', fontWeight: 700 }}>
                    <Calendar size={12} style={{ marginRight: '4px' }} />
                    {summary.active_month}
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Mang tính tham khảo sẽ cập nhật thêm khi có cách tính chính thức cho cả cố định và di động.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowFormulaModal(true)}
              style={{ fontSize: '0.8rem', padding: '6px 14px', gap: '6px' }}
            >
              <HelpCircle size={15} style={{ color: '#0284c7' }} />
              <span>Xem Công Thức KPI</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportExcel}
              disabled={!filteredItems.length}
              style={{ fontSize: '0.8rem', padding: '6px 16px', gap: '6px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
              title="Xuất bảng số liệu KPI ra file Excel chuẩn Microsoft Excel (.xlsx)"
            >
              <Download size={15} />
              <span>Xuất Bảng Excel</span>
            </button>
          </div>
        </div>

        {/* Exclude Tu Choi Toggle */}
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: '0.78rem',
              fontWeight: 650,
              color: excludeTuChoi ? 'var(--danger-dark, #e11d48)' : 'var(--text-secondary)',
              background: excludeTuChoi ? 'rgba(244, 63, 94, 0.08)' : 'var(--bg-tertiary)',
              border: excludeTuChoi ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid var(--border-color)',
              padding: '3px 10px',
              borderRadius: '16px',
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(excludeTuChoi)}
              onChange={(e) => setExcludeTuChoi(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#e11d48' }}
            />
            <span>Không tính các WO FT từ chối / CĐ từ chối vào KPI</span>
          </label>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Nguồn dữ liệu: <strong style={{ color: 'var(--text-primary)' }}>All-Wo-HTH</strong> ({summary.total_all_wos?.toLocaleString() || 0} WO)
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. KPI METRIC SUMMARY CARDS                                  */}
      {/* ============================================================ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        {/* Box 1: Tổng nhân sự xét duyệt */}
        <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>NHÂN SỰ XÉT KPI (≥ 40 WO)</span>
            <Users size={15} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 850, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {summary.total_eligible ?? 0}
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '4px' }}>nhân viên</span>
          </div>
          {summary.total_excluded > 0 && (
            <button
              type="button"
              onClick={() => setShowExcludedModal(true)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline', marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
            >
              Xem {summary.total_excluded} nhân sự bị loại (&lt; 40 WO) <ChevronRight size={10} />
            </button>
          )}
        </div>

        {/* Box 2: Điểm KPI Trung Bình */}
        <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #0ea5e9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>KPI TRUNG BÌNH TOÀN MẠNG</span>
            <TrendingUp size={15} style={{ color: '#0ea5e9' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#0284c7', fontFamily: 'var(--font-mono)' }}>
            {(summary.avg_kpi_score ?? 0).toFixed(3)}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Thang điểm chuẩn: 0.800 – 1.200
          </span>
        </div>

        {/* Box 3: Xuất Sắc (> 1.0) */}
        <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #059669' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>XUẤT SẮC (CÓ THƯỞNG &gt; 1.0)</span>
            <Sparkles size={15} style={{ color: '#059669' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#059669', fontFamily: 'var(--font-mono)' }}>
            {summary.bonus_count ?? 0}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 650 }}>
            Tỷ lệ: {summary.total_eligible ? Math.round((summary.bonus_count / summary.total_eligible) * 100) : 0}% nhân sự
          </span>
        </div>

        {/* Box 4: Đạt Định Mức (>= 1.0) */}
        <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: '#7c3aed', fontWeight: 700 }}>ĐẠT ĐỊNH MỨC CHUẨN (≥ 1.0)</span>
            <CheckCircle2 size={15} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
            {summary.qualified_count ?? 0}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 650 }}>
            Tỷ lệ: {summary.total_eligible ? Math.round((summary.qualified_count / summary.total_eligible) * 100) : 0}% nhân sự
          </span>
        </div>

        {/* Box 5: Cần Cải Thiện (< 1.0) */}
        <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700 }}>CẦN CẢI THIỆN (&lt; 1.0)</span>
            <AlertTriangle size={15} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 850, color: '#dc2626', fontFamily: 'var(--font-mono)' }}>
            {summary.shortfall_count ?? 0}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 650 }}>
            Chưa đạt định mức hoặc có WO trễ hạn
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. EXCEL SPREADSHEET TOOLBAR & FILTERS                       */}
      {/* ============================================================ */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          background: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Left: Search & Dropdowns */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
            {/* Search */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="select-filter"
                placeholder="Tìm nhân viên, cụm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '6px 10px 6px 32px', fontSize: '0.82rem' }}
              />
            </div>

            {/* Group Filter */}
            <select
              className="select-filter"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '0.82rem', minWidth: '150px' }}
            >
              <option value="ALL">🏢 Tất cả Cụm / Đội</option>
              {groupOptions.map(g => (
                <option key={g} value={g}>{formatGroupName(g)}</option>
              ))}
            </select>

            {/* Branch Filter */}
            <select
              className="select-filter"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
            >
              <option value="ALL">📊 Tất cả phân nhóm</option>
              <option value="DU_DINH_MUC">🟢 Đủ định mức (N ≥ 125)</option>
              <option value="IT_VIEC">🟡 Ít việc (N &lt; 125)</option>
            </select>

            {/* Tier Filter */}
            <select
              className="select-filter"
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
            >
              <option value="ALL">⭐ Tất cả xếp loại</option>
              <option value="XUAT_SAC">🌟 Xuất Sắc (≥ 1.10)</option>
              <option value="DAT_CHUAN">✅ Đạt Chuẩn (1.00 – 1.09)</option>
              <option value="KHA">📈 Khá (0.90 – 0.99)</option>
              <option value="CAN_CO_GANG">⚠️ Cần Cải Thiện (&lt; 0.90)</option>
            </select>
          </div>

          {/* Right: Info count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Hiển thị: <strong style={{ color: 'var(--text-primary)' }}>{filteredItems.length}</strong> / {summary.total_eligible || 0} nhân sự
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. EXCEL-STYLE KPI SPREADSHEET TABLE                         */}
      {/* ============================================================ */}
      <div
        className="card"
        style={{
          padding: 0,
          background: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden'
        }}
      >
        {/* Table Top Title Bar */}
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={16} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              BẢNG TÍNH HỆ SỐ KPI CHI TIẾT (EXCEL SPREADSHEET)
            </span>
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
              Quy tắc chuẩn VCC
            </span>
          </div>

          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            * Bấm vào bất kỳ dòng nào hoặc ô số liệu để xem danh sách WO chi tiết
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            Đang tải dữ liệu và tính toán hệ số KPI...
          </div>
        ) : isError ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--danger-dark)', fontSize: '0.84rem' }}>
            Không thể tải dữ liệu KPI. Vui lòng thử lại sau.
          </div>
        ) : !filteredItems.length ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            Không tìm thấy nhân viên phù hợp với bộ lọc tìm kiếm.
          </div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: '680px', overflowY: 'auto' }}>
            <table
              className="table"
              style={{
                fontSize: '0.78rem',
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  background: '#f8fafc',
                  zIndex: 3,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}
              >
                <tr>
                  <th
                    style={{ width: '48px', textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => handleSort('rank')}
                    title="Sắp xếp theo thứ hạng KPI"
                  >
                    Hạng {renderSortIndicator('rank')}
                  </th>
                  <th
                    style={{ minWidth: '170px', cursor: 'pointer' }}
                    onClick={() => handleSort('key_name')}
                    title="Sắp xếp theo tên nhân viên"
                  >
                    Nhân Viên FT {renderSortIndicator('key_name')}
                  </th>
                  <th
                    style={{ minWidth: '140px', cursor: 'pointer' }}
                    onClick={() => handleSort('group_name')}
                    title="Sắp xếp theo cụm quản lý"
                  >
                    Cụm / Đội {renderSortIndicator('group_name')}
                  </th>
                  <th
                    style={{ textAlign: 'center', width: '90px', cursor: 'pointer', background: 'rgba(2, 132, 199, 0.04)' }}
                    onClick={() => handleSort('n_total')}
                    title="Tổng số WO được giao (N)"
                  >
                    Tổng WO (N) {renderSortIndicator('n_total')}
                  </th>
                  <th
                    style={{ textAlign: 'center', width: '95px', cursor: 'pointer', color: '#059669', background: 'rgba(16, 185, 129, 0.05)' }}
                    onClick={() => handleSort('a_closed')}
                    title="Số WO đã hoàn thành (A) - Định mức chuẩn 125"
                  >
                    Hoàn Thành (A) {renderSortIndicator('a_closed')}
                  </th>
                  <th
                    style={{ textAlign: 'center', width: '90px', cursor: 'pointer', color: '#dc2626', background: 'rgba(239, 68, 68, 0.05)' }}
                    onClick={() => handleSort('b_overdue')}
                    title="Số WO trễ hạn (B)"
                  >
                    Quá Hạn (B) {renderSortIndicator('b_overdue')}
                  </th>
                  <th
                    style={{ textAlign: 'center', width: '85px', cursor: 'pointer' }}
                    onClick={() => handleSort('completion_rate')}
                    title="Tỷ lệ hoàn thành đóng WO"
                  >
                    Tỉ Lệ Đóng {renderSortIndicator('completion_rate')}
                  </th>
                  <th style={{ width: '140px', textAlign: 'center' }}>
                    Phân Nhóm
                  </th>
                  <th style={{ minWidth: '220px' }}>
                    Đánh Giá Tiến Độ / Quá Hạn
                  </th>
                  <th
                    style={{
                      textAlign: 'center',
                      width: '120px',
                      cursor: 'pointer',
                      background: 'rgba(16, 185, 129, 0.08)',
                      borderLeft: '1.5px solid rgba(16, 185, 129, 0.3)',
                      borderRight: '1.5px solid rgba(16, 185, 129, 0.3)'
                    }}
                    onClick={() => handleSort('kpi_score')}
                    title="Hệ số KPI tính toán từ 0.800 đến 1.200"
                  >
                    ⭐ HỆ SỐ KPI {renderSortIndicator('kpi_score')}
                  </th>
                  <th style={{ textAlign: 'center', width: '130px' }}>
                    Xếp Loại
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((emp, idx) => {
                  const score = Number(emp.kpi_score);
                  const tierStyle = getTierBadge(emp.tier, score);
                  const isTopRank = idx < 3;

                  return (
                    <tr
                      key={emp.id || idx}
                      className="hover-card"
                      style={{
                        transition: 'background var(--transition-fast)',
                        borderBottom: '1px solid var(--border-color)',
                        background: idx % 2 === 0 ? '#ffffff' : '#fcfdfd'
                      }}
                    >
                      {/* Rank */}
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>
                        {isTopRank ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : '#cd7f32',
                              color: '#ffffff',
                              fontSize: '0.72rem',
                              fontWeight: 850
                            }}
                          >
                            {idx + 1}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                        )}
                      </td>

                      {/* Employee Name */}
                      <td style={{ fontWeight: 750 }}>
                        <span
                          onClick={() => handleOpenEmpDrilldown(emp, 'total', 'Toàn Bộ WO Của')}
                          style={{ cursor: 'pointer', color: 'var(--brand-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="Bấm để xem toàn bộ danh sách WO của nhân viên này"
                        >
                          {emp.key_name}
                          <ExternalLink size={11} style={{ opacity: 0.6 }} />
                        </span>
                      </td>

                      {/* Group Name */}
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {formatGroupName(emp.group_name)}
                      </td>

                      {/* Total N */}
                      <td
                        style={{ textAlign: 'center', fontWeight: 750, cursor: 'pointer' }}
                        className="clickable-cell"
                        onClick={() => handleOpenEmpDrilldown(emp, 'total', 'Tổng WO Được Giao')}
                        title="Bấm để xem danh sách toàn bộ WO"
                      >
                        {emp.n_total}
                      </td>

                      {/* Closed A */}
                      <td
                        style={{ textAlign: 'center', fontWeight: 800, color: '#059669', cursor: 'pointer', background: 'rgba(16, 185, 129, 0.04)' }}
                        className="clickable-cell"
                        onClick={() => handleOpenEmpDrilldown(emp, 'closed', 'WO Đã Hoàn Thành')}
                        title="Bấm để xem danh sách WO đã đóng"
                      >
                        {emp.a_closed}
                      </td>

                      {/* Overdue B */}
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 750,
                          color: emp.b_overdue > 0 ? '#dc2626' : 'var(--text-muted)',
                          cursor: emp.b_overdue > 0 ? 'pointer' : 'default',
                          background: emp.b_overdue > 0 ? 'rgba(239, 68, 68, 0.04)' : undefined
                        }}
                        className={emp.b_overdue > 0 ? 'clickable-cell' : undefined}
                        onClick={() => emp.b_overdue > 0 && handleOpenEmpDrilldown(emp, 'overdue', 'WO Quá Hạn')}
                        title={emp.b_overdue > 0 ? 'Bấm để xem danh sách WO quá hạn' : 'Không có WO quá hạn'}
                      >
                        {emp.b_overdue}
                      </td>

                      {/* Completion Rate */}
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        <span style={{ color: emp.completion_rate >= 80 ? '#059669' : emp.completion_rate >= 60 ? '#0284c7' : '#d97706' }}>
                          {emp.completion_rate}%
                        </span>
                      </td>

                      {/* Branch Badge */}
                      <td style={{ textAlign: 'center' }}>
                        {emp.branch === 'DU_DINH_MUC' ? (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#059669',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              fontWeight: 700
                            }}
                          >
                            Đủ ĐM (N ≥ 125)
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: 'rgba(245, 158, 11, 0.1)',
                              color: '#d97706',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              fontWeight: 700
                            }}
                          >
                            Ít việc (N &lt; 125)
                          </span>
                        )}
                      </td>

                      {/* Evaluation Text */}
                      <td style={{ fontSize: '0.74rem' }}>
                        <span style={{
                          color: score >= 1.0 ? '#059669' : '#dc2626',
                          fontWeight: 650,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {score >= 1.0 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                          {emp.evaluation}
                        </span>
                      </td>

                      {/* KPI SCORE */}
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 900,
                          fontSize: '0.98rem',
                          fontFamily: 'var(--font-mono)',
                          color: score >= 1.10 ? '#059669' : score >= 1.0 ? '#0284c7' : score >= 0.90 ? '#d97706' : '#dc2626',
                          background: score >= 1.10 ? 'rgba(16, 185, 129, 0.08)' : score >= 1.0 ? 'rgba(14, 165, 233, 0.08)' : 'rgba(239, 68, 68, 0.04)',
                          borderLeft: '1.5px solid rgba(16, 185, 129, 0.2)',
                          borderRight: '1.5px solid rgba(16, 185, 129, 0.2)'
                        }}
                      >
                        {score.toFixed(3)}
                      </td>

                      {/* Tier Badge */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            background: tierStyle.bg,
                            color: tierStyle.color,
                            border: tierStyle.border,
                            fontWeight: 750,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {tierStyle.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 5. MODAL CÔNG THỨC KPI CHI TIẾT                              */}
      {/* ============================================================ */}
      {showFormulaModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowFormulaModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px 28px',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              background: '#ffffff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={20} style={{ color: '#10b981' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  QUY TẮC & CÔNG THỨC TÍNH HỆ SỐ KPI FT
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowFormulaModal(false)}
                style={{ fontSize: '1.2rem', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              <div style={{ padding: '12px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: 'var(--radius-md)', marginBottom: '14px', borderLeft: '4px solid #0284c7' }}>
                <strong>Dải điểm chuẩn:</strong> Hệ số KPI nằm trong khoảng <strong>[0.800 – 1.200]</strong>.<br />
                <strong>Nguồn dữ liệu:</strong> Toàn bộ công việc thuộc báo cáo cố định <strong>All-Wo-HTH</strong>.
              </div>

              {/* Điều kiện loại trừ */}
              <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#dc2626', marginBottom: '6px' }}>
                1. Điều Kiện Loại Trừ (Không Đưa Vào Xét KPI)
              </h4>
              <p style={{ margin: '0 0 14px 0', color: 'var(--text-secondary)' }}>
                • Nhân viên được giao <strong>dưới 40 WO (N &lt; 40)</strong> sẽ bị loại trừ khỏi bảng đánh giá để đảm bảo tính đại diện và công bằng.
              </p>

              {/* Nhánh 1: N >= 125 */}
              <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669', marginBottom: '6px' }}>
                2. Nhóm Đủ Việc / Nhiều Việc (Tổng WO N ≥ 125)
              </h4>
              <ul style={{ margin: '0 0 14px 0', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
                <li>
                  <strong>Trường hợp A ≥ 125 (Đạt hoặc Vượt định mức hoàn thành):</strong>
                  <br />- Đạt định mức chuẩn: <strong>Hệ số = 1.000</strong>.
                  <br />- Không bị trừ điểm với các WO quá hạn phát sinh thêm.
                  <br />- Nếu vượt định mức (A &gt; 125): Thưởng thêm điểm theo hàm tiệm cận tối đa 1.2:
                  <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', margin: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    Hệ số = 1.0 + 0.2 × [(A - 125) / ((A - 125) + 50)]  (tối đa 1.200)
                  </div>
                </li>
                <li style={{ marginTop: '6px' }}>
                  <strong>Trường hợp A &lt; 125 (Chưa đủ định mức hoàn thành):</strong>
                  <br />- Tính điểm theo tỷ lệ hoàn thành đưa về dải <strong>[0.800 – 1.000]</strong>:
                  <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', margin: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    Hệ số = 0.8 + 0.2 × (A / 125)
                  </div>
                </li>
              </ul>

              {/* Nhánh 2: N < 125 */}
              <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#d97706', marginBottom: '6px' }}>
                3. Nhóm Ít Việc (Tổng WO N &lt; 125 và N ≥ 40)
              </h4>
              <ul style={{ margin: '0 0 14px 0', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
                <li>
                  Bắt buộc tỷ lệ hoàn thành trong hạn là 100% (tức số WO quá hạn <strong>B = 0</strong>): <strong>Hệ số = 1.000</strong>.
                </li>
                <li style={{ marginTop: '4px' }}>
                  Nếu có bất kỳ WO nào quá hạn (<strong>B &gt; 0</strong>): Bị trừ điểm dần theo tỷ lệ quá hạn về mức sàn <strong>0.800</strong>:
                  <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', margin: '4px 0', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    Hệ số = max(0.800, 0.8 + 0.2 × [(N - B) / N])
                  </div>
                </li>
              </ul>
            </div>

            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowFormulaModal(false)}
                style={{ fontSize: '0.82rem', padding: '6px 18px' }}
              >
                Đã Hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODAL DANH SÁCH NHÂN SỰ BỊ LOẠI (< 40 WO)                 */}
      {/* ============================================================ */}
      {showExcludedModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowExcludedModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '620px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '20px 24px',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              background: '#ffffff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: '#ef4444' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  DANH SÁCH NHÂN SỰ LOẠI TRỪ (&lt; 40 WO)
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowExcludedModal(false)}
                style={{ fontSize: '1.2rem', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Các nhân viên sau đây có khối lượng công việc được giao dưới 40 WO trong All-Wo-HTH nên theo quy định không đưa vào bảng đánh giá KPI:
            </p>

            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '0.78rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tên Nhân Viên</th>
                    <th>Cụm / Đội</th>
                    <th style={{ textAlign: 'center' }}>Tổng WO</th>
                    <th style={{ textAlign: 'center' }}>Đã Đóng</th>
                    <th>Lý Do Loại Trừ</th>
                  </tr>
                </thead>
                <tbody>
                  {excludedItems.map((ex, idx) => (
                    <tr key={ex.id || idx}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 700 }}>{ex.key_name}</td>
                      <td>{formatGroupName(ex.group_name)}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{ex.n_total}</td>
                      <td style={{ textAlign: 'center', color: '#059669' }}>{ex.a_closed}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{ex.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowExcludedModal(false)}
                style={{ fontSize: '0.8rem', padding: '5px 16px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. TASK DRILLDOWN MODAL (CLICK XEM CHI TIẾT WO)              */}
      {/* ============================================================ */}
      {drilldownFilter && (
        <TaskDrilldownModal
          isOpen={Boolean(drilldownFilter)}
          onClose={() => setDrilldownFilter(null)}
          filterInfo={drilldownFilter}
        />
      )}
    </div>
  );
}
