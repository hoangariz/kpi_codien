import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Search, 
  Download, 
  Eye, 
  AlertCircle,
  FileSpreadsheet,
  Calendar,
  Clock,
  Briefcase,
  BarChart2,
  Layers,
  CheckCircle2,
  Filter,
  ArrowRight,
  ExternalLink,
  MousePointerClick
} from 'lucide-react';
import { statsApi } from '../api/statsApi';
import { fixedWoApi } from '../api/fixedWoApi';
import { formatGroupName } from '../utils/groupFormat';

/**
 * Format datetime string as dd/MM/yyyy HH:mm:ss
 */
function formatDateTime(val) {
  if (!val) return '--';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Status color helper
 */
function getStatusBadgeClass(status) {
  if (!status) return 'badge-neutral';
  const s = status.toLowerCase();
  if (s.includes('đóng')) {
    return 'badge-success';
  }
  if (s.includes('ft hoàn thành')) {
    return 'badge-cyan';
  }
  if (s.includes('chờ') && s.includes('tiếp nhận')) {
    return 'badge-purple';
  }
  if (s.includes('quá hạn') || s.includes('trễ')) {
    return 'badge-danger';
  }
  if (s.includes('tiếp nhận') || s.includes('giao ft') || s.includes('đang thực hiện') || s.includes('đang xử lý')) {
    return 'badge-info';
  }
  if (s.includes('hoàn thành') || s.includes('thành công')) {
    return 'badge-success';
  }
  return 'badge-warning';
}

export default function TaskDrilldownModal({ isOpen, onClose, filterInfo, onSelectTask }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('thoi_diem_yeu_cau_ket_thuc');
  const [sortOrder, setSortOrder] = useState('desc');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'analytics'
  const [analyticsJobSearch, setAnalyticsJobSearch] = useState('');

  // Interactive drilldown sub-table state (when clicking any number in Table 1 or Table 2)
  const [drilldownFilter, setDrilldownFilter] = useState(null);
  const [drilldownSearchTerm, setDrilldownSearchTerm] = useState('');
  const [drilldownSortKey, setDrilldownSortKey] = useState('thoi_diem_yeu_cau_ket_thuc');
  const [drilldownSortOrder, setDrilldownSortOrder] = useState('desc');
  const drilldownSectionRef = useRef(null);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key.startsWith('thoi_diem_') ? 'desc' : 'asc');
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <span style={{ opacity: 0.35, marginLeft: '4px', fontSize: '0.72rem' }}>↕</span>;
    }
    return (
      <span style={{ color: 'var(--brand-primary)', marginLeft: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const handleDrilldownSort = (key) => {
    if (drilldownSortKey === key) {
      setDrilldownSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDrilldownSortKey(key);
      setDrilldownSortOrder(key.startsWith('thoi_diem_') ? 'desc' : 'asc');
    }
  };

  const renderDrilldownSortIndicator = (key) => {
    if (drilldownSortKey !== key) {
      return <span style={{ opacity: 0.35, marginLeft: '4px', fontSize: '0.72rem' }}>↕</span>;
    }
    return (
      <span style={{ color: 'var(--brand-primary)', marginLeft: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
        {drilldownSortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // Fetch all tasks matching the clicked number's exact filters (display all directly without page size limit)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['maintenance-drilldown-tasks', filterInfo, searchTerm, sortKey, sortOrder],
    queryFn: () => {
      if (filterInfo.fixedWoReportId) {
        return fixedWoApi.getTasks(filterInfo.fixedWoReportId, {
          metric: filterInfo.metric || 'total',
          filter_type: filterInfo.filterType || null,
          filter_id: filterInfo.filterId ?? null,
          is_other: Boolean(filterInfo.isOther),
          search: searchTerm.trim() || undefined,
          day: filterInfo.day || undefined,
          max_day: filterInfo.max_day || undefined,
          month: filterInfo.activeMonth || undefined,
          sort_by: sortKey,
          sort_order: sortOrder,
          page: 1,
          page_size: 20000,
          exclude_tu_choi: Boolean(filterInfo.exclude_tu_choi),
        });
      }
      return statsApi.getMaintenanceTasks({
        metric: filterInfo.metric || 'total',
        filter_type: filterInfo.filterType || null,
        filter_id: filterInfo.filterId ?? null,
        target_name: filterInfo.targetName || null,
        is_other: Boolean(filterInfo.isOther),
        month: filterInfo.activeMonth || null,
        target_type: filterInfo.targetType || undefined,
        exclude_closed_prior_months: filterInfo.excludeClosedPriorMonths,
        board_id: filterInfo.boardId || undefined,
        board_codes: filterInfo.boardCodes || undefined,
        sub_category_id: filterInfo.subCategoryId || undefined,
        sub_keyword: filterInfo.subKeyword || undefined,
        is_sub_other: Boolean(filterInfo.isSubOther),
        all_sub_keywords: filterInfo.allSubKeywords || undefined,
        day: filterInfo.day || undefined,
        max_day: filterInfo.max_day || undefined,
        search: searchTerm.trim() || undefined,
        sort_by: sortKey,
        sort_order: sortOrder,
        page: 1,
        page_size: 20000,
        exclude_tu_choi: Boolean(filterInfo.exclude_tu_choi),
      });
    },
    enabled: Boolean(isOpen && filterInfo),
    keepPreviousData: true,
  });

  if (!isOpen || !filterInfo) return null;

  const total = data?.total || 0;
  const totalPages = data?.total_pages || 1;
  const items = data?.items || [];

  // =========================================================================
  // DEEP ANALYSIS CALCULATIONS (PHÂN TÍCH SÂU)
  // =========================================================================

  // Classification: check if task is suspended/treo (CĐ từ chối / FT từ chối)
  const isTreo = (status) => {
    if (!status) return false;
    const s = String(status).toLowerCase().trim();
    return s.includes('từ chối') || s === 'ft từ chối' || s === 'cd từ chối' || s === 'cđ từ chối';
  };

  // Extract month (YYYY-MM) according to thoi_diem_bat_dau_thuc_hien
  const getTaskMonthKey = (t) => {
    const dtStr = t.thoi_diem_bat_dau_thuc_hien || t.thoi_diem_tao || t.thoi_diem_yeu_cau_ket_thuc;
    if (!dtStr) return 'Khác / Chưa rõ';

    const str = String(dtStr).trim();
    // 1. Regex check for DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const m = dmyMatch[2].padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}`;
    }

    // 2. Regex check for YYYY-MM-DD or YYYY-MM
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = ymdMatch[2].padStart(2, '0');
      return `${y}-${m}`;
    }

    // 3. Fallback to Date object parsing
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }
    } catch (e) {}

    return 'Khác / Chưa rõ';
  };

  const formatMonthLabel = (mKey) => {
    if (!mKey || mKey === 'Khác / Chưa rõ') return 'Khác / Chưa rõ';
    const parts = mKey.split('-');
    if (parts.length === 2) {
      return `Tháng ${parts[1]}/${parts[0]}`;
    }
    return mKey;
  };

  // Table 1: Group by Job Type
  const analyticsByType = useMemo(() => {
    if (!items.length) return [];
    const map = new Map();
    items.forEach(t => {
      const typeName = (t.loai_cong_viec || 'Chưa phân loại').trim();
      if (!map.has(typeName)) {
        map.set(typeName, {
          loai_cong_viec: typeName,
          tong_ton: 0,
          so_treo: 0,
          ton_con_lai: 0,
          tasks: []
        });
      }
      const entry = map.get(typeName);
      entry.tong_ton += 1;
      if (isTreo(t.trang_thai)) {
        entry.so_treo += 1;
      } else {
        entry.ton_con_lai += 1;
      }
      entry.tasks.push(t);
    });

    const list = Array.from(map.values());
    list.sort((a, b) => b.tong_ton - a.tong_ton);
    return list;
  }, [items]);

  // Distinct months sorted chronologically
  const distinctMonths = useMemo(() => {
    if (!items.length) return [];
    const set = new Set();
    items.forEach(t => {
      set.add(getTaskMonthKey(t));
    });
    const arr = Array.from(set);
    arr.sort((a, b) => {
      if (a === 'Khác / Chưa rõ') return 1;
      if (b === 'Khác / Chưa rõ') return -1;
      return a.localeCompare(b);
    });
    return arr;
  }, [items]);

  // Overall totals
  const totalTongTon = items.length;
  const totalSoTreo = useMemo(() => items.filter(t => isTreo(t.trang_thai)).length, [items]);
  const totalTonConLai = totalTongTon - totalSoTreo;
  const overallTreoRate = totalTongTon > 0 ? (totalSoTreo / totalTongTon * 100).toFixed(1) : '0.0';
  const overallConLaiRate = totalTongTon > 0 ? (totalTonConLai / totalTongTon * 100).toFixed(1) : '0.0';

  // Table 2: Monthly Matrix
  const monthlyMatrix = useMemo(() => {
    if (!analyticsByType.length || !distinctMonths.length) {
      return { rows: [], monthTotals: {} };
    }

    const monthTotals = {};
    distinctMonths.forEach(m => {
      monthTotals[m] = { so_ton: 0, so_treo: 0, ton_thuc: 0 };
    });

    const rows = analyticsByType.map(group => {
      const rowMonths = {};
      distinctMonths.forEach(m => {
        rowMonths[m] = { so_ton: 0, so_treo: 0, ton_thuc: 0 };
      });

      group.tasks.forEach(t => {
        const m = getTaskMonthKey(t);
        if (!rowMonths[m]) rowMonths[m] = { so_ton: 0, so_treo: 0, ton_thuc: 0 };
        if (!monthTotals[m]) monthTotals[m] = { so_ton: 0, so_treo: 0, ton_thuc: 0 };

        rowMonths[m].so_ton += 1;
        monthTotals[m].so_ton += 1;

        if (isTreo(t.trang_thai)) {
          rowMonths[m].so_treo += 1;
          monthTotals[m].so_treo += 1;
        } else {
          rowMonths[m].ton_thuc += 1;
          monthTotals[m].ton_thuc += 1;
        }
      });

      return {
        loai_cong_viec: group.loai_cong_viec,
        total_ton: group.tong_ton,
        total_treo: group.so_treo,
        total_con_lai: group.ton_con_lai,
        by_month: rowMonths
      };
    });

    return { rows, monthTotals };
  }, [analyticsByType, distinctMonths]);

  // Filter Table 1 and Table 2 if user searches in analytics
  const filteredAnalyticsByType = useMemo(() => {
    if (!analyticsJobSearch.trim()) return analyticsByType;
    const term = analyticsJobSearch.trim().toLowerCase();
    return analyticsByType.filter(item => item.loai_cong_viec.toLowerCase().includes(term));
  }, [analyticsByType, analyticsJobSearch]);

  const filteredMonthlyRows = useMemo(() => {
    if (!analyticsJobSearch.trim()) return monthlyMatrix.rows;
    const term = analyticsJobSearch.trim().toLowerCase();
    return monthlyMatrix.rows.filter(row => row.loai_cong_viec.toLowerCase().includes(term));
  }, [monthlyMatrix.rows, analyticsJobSearch]);

  // Export Deep Analysis to Excel CSV (including Table 1 and Table 2)
  const handleExportAnalyticsCSV = () => {
    if (!items.length) return;
    const lines = [];

    lines.push(`BÁO CÁO PHÂN TÍCH SÂU DỮ LIỆU WO`);
    lines.push(`Đối tượng: "${(filterInfo.targetName || 'Tất cả').replace(/"/g, '""')}" - Chỉ tiêu: "${(filterInfo.metricLabel || 'Quá Hạn').replace(/"/g, '""')}"`);
    lines.push(`Tổng: ${totalTongTon} | Treo: ${totalSoTreo} (${overallTreoRate}%) | Tồn thực: ${totalTonConLai} (${overallConLaiRate}%)`);
    lines.push(`Ngày xuất: ${new Date().toLocaleString('vi-VN')}`);
    lines.push('');

    // BẢNG 1: THỐNG KÊ THEO LOẠI CÔNG VIỆC
    lines.push('=== BẢNG 1: THỐNG KÊ THEO LOẠI CÔNG VIỆC ===');
    lines.push('STT,Loại công việc,Tổng,Treo,Tồn thực,% Tồn thực');
    analyticsByType.forEach((item, idx) => {
      const pctTonConLai = totalTongTon > 0 ? ((item.ton_con_lai / totalTongTon) * 100).toFixed(1) : '0.0';
      lines.push(`${idx + 1},"${item.loai_cong_viec.replace(/"/g, '""')}",${item.tong_ton},${item.so_treo},${item.ton_con_lai},${pctTonConLai}%`);
    });
    lines.push(`TỔNG CỘNG,,${totalTongTon},${totalSoTreo},${totalTonConLai},${overallConLaiRate}%`);
    lines.push('');

    // BẢNG 2: THỐNG KÊ CHI TIẾT THEO THÁNG
    lines.push('=== BẢNG 2: THỐNG KÊ CHI TIẾT THEO THÁNG (NGÀY BẮT ĐẦU THỰC HIỆN) ===');
    const headerCols = ['STT', 'Loại công việc'];
    distinctMonths.forEach(m => {
      const label = formatMonthLabel(m);
      headerCols.push(`"${label} - Tồn thực"`);
      headerCols.push(`"${label} - Treo"`);
    });
    headerCols.push('Tồn thực');
    headerCols.push('Treo');
    lines.push(headerCols.join(','));

    // Row TỔNG CỘNG THEO THÁNG đưa lên trên cùng
    const totalRowCols = ['TỔNG CỘNG THEO THÁNG', ''];
    distinctMonths.forEach(m => {
      const mTot = monthlyMatrix.monthTotals[m] || { so_ton: 0, so_treo: 0, ton_thuc: 0 };
      totalRowCols.push(mTot.ton_thuc || 0);
      totalRowCols.push(mTot.so_treo || 0);
    });
    totalRowCols.push(totalTonConLai);
    totalRowCols.push(totalSoTreo);
    lines.push(totalRowCols.join(','));

    monthlyMatrix.rows.forEach((row, idx) => {
      const rowCols = [idx + 1, `"${row.loai_cong_viec.replace(/"/g, '""')}"`];
      distinctMonths.forEach(m => {
        const cell = row.by_month[m] || { so_ton: 0, so_treo: 0, ton_thuc: 0 };
        rowCols.push(cell.ton_thuc || 0);
        rowCols.push(cell.so_treo || 0);
      });
      rowCols.push(row.total_con_lai);
      rowCols.push(row.total_treo);
      lines.push(rowCols.join(','));
    });

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanTarget = (filterInfo.targetName || 'WO').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `Phan_tich_sau_${cleanTarget}_${filterInfo.metric || 'qua_han'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // -------------------------------------------------------------------------
  // INTERACTIVE DRILLDOWN WHEN CLICKING ANY NUMBER IN TABLE 1 OR TABLE 2
  // -------------------------------------------------------------------------
  const handleNumberClick = (key, title, jobType, monthKey, statusFilter, count) => {
    if (!count || count <= 0) return;
    if (drilldownFilter && drilldownFilter.key === key) {
      setDrilldownFilter(null);
      return;
    }
    setDrilldownFilter({
      key,
      title,
      jobType,
      monthKey,
      statusFilter,
      count
    });
    setDrilldownSearchTerm('');
    setTimeout(() => {
      drilldownSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Filter tasks belonging to current drilldownFilter
  const drilldownTasks = useMemo(() => {
    if (!drilldownFilter || !items.length) return [];
    return items.filter(t => {
      if (drilldownFilter.jobType) {
        const typeName = (t.loai_cong_viec || 'Chưa phân loại').trim();
        if (typeName !== drilldownFilter.jobType) return false;
      }
      if (drilldownFilter.monthKey) {
        if (getTaskMonthKey(t) !== drilldownFilter.monthKey) return false;
      }
      const treo = isTreo(t.trang_thai);
      if (drilldownFilter.statusFilter === 'treo' && !treo) return false;
      if (drilldownFilter.statusFilter === 'con_lai' && treo) return false;
      return true;
    });
  }, [items, drilldownFilter]);

  // Sort and search inside drilldownTasks
  const sortedDrilldownTasks = useMemo(() => {
    if (!drilldownTasks.length) return [];
    let list = [...drilldownTasks];
    if (drilldownSearchTerm.trim()) {
      const term = drilldownSearchTerm.trim().toLowerCase();
      list = list.filter(t =>
        (t.ma_cong_viec && t.ma_cong_viec.toLowerCase().includes(term)) ||
        (t.noi_dung_cong_viec && t.noi_dung_cong_viec.toLowerCase().includes(term)) ||
        (t.ghi_chu && t.ghi_chu.toLowerCase().includes(term)) ||
        (t.station_code && t.station_code.toLowerCase().includes(term)) ||
        (t.employee_assigned_name && t.employee_assigned_name.toLowerCase().includes(term)) ||
        (t.loai_cong_viec && t.loai_cong_viec.toLowerCase().includes(term)) ||
        (t.trang_thai && t.trang_thai.toLowerCase().includes(term)) ||
        (t.latest_note && t.latest_note.toLowerCase().includes(term))
      );
    }
    list.sort((a, b) => {
      let va = a[drilldownSortKey] ?? '';
      let vb = b[drilldownSortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return drilldownSortOrder === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return drilldownSortOrder === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return list;
  }, [drilldownTasks, drilldownSearchTerm, drilldownSortKey, drilldownSortOrder]);

  // Quick switch from drilldown preview to main list view
  const handleOpenInMainList = () => {
    if (!drilldownFilter) return;
    if (drilldownFilter.jobType) {
      setSearchTerm(drilldownFilter.jobType);
    }
    setViewMode('list');
  };

  // Export only the drilldown filtered tasks
  const handleExportDrilldownTasksCSV = () => {
    if (!sortedDrilldownTasks.length) return;
    const headers = [
      'STT',
      'Ghi chú',
      'Mã công việc',
      'Mã trạm',
      'Loại công việc',
      'Nội dung công việc',
      'Mô tả',
      'Trạng thái',
      'Nhóm điều phối',
      'Nhân viên',
      'Thời điểm BĐ thực hiện',
      'Thời điểm yêu cầu kết thúc',
      'Thời gian còn lại (H)'
    ];

    const escapeCSV = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [
      headers.join(','),
      ...sortedDrilldownTasks.map((t, index) => [
        index + 1,
        escapeCSV(t.latest_note || ''),
        escapeCSV(t.ma_cong_viec || ''),
        escapeCSV(t.station_code || ''),
        escapeCSV(t.loai_cong_viec || ''),
        escapeCSV(t.noi_dung_cong_viec || ''),
        escapeCSV(t.ghi_chu || ''),
        escapeCSV(t.trang_thai || ''),
        escapeCSV(t.group_name || ''),
        escapeCSV(t.employee_assigned_name || ''),
        escapeCSV(formatDateTime(t.thoi_diem_bat_dau_thuc_hien)),
        escapeCSV(formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)),
        escapeCSV(t.thoi_gian_con_lai != null ? t.thoi_gian_con_lai : '')
      ].join(','))
    ];

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanTitle = (drilldownFilter?.title || 'chi_tiet').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `Chi_tiet_WO_${cleanTitle}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to render interactive clickable number buttons in tables
  const renderClickableNum = ({
    val,
    numKey,
    title,
    jobType = null,
    monthKey = null,
    statusFilter = 'all',
    textColor = 'var(--text-primary)',
    bgColor = 'transparent',
    isZeroDisabled = true,
    isBadge = false,
    badgeClass = 'badge-danger'
  }) => {
    const numVal = Number(val) || 0;
    if (isZeroDisabled && numVal <= 0) {
      return <span style={{ color: 'var(--text-muted)', opacity: 0.35 }}>{val === 0 ? '0' : '-'}</span>;
    }

    const isSelected = drilldownFilter?.key === numKey;

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleNumberClick(numKey, title, jobType, monthKey, statusFilter, numVal);
        }}
        title={`Nhấp để xem danh sách ${numVal.toLocaleString()} WO ở bảng bên dưới: ${title}`}
        style={{
          background: isSelected ? 'var(--brand-primary)' : (isBadge ? undefined : bgColor),
          color: isSelected ? '#ffffff' : textColor,
          border: isSelected ? '1px solid var(--brand-primary)' : '1px solid transparent',
          borderRadius: '4px',
          padding: '2px 7px',
          cursor: 'pointer',
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          fontSize: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '4px',
          transition: 'all 0.15s ease',
          textDecoration: isSelected ? 'none' : 'underline decoration-dotted',
          boxShadow: isSelected ? '0 0 0 2px rgba(2, 132, 199, 0.4)' : 'none'
        }}
        className={isBadge && !isSelected ? `badge ${badgeClass}` : ''}
      >
        {numVal.toLocaleString()}
      </button>
    );
  };

  // Export current filtered list as CSV
  const handleExportCSV = () => {
    if (!items.length) return;
    const headers = [
      'STT',
      'Ghi chú',
      'Mã công việc',
      'Mã trạm',
      'Loại công việc',
      'Nội dung công việc',
      'Mô tả',
      'Trạng thái',
      'Nhóm điều phối',
      'Nhân viên',
      'Thời điểm bắt đầu thực hiện',
      'Thời điểm yêu cầu kết thúc',
      'Thời gian còn lại (H)'
    ];

    const rows = items.map((t, idx) => [
      idx + 1,
      `"${(t.latest_note || '').replace(/"/g, '""')}"`,
      `"${t.ma_cong_viec || ''}"`,
      `"${t.station_code || ''}"`,
      `"${(t.loai_cong_viec || '').replace(/"/g, '""')}"`,
      `"${(t.noi_dung_cong_viec || '').replace(/"/g, '""')}"`,
      `"${(t.ghi_chu || '').replace(/"/g, '""')}"`,
      `"${t.trang_thai || ''}"`,
      `"${t.group_name || ''}"`,
      `"${t.employee_assigned_name || ''}"`,
      `"${formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}"`,
      `"${formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}"`,
      t.thoi_gian_con_lai ?? ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeTitle = `${filterInfo.targetName || 'Tat_ca'}_${filterInfo.metricLabel || 'Chi_tiet'}`.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    link.setAttribute('download', `Chi_tiet_${safeTitle}_Toan_bo.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 60 }}>
      <div 
        className="modal-content modal-drilldown" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '1500px',
          width: '96vw',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div 
          className="modal-header" 
          style={{ 
            padding: '14px 20px', 
            background: 'var(--bg-secondary)', 
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ fontWeight: 800, fontSize: '0.82rem', padding: '3px 10px', gap: '5px' }}>
              <FileSpreadsheet size={14} /> Chi Tiết Dữ Liệu
            </span>

            <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {filterInfo.targetName ? (
                <>
                  <span style={{ color: 'var(--brand-primary)' }} title={filterInfo.targetName}>
                    {filterInfo.filterType === 'group' ? formatGroupName(filterInfo.targetName) : filterInfo.targetName}
                  </span>
                  <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>&bull;</span>
                </>
              ) : null}
              <span>Chỉ tiêu: </span>
              <span className={`badge ${
                filterInfo.metric === 'overdue' ? 'badge-danger' : 
                filterInfo.metric === 'closed' || filterInfo.metric === 'closed_day' || filterInfo.metric === 'closed_up_to_max' ? 'badge-success' : 
                filterInfo.metric === 'pending' ? 'badge-warning' : 
                filterInfo.metric === 'cho_cd_tiep_nhan' ? 'badge-purple' :
                filterInfo.metric === 'ft_hoan_thanh' ? 'badge-cyan' :
                filterInfo.metric === 'closed_today' || filterInfo.metric === 'closed_yesterday' ? 'badge-success' :
                'badge-info'
              }`} style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                {filterInfo.metricLabel || 'Tất Cả'}
              </span>
            </span>

            <span className="badge badge-neutral" style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? 'Đang tải...' : `${total.toLocaleString()} công việc`}
            </span>

            {filterInfo.boardName && (
              <span style={{ 
                padding: '2px 8px', 
                borderRadius: '12px', 
                background: 'rgba(139, 92, 246, 0.15)', 
                color: '#8b5cf6', 
                fontSize: '0.78rem', 
                fontWeight: 700 
              }}>
                📌 {filterInfo.boardName}
              </span>
            )}

            {filterInfo.subCategoryName && (
              <span style={{
                padding: '2px 10px',
                borderRadius: '12px',
                background: 'rgba(2, 132, 199, 0.15)',
                color: 'var(--brand-primary)',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid rgba(2, 132, 199, 0.3)'
              }}>
                📂 Đầu việc con: {filterInfo.subCategoryName}
              </span>
            )}

            {filterInfo.exclude_tu_choi && (
              <span style={{ 
                padding: '2px 8px', 
                borderRadius: '12px', 
                background: 'rgba(225, 29, 72, 0.12)', 
                color: '#e11d48', 
                fontSize: '0.78rem', 
                fontWeight: 700,
                border: '1px solid rgba(225, 29, 72, 0.25)'
              }}>
                🚫 Đã ẩn WO Từ Chối
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Nút Phân Tích Sâu đặt ngay trước nút Xuất Excel */}
            <button 
              className={`btn ${viewMode === 'analytics' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setViewMode(prev => prev === 'analytics' ? 'list' : 'analytics')}
              disabled={!items.length && !isLoading}
              title={viewMode === 'analytics' ? 'Quay lại xem danh sách chi tiết các dòng WO' : 'Phân tích sâu dữ liệu theo loại công việc và theo tháng bắt đầu'}
              style={{ 
                padding: '6px 14px', 
                fontSize: '0.82rem', 
                fontWeight: 700, 
                gap: '6px',
                borderColor: viewMode === 'analytics' ? 'var(--brand-primary)' : 'rgba(2, 132, 199, 0.4)',
                background: viewMode === 'analytics' ? 'var(--brand-primary)' : 'rgba(2, 132, 199, 0.08)',
                color: viewMode === 'analytics' ? '#ffffff' : 'var(--brand-primary)'
              }}
            >
              <BarChart2 size={15} /> 
              {viewMode === 'analytics' ? '📋 Danh Sách WO' : '📊 Phân Tích Sâu'}
            </button>

            <button 
              className="btn btn-outline"
              onClick={viewMode === 'analytics' ? handleExportAnalyticsCSV : handleExportCSV}
              disabled={!items.length}
              title={viewMode === 'analytics' ? 'Xuất toàn bộ bảng phân tích sâu ra Excel CSV' : 'Xuất danh sách này ra Excel CSV'}
              style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '5px' }}
            >
              <Download size={14} /> Xuất Excel
            </button>

            <button 
              className="btn btn-outline btn-icon" 
              onClick={onClose}
              title="Đóng cửa sổ"
              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar: Search and Filter Info */}
        {viewMode === 'analytics' ? (
          <div 
            style={{ 
              padding: '10px 20px', 
              background: 'var(--bg-tertiary)', 
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '420px' }}>
              <div className="search-input-box" style={{ width: '100%' }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Lọc loại công việc trong bảng phân tích..."
                  value={analyticsJobSearch}
                  onChange={(e) => setAnalyticsJobSearch(e.target.value)}
                  style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem', height: '32px' }}
                />
              </div>
              {analyticsJobSearch && (
                <button 
                  className="btn btn-outline" 
                  onClick={() => setAnalyticsJobSearch('')}
                  style={{ padding: '4px 8px', fontSize: '0.75rem', height: '32px' }}
                >
                  Xóa
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>* Tháng WO tính theo <strong>Ngày bắt đầu thực hiện</strong></span>
              <span className="badge badge-purple" style={{ fontSize: '0.72rem', padding: '3px 8px', fontWeight: 700 }}>
                {filteredAnalyticsByType.length} Loại Việc &bull; {distinctMonths.length} Tháng
              </span>
            </div>
          </div>
        ) : (
          <div 
            style={{ 
              padding: '8px 20px', 
              background: 'var(--bg-tertiary)', 
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '420px' }}>
              <div className="search-input-box" style={{ width: '100%' }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Tìm theo mã việc, nội dung, mô tả, trạm, người nhận..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: '6px 10px 6px 32px', fontSize: '0.82rem', height: '32px' }}
                />
              </div>
              {searchTerm && (
                <button 
                  className="btn btn-outline" 
                  onClick={() => setSearchTerm('')}
                  style={{ padding: '4px 8px', fontSize: '0.75rem', height: '32px' }}
                >
                  Xóa
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>* Nhấp tiêu đề cột để sắp xếp &bull; Rê chuột vào ô để xem nội dung đầy đủ</span>
              <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '3px 8px', fontWeight: 700 }}>
                Hiển thị toàn bộ ({items.length.toLocaleString()})
              </span>
            </div>
          </div>
        )}

        {/* Modal Body: Excel Table or Deep Analytics View */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: '36px', height: '36px' }} />
              <p style={{ fontSize: '0.9rem' }}>Đang tải danh sách công việc...</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'var(--text-muted)', padding: '40px' }}>
              <AlertCircle size={40} style={{ opacity: 0.4 }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Không tìm thấy công việc nào phù hợp với bộ lọc</p>
              {searchTerm && (
                <button className="btn btn-outline" onClick={() => setSearchTerm('')} style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                  Xóa từ khóa tìm kiếm
                </button>
              )}
            </div>
          ) : viewMode === 'analytics' ? (
            /* =========================================================
               CHẾ ĐỘ PHÂN TÍCH SÂU (DEEP ANALYTICS VIEW)
               ========================================================= */
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* 4 KPI Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div 
                  onClick={() => handleNumberClick('kpi-tong', 'Toàn bộ WO: Tổng tồn quá hạn', null, null, 'all', totalTongTon)}
                  title="Nhấp để xem danh sách toàn bộ WO ở bảng bên dưới"
                  style={{ 
                    background: drilldownFilter?.key === 'kpi-tong' ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-secondary)', 
                    border: drilldownFilter?.key === 'kpi-tong' ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '14px 16px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ 
                    width: '42px', 
                    height: '42px', 
                    borderRadius: 'var(--radius-md)', 
                    background: 'rgba(2, 132, 199, 0.12)', 
                    color: 'var(--brand-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Layers size={20} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Tổng
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                      {totalTongTon.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>WO</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                      Nhấp để xem toàn bộ danh sách ⬇
                    </span>
                  </div>
                </div>

                <div 
                  onClick={() => handleNumberClick('kpi-treo', 'Toàn bộ WO: Treo', null, null, 'treo', totalSoTreo)}
                  title="Nhấp để xem danh sách WO treo ở bảng bên dưới"
                  style={{ 
                    background: drilldownFilter?.key === 'kpi-treo' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)', 
                    border: drilldownFilter?.key === 'kpi-treo' ? '2px solid var(--danger)' : '1px solid rgba(239, 68, 68, 0.3)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '14px 16px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: totalSoTreo > 0 ? 'pointer' : 'default',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ 
                    width: '42px', 
                    height: '42px', 
                    borderRadius: 'var(--radius-md)', 
                    background: 'rgba(239, 68, 68, 0.12)', 
                    color: 'var(--danger-dark)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--danger-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Treo
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--danger-dark)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                      {totalSoTreo.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)' }}>WO</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>
                      Chiếm {overallTreoRate}% tổng tồn ⬇
                    </span>
                  </div>
                </div>

                <div 
                  onClick={() => handleNumberClick('kpi-conlai', 'Toàn bộ WO: Tồn thực', null, null, 'con_lai', totalTonConLai)}
                  title="Nhấp để xem danh sách WO tồn thực cần xử lý ở bảng bên dưới"
                  style={{ 
                    background: drilldownFilter?.key === 'kpi-conlai' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)', 
                    border: drilldownFilter?.key === 'kpi-conlai' ? '2px solid var(--success-dark)' : '1px solid rgba(16, 185, 129, 0.3)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '14px 16px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: totalTonConLai > 0 ? 'pointer' : 'default',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ 
                    width: '42px', 
                    height: '42px', 
                    borderRadius: 'var(--radius-md)', 
                    background: 'rgba(16, 185, 129, 0.12)', 
                    color: 'var(--success-dark)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Tồn thực
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--success-dark)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                      {totalTonConLai.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success-dark)' }}>WO</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--success-dark)', fontWeight: 600 }}>
                      Chiếm {overallConLaiRate}% tổng tồn ⬇
                    </span>
                  </div>
                </div>

                <div style={{ 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid rgba(139, 92, 246, 0.3)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '14px 16px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{ 
                    width: '42px', 
                    height: '42px', 
                    borderRadius: 'var(--radius-md)', 
                    background: 'rgba(139, 92, 246, 0.12)', 
                    color: '#8b5cf6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Calendar size={20} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Phân Bổ Tháng Bắt Đầu
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>
                      {distinctMonths.length} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tháng</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {distinctMonths.length ? `${formatMonthLabel(distinctMonths[0])} → ${formatMonthLabel(distinctMonths[distinctMonths.length - 1])}` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* BẢNG 1: THỐNG KÊ THEO LOẠI CÔNG VIỆC */}
              <div style={{ 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 'var(--radius-md)', 
                padding: '16px 18px',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'rgba(2, 132, 199, 0.12)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Layers size={16} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        1. THỐNG KÊ THEO LOẠI CÔNG VIỆC ({filteredAnalyticsByType.length} loại việc)
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Nhấp trực tiếp vào bất kỳ con số nào để xem chi tiết danh sách WO ngay bên dưới &bull; % Tồn thực tính chia cho tổng ở dòng dưới
                      </p>
                    </div>
                  </div>

                  <span className="badge badge-info" style={{ fontSize: '0.74rem', padding: '3px 10px', fontWeight: 700 }}>
                    Tổng cộng: {totalTongTon.toLocaleString()} WO
                  </span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
                        <th style={{ minWidth: '260px', textAlign: 'left' }}>Loại Công Việc</th>
                        <th style={{ width: '130px', textAlign: 'right', background: 'var(--bg-tertiary)' }} title="Tổng WO của loại việc (Nhấp số để xem)">Tổng</th>
                        <th style={{ width: '140px', textAlign: 'right', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger-dark)' }} title="Treo: CD từ chối / FT từ chối (Nhấp số để xem)">
                          Treo
                        </th>
                        <th style={{ width: '150px', textAlign: 'right', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)' }} title="Tồn thực = Tổng - Treo (Nhấp số để xem)">
                          Tồn thực
                        </th>
                        <th style={{ width: '140px', textAlign: 'right', background: 'rgba(16, 185, 129, 0.04)', color: 'var(--success-dark)' }} title="% Tồn thực = (Tồn thực / Tổng ở dòng dưới) * 100">
                          % Tồn thực
                        </th>
                        <th style={{ width: '110px', textAlign: 'center' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAnalyticsByType.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                            Không tìm thấy loại công việc nào khớp với từ khóa tìm kiếm
                          </td>
                        </tr>
                      ) : (
                        filteredAnalyticsByType.map((row, idx) => {
                          const pctTonConLai = totalTongTon > 0 ? ((row.ton_con_lai / totalTongTon) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={row.loai_cong_viec} className="excel-row">
                              <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                              <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                {row.loai_cong_viec}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)' }}>
                                {renderClickableNum({
                                  val: row.tong_ton,
                                  numKey: `t1-tong-${row.loai_cong_viec}`,
                                  title: `Loại việc: "${row.loai_cong_viec}" • Tổng`,
                                  jobType: row.loai_cong_viec,
                                  statusFilter: 'all',
                                  textColor: 'var(--text-primary)'
                                })}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', background: row.so_treo > 0 ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                                {renderClickableNum({
                                  val: row.so_treo,
                                  numKey: `t1-treo-${row.loai_cong_viec}`,
                                  title: `Loại việc: "${row.loai_cong_viec}" • Treo`,
                                  jobType: row.loai_cong_viec,
                                  statusFilter: 'treo',
                                  textColor: 'var(--danger-dark)',
                                  isBadge: true,
                                  badgeClass: 'badge-danger'
                                })}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', background: 'rgba(16, 185, 129, 0.04)' }}>
                                {renderClickableNum({
                                  val: row.ton_con_lai,
                                  numKey: `t1-conlai-${row.loai_cong_viec}`,
                                  title: `Loại việc: "${row.loai_cong_viec}" • Tồn thực`,
                                  jobType: row.loai_cong_viec,
                                  statusFilter: 'con_lai',
                                  textColor: 'var(--success-dark)'
                                })}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', background: 'rgba(16, 185, 129, 0.02)' }} title={`Tỷ lệ chiếm trên tổng ở dưới: ${row.ton_con_lai} / ${totalTongTon} WO`}>
                                <span style={{ 
                                  color: Number(pctTonConLai) > 0 ? 'var(--success-dark)' : 'var(--text-muted)',
                                  fontWeight: Number(pctTonConLai) > 0 ? 800 : 500
                                }}>
                                  {pctTonConLai}%
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className={`btn ${drilldownFilter?.key === `t1-tong-${row.loai_cong_viec}` ? 'btn-primary' : 'btn-outline'}`}
                                  onClick={() => handleNumberClick(`t1-tong-${row.loai_cong_viec}`, `Loại việc: "${row.loai_cong_viec}"`, row.loai_cong_viec, null, 'all', row.tong_ton)}
                                  title={`Xem danh sách ${row.tong_ton} WO của loại "${row.loai_cong_viec}" ở bảng bên dưới`}
                                  style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '3px' }}
                                >
                                  <Eye size={12} /> Xem WO
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)', fontWeight: 800 }}>
                        <td colSpan={2} style={{ textAlign: 'center', letterSpacing: '0.04em' }}>
                          TỔNG CỘNG
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--brand-primary)', background: 'var(--bg-tertiary)' }}>
                          {renderClickableNum({
                            val: totalTongTon,
                            numKey: 't1-foot-tong',
                            title: 'Toàn bộ WO: Tổng',
                            jobType: null,
                            statusFilter: 'all',
                            textColor: 'var(--brand-primary)'
                          })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--danger-dark)', background: 'rgba(239, 68, 68, 0.1)' }}>
                          {renderClickableNum({
                            val: totalSoTreo,
                            numKey: 't1-foot-treo',
                            title: 'Toàn bộ WO: Treo',
                            jobType: null,
                            statusFilter: 'treo',
                            textColor: 'var(--danger-dark)'
                          })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--success-dark)', background: 'rgba(16, 185, 129, 0.1)' }}>
                          {renderClickableNum({
                            val: totalTonConLai,
                            numKey: 't1-foot-conlai',
                            title: 'Toàn bộ WO: Tồn thực',
                            jobType: null,
                            statusFilter: 'con_lai',
                            textColor: 'var(--success-dark)'
                          })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--success-dark)', background: 'rgba(16, 185, 129, 0.08)', fontWeight: 800 }} title={`Tổng còn lại chia cho tổng: ${totalTonConLai} / ${totalTongTon}`}>
                          {overallConLaiRate}%
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {items.length} WO
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* BẢNG 2: THỐNG KÊ CHI TIẾT THEO THÁNG */}
              <div style={{ 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 'var(--radius-md)', 
                padding: '16px 18px',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Calendar size={16} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        2. BẢNG THỐNG KÊ CHI TIẾT THEO THÁNG (CỘT NGANG CHỨA CÁC THÁNG CÓ WO TỒN)
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Tháng lấy theo <strong>Ngày bắt đầu thực hiện</strong>. Thống kê theo <strong>Tồn thực</strong> và <strong>Treo</strong> &bull; Hàng tổng cộng theo tháng ở trên cùng
                      </p>
                    </div>
                  </div>

                  <span className="badge badge-purple" style={{ fontSize: '0.74rem', padding: '3px 10px', fontWeight: 700 }}>
                    {distinctMonths.length} tháng phát sinh tồn
                  </span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ width: '42px', minWidth: '42px', textAlign: 'center', position: 'sticky', left: 0, zIndex: 6, background: 'var(--bg-secondary)' }}>
                          STT
                        </th>
                        <th rowSpan={2} style={{ minWidth: '240px', maxWidth: '300px', textAlign: 'left', position: 'sticky', left: '42px', zIndex: 6, background: 'var(--bg-secondary)' }}>
                          Loại Công Việc
                        </th>
                        
                        {/* Cột ngang chứa các tháng mà có WO tồn */}
                        {distinctMonths.map(m => (
                          <th 
                            key={m} 
                            colSpan={2} 
                            style={{ 
                              textAlign: 'center', 
                              borderLeft: '1.5px solid var(--border-color)', 
                              background: 'var(--bg-tertiary)', 
                              padding: '7px 12px',
                              fontSize: '0.8rem',
                              fontWeight: 800
                            }}
                          >
                            📅 {formatMonthLabel(m)}
                          </th>
                        ))}

                        {/* Cột Tổng Cộng bên phải */}
                        <th 
                          colSpan={2} 
                          style={{ 
                            textAlign: 'center', 
                            borderLeft: '2px solid var(--border-color)', 
                            background: 'rgba(2, 132, 199, 0.12)', 
                            color: 'var(--brand-primary)',
                            padding: '7px 12px',
                            fontSize: '0.82rem',
                            fontWeight: 800
                          }}
                        >
                          TỔNG CỘNG
                        </th>
                      </tr>
                      <tr>
                        {/* Hàng 2: Sub-columns Tồn thực và Treo cho mỗi tháng */}
                        {distinctMonths.map(m => (
                          <React.Fragment key={`sub-${m}`}>
                            <th style={{ textAlign: 'right', borderLeft: '1.5px solid var(--border-color)', width: '80px', minWidth: '75px', fontSize: '0.73rem', background: 'rgba(16, 185, 129, 0.05)', color: 'var(--success-dark)' }} title="Tồn thực (Số lượng WO quá hạn thực tế sau khi trừ treo)">
                              Tồn thực
                            </th>
                            <th style={{ textAlign: 'right', width: '80px', minWidth: '75px', fontSize: '0.73rem', color: 'var(--danger-dark)', background: 'rgba(239, 68, 68, 0.05)' }} title="Treo: CĐ từ chối / FT từ chối">
                              Treo
                            </th>
                          </React.Fragment>
                        ))}
                        <th style={{ textAlign: 'right', borderLeft: '2px solid var(--border-color)', width: '85px', minWidth: '80px', fontSize: '0.74rem', fontWeight: 800, background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-dark)' }} title="Tổng Tồn thực">
                          Tồn thực
                        </th>
                        <th style={{ textAlign: 'right', width: '85px', minWidth: '80px', fontSize: '0.74rem', fontWeight: 800, color: 'var(--danger-dark)', background: 'rgba(239, 68, 68, 0.08)' }} title="Tổng Treo">
                          Treo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* =========================================================
                          HÀNG TỔNG CỘNG THEO THÁNG (ĐƯA LÊN TRÊN CÙNG THEO YÊU CẦU)
                          ========================================================= */}
                      <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2.5px solid var(--border-color)', fontWeight: 800 }}>
                        <td colSpan={2} style={{ textAlign: 'center', letterSpacing: '0.04em', position: 'sticky', left: 0, zIndex: 6, background: 'var(--bg-tertiary)', fontSize: '0.84rem', color: 'var(--brand-primary)', padding: '8px 12px' }}>
                          ⭐ TỔNG CỘNG THEO THÁNG
                        </td>
                        {distinctMonths.map(m => {
                          const mTot = monthlyMatrix.monthTotals[m] || { so_ton: 0, so_treo: 0, ton_thuc: 0 };
                          return (
                            <React.Fragment key={`top-${m}`}>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', borderLeft: '1.5px solid var(--border-color)', fontSize: '0.88rem', background: 'rgba(16, 185, 129, 0.06)' }}>
                                {renderClickableNum({
                                  val: mTot.ton_thuc || 0,
                                  numKey: `t2-top-mtonthuc-${m}`,
                                  title: `Tất cả loại việc • ${formatMonthLabel(m)} • Tồn thực`,
                                  jobType: null,
                                  monthKey: m,
                                  statusFilter: 'con_lai',
                                  textColor: 'var(--success-dark)'
                                })}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.88rem', background: 'rgba(239, 68, 68, 0.08)' }}>
                                {renderClickableNum({
                                  val: mTot.so_treo || 0,
                                  numKey: `t2-top-mtreo-${m}`,
                                  title: `Tất cả loại việc • ${formatMonthLabel(m)} • Treo`,
                                  jobType: null,
                                  monthKey: m,
                                  statusFilter: 'treo',
                                  textColor: 'var(--danger-dark)',
                                  isBadge: true,
                                  badgeClass: 'badge-danger'
                                })}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', borderLeft: '2px solid var(--border-color)', color: 'var(--success-dark)', background: 'rgba(16, 185, 129, 0.12)' }}>
                          {renderClickableNum({
                            val: totalTonConLai,
                            numKey: 't2-top-tot-ton-thuc',
                            title: 'Toàn bộ WO: Tồn thực',
                            jobType: null,
                            statusFilter: 'con_lai',
                            textColor: 'var(--success-dark)'
                          })}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--danger-dark)', background: 'rgba(239, 68, 68, 0.12)' }}>
                          {renderClickableNum({
                            val: totalSoTreo,
                            numKey: 't2-top-tot-treo',
                            title: 'Toàn bộ WO: Treo',
                            jobType: null,
                            statusFilter: 'treo',
                            textColor: 'var(--danger-dark)',
                            isBadge: true,
                            badgeClass: 'badge-danger'
                          })}
                        </td>
                      </tr>

                      {/* CÁC DÒNG TỪNG LOẠI CÔNG VIỆC */}
                      {filteredMonthlyRows.length === 0 ? (
                        <tr>
                          <td colSpan={2 + distinctMonths.length * 2 + 2} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                            Không có dữ liệu phân tích theo tháng
                          </td>
                        </tr>
                      ) : (
                        filteredMonthlyRows.map((row, idx) => (
                          <tr key={row.loai_cong_viec} className="excel-row">
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)', position: 'sticky', left: 0, zIndex: 5, background: 'var(--bg-secondary)' }}>
                              {idx + 1}
                            </td>
                            <td 
                              style={{ 
                                fontWeight: 700, 
                                color: 'var(--text-primary)', 
                                position: 'sticky', 
                                left: '42px', 
                                zIndex: 5, 
                                background: 'var(--bg-secondary)',
                                minWidth: '240px',
                                maxWidth: '300px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={row.loai_cong_viec}
                            >
                              {row.loai_cong_viec}
                            </td>
                            
                            {/* Dữ liệu từng tháng: Tồn thực và Treo */}
                            {distinctMonths.map(m => {
                              const cell = row.by_month[m] || { so_ton: 0, so_treo: 0, ton_thuc: 0 };
                              return (
                                <React.Fragment key={m}>
                                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', borderLeft: '1.5px solid var(--border-color)', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.02)' }}>
                                    {renderClickableNum({
                                      val: cell.ton_thuc || 0,
                                      numKey: `t2-mtonthuc-${row.loai_cong_viec}-${m}`,
                                      title: `Loại: "${row.loai_cong_viec}" • ${formatMonthLabel(m)} • Tồn thực`,
                                      jobType: row.loai_cong_viec,
                                      monthKey: m,
                                      statusFilter: 'con_lai',
                                      textColor: 'var(--success-dark)'
                                    })}
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: cell.so_treo > 0 ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                                    {renderClickableNum({
                                      val: cell.so_treo || 0,
                                      numKey: `t2-mtreo-${row.loai_cong_viec}-${m}`,
                                      title: `Loại: "${row.loai_cong_viec}" • ${formatMonthLabel(m)} • Treo`,
                                      jobType: row.loai_cong_viec,
                                      monthKey: m,
                                      statusFilter: 'treo',
                                      textColor: 'var(--danger-dark)',
                                      isBadge: true,
                                      badgeClass: 'badge-danger'
                                    })}
                                  </td>
                                </React.Fragment>
                              );
                            })}

                            {/* Cột Tổng cho từng dòng: Tồn thực và Treo */}
                            <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', borderLeft: '2px solid var(--border-color)', background: 'rgba(16, 185, 129, 0.04)', fontSize: '0.84rem' }}>
                              {renderClickableNum({
                                val: row.total_con_lai,
                                numKey: `t2-row-tonthuc-${row.loai_cong_viec}`,
                                title: `Loại: "${row.loai_cong_viec}" • Tồn thực`,
                                jobType: row.loai_cong_viec,
                                statusFilter: 'con_lai',
                                textColor: 'var(--success-dark)'
                              })}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', background: 'rgba(239, 68, 68, 0.08)', fontSize: '0.84rem' }}>
                              {renderClickableNum({
                                val: row.total_treo,
                                numKey: `t2-row-treo-${row.loai_cong_viec}`,
                                title: `Loại: "${row.loai_cong_viec}" • Treo`,
                                jobType: row.loai_cong_viec,
                                statusFilter: 'treo',
                                textColor: 'var(--danger-dark)',
                                isBadge: true,
                                badgeClass: 'badge-danger'
                              })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* =========================================================
                  BẢNG 3: DANH SÁCH CHI TIẾT CÁC CÔNG VIỆC ĐƯỢC CHỌN (KHI ẤN VÀO SỐ)
                  ========================================================= */}
              {drilldownFilter ? (
                <div 
                  ref={drilldownSectionRef}
                  style={{ 
                    background: 'var(--bg-secondary)', 
                    border: '2px solid var(--brand-primary)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '16px 18px',
                    boxShadow: 'var(--shadow-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  {/* Header của Bảng Chi Tiết Được Chọn */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'rgba(2, 132, 199, 0.15)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileSpreadsheet size={18} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          3. DANH SÁCH CHI TIẾT CÔNG VIỆC THEO SỐ LIỆU ĐÃ CHỌN
                          <span className="badge badge-info" style={{ fontSize: '0.76rem', fontWeight: 800, padding: '2px 8px' }}>
                            {sortedDrilldownTasks.length} / {drilldownTasks.length} WO
                          </span>
                        </h4>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                          Đang lọc: {drilldownFilter.title}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Nút Mở Toàn Màn Hình */}
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleOpenInMainList}
                        title="Chuyển sang chế độ xem toàn màn hình danh sách chính"
                        style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px', borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}
                      >
                        <ExternalLink size={14} /> Mở Toàn Màn Hình
                      </button>

                      {/* Nút Xuất Excel riêng cho nhóm này */}
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleExportDrilldownTasksCSV}
                        disabled={!sortedDrilldownTasks.length}
                        title="Xuất riêng danh sách các WO này ra file Excel CSV"
                        style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}
                      >
                        <Download size={14} /> Xuất Excel ({sortedDrilldownTasks.length})
                      </button>

                      {/* Nút Đóng danh sách */}
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setDrilldownFilter(null)}
                        title="Đóng bảng danh sách chi tiết này"
                        style={{ padding: '5px 10px', fontSize: '0.78rem', gap: '4px' }}
                      >
                        <X size={15} /> Đóng
                      </button>
                    </div>
                  </div>

                  {/* Toolbar tìm kiếm nhanh trong nhóm này */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                    <div className="search-input-box" style={{ maxWidth: '400px', flex: 1 }}>
                      <Search size={14} className="search-icon" />
                      <input
                        type="text"
                        placeholder="Tìm theo mã việc, trạm, nội dung, nhân viên trong nhóm này..."
                        value={drilldownSearchTerm}
                        onChange={(e) => setDrilldownSearchTerm(e.target.value)}
                        style={{ padding: '4px 10px 4px 30px', fontSize: '0.8rem', height: '30px' }}
                      />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      * Nhấp tiêu đề cột để sắp xếp &bull; Nhấp nút "Chi tiết" ở cuối dòng để xem lịch sử / ghi chú
                    </div>
                  </div>

                  {/* Table rendered */}
                  <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                    <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>STT</th>
                          <th onClick={() => handleDrilldownSort('latest_note')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '130px' }}>
                            Ghi chú {renderDrilldownSortIndicator('latest_note')}
                          </th>
                          <th onClick={() => handleDrilldownSort('ma_cong_viec')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '120px' }}>
                            Mã công việc {renderDrilldownSortIndicator('ma_cong_viec')}
                          </th>
                          <th onClick={() => handleDrilldownSort('station_code')} style={{ cursor: 'pointer', textAlign: 'left', width: '85px' }}>
                            Mã trạm {renderDrilldownSortIndicator('station_code')}
                          </th>
                          <th onClick={() => handleDrilldownSort('loai_cong_viec')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '150px' }}>
                            Loại công việc {renderDrilldownSortIndicator('loai_cong_viec')}
                          </th>
                          <th onClick={() => handleDrilldownSort('noi_dung_cong_viec')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '220px' }}>
                            Nội dung công việc {renderDrilldownSortIndicator('noi_dung_cong_viec')}
                          </th>
                          <th onClick={() => handleDrilldownSort('ghi_chu')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '180px' }}>
                            Mô tả {renderDrilldownSortIndicator('ghi_chu')}
                          </th>
                          <th onClick={() => handleDrilldownSort('trang_thai')} style={{ cursor: 'pointer', textAlign: 'center', width: '100px' }}>
                            Trạng thái {renderDrilldownSortIndicator('trang_thai')}
                          </th>
                          <th onClick={() => handleDrilldownSort('group_name')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '120px' }}>
                            Nhóm điều phối {renderDrilldownSortIndicator('group_name')}
                          </th>
                          <th onClick={() => handleDrilldownSort('employee_assigned_name')} style={{ cursor: 'pointer', textAlign: 'left', minWidth: '140px' }}>
                            Nhân viên {renderDrilldownSortIndicator('employee_assigned_name')}
                          </th>
                          <th onClick={() => handleDrilldownSort('thoi_diem_bat_dau_thuc_hien')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                            Bắt đầu TH {renderDrilldownSortIndicator('thoi_diem_bat_dau_thuc_hien')}
                          </th>
                          <th onClick={() => handleDrilldownSort('thoi_diem_yeu_cau_ket_thuc')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                            Yêu cầu KT {renderDrilldownSortIndicator('thoi_diem_yeu_cau_ket_thuc')}
                          </th>
                          <th onClick={() => handleDrilldownSort('thoi_gian_con_lai')} style={{ cursor: 'pointer', textAlign: 'right', width: '90px' }}>
                            Còn lại (H) {renderDrilldownSortIndicator('thoi_gian_con_lai')}
                          </th>
                          <th style={{ textAlign: 'center', width: '80px' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDrilldownTasks.length === 0 ? (
                          <tr>
                            <td colSpan={14} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                              Không có công việc nào phù hợp với bộ lọc
                            </td>
                          </tr>
                        ) : (
                          sortedDrilldownTasks.map((t, idx) => {
                            const isOverdue = t.thoi_gian_con_lai != null && Number(t.thoi_gian_con_lai) <= 0;
                            return (
                              <tr key={t.task_id || t.ma_cong_viec || idx} className="excel-row">
                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.latest_note || ''}>
                                  {t.latest_note ? (
                                    <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>{t.latest_note}</span>
                                  ) : <span style={{ opacity: 0.35 }}>--</span>}
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }} title={t.ma_cong_viec}>
                                  {t.ma_cong_viec || '--'}
                                </td>
                                <td title={t.station_code || '--'}>
                                  {t.station_code ? (
                                    <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>{t.station_code}</span>
                                  ) : '--'}
                                </td>
                                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.loai_cong_viec}>
                                  {t.loai_cong_viec || '--'}
                                </td>
                                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.noi_dung_cong_viec}>
                                  {t.noi_dung_cong_viec || '--'}
                                </td>
                                <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.ghi_chu}>
                                  {t.ghi_chu || <span style={{ opacity: 0.35 }}>--</span>}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`badge ${getStatusBadgeClass(t.trang_thai)}`} style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
                                    {t.trang_thai || '--'}
                                  </span>
                                </td>
                                <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.group_name}>
                                  {t.group_name ? formatGroupName(t.group_name) : <span style={{ color: 'var(--text-muted)' }}>Chưa phân nhóm</span>}
                                </td>
                                <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.employee_assigned_name}>
                                  <strong style={{ color: isOverdue ? 'var(--danger-dark)' : (t.employee_assigned_name ? 'var(--text-primary)' : 'var(--text-muted)') }}>
                                    {t.employee_assigned_name || 'Chưa gán'}
                                  </strong>
                                </td>
                                <td className="cell-num" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                  {formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}
                                </td>
                                <td className="cell-num" style={{ fontSize: '0.78rem', color: isOverdue ? 'var(--danger-dark)' : 'var(--text-primary)', fontWeight: isOverdue ? 700 : 500 }}>
                                  {formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}
                                </td>
                                <td className="cell-num" style={{ color: isOverdue ? 'var(--danger-dark)' : 'var(--text-primary)', background: isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'transparent', fontWeight: 700 }}>
                                  {t.thoi_gian_con_lai != null ? t.thoi_gian_con_lai : '--'}
                                </td>
                                <td style={{ textAlign: 'center', padding: '2px 6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => onSelectTask && onSelectTask(t)}
                                    title="Xem chi tiết công việc"
                                    style={{ padding: '2px 7px', fontSize: '0.72rem', gap: '3px', height: '24px', borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}
                                  >
                                    <Eye size={12} /> Chi tiết
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
              ) : (
                <div style={{
                  background: 'rgba(2, 132, 199, 0.05)',
                  border: '1.5px dashed rgba(2, 132, 199, 0.35)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(2, 132, 199, 0.15)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MousePointerClick size={18} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                        Mẹo xem chi tiết WO: Nhấp trực tiếp vào bất kỳ con số nào trong Bảng 1 hoặc Bảng 2
                      </strong>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        Bảng danh sách chi tiết sẽ mở ngay tại đây với đúng bộ lọc bạn chọn (theo loại công việc, trạng thái treo / tồn còn lại, hoặc theo từng tháng).
                      </p>
                    </div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '3px 10px', fontWeight: 700 }}>
                    Tương tác 1-Click
                  </span>
                </div>
              )}

            </div>
          ) : (
            /* =========================================================
               CHẾ ĐỘ DANH SÁCH CHI TIẾT TỪNG WO (LIST VIEW HIỆN CÓ)
               ========================================================= */
            <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: '38px', minWidth: '38px', whiteSpace: 'nowrap' }}>STT</th>
                  
                  <th 
                    onClick={() => handleSort('latest_note')}
                    style={{ width: '160px', minWidth: '140px', maxWidth: '220px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Ghi chú"
                  >
                    Ghi chú {renderSortIndicator('latest_note')}
                  </th>

                  <th 
                    onClick={() => handleSort('ma_cong_viec')}
                    style={{ width: '130px', minWidth: '130px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mã công việc"
                  >
                    Mã công việc {renderSortIndicator('ma_cong_viec')}
                  </th>

                  <th 
                    onClick={() => handleSort('station_code')}
                    style={{ width: '85px', minWidth: '85px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mã trạm"
                  >
                    Mã trạm {renderSortIndicator('station_code')}
                  </th>

                  <th 
                    onClick={() => handleSort('loai_cong_viec')}
                    style={{ width: '170px', minWidth: '150px', maxWidth: '200px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Loại công việc"
                  >
                    Loại công việc {renderSortIndicator('loai_cong_viec')}
                  </th>

                  <th 
                    onClick={() => handleSort('noi_dung_cong_viec')}
                    style={{ minWidth: '220px', maxWidth: '320px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nội dung công việc"
                  >
                    Nội dung công việc {renderSortIndicator('noi_dung_cong_viec')}
                  </th>

                  <th 
                    onClick={() => handleSort('ghi_chu')}
                    style={{ minWidth: '180px', maxWidth: '300px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Mô tả"
                  >
                    Mô tả {renderSortIndicator('ghi_chu')}
                  </th>

                  <th 
                    onClick={() => handleSort('trang_thai')}
                    style={{ width: '100px', minWidth: '95px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Trạng thái"
                  >
                    Trạng thái {renderSortIndicator('trang_thai')}
                  </th>

                  <th 
                    onClick={() => handleSort('group_name')}
                    style={{ width: '130px', minWidth: '120px', maxWidth: '160px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nhóm điều phối"
                  >
                    Nhóm điều phối {renderSortIndicator('group_name')}
                  </th>

                  <th 
                    onClick={() => handleSort('employee_assigned_name')}
                    style={{ width: '140px', minWidth: '130px', maxWidth: '170px', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Nhân viên"
                  >
                    Nhân viên {renderSortIndicator('employee_assigned_name')}
                  </th>

                  <th 
                    onClick={() => handleSort('thoi_diem_bat_dau_thuc_hien')}
                    style={{ width: '140px', minWidth: '135px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Bắt đầu thực hiện"
                  >
                    Bắt đầu thực hiện {renderSortIndicator('thoi_diem_bat_dau_thuc_hien')}
                  </th>

                  <th 
                    onClick={() => handleSort('thoi_diem_yeu_cau_ket_thuc')}
                    style={{ width: '140px', minWidth: '135px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Yêu cầu kết thúc"
                  >
                    Yêu cầu kết thúc {renderSortIndicator('thoi_diem_yeu_cau_ket_thuc')}
                  </th>

                  <th 
                    onClick={() => handleSort('thoi_gian_con_lai')}
                    style={{ width: '95px', minWidth: '95px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                    title="Nhấn để sắp xếp theo Thời gian còn lại"
                  >
                    Thời gian còn lại (H) {renderSortIndicator('thoi_gian_con_lai')}
                  </th>

                  <th style={{ width: '90px', minWidth: '90px', whiteSpace: 'nowrap', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t, idx) => {
                  const isOverdue = t.thoi_gian_con_lai < 0;
                  const stt = idx + 1;
                  return (
                    <tr 
                      key={t.ma_cong_viec} 
                      className="excel-row"
                      style={{
                        background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                      }}
                    >
                      {/* 1. STT */}
                      <td className="cell-num" style={{ width: '38px', color: 'var(--text-muted)' }}>
                        {stt}
                      </td>

                      {/* Ghi chú */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '180px',
                          color: t.latest_note ? 'var(--text-primary)' : 'var(--text-muted)',
                          fontStyle: t.latest_note ? 'normal' : 'italic',
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                        title={t.latest_note ? `Ghi chú: ${t.latest_note}` : 'Chưa có ghi chú (Nhấn để xem/thêm ghi chú)'}
                        onClick={() => onSelectTask && onSelectTask(t)}
                      >
                        {t.latest_note ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--brand-primary)', fontSize: '11px' }}>📝</span>
                            <span>{t.latest_note}</span>
                          </span>
                        ) : (
                          <span style={{ opacity: 0.4 }}>--</span>
                        )}
                      </td>

                      {/* 2. Mã công việc */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          fontWeight: 700, 
                          fontFamily: 'var(--font-mono)', 
                          color: isOverdue ? 'var(--danger-dark)' : 'var(--brand-primary)',
                          cursor: 'pointer'
                        }}
                        title={t.ma_cong_viec}
                        onClick={() => onSelectTask && onSelectTask(t)}
                      >
                        {t.ma_cong_viec}
                      </td>

                      {/* 2.5 Mã trạm */}
                      <td 
                        className="cell-num" 
                        style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                        title={t.station_code || '--'}
                      >
                        {t.station_code ? (
                          <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>
                            {t.station_code}
                          </span>
                        ) : '--'}
                      </td>

                      {/* 3. Loại công việc */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '200px' 
                        }}
                        title={t.loai_cong_viec || '--'}
                      >
                        {t.loai_cong_viec || '--'}
                      </td>

                      {/* 4. Nội dung công việc */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '320px',
                          color: 'var(--text-secondary)'
                        }}
                        title={t.noi_dung_cong_viec || '(Không có nội dung)'}
                      >
                        {t.noi_dung_cong_viec || '(Không có nội dung)'}
                      </td>

                      {/* 4.5 Mô tả */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '300px',
                          color: 'var(--text-secondary)'
                        }}
                        title={t.ghi_chu || '(Không có mô tả)'}
                      >
                        {t.ghi_chu || <span style={{ opacity: 0.35 }}>--</span>}
                      </td>

                      {/* 5. Trạng thái */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={t.trang_thai || '--'}>
                        <span className={`badge ${getStatusBadgeClass(t.trang_thai)}`} style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
                          {t.trang_thai || '--'}
                        </span>
                      </td>

                      {/* 6. Nhóm điều phối */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '160px' 
                        }}
                        title={t.group_name || 'Chưa phân nhóm'}
                      >
                        {t.group_name ? formatGroupName(t.group_name) : <span style={{ color: 'var(--text-muted)' }}>Chưa phân nhóm</span>}
                      </td>

                      {/* 7. Nhân viên thực hiện */}
                      <td 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          maxWidth: '170px' 
                        }}
                        title={t.employee_assigned_name || 'Chưa gán'}
                      >
                        <strong style={{ color: isOverdue ? 'var(--danger-dark)' : (t.employee_assigned_name ? 'var(--text-primary)' : 'var(--text-muted)') }}>
                          {t.employee_assigned_name || 'Chưa gán'}
                        </strong>
                      </td>

                      {/* 8. Thời điểm bắt đầu thực hiện */}
                      <td 
                        className="cell-num" 
                        style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
                        title={formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}
                      >
                        {formatDateTime(t.thoi_diem_bat_dau_thuc_hien)}
                      </td>

                      {/* 9. Thời điểm yêu cầu kết thúc */}
                      <td 
                        className="cell-num" 
                        style={{ 
                          whiteSpace: 'nowrap', 
                          fontSize: '0.82rem',
                          color: isOverdue ? 'var(--danger-dark)' : 'var(--text-primary)',
                          fontWeight: isOverdue ? 700 : 500
                        }}
                        title={formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}
                      >
                        {formatDateTime(t.thoi_diem_yeu_cau_ket_thuc)}
                      </td>

                      {/* 10. Thời gian còn lại (H) */}
                      <td 
                        className="cell-num" 
                        style={{ 
                          whiteSpace: 'nowrap',
                          color: isOverdue ? 'var(--danger-dark)' : 'var(--text-primary)',
                          background: isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                          fontWeight: 700
                        }}
                        title={t.thoi_gian_con_lai != null ? `${t.thoi_gian_con_lai} giờ` : '--'}
                      >
                        {t.thoi_gian_con_lai != null ? t.thoi_gian_con_lai : '--'}
                      </td>

                      {/* 12. Thao tác */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '2.5px 6px' }}>
                        <button
                          className="btn btn-outline"
                          onClick={() => onSelectTask && onSelectTask(t)}
                          title="Xem chi tiết, lịch sử và ghi chú công việc"
                          style={{
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            gap: '3px',
                            height: '24px',
                            borderColor: 'var(--brand-primary)',
                            color: 'var(--brand-primary)'
                          }}
                        >
                          <Eye size={12} /> Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer: Total & Count Summary */}
        <div 
          style={{ 
            padding: '10px 20px', 
            background: 'var(--bg-secondary)', 
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          {viewMode === 'analytics' ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Phân tích:</span>
              <strong style={{ color: 'var(--brand-primary)', fontSize: '0.98rem', fontFamily: 'var(--font-mono)' }}>
                {totalTongTon.toLocaleString()}
              </strong>
              <span>công việc (Treo: <strong style={{ color: 'var(--danger-dark)' }}>{totalSoTreo.toLocaleString()}</strong> | Tồn thực: <strong style={{ color: 'var(--success-dark)' }}>{totalTonConLai.toLocaleString()}</strong>)</span>
              <span className="badge badge-purple" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 700 }}>
                📊 Chế độ Phân Tích Sâu
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Tổng cộng:</span>
              <strong style={{ color: 'var(--brand-primary)', fontSize: '0.98rem', fontFamily: 'var(--font-mono)' }}>
                {total.toLocaleString()}
              </strong>
              <span>công việc</span>
              <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 700 }}>
                Đang hiển thị toàn bộ ({items.length.toLocaleString()})
              </span>
            </div>
          )}

          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {viewMode === 'analytics' ? (
              analyticsJobSearch ? `(Đang lọc loại việc: "${analyticsJobSearch}")` : '* Bảng 2 hiển thị các tháng có WO tồn theo ngày BĐ thực hiện'
            ) : (
              searchTerm ? `(Đang lọc tìm kiếm: "${searchTerm}")` : '* Cuộn danh sách để xem toàn bộ công việc'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
