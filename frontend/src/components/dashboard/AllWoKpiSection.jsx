import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Eye,
  ArrowUpDown,
  Calculator
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fixedWoApi } from '../../api/fixedWoApi';
import { statsApi } from '../../api/statsApi';

/**
 * Tính điểm KPI VHKT theo All-WO:
 * - Dải điểm quy định: [0.80, 1.20]
 * - Chỉ áp dụng đối với nhân sự có > 30 WO (loại bỏ hoàn toàn người <= 30 WO khỏi bảng)
 * - Khối lượng < 125 WO:
 *     + Điểm tính theo tỷ lệ đúng hạn (onTime / total), không trừ thẳng về 0.80.
 *     + Tối đa 1.00 (khi 100% đúng hạn).
 *     + Tối thiểu chạm mức sàn 0.80 (khi tỷ lệ đúng hạn <= 80%).
 * - Khối lượng >= 125 WO:
 *     + Cần tối thiểu 125 WO đúng hạn (đạt 1.00 điểm cơ sở).
 *     + onTime >= 125: Giảm áp lực phạt quá hạn do quá tải, cộng điểm khuyến khích lũy tiến lên đến 1.20
 *       (mỗi WO đúng hạn vượt mốc 125 cộng +0.004).
 *     + onTime < 125: Giảm nhẹ áp lực phạt, tính tỷ lệ theo mức độ hoàn thành chỉ tiêu 125 đúng hạn (0.80 - 1.00).
 */
export function calculateVhktKpi(emp) {
  const total = Number(emp.total ?? emp.total_wos ?? 0);
  const overdue = Number(emp.overdue ?? emp.overdue_wos ?? 0);
  const closed = Number(emp.closed ?? emp.closed_wos ?? 0);
  const pending = Number(emp.pending ?? emp.pending_wos ?? 0);
  const onTime = Math.max(0, total - overdue);
  const onTimeRate = total > 0 ? (onTime / total) * 100 : 0;

  // Loại nhân sự <= 30 WO
  if (total <= 30) {
    return {
      eligible: false,
      kpiScore: null,
      displayScore: '--',
      total,
      onTime,
      overdue,
      closed,
      pending,
      onTimeRate,
    };
  }

  // 1. Khối lượng thấp: 31 đến 124 WO
  if (total < 125) {
    const rawRatio = total > 0 ? onTime / total : 0;
    const score = Math.max(0.80, Math.min(1.00, rawRatio));
    const roundedScore = Number(score.toFixed(2));

    return {
      eligible: true,
      kpiScore: roundedScore,
      displayScore: roundedScore.toFixed(2),
      isExcellent: false,
      isStandard: roundedScore === 1.00,
      isBelow: roundedScore < 1.00,
      total,
      onTime,
      overdue,
      closed,
      pending,
      onTimeRate,
    };
  }

  // 2. Khối lượng lớn: >= 125 WO
  if (onTime >= 125) {
    const extraOnTime = onTime - 125;
    const bonus = Math.min(0.20, extraOnTime * 0.004);
    const score = Math.min(1.20, Math.max(1.00, 1.00 + bonus));
    const roundedScore = Number(score.toFixed(2));

    return {
      eligible: true,
      kpiScore: roundedScore,
      displayScore: roundedScore.toFixed(2),
      isExcellent: roundedScore > 1.00,
      isStandard: roundedScore === 1.00,
      isBelow: false,
      total,
      onTime,
      overdue,
      closed,
      pending,
      onTimeRate,
    };
  } else {
    const ratio = onTime / 125;
    const score = Math.max(0.80, 0.80 + ratio * 0.20);
    const roundedScore = Number(score.toFixed(2));

    return {
      eligible: true,
      kpiScore: roundedScore,
      displayScore: roundedScore.toFixed(2),
      isExcellent: false,
      isStandard: false,
      isBelow: true,
      total,
      onTime,
      overdue,
      closed,
      pending,
      onTimeRate,
    };
  }
}

export default function AllWoKpiSection({
  fixedWoReports = [],
  reportCategories = [],
  excludeTuChoi = false,
  onOpenDrilldown = null,
}) {
  // Left Table States
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('kpi_desc'); // kpi_desc | kpi_asc | total_desc | ontime_desc | overdue_desc | name_asc
  const [showFormula, setShowFormula] = useState(false);

  // Right Table States (Placeholder KPI cập nhật sau)
  const [rightSearchTerm, setRightSearchTerm] = useState('');
  const [rightSortBy, setRightSortBy] = useState('name_asc');

  // 1. Tự động tìm báo cáo All-WO mục tiêu
  const defaultTarget = useMemo(() => {
    const fixedAllWo = fixedWoReports.find(r => r.name?.toLowerCase().includes('all-wo') || r.name?.toLowerCase().includes('all_wo'));
    if (fixedAllWo) return { type: 'fixed', id: fixedAllWo.id, name: fixedAllWo.name, report: fixedAllWo };

    const catAllWo = reportCategories.find(c => c.name?.toLowerCase().includes('all-wo') || c.name?.toLowerCase().includes('all_wo'));
    if (catAllWo) return { type: 'category', id: catAllWo.id, name: catAllWo.name, category: catAllWo };

    if (fixedWoReports.length > 0) return { type: 'fixed', id: fixedWoReports[0].id, name: fixedWoReports[0].name, report: fixedWoReports[0] };
    if (reportCategories.length > 0) return { type: 'category', id: reportCategories[0].id, name: reportCategories[0].name, category: reportCategories[0] };
    return null;
  }, [fixedWoReports, reportCategories]);

  const [selectedReportKey, setSelectedReportKey] = useState(null);

  const activeTarget = useMemo(() => {
    if (selectedReportKey) {
      const [type, idStr] = selectedReportKey.split(':');
      const id = Number(idStr);
      if (type === 'fixed') {
        const found = fixedWoReports.find(r => r.id === id);
        if (found) return { type: 'fixed', id, name: found.name, report: found };
      } else if (type === 'cat') {
        const found = reportCategories.find(c => c.id === id);
        if (found) return { type: 'category', id, name: found.name, category: found };
      }
    }
    return defaultTarget;
  }, [selectedReportKey, defaultTarget, fixedWoReports, reportCategories]);

  // Fetch dữ liệu thống kê
  const isFixed = activeTarget?.type === 'fixed';
  const reportId = isFixed ? activeTarget?.id : null;
  const categoryTaskType = !isFixed ? activeTarget?.category?.loai_cong_viec : null;

  const { data: fixedStats, isLoading: loadingFixed } = useQuery({
    queryKey: ['kpi-vhkt-fixed-stats', reportId, excludeTuChoi],
    queryFn: () => fixedWoApi.getStats(reportId, { exclude_tu_choi: excludeTuChoi }),
    enabled: Boolean(reportId && isFixed),
  });

  const { data: catStats, isLoading: loadingCat } = useQuery({
    queryKey: ['kpi-vhkt-cat-stats', categoryTaskType, excludeTuChoi],
    queryFn: () => statsApi.getMaintenanceSpecial({ task_type: categoryTaskType, exclude_tu_choi: excludeTuChoi }),
    enabled: Boolean(categoryTaskType && !isFixed),
  });

  const isLoading = isFixed ? loadingFixed : loadingCat;
  const rawEmployeeList = isFixed ? (fixedStats?.by_employee || []) : (catStats?.by_employee || []);

  // Tính toán KPI & LỌC BỎ HOÀN TOÀN NHÂN SỰ <= 30 WO
  const eligibleEmployees = useMemo(() => {
    return rawEmployeeList
      .map(emp => {
        const kpi = calculateVhktKpi(emp);
        return {
          ...emp,
          kpi,
        };
      })
      .filter(emp => emp.kpi.eligible); // Chỉ lấy người có > 30 WO
  }, [rawEmployeeList]);

  // Thống kê nhanh Left Table
  const summary = useMemo(() => {
    const total = eligibleEmployees.length;
    const excellent = eligibleEmployees.filter(e => e.kpi.kpiScore > 1.00).length;
    const standard = eligibleEmployees.filter(e => e.kpi.kpiScore === 1.00).length;
    const below = eligibleEmployees.filter(e => e.kpi.kpiScore < 1.00).length;
    const avg = total > 0
      ? (eligibleEmployees.reduce((sum, e) => sum + (e.kpi.kpiScore || 0), 0) / total).toFixed(2)
      : '0.00';

    return { total, excellent, standard, below, avg };
  }, [eligibleEmployees]);

  // Lọc tìm kiếm & Sắp xếp Left Table
  const filteredList = useMemo(() => {
    return eligibleEmployees
      .filter(item => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (item.key_name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'kpi_desc') {
          if (b.kpi.kpiScore !== a.kpi.kpiScore) return b.kpi.kpiScore - a.kpi.kpiScore;
          return b.kpi.total - a.kpi.total;
        }
        if (sortBy === 'kpi_asc') {
          if (a.kpi.kpiScore !== b.kpi.kpiScore) return a.kpi.kpiScore - b.kpi.kpiScore;
          return a.kpi.total - b.kpi.total;
        }
        if (sortBy === 'total_desc') return b.kpi.total - a.kpi.total;
        if (sortBy === 'ontime_desc') return b.kpi.onTime - a.kpi.onTime;
        if (sortBy === 'overdue_desc') return b.kpi.overdue - a.kpi.overdue;
        if (sortBy === 'name_asc') return (a.key_name || '').localeCompare(b.key_name || '');
        return 0;
      });
  }, [eligibleEmployees, searchTerm, sortBy]);

  // Lọc tìm kiếm & Sắp xếp Right Table (Placeholder)
  const filteredRightList = useMemo(() => {
    return eligibleEmployees
      .filter(item => {
        if (!rightSearchTerm.trim()) return true;
        const q = rightSearchTerm.toLowerCase();
        return (item.key_name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (rightSortBy === 'name_asc') return (a.key_name || '').localeCompare(b.key_name || '');
        if (rightSortBy === 'name_desc') return (b.key_name || '').localeCompare(a.key_name || '');
        return 0;
      });
  }, [eligibleEmployees, rightSearchTerm, rightSortBy]);

  // Xuất CSV Left Table
  const handleExportCsv = () => {
    if (!filteredList.length) return;
    const headers = ['STT', 'Nhân viên', 'Tổng WO', 'Đúng hạn', 'Quá hạn', 'Tỷ lệ đúng hạn (%)', 'Điểm KPI (Tham khảo)'];
    const rows = filteredList.map((e, idx) => [
      idx + 1,
      `"${e.key_name || ''}"`,
      e.kpi.total,
      e.kpi.onTime,
      e.kpi.overdue,
      `${e.kpi.onTimeRate.toFixed(1)}%`,
      e.kpi.displayScore
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bang_KPI_VHKT_${activeTarget?.name || 'All_WO'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Xuất CSV Right Table
  const handleExportRightCsv = () => {
    if (!filteredRightList.length) return;
    const headers = ['STT', 'Nhân viên', 'Tổng WO', 'Đúng hạn', 'Quá hạn', 'Tỷ lệ đúng hạn (%)', 'Điểm KPI'];
    const rows = filteredRightList.map((e, idx) => [
      idx + 1,
      `"${e.key_name || ''}"`,
      0,
      0,
      0,
      '0.0%',
      '0.00'
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Bang_KPI_VHKT_ChinhThuc.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: '14px',
        marginBottom: '20px',
        width: '100%',
        alignItems: 'start'
      }}
    >
      {/* ============================================================ */}
      {/* BẢNG 1 (BÊN TRÁI): BẢNG TÍNH KPI VHKT (THEO ALL-WO)          */}
      {/* ============================================================ */}
      <div
        className="card"
        style={{
          padding: '12px 14px',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          background: '#ffffff',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Header Bảng 1 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '10px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              BẢNG TÍNH KPI VHKT (ALL-WO)
            </h3>
            <span
              className="badge badge-warning"
              style={{ fontSize: '0.64rem', padding: '1px 5px', fontWeight: 700 }}
            >
              ⭐ Tham khảo
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            {/* Chọn nguồn báo cáo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Nguồn:</span>
              <select
                className="select-input"
                style={{ fontSize: '0.7rem', padding: '2px 5px', borderRadius: 'var(--radius-sm)', maxWidth: '140px' }}
                value={selectedReportKey || (activeTarget?.type === 'fixed' ? `fixed:${activeTarget.id}` : `cat:${activeTarget?.id}`)}
                onChange={(e) => setSelectedReportKey(e.target.value)}
              >
                {fixedWoReports.map(r => (
                  <option key={`fixed:${r.id}`} value={`fixed:${r.id}`}>
                    {r.name}
                  </option>
                ))}
                {reportCategories.map(c => (
                  <option key={`cat:${c.id}`} value={`cat:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowFormula(!showFormula)}
              style={{ fontSize: '0.7rem', padding: '2px 6px', gap: '3px' }}
              title="Xem quy tắc tính điểm"
            >
              <Calculator size={11} />
              <span>Cách tính</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
              disabled={!filteredList.length}
              style={{ fontSize: '0.7rem', padding: '2px 6px', gap: '3px' }}
              title="Xuất bảng ra Excel"
            >
              <Download size={11} />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Chú thích cách tính ngắn gọn khi mở */}
        {showFormula && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              marginBottom: '10px',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.4
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
              Quy tắc tính (Dải điểm: 0.80 đến 1.20 • Chỉ xét nhân sự &gt; 30 WO):
            </div>
            <ul style={{ margin: 0, paddingLeft: '14px' }}>
              <li>
                <strong>Khối lượng &lt; 125 WO:</strong> Điểm = <code>Đúng hạn / Tổng WO</code>, tối đa <strong>1.00</strong>, tối thiểu sàn <strong>0.80</strong>.
                (Ví dụ: 80 WO có 6 quá hạn $\rightarrow$ 92.5% $\rightarrow$ <strong>0.93</strong>).
              </li>
              <li>
                <strong>Khối lượng &ge; 125 WO:</strong> Cần &ge; 125 đúng hạn (1.00). Đạt &ge; 125 đúng hạn cộng khuyến khích đến max <strong>1.20</strong> (+0.004 / WO vượt 125).
              </li>
            </ul>
          </div>
        )}

        {/* Tóm tắt nhanh số lượng & Bộ lọc Bảng 1 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', flexWrap: 'wrap' }}>
            <span>NS: <strong style={{ color: 'var(--text-primary)' }}>{summary.total}</strong></span>
            <span>XS (&gt;1): <strong style={{ color: '#7c3aed' }}>{summary.excellent}</strong></span>
            <span>Chuẩn (1.0): <strong style={{ color: '#059669' }}>{summary.standard}</strong></span>
            <span>&lt;1.0: <strong style={{ color: '#dc2626' }}>{summary.below}</strong></span>
            <span>TB: <strong style={{ color: 'var(--brand-primary)' }}>{summary.avg}</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpDown size={11} style={{ color: 'var(--text-muted)' }} />
            <select
              className="select-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="kpi_desc">KPI (Cao → Thấp)</option>
              <option value="kpi_asc">KPI (Thấp → Cao)</option>
              <option value="total_desc">Tổng WO (Giảm)</option>
              <option value="ontime_desc">Đúng hạn (Giảm)</option>
              <option value="overdue_desc">Quá hạn (Giảm)</option>
              <option value="name_asc">Tên (A → Z)</option>
            </select>

            <div style={{ position: 'relative', width: '120px' }}>
              <Search size={11} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Tìm nhân viên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
                style={{ fontSize: '0.7rem', padding: '2px 4px 2px 20px', height: '22px', width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Bảng Dữ Liệu 1 (Left Table) */}
        {isLoading ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Đang tải dữ liệu...
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Không có dữ liệu nhân viên nào &gt; 30 WO.
          </div>
        ) : (
          <div
            className="table-responsive"
            style={{
              maxHeight: filteredList.length > 10 ? '360px' : 'none',
              overflowY: filteredList.length > 10 ? 'auto' : 'visible',
              overflowX: 'auto',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              width: '100%'
            }}
          >
            <table
              className="excel-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                margin: 0,
                fontSize: '0.76rem',
                border: '1px solid #cbd5e1'
              }}
            >
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f1f5f9' }}>
                <tr>
                  <th style={{ width: '32px', textAlign: 'center', border: '1px solid #cbd5e1', padding: '5px 2px', fontWeight: 700 }}>#</th>
                  <th style={{ width: '125px', minWidth: '105px', textAlign: 'left', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Nhân Viên</th>
                  <th style={{ width: '65px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Tổng WO</th>
                  <th style={{ width: '65px', textAlign: 'right', color: '#059669', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Đúng Hạn</th>
                  <th style={{ width: '60px', textAlign: 'right', color: '#dc2626', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Quá Hạn</th>
                  <th style={{ width: '75px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Tỷ Lệ</th>
                  <th style={{ width: '75px', textAlign: 'center', fontWeight: 800, border: '1px solid #cbd5e1', padding: '5px 6px', background: '#e2e8f0' }}>Điểm KPI</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((emp, index) => {
                  const { kpi } = emp;
                  const scoreColor = kpi.isExcellent ? '#7c3aed' : kpi.isStandard ? '#059669' : '#dc2626';
                  const rowBg = index % 2 === 1 ? '#f8fafc' : '#ffffff';

                  return (
                    <tr
                      key={emp.id || emp.key_name || index}
                      className="excel-row"
                      style={{ background: rowBg }}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', border: '1px solid #cbd5e1', padding: '4px 2px' }}>
                        {index + 1}
                      </td>

                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', maxWidth: '130px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={emp.key_name}
                          >
                            {emp.key_name}
                          </span>
                          {onOpenDrilldown && (
                            <button
                              type="button"
                              onClick={() => onOpenDrilldown('total', `WO của ${emp.key_name}`, emp, null, {
                                filterType: 'employee',
                                filterId: emp.id,
                                fixedWoReportId: isFixed ? reportId : undefined
                              })}
                              title="Xem chi tiết WO"
                              style={{ border: 'none', background: 'transparent', padding: '0', cursor: 'pointer', color: 'var(--brand-primary)', opacity: 0.6, flexShrink: 0 }}
                            >
                              <Eye size={11} />
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        {kpi.total.toLocaleString()}
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 600, border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        {kpi.onTime.toLocaleString()}
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: kpi.overdue > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: kpi.overdue > 0 ? 700 : 400, border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        {kpi.overdue}
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        {kpi.onTimeRate.toFixed(1)}%
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: scoreColor, border: '1px solid #cbd5e1', padding: '4px 6px', background: 'rgba(0,0,0,0.01)' }}>
                        {kpi.displayScore}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '5px', fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>* Điểm KPI tham khảo nội bộ từ All-WO.</span>
          <span>Hiển thị: <strong>{filteredList.length}</strong> nhân sự</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* BẢNG 2 (BÊN PHẢI): BẢNG TÍNH KPI VHKT (CẬP NHẬT SAU)         */}
      {/* ============================================================ */}
      <div
        className="card"
        style={{
          padding: '12px 14px',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          background: '#ffffff',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Header Bảng 2 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '10px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              BẢNG TÍNH KPI GĐTT
            </h3>
            <span
              className="badge"
              style={{ fontSize: '0.64rem', padding: '1px 5px', fontWeight: 700, background: '#e2e8f0', color: '#475569' }}
            >
              Cập nhật sau
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (Số liệu chính thức đang hoàn thiện)
            </span>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportRightCsv}
              disabled={!filteredRightList.length}
              style={{ fontSize: '0.7rem', padding: '2px 6px', gap: '3px' }}
              title="Xuất bảng ra Excel"
            >
              <Download size={11} />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Tóm tắt nhanh số liệu (Toàn bộ 0) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', flexWrap: 'wrap' }}>
            <span>NS: <strong style={{ color: 'var(--text-primary)' }}>{summary.total}</strong></span>
            <span>XS (&gt;1): <strong style={{ color: 'var(--text-muted)' }}>0</strong></span>
            <span>Chuẩn (1.0): <strong style={{ color: 'var(--text-muted)' }}>0</strong></span>
            <span>&lt;1.0: <strong style={{ color: 'var(--text-muted)' }}>0</strong></span>
            <span>TB: <strong style={{ color: 'var(--text-muted)' }}>0.00</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpDown size={11} style={{ color: 'var(--text-muted)' }} />
            <select
              className="select-input"
              value={rightSortBy}
              onChange={(e) => setRightSortBy(e.target.value)}
              style={{ fontSize: '0.7rem', padding: '1px 4px', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="name_asc">Tên (A → Z)</option>
              <option value="name_desc">Tên (Z → A)</option>
            </select>

            <div style={{ position: 'relative', width: '120px' }}>
              <Search size={11} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Tìm nhân viên..."
                value={rightSearchTerm}
                onChange={(e) => setRightSearchTerm(e.target.value)}
                className="search-input"
                style={{ fontSize: '0.7rem', padding: '2px 4px 2px 20px', height: '22px', width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Bảng Dữ Liệu 2 (Right Table: số liệu 0) */}
        {filteredRightList.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Không có dữ liệu nhân viên.
          </div>
        ) : (
          <div
            className="table-responsive"
            style={{
              maxHeight: filteredRightList.length > 10 ? '360px' : 'none',
              overflowY: filteredRightList.length > 10 ? 'auto' : 'visible',
              overflowX: 'auto',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              width: '100%'
            }}
          >
            <table
              className="excel-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                margin: 0,
                fontSize: '0.76rem',
                border: '1px solid #cbd5e1'
              }}
            >
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f1f5f9' }}>
                <tr>
                  <th style={{ width: '32px', textAlign: 'center', border: '1px solid #cbd5e1', padding: '5px 2px', fontWeight: 700 }}>#</th>
                  <th style={{ width: '125px', minWidth: '105px', textAlign: 'left', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Nhân Viên</th>
                  <th style={{ width: '65px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Tổng WO</th>
                  <th style={{ width: '65px', textAlign: 'right', color: 'var(--text-muted)', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Đúng Hạn</th>
                  <th style={{ width: '60px', textAlign: 'right', color: 'var(--text-muted)', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Quá Hạn</th>
                  <th style={{ width: '75px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '5px 6px', fontWeight: 700 }}>Tỷ Lệ</th>
                  <th style={{ width: '75px', textAlign: 'center', fontWeight: 800, border: '1px solid #cbd5e1', padding: '5px 6px', background: '#e2e8f0' }}>Điểm KPI</th>
                </tr>
              </thead>
              <tbody>
                {filteredRightList.map((emp, index) => {
                  const rowBg = index % 2 === 1 ? '#f8fafc' : '#ffffff';

                  return (
                    <tr
                      key={emp.id || emp.key_name || index}
                      className="excel-row"
                      style={{ background: rowBg }}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', border: '1px solid #cbd5e1', padding: '4px 2px' }}>
                        {index + 1}
                      </td>

                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 6px', maxWidth: '130px' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block'
                          }}
                          title={emp.key_name}
                        >
                          {emp.key_name}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid #cbd5e1', padding: '4px 6px', color: 'var(--text-muted)' }}>
                        0
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        0
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        0
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        0.0%
                      </td>

                      <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', border: '1px solid #cbd5e1', padding: '4px 6px' }}>
                        0.00
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '5px', fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>* Hệ số KPI chính thức sẽ được công bố và tính toán sau.</span>
          <span>Hiển thị: <strong>{filteredRightList.length}</strong> nhân sự</span>
        </div>
      </div>
    </div>
  );
}
