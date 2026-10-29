import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Building2,
  FolderKanban,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  ListFilter,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import SortableTh from './SortableTh';
import MetricCell from './MetricCell';
import { getOrgColumns } from './orgColumns.jsx';
import { useTableState } from './useTableState';
import { exportToCsv } from './exportCsv';
import { getShortClusterName } from '../../../utils/groupFormat';

export default function LevelTable({
  reportKey = 'thc',
  level = 'employee', // 'employee' | 'team' | 'cluster'
  onLevelChange,
  rows = [],
  summary = null,
  metricColumns = [],
  onDrilldown,
  orgMetadata = {},
  emptyOrg = false,
  reportTitle = '',
  lastUpdatedStr = null,
  selectedMonth = 'all',
  onMonthChange = null,
  availableMonths = [],
  statsData = null,
  groupedColumnsConfig = null,
  selectedDate = '',
  onDateChange = null,
}) {
  const curDateStr = selectedDate || statsData?.selected_date || '';
  let dayStr = 'n';
  if (curDateStr && curDateStr.includes('-')) {
    const parts = curDateStr.split('-');
    if (parts.length === 3) {
      dayStr = parseInt(parts[2], 10) || parts[2];
    }
  }

  // Two-tier filter states (Cụm & Đội)
  const [selectedClusterFilter, setSelectedClusterFilter] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('');

  // Reset filters when switching between employee / team / cluster levels
  useEffect(() => {
    setSelectedClusterFilter('');
    setSelectedTeamFilter('');
  }, [level]);

  // Cross-filter navigation from table links
  const handleCrossFilter = (filterData) => {
    if (filterData.type === 'cluster' && onLevelChange) {
      onLevelChange('team');
      setSelectedClusterFilter(filterData.name || filterData.code || '');
      setSelectedTeamFilter('');
    } else if (filterData.type === 'team' && onLevelChange) {
      onLevelChange('employee');
      setSelectedTeamFilter(filterData.name || '');
    }
  };

  // Org columns according to level (Cụm viết tắt, Đội & Cụm đã xóa theo yêu cầu)
  const orgCols = useMemo(() => {
    return getOrgColumns(level, {
      onCrossFilter: handleCrossFilter,
      orgMetadata,
    });
  }, [level, orgMetadata]);

  // 1. Extract Cluster Pills (Lớp 1)
  const clusterPills = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const cName = r.cluster_name || r.ten_cum || r.group_name;
      if (cName && !r.is_other) {
        const short = getShortClusterName(cName, r.ma_cum);
        if (!map.has(cName)) {
          map.set(cName, {
            rawName: cName,
            clusterId: r.cluster_id,
            shortName: short,
            count: 0,
          });
        }
        map.get(cName).count += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.shortName.localeCompare(b.shortName, 'vi')
    );
  }, [rows]);

  // 2. Extract Team Pills (Lớp 2 - chỉ dành cho tab Nhân viên)
  const teamPills = useMemo(() => {
    if (level !== 'employee') return [];

    // Lọc các rows theo cụm đang chọn trước khi gom đội
    let targetRows = rows;
    if (selectedClusterFilter) {
      targetRows = rows.filter((r) => {
        if (r.is_other) return false;
        const cName = r.cluster_name || r.ten_cum || r.group_name;
        const cShort = getShortClusterName(cName, r.ma_cum);
        return (
          cName === selectedClusterFilter ||
          cShort === selectedClusterFilter ||
          r.cluster_id === selectedClusterFilter
        );
      });
    }

    const map = new Map();
    targetRows.forEach((r) => {
      const tName = r.team_name || r.ten_doi;
      if (tName && tName !== 'Chưa phân đội' && !r.is_other) {
        if (!map.has(tName)) {
          map.set(tName, {
            rawName: tName,
            teamId: r.team_id,
            count: 0,
          });
        }
        map.get(tName).count += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.rawName.localeCompare(b.rawName, 'vi')
    );
  }, [rows, level, selectedClusterFilter]);

  // 3. Filter rows by active Cluster and Team pills
  const filteredByPills = useMemo(() => {
    let list = rows;

    if (level === 'employee') {
      if (selectedClusterFilter) {
        list = list.filter((r) => {
          if (r.is_other) return false;
          const cName = r.cluster_name || r.ten_cum || r.group_name;
          const cShort = getShortClusterName(cName, r.ma_cum);
          return (
            cName === selectedClusterFilter ||
            cShort === selectedClusterFilter ||
            r.cluster_id === selectedClusterFilter
          );
        });
      }
      if (selectedTeamFilter) {
        list = list.filter((r) => {
          if (r.is_other) return false;
          const tName = r.team_name || r.ten_doi;
          return tName === selectedTeamFilter || r.team_id === selectedTeamFilter;
        });
      }
    } else if (level === 'team') {
      if (selectedClusterFilter) {
        list = list.filter((r) => {
          if (r.is_other) return false;
          const cName = r.cluster_name || r.ten_cum;
          const cShort = getShortClusterName(cName, r.ma_cum);
          return (
            cName === selectedClusterFilter ||
            cShort === selectedClusterFilter ||
            r.cluster_id === selectedClusterFilter
          );
        });
      }
    }

    return list;
  }, [rows, level, selectedClusterFilter, selectedTeamFilter]);

  // 4. Combined columns for CSV export
  const allColumns = useMemo(() => {
    return [
      {
        key: '_stt',
        label: 'STT',
        align: 'center',
        width: '45px',
        getValue: (_, idx) => idx + 1,
      },
      ...orgCols,
      ...metricColumns,
    ];
  }, [orgCols, metricColumns]);

  // 5. Table State Hook (search, sort, flat view, grouping) on pill-filtered rows
  const state = useTableState({
    level,
    rows: filteredByPills,
    summary,
    columns: allColumns,
  });

  const {
    searchQuery,
    setSearchQuery,
    sortKey,
    sortOrder,
    handleSort,
    isFlatView,
    setIsFlatView,
    expandedGroups,
    toggleGroup,
    groupedData,
  } = state;

  // 6. Dynamic Summary for Strip and Summary Row (Updates in real-time when selecting Cluster/Team)
  const activeSummary = useMemo(() => {
    if (!selectedClusterFilter && !selectedTeamFilter) {
      return summary || {};
    }

    const sum = {
      ...(summary || {}),
      total_wos: 0,
      closed_wos: 0,
      pending_wos: 0,
      overdue_wos: 0,
      closed_today: 0,
      closed_yesterday: 0,
      closed_week: 0,
      total_cabinets: 0,
      completed_cabinets: 0,
      pending_cabinets: 0,
      overdue_cabinets: 0,
      home_kem_count: 0,
      port_kem_count: 0,
      pending_under_24h: 0,
      pending_under_72h: 0,
      closed_within_24h: 0,
      closed_within_72h: 0,
      // QLCTKT fields
      so_nv: 0,
      cap_nhat_ho_so: 0,
      nghiem_thu_n: 0,
      dd_nghiem_thu_n: 0,
      dau_noi_n: 0,
      nsld: null,
      ton_duong_day: 0,
      ton_duong_day_th: 0,
      ton_ldtb: 0,
      ton_ldtb_th: 0,
      ton_lt1: 0,
      ton_lt2: 0,
      ton_lt3: 0,
      ton_gt3: 0,
      tong_ton: 0,
      qua_han: 0,
      huy: 0,
      // Tong hop su co fields
      ton_truoc: 0,
      phat_sinh: 0,
      xu_ly: 0,
      ton_su_co: 0,
      ton_tk: 0,
      ton_su_co_tk: 0,
      tac_vu_dong_n: 0,
      lte_3h: 0,
      h3_24: 0,
      h24_48: 0,
      h48_72: 0,
      gt_72h: 0,
      tam_dung: 0,
      tong: 0,
      hot: 0,
      soc_tong: 0,
      soc_gt_72h: 0,
      htdv_tong: 0,
      htdv_qua_han: 0,
      htdv_gt_72h: 0,
    };

    filteredByPills.forEach((r) => {
      sum.total_wos += r.total_wos || 0;
      sum.closed_wos += r.closed_wos || 0;
      sum.pending_wos += r.pending_wos || 0;
      sum.overdue_wos += r.overdue_wos || 0;
      sum.closed_today += r.closed_today || 0;
      sum.closed_yesterday += r.closed_yesterday || 0;
      sum.closed_week += r.closed_week || 0;
      sum.total_cabinets += r.total_cabinets || 0;
      sum.completed_cabinets += r.completed_cabinets || 0;
      sum.pending_cabinets += r.pending_cabinets || 0;
      sum.overdue_cabinets += r.overdue_cabinets || 0;
      sum.home_kem_count += r.home_kem_count || 0;
      sum.port_kem_count += r.port_kem_count || 0;
      sum.pending_under_24h += r.pending_under_24h || 0;
      sum.pending_under_72h += r.pending_under_72h || 0;
      sum.closed_within_24h += r.closed_within_24h || 0;
      sum.closed_within_72h += r.closed_within_72h || 0;

      // Sum QLCTKT fields
      if (typeof r.so_nv === 'number') sum.so_nv += r.so_nv;
      if (typeof r.cap_nhat_ho_so === 'number') sum.cap_nhat_ho_so += r.cap_nhat_ho_so;
      if (typeof r.nghiem_thu_n === 'number') sum.nghiem_thu_n += r.nghiem_thu_n;
      if (typeof r.dd_nghiem_thu_n === 'number') sum.dd_nghiem_thu_n += r.dd_nghiem_thu_n;
      if (typeof r.dau_noi_n === 'number') sum.dau_noi_n += r.dau_noi_n;
      if (typeof r.ton_duong_day === 'number') sum.ton_duong_day += r.ton_duong_day;
      if (typeof r.ton_duong_day_th === 'number') sum.ton_duong_day_th += r.ton_duong_day_th;
      if (typeof r.ton_ldtb === 'number') sum.ton_ldtb += r.ton_ldtb;
      if (typeof r.ton_ldtb_th === 'number') sum.ton_ldtb_th += r.ton_ldtb_th;
      if (typeof r.ton_lt1 === 'number') sum.ton_lt1 += r.ton_lt1;
      if (typeof r.ton_lt2 === 'number') sum.ton_lt2 += r.ton_lt2;
      if (typeof r.ton_lt3 === 'number') sum.ton_lt3 += r.ton_lt3;
      if (typeof r.ton_gt3 === 'number') sum.ton_gt3 += r.ton_gt3;
      if (typeof r.tong_ton === 'number') sum.tong_ton += r.tong_ton;
      if (typeof r.qua_han === 'number') sum.qua_han += r.qua_han;
      if (typeof r.huy === 'number') sum.huy += r.huy;

      // Sum Tong Hop Su Co fields
      if (typeof r.ton_truoc === 'number') sum.ton_truoc += r.ton_truoc;
      if (typeof r.phat_sinh === 'number') sum.phat_sinh += r.phat_sinh;
      if (typeof r.xu_ly === 'number') sum.xu_ly += r.xu_ly;
      if (typeof r.ton_su_co === 'number') sum.ton_su_co += r.ton_su_co;
      if (typeof r.ton_tk === 'number') sum.ton_tk += r.ton_tk;
      if (typeof r.ton_su_co_tk === 'number') sum.ton_su_co_tk += r.ton_su_co_tk;
      if (typeof r.tac_vu_dong_n === 'number') sum.tac_vu_dong_n += r.tac_vu_dong_n;
      if (typeof r.lte_3h === 'number') sum.lte_3h += r.lte_3h;
      if (typeof r.h3_24 === 'number') sum.h3_24 += r.h3_24;
      if (typeof r.h24_48 === 'number') sum.h24_48 += r.h24_48;
      if (typeof r.h48_72 === 'number') sum.h48_72 += r.h48_72;
      if (typeof r.gt_72h === 'number') sum.gt_72h += r.gt_72h;
      if (typeof r.tam_dung === 'number') sum.tam_dung += r.tam_dung;
      if (typeof r.tong === 'number') sum.tong += r.tong;
      if (typeof r.hot === 'number') sum.hot += r.hot;
      if (typeof r.soc_tong === 'number') sum.soc_tong += r.soc_tong;
      if (typeof r.soc_gt_72h === 'number') sum.soc_gt_72h += r.soc_gt_72h;
      if (typeof r.htdv_tong === 'number') sum.htdv_tong += r.htdv_tong;
      if (typeof r.htdv_qua_han === 'number') sum.htdv_qua_han += r.htdv_qua_han;
      if (typeof r.htdv_gt_72h === 'number') sum.htdv_gt_72h += r.htdv_gt_72h;

      // Dynamic accumulation for any report metric columns (e.g. date columns in TonTkTheoNgay)
      metricColumns.forEach((col) => {
        if (typeof r[col.key] === 'number') {
          sum[col.key] = (sum[col.key] || 0) + r[col.key];
        }
      });
    });

    sum.wo_rate = sum.total_wos > 0 ? Math.round((sum.closed_wos / sum.total_wos) * 1000) / 10 : 0;
    sum.cabinet_rate = sum.total_cabinets > 0 ? Math.round((sum.completed_cabinets / sum.total_cabinets) * 1000) / 10 : 0;
    sum.kpi_24h_rate = sum.closed_wos > 0 ? Math.round((sum.closed_within_24h / sum.closed_wos) * 1000) / 10 : 0;
    sum.kpi_72h_rate = sum.closed_wos > 0 ? Math.round((sum.closed_within_72h / sum.closed_wos) * 1000) / 10 : 0;
    sum.closed_today_wos = sum.closed_today;
    sum.closed_yesterday_wos = sum.closed_yesterday;
    sum.closed_week_wos = sum.closed_week;

    // Recalculate NSLD
    if (reportKey === 'tong_hop_su_co') {
      if (sum.so_nv > 0) {
        sum.nsld = Math.round(((sum.tac_vu_dong_n + sum.nghiem_thu_n) / sum.so_nv) * 100) / 100;
      } else {
        sum.nsld = null;
      }
    } else if (sum.so_nv > 0) {
      sum.nsld = Math.round((sum.nghiem_thu_n / sum.so_nv) * 100) / 100;
    } else {
      sum.nsld = null;
    }

    return sum;
  }, [filteredByPills, selectedClusterFilter, selectedTeamFilter, summary]);

  // CSV Export handler
  const handleExportCsv = () => {
    const levelName =
      level === 'cluster' ? 'Cum' : level === 'team' ? 'Doi' : 'NhanVien';
    const filename = `Bao_Cao_${reportKey.toUpperCase()}_${levelName}.csv`;

    const exportRows =
      groupedData.flatRows?.length > 0
        ? groupedData.flatRows
        : groupedData.groups.flatMap((g) => g.rows);

    exportToCsv(filename, allColumns, exportRows);
  };

  // Helper to trigger drilldown
  const triggerDrilldown = (metricKey, row = null, overrideType = null, overrideName = null, overrideId = null) => {
    if (!onDrilldown) return;

    let filterType = overrideType;
    let filterId = overrideId;
    let targetName = overrideName;

    if (!filterType && row) {
      if (level === 'cluster') {
        filterType = row.is_other ? 'other_cluster' : 'cluster';
        filterId = row.cluster_id;
        targetName = row.ten_cum;
      } else if (level === 'team') {
        filterType = row.is_other ? 'other_team' : 'team';
        filterId = row.team_id;
        targetName = row.ten_doi;
      } else {
        filterType = 'employee';
        filterId = row.employee_id;
        targetName = row.key_name;
      }
    } else if (!filterType) {
      // From summary strip or summary row
      if (selectedTeamFilter) {
        filterType = 'team';
        targetName = selectedTeamFilter;
      } else if (selectedClusterFilter) {
        filterType = 'cluster';
        targetName = selectedClusterFilter;
      }
    }

    onDrilldown({
      metric: metricKey,
      filterType: filterType || undefined,
      filterId: filterId || undefined,
      targetName: targetName || undefined,
      row,
    });
  };

  if (emptyOrg) {
    return (
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          border: '2px dashed var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-secondary)',
          margin: '24px 0',
        }}
      >
        <AlertTriangle size={40} style={{ color: '#f59e0b', margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px' }}>
          Chưa có cơ cấu Cụm / Đội / Nhân viên
        </h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px', maxWidth: '480px', margin: '0 auto 16px' }}>
          Hệ thống CĐBR yêu cầu danh mục cơ cấu 3 cấp để tổng hợp số liệu chính xác theo quy chuẩn mới.
        </p>
        <a
          href="/admincodinh"
          onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, '', '/admincodinh');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="btn btn-primary"
          style={{ gap: '6px', fontSize: '0.85rem', padding: '8px 18px' }}
        >
          <span>Sang trang Quản trị Admin để nạp danh mục</span>
          <ArrowRight size={15} />
        </a>
      </div>
    );
  }

  const isPortKem = reportKey === 'port_kem';

  return (
    <div
      className="table-card excel-table-container"
      style={{
        marginBottom: '28px',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* 1. Quick Metric Strip (Reflects active cluster/team filter) */}
      <div
        className="table-metric-strip"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '8px',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
        }}
      >
        {isPortKem ? (
          /* Port Kém Mini Strip */
          <>
            <div
              onClick={() => triggerDrilldown('total')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tổng Công Việc"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.total_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đã Đóng"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.closed_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('pending')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đang Tồn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.pending_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('home_kem')}
              className="cell-clickable"
              style={{ background: 'rgba(147, 51, 234, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Home Wifi Kém"
            >
              <span style={{ fontSize: '0.68rem', color: '#9333ea', display: 'block', fontWeight: 700 }}>Home Wifi Kém</span>
              <strong style={{ fontSize: '1.15rem', color: '#9333ea', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.home_kem_count ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('port_kem')}
              className="cell-clickable"
              style={{ background: 'rgba(6, 182, 212, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Port GPON Kém"
            >
              <span style={{ fontSize: '0.68rem', color: '#0891b2', display: 'block', fontWeight: 700 }}>Port GPON Kém</span>
              <strong style={{ fontSize: '1.15rem', color: '#0891b2', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.port_kem_count ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('overdue')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Quá Hạn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.overdue_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('kpi_24h')}
              className="cell-clickable"
              style={{ background: 'rgba(99, 102, 241, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết KPI ≤ 24h"
            >
              <span style={{ fontSize: '0.68rem', color: '#6366f1', display: 'block', fontWeight: 700 }}>KPI ≤ 24 Giờ</span>
              <strong style={{ fontSize: '1.15rem', color: '#6366f1', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.kpi_24h_rate ?? 0}%
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('kpi_72h')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết KPI ≤ 72h"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>KPI ≤ 72 Giờ</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.kpi_72h_rate ?? 0}%
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed_today')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Hôm Nay"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Hôm nay</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{activeSummary.closed_today ?? activeSummary.closed_today_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed_yesterday')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Hôm Qua"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Hôm qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{activeSummary.closed_yesterday ?? activeSummary.closed_yesterday_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed_week')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tuần Qua"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tuần qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                +{activeSummary.closed_week ?? activeSummary.closed_week_wos ?? 0}
              </strong>
            </div>
          </>
        ) : reportKey === 'tong_hop_su_co' ? (
          /* Tổng Hợp Sự Cố Mini Strip */
          <>
            <div
              onClick={() => triggerDrilldown('ton_su_co')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tồn Sự Cố"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Sự Cố</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.ton_su_co ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('qua_han')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Quá Hạn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.qua_han ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('hot')}
              className="cell-clickable"
              style={{ background: 'rgba(236, 72, 153, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Sự Cố HOT"
            >
              <span style={{ fontSize: '0.68rem', color: '#ec4899', display: 'block' }}>HOT</span>
              <strong style={{ fontSize: '1.15rem', color: '#ec4899', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.hot ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('phat_sinh')}
              className="cell-clickable"
              style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title={`Nhấn để xem chi tiết Phát Sinh trong ngày ${dayStr}`}
            >
              <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block' }}>Phát Sinh (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.phat_sinh ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('xu_ly')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title={`Nhấn để xem chi tiết Xử Lý trong ngày ${dayStr}`}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Xử Lý (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.xu_ly ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('tac_vu_dong_n')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title={`Nhấn để xem chi tiết Tác Vụ Đã Đóng trong ngày ${dayStr}`}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tác Vụ Đóng (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.tac_vu_dong_n ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('ton_tk')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tồn TK"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn TK</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.ton_tk ?? 0}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>NSLĐ (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.nsld ?? '-'}
              </strong>
            </div>
          </>
        ) : reportKey === 'qlctkt_trien_khai' ? (
          /* QLCTKT Triển Khai Mini Strip */
          <>
            <div
              onClick={() => triggerDrilldown('tong_ton')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tổng Tồn Triển Khai"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tổng Tồn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.tong_ton ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('qua_han')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Quá Hạn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.qua_han ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('nghiem_thu_n')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title={`Nhấn để xem chi tiết Nghiệm Thu trong ngày ${dayStr}`}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Nghiệm Thu (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.nghiem_thu_n ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('dd_nghiem_thu_n')}
              className="cell-clickable"
              style={{ background: 'rgba(2, 132, 199, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title={`Nhấn để xem chi tiết Đường Dây Nghiệm Thu trong ngày ${dayStr}`}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--brand-primary)', display: 'block' }}>ĐD Nghiệm Thu (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.dd_nghiem_thu_n ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('dau_noi_n')}
              className="cell-clickable"
              style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title={`Nhấn để xem chi tiết Đấu Nối trong ngày ${dayStr}`}
            >
              <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block' }}>Đấu Nối (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.dau_noi_n ?? 0}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>NSLĐ (ngày {dayStr})</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.nsld ?? '-'}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('ton_duong_day')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tồn Đường Dây"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tồn Đường Dây</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.ton_duong_day ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('ton_ldtb')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tồn LĐTB"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tồn LĐTB</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.ton_ldtb ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('cap_nhat_ho_so')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Cập Nhật Hồ Sơ"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Cập Nhật Hồ Sơ</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.cap_nhat_ho_so ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('huy')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết HỦY"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>HỦY</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.huy ?? 0}
              </strong>
            </div>
          </>
        ) : (
          /* THC Mini Strip */
          <>
            <div
              onClick={() => triggerDrilldown('total')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tổng Công Việc (WO)"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tổng Công Việc</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.total_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đã Đóng"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block' }}>Đã Đóng WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.closed_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('pending')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Đang Tồn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block' }}>Tồn Việc WO</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.pending_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('overdue')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết WO Quá Hạn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block' }}>Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.overdue_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed_today')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Hôm Nay"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Hôm nay</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{activeSummary.closed_today ?? activeSummary.closed_today_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed_yesterday')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Hôm Qua"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Hôm qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                +{activeSummary.closed_yesterday ?? activeSummary.closed_yesterday_wos ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('closed_week')}
              className="cell-clickable"
              style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tuần Qua"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tuần qua</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                +{activeSummary.closed_week ?? activeSummary.closed_week_wos ?? 0}
              </strong>
            </div>

            <div style={{ background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Tỉ Lệ Đóng WO</span>
              <strong style={{ fontSize: '1.15rem', color: (activeSummary.wo_rate || 0) >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.wo_rate ?? 0}%
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('cabinet_total')}
              className="cell-clickable"
              style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tổng Tủ THC"
            >
              <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Tổng Tủ THC</span>
              <strong style={{ fontSize: '1.15rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.total_cabinets ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('cabinet_completed')}
              className="cell-clickable"
              style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tủ THC Đã Xong"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700 }}>Tủ Đã Xong</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.completed_cabinets ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('cabinet_pending')}
              className="cell-clickable"
              style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tủ THC Còn Tồn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700 }}>Tủ Tồn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.pending_cabinets ?? 0}
              </strong>
            </div>

            <div
              onClick={() => triggerDrilldown('cabinet_overdue')}
              className="cell-clickable"
              style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              title="Nhấn để xem chi tiết Tủ THC Quá Hạn"
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--danger-dark)', display: 'block', fontWeight: 700 }}>Tủ Quá Hạn</span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.overdue_cabinets ?? 0}
              </strong>
            </div>

            <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.68rem', color: '#8b5cf6', display: 'block', fontWeight: 700 }}>Tiến Độ Tủ</span>
              <strong style={{ fontSize: '1.15rem', color: (activeSummary.cabinet_rate || 0) >= 80 ? 'var(--success-dark)' : '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                {activeSummary.cabinet_rate ?? 0}%
              </strong>
            </div>
          </>
        )}
      </div>

      {/* 2. Table Toolbar (Tabs, Flat toggle, Month selector, Search box, CSV) */}
      <div
        className="table-toolbar"
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {/* Left Side: 3 Level Tabs + Group Controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${level === 'employee' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onLevelChange && onLevelChange('employee')}
            style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
          >
            <Users size={14} />
            Theo Nhân Viên ({statsData?.by_employee?.length || (level === 'employee' ? rows.length : 0)})
          </button>

          <button
            type="button"
            className={`btn ${level === 'team' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onLevelChange && onLevelChange('team')}
            style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
          >
            <FolderKanban size={14} />
            Theo Đội ({statsData?.by_team?.length || (level === 'team' ? rows.length : 0)})
          </button>

          <button
            type="button"
            className={`btn ${level === 'cluster' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onLevelChange && onLevelChange('cluster')}
            style={{ padding: '5px 14px', fontSize: '0.82rem', gap: '5px' }}
          >
            <Building2 size={14} />
            Theo Cụm ({statsData?.by_cluster?.length || (level === 'cluster' ? rows.length : 0)})
          </button>

          {level !== 'cluster' && (
            <button
              type="button"
              onClick={() => setIsFlatView(!isFlatView)}
              className={`btn ${isFlatView ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '5px 10px', fontSize: '0.78rem', gap: '4px' }}
              title="Chuyển đổi giữa chế độ Gom nhóm phân cấp và Danh sách phẳng toàn cục"
            >
              <ListFilter size={13} />
              <span>{isFlatView ? 'Danh sách phẳng' : 'Gom nhóm'}</span>
            </button>
          )}
        </div>

        {/* Right Side: Month dropdown, Search, Xuất Excel */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {(reportKey === 'qlctkt_trien_khai' || reportKey === 'tong_hop_su_co') && onDateChange && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--bg-tertiary)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                height: '32px',
              }}
            >
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>📅 Ngày:</span>
              <input
                type="date"
                value={curDateStr}
                onChange={(e) => onDateChange(e.target.value)}
                style={{
                  height: '24px',
                  padding: '0 6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              />
            </div>
          )}

          {availableMonths.length > 0 && onMonthChange && (
            <select
              value={selectedMonth || 'all'}
              onChange={(e) => onMonthChange(e.target.value)}
              style={{
                height: '32px',
                padding: '0 10px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">📅 Tất cả các tháng</option>
              {availableMonths.map((m) => {
                const parts = m.split('-');
                const label = parts.length === 2 ? `Tháng ${parts[1]}/${parts[0]}` : m;
                return (
                  <option key={m} value={m}>
                    {label}
                  </option>
                );
              })}
            </select>
          )}

          <div className="search-input-box" style={{ width: '220px', position: 'relative' }}>
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder={`Tìm ${level === 'cluster' ? 'cụm' : level === 'team' ? 'đội' : 'nhân viên'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={handleExportCsv}
            title="Tải bảng dạng CSV / Excel (UTF-8 BOM)"
            style={{ gap: '5px', fontSize: '0.8rem', padding: '5px 12px' }}
          >
            <Download size={14} /> Xuất Excel
          </button>
        </div>
      </div>

      {/* =========================================================================
          3. FILTER LỚP 1: CỤM (Dành cho cả tab Nhân viên và tab Đội)
          ========================================================================= */}
      {(level === 'employee' || level === 'team') && clusterPills.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              marginRight: '2px',
            }}
          >
            <Filter size={14} style={{ color: '#8b5cf6' }} />
            <span>Cụm:</span>
          </div>

          {/* Nút Tất cả Cụm */}
          <button
            type="button"
            onClick={() => {
              setSelectedClusterFilter('');
              setSelectedTeamFilter('');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.8rem',
              fontWeight: !selectedClusterFilter ? 700 : 500,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              border: !selectedClusterFilter ? '1px solid #7c3aed' : '1px solid var(--border-color)',
              background: !selectedClusterFilter ? '#8b5cf6' : 'var(--bg-primary)',
              color: !selectedClusterFilter ? '#ffffff' : 'var(--text-primary)',
              boxShadow: !selectedClusterFilter ? '0 2px 6px rgba(139, 92, 246, 0.35)' : 'none',
            }}
          >
            <span>Tất cả</span>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '1px 6px',
                borderRadius: '10px',
                background: !selectedClusterFilter ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-tertiary)',
                color: !selectedClusterFilter ? '#ffffff' : 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              {rows.length}
            </span>
          </button>

          {/* Các nút Cụm viết tắt */}
          {clusterPills.map((pill) => {
            const isSelected =
              selectedClusterFilter === pill.rawName ||
              selectedClusterFilter === pill.shortName ||
              selectedClusterFilter === pill.clusterId;

            return (
              <button
                key={pill.rawName}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSelectedClusterFilter('');
                  } else {
                    setSelectedClusterFilter(pill.rawName);
                  }
                  // Reset lọc đội khi đổi cụm
                  setSelectedTeamFilter('');
                }}
                title={`${pill.rawName} - Bấm để lọc theo cụm`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? 700 : 500,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-color)',
                  background: isSelected ? '#8b5cf6' : 'var(--bg-primary)',
                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                  boxShadow: isSelected ? '0 2px 6px rgba(139, 92, 246, 0.35)' : 'none',
                }}
              >
                <span>{pill.shortName}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-tertiary)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          4. FILTER LỚP 2: ĐỘI (Chỉ dành cho tab Nhân viên)
          ========================================================================= */}
      {level === 'employee' && teamPills.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              marginRight: '2px',
            }}
          >
            <FolderKanban size={13} style={{ color: '#8b5cf6' }} />
            <span>Đội:</span>
          </div>

          {/* Nút Tất cả Đội */}
          <button
            type="button"
            onClick={() => setSelectedTeamFilter('')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.76rem',
              fontWeight: !selectedTeamFilter ? 700 : 500,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              border: !selectedTeamFilter ? '1px solid #7c3aed' : '1px solid var(--border-color)',
              background: !selectedTeamFilter ? '#8b5cf6' : 'var(--bg-secondary)',
              color: !selectedTeamFilter ? '#ffffff' : 'var(--text-primary)',
              boxShadow: !selectedTeamFilter ? '0 2px 4px rgba(139, 92, 246, 0.3)' : 'none',
            }}
          >
            <span>Tất cả đội</span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0 5px',
                borderRadius: '8px',
                background: !selectedTeamFilter ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-primary)',
                color: !selectedTeamFilter ? '#ffffff' : 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              {teamPills.reduce((acc, t) => acc + t.count, 0)}
            </span>
          </button>

          {/* Danh sách các nút Đội con */}
          {teamPills.map((pill) => {
            const isSelected = selectedTeamFilter === pill.rawName || selectedTeamFilter === pill.teamId;

            return (
              <button
                key={pill.rawName}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSelectedTeamFilter('');
                  } else {
                    setSelectedTeamFilter(pill.rawName);
                  }
                }}
                title={`Lọc nhân viên thuộc ${pill.rawName}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.76rem',
                  fontWeight: isSelected ? 700 : 500,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-color)',
                  background: isSelected ? '#8b5cf6' : 'var(--bg-secondary)',
                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                  boxShadow: isSelected ? '0 2px 4px rgba(139, 92, 246, 0.3)' : 'none',
                }}
              >
                <span>{pill.rawName}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0 5px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-primary)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile swipe hint banner */}
      <div className="mobile-swipe-hint">
        <span>👈 Vuốt ngang bảng để xem đầy đủ các cột chỉ tiêu 👉</span>
      </div>

      {/* 5. Excel Table Scroll Wrapper */}
      <div
        className="excel-table-scroll-wrapper"
        style={{
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-color)',
          WebkitOverflowScrolling: 'touch',
          background: 'var(--bg-secondary)',
        }}
      >
        <table className={`excel-table ${reportKey === 'qlctkt_trien_khai' || reportKey === 'tong_hop_su_co' ? 'qlctkt-table' : ''}`} style={{ width: 'max-content', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            {groupedColumnsConfig ? (() => {
              const groupsList = Array.isArray(groupedColumnsConfig)
                ? groupedColumnsConfig
                : (Array.isArray(groupedColumnsConfig.groups) ? groupedColumnsConfig.groups : [groupedColumnsConfig]);
              const allGroupedKeys = groupsList.flatMap((g) => g.groupColumns || []);

              return (
                <>
                  <tr>
                    <th rowSpan={2} className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>
                      STT
                    </th>
                    {orgCols.map((col, idx) => {
                      const isName = col.isNameCol || idx === 0;
                      return (
                        <SortableTh
                          key={col.key}
                          rowSpan={2}
                          label={col.label}
                          sortKey={col.sortable ? col.key : null}
                          currentSortKey={sortKey}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align={col.align || 'left'}
                          width={isName ? '1%' : col.width}
                          className={isName ? 'col-name' : ''}
                          style={isName ? { width: '1%', whiteSpace: 'nowrap', padding: '5px 12px' } : {}}
                        />
                      );
                    })}
                    {metricColumns.map((col) => {
                      const matchingGroup = groupsList.find((g) => (g.groupColumns || []).includes(col.key));
                      if (matchingGroup) {
                        if (col.key === matchingGroup.groupColumns[0]) {
                          return (
                            <th
                              key={`grouped_parent_${matchingGroup.groupName}`}
                              colSpan={matchingGroup.groupColumns.length}
                              style={{
                                textAlign: 'center',
                                fontWeight: 800,
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: 'var(--warning-dark)',
                                borderBottom: '1px solid var(--border-color)',
                                padding: '6px 12px',
                                ...(matchingGroup.groupStyle || {}),
                              }}
                            >
                              {matchingGroup.groupName}
                            </th>
                          );
                        }
                        return null;
                      }
                      return (
                        <SortableTh
                          key={col.key}
                          rowSpan={2}
                          label={col.label}
                          sortKey={col.sortable !== false ? col.key : null}
                          currentSortKey={sortKey}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align={col.align || 'right'}
                          width={col.width}
                          tooltip={col.tooltip}
                          style={col.headerStyle || {}}
                        />
                      );
                    })}
                  </tr>
                  <tr>
                    {metricColumns
                      .filter((col) => allGroupedKeys.includes(col.key))
                      .map((col) => (
                        <SortableTh
                          key={col.key}
                          label={col.label}
                          sortKey={col.sortable !== false ? col.key : null}
                          currentSortKey={sortKey}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                          align={col.align || 'right'}
                          width={col.width}
                          tooltip={col.tooltip}
                          style={col.headerStyle || {}}
                        />
                      ))}
                  </tr>
                </>
              );
            })() : (
              <tr>
                <th className="col-stt" style={{ width: '38px', whiteSpace: 'nowrap' }}>
                  STT
                </th>
                {orgCols.map((col, idx) => {
                  const isName = col.isNameCol || idx === 0;
                  return (
                    <SortableTh
                      key={col.key}
                      label={col.label}
                      sortKey={col.sortable ? col.key : null}
                      currentSortKey={sortKey}
                      currentSortOrder={sortOrder}
                      onSort={handleSort}
                      align={col.align || 'left'}
                      width={isName ? '1%' : col.width}
                      className={isName ? 'col-name' : ''}
                      style={isName ? { width: '1%', whiteSpace: 'nowrap', padding: '5px 12px' } : {}}
                    />
                  );
                })}
                {metricColumns.map((col) => (
                  <SortableTh
                    key={col.key}
                    label={col.label}
                    sortKey={col.sortable !== false ? col.key : null}
                    currentSortKey={sortKey}
                    currentSortOrder={sortOrder}
                    onSort={handleSort}
                    align={col.align || 'right'}
                    width={col.width}
                    tooltip={col.tooltip}
                    style={col.headerStyle || {}}
                  />
                ))}
              </tr>
            )}
          </thead>

          <tbody>
            {/* Sticky Top Summary Row (Phản ánh đúng bộ lọc Cụm/Đội đang chọn) */}
            <tr className="excel-summary-row">
              <td
                className="col-summary-label"
                colSpan={orgCols.length + 1}
                style={{
                  textAlign: 'right',
                  paddingRight: '16px',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap',
                  fontWeight: 800,
                }}
              >
                {selectedTeamFilter
                  ? `TỔNG (Đội ${selectedTeamFilter}):`
                  : selectedClusterFilter
                  ? `TỔNG (Cụm ${getShortClusterName(selectedClusterFilter)}):`
                  : 'TỔNG CỘNG HỆ THỐNG:'}
              </td>
              {metricColumns.map((col) => {
                const val = activeSummary[col.summaryKey || col.key] ?? 0;
                const isRate = col.isRate || false;
                return (
                  <MetricCell
                    key={col.key}
                    value={val}
                    isRate={isRate}
                    variant={col.variant}
                    showPlus={col.showPlus}
                    align={col.align || 'right'}
                    onClick={
                      col.drilldownMetric && val > 0
                        ? () => triggerDrilldown(col.drilldownMetric)
                        : undefined
                    }
                  />
                );
              })}
            </tr>

            {/* Case A: Grouped Mode */}
            {groupedData.isGrouped && !isFlatView ? (
              groupedData.groups.map((group) => {
                const isExpanded = expandedGroups[group.groupId] !== false; // Default expanded
                return (
                  <React.Fragment key={group.groupId}>
                    {/* Group Header Row */}
                    <tr
                      className="excel-summary-row"
                      onClick={() => toggleGroup(group.groupId)}
                      style={{
                        cursor: 'pointer',
                        background: group.isOther ? 'var(--bg-tertiary)' : 'rgba(139, 92, 246, 0.08)',
                        userSelect: 'none',
                        borderTop: '2px solid var(--border-color)',
                      }}
                    >
                      <td className="col-stt" style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            color: '#8b5cf6',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(group.groupId);
                          }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td
                        colSpan={orgCols.length}
                        className="col-summary-label"
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: group.isOther ? 'var(--text-muted)' : '#8b5cf6' }}>
                            {level === 'team' ? getShortClusterName(group.title) : group.title}
                          </strong>
                          {group.subtitle && (
                            <span
                              style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}
                              title={group.subtitle}
                            >
                              ({getShortClusterName(group.subtitle)})
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '1px 8px',
                              borderRadius: '10px',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-muted)',
                              fontWeight: 700,
                            }}
                            title={level === 'team' ? `${group.rows.length} đội` : `${group.rows.length} nhân sự`}
                          >
                            {group.rows.length}
                          </span>
                        </div>
                      </td>

                      {/* Group Aggregated Metric Cells */}
                      {metricColumns.map((col) => {
                        const val = group[col.key] ?? 0;
                        const isRate = col.isRate || false;
                        const ovType = group.isOther
                          ? level === 'team'
                            ? 'other_cluster'
                            : 'other_team'
                          : level === 'team'
                          ? 'cluster'
                          : 'team';

                        return (
                          <MetricCell
                            key={col.key}
                            value={val}
                            isRate={isRate}
                            variant={col.variant}
                            showPlus={col.showPlus}
                            align={col.align || 'right'}
                            onClick={
                              col.drilldownMetric && val > 0
                                ? () =>
                                    triggerDrilldown(
                                      col.drilldownMetric,
                                      null,
                                      ovType,
                                      group.title,
                                      group.groupId
                                    )
                                : undefined
                            }
                          />
                        );
                      })}
                    </tr>

                    {/* Group Child Rows */}
                    {isExpanded &&
                      group.rows.map((row, rIdx) => {
                        return (
                          <tr
                            key={row.key_name || rIdx}
                            className="excel-row"
                            style={row.is_other ? { fontStyle: 'italic', opacity: 0.85 } : {}}
                          >
                            <td className="col-stt" style={{ color: 'var(--text-muted)' }}>
                              {row.is_other ? '*' : rIdx + 1}
                            </td>
                            {orgCols.map((col, cIdx) => {
                              const isName = col.isNameCol || cIdx === 0;
                              return (
                                <td
                                  key={col.key}
                                  className={isName ? 'col-name' : ''}
                                  style={{
                                    textAlign: col.align || 'left',
                                    padding: isName ? '3px 12px' : '3px 8px',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {col.render ? col.render(row) : row[col.key]}
                                </td>
                              );
                            })}
                            {metricColumns.map((col) => {
                              const val = row[col.key] ?? 0;
                              const isRate = col.isRate || false;
                              return (
                                <MetricCell
                                  key={col.key}
                                  value={val}
                                  isRate={isRate}
                                  variant={col.variant}
                                  showPlus={col.showPlus}
                                  align={col.align || 'right'}
                                  onClick={
                                    col.drilldownMetric && val > 0
                                      ? () => triggerDrilldown(col.drilldownMetric, row)
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })
            ) : (
              /* Case B: Flat List Mode or Tab Cụm */
              groupedData.flatRows.map((row, idx) => {
                const isOther = row.is_other;
                return (
                  <tr
                    key={row.key_name || idx}
                    className="excel-row"
                    style={isOther ? { fontStyle: 'italic', opacity: 0.85 } : {}}
                  >
                    <td className="col-stt" style={{ color: 'var(--text-muted)' }}>
                      {isOther ? '*' : idx + 1}
                    </td>
                    {orgCols.map((col, cIdx) => {
                      const isName = col.isNameCol || cIdx === 0;
                      return (
                        <td
                          key={col.key}
                          className={isName ? 'col-name' : ''}
                          style={{
                            textAlign: col.align || 'left',
                            padding: isName ? '3px 12px' : '3px 8px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.render ? col.render(row) : row[col.key]}
                        </td>
                      );
                    })}
                    {metricColumns.map((col) => {
                      const val = row[col.key] ?? 0;
                      const isRate = col.isRate || false;
                      return (
                        <MetricCell
                          key={col.key}
                          value={val}
                          isRate={isRate}
                          variant={col.variant}
                          showPlus={col.showPlus}
                          align={col.align || 'right'}
                          onClick={
                            col.drilldownMetric && val > 0
                              ? () => triggerDrilldown(col.drilldownMetric, row)
                              : undefined
                          }
                        />
                      );
                    })}
                  </tr>
                );
              })
            )}

            {/* Empty state */}
            {groupedData.flatRows?.length === 0 && groupedData.groups?.length === 0 && (
              <tr>
                <td
                  colSpan={allColumns.length}
                  style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}
                >
                  {searchQuery || selectedClusterFilter || selectedTeamFilter
                    ? 'Không có kết quả nào khớp với điều kiện lọc'
                    : 'Không có dữ liệu trong khoảng thời gian đã chọn'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
