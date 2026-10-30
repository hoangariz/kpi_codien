import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cable,
  Calendar,
  RotateCcw,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';

import { codinhApi } from '../api/codinhApi';
import { getReportConfig } from '../components/codinh/registry';
import ReportCards from '../components/codinh/ReportCards';
import CodinhDrilldownModal from '../components/CodinhDrilldownModal';
import TaskDetailModal from '../components/TaskDetailModal';

export default function CodinhPage() {
  const tableSectionRef = useRef(null);

  // Active states - Mặc định không chọn bảng nào khi vào trang /codinh
  const [selectedReportKey, setSelectedReportKey] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');

  const isDateReport =
    selectedReportKey === 'qlctkt_trien_khai' ||
    selectedReportKey === 'tong_hop_su_co' ||
    selectedReportKey === 'ton_tk_theo_ngay';

  // Drilldown & Detail modals
  const [drilldownFilter, setDrilldownFilter] = useState(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // 1. Fetch reports list with mini KPI summary cards (cached 5m, keeps placeholder to prevent card blinking)
  const { data: reportsList = [], isLoading: loadingReports, refetch: refetchReports } = useQuery({
    queryKey: ['codinh-reports', selectedMonth],
    queryFn: () => codinhApi.getReports(selectedMonth),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // 2. Fetch stats for the active report (chỉ fetch khi đã chọn bảng)
  const {
    data: statsData,
    isLoading: loadingStats,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['codinh-stats', selectedReportKey, isDateReport ? selectedDate : selectedMonth],
    queryFn: () => codinhApi.getStats(
      selectedReportKey,
      isDateReport ? null : (selectedMonth === 'all' ? null : selectedMonth),
      isDateReport ? (selectedDate || undefined) : null
    ),
    enabled: Boolean(selectedReportKey),
    staleTime: 60 * 1000,
  });

  // Keep selectedDate in sync with backend's active selected_date
  useEffect(() => {
    if (isDateReport && statsData?.selected_date && !selectedDate) {
      setSelectedDate(statsData.selected_date);
    }
  }, [isDateReport, statsData?.selected_date, selectedDate]);

  // 3. Fetch org directory tree for team/cluster metadata
  const { data: orgTree = [] } = useQuery({
    queryKey: ['codinh-org-tree'],
    queryFn: () => codinhApi.getOrgTree(),
    staleTime: 5 * 60 * 1000,
  });

  // Reset view on header tab click
  useEffect(() => {
    const handleReset = () => {
      setSelectedReportKey(null);
      setSelectedMonth('all');
      setSelectedDate('');
    };
    window.addEventListener('reset-codinh-view', handleReset);
    return () => window.removeEventListener('reset-codinh-view', handleReset);
  }, []);

  // Org Metadata Maps
  const orgMetadata = useMemo(() => {
    const clusterMap = {};
    const teamMap = {};

    orgTree.forEach((c) => {
      let cEmpCount = 0;
      (c.teams || []).forEach((t) => {
        const emps = t.employees || [];
        cEmpCount += emps.length;
        const leader = emps.find((e) => e.la_doi_truong);
        teamMap[t.id] = {
          id: t.id,
          ma_doi: t.ma_doi,
          ten_doi: t.ten_doi,
          cluster_id: c.id,
          ten_cum: c.ten_cum,
          leader_name: leader ? leader.ho_ten : null,
          employee_count: emps.length,
        };
      });
      clusterMap[c.id] = {
        id: c.id,
        ma_cum: c.ma_cum,
        ten_cum: c.ten_cum,
        team_count: (c.teams || []).length,
        employee_count: cEmpCount,
      };
    });

    return { clusterMap, teamMap };
  }, [orgTree]);

  const reportConfig = useMemo(() => {
    return selectedReportKey ? getReportConfig(selectedReportKey) : null;
  }, [selectedReportKey]);

  const lastUpdatedStr = statsData?.last_data_update_vn || null;

  const handleDrilldown = ({ metric, filterType, filterId, targetName, row }) => {
    if (!reportConfig) return;
    setDrilldownFilter({
      report: selectedReportKey,
      metric: metric || 'total',
      filterType: filterType || undefined,
      filterId: filterId || undefined,
      targetName: targetName || undefined,
      reportTitle: reportConfig.title,
      month: isDateReport ? undefined : (selectedMonth === 'all' ? undefined : selectedMonth),
      date: isDateReport ? (selectedDate || statsData?.selected_date) : undefined,
      row,
    });
  };

  const handleSelectReport = (repKey) => {
    const isDateRep =
      repKey === 'qlctkt_trien_khai' ||
      repKey === 'tong_hop_su_co' ||
      repKey === 'ton_tk_theo_ngay';

    if (repKey !== selectedReportKey) {
      if (isDateRep) {
        // Pre-fill selectedDate from the card's already fetched date so useQuery fires only ONE request
        const repObj = reportsList.find((r) => r.key === repKey);
        const prefilledDate = repObj?.selected_date || (new Date()).toISOString().split('T')[0];
        setSelectedDate(prefilledDate);
      } else {
        setSelectedDate('');
      }
    }
    setSelectedReportKey(repKey);
    setTimeout(() => {
      if (tableSectionRef.current) {
        tableSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const ReportComponent = reportConfig?.component;
  const isOrgEmpty = orgTree.length === 0;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Responsive mobile & cabinet UI styling matching original CĐBR */}
      <style>{`
        .excel-table-scroll-wrapper table.excel-table {
          width: max-content !important;
          min-width: auto !important;
        }
        .col-stt {
          position: sticky !important;
          left: 0 !important;
          width: 38px !important;
          min-width: 38px !important;
          max-width: 38px !important;
          z-index: 6 !important;
          background: var(--bg-secondary) !important;
          box-sizing: border-box !important;
          text-align: center !important;
        }
        th.col-stt {
          z-index: 10 !important;
          background: var(--bg-tertiary) !important;
        }
        .col-name {
          position: sticky !important;
          left: 38px !important;
          z-index: 6 !important;
          background: var(--bg-secondary) !important;
          box-shadow: 3px 0 6px -2px rgba(0, 0, 0, 0.18) !important;
        }
        th.col-name {
          z-index: 10 !important;
          background: var(--bg-tertiary) !important;
        }
        tr.excel-row:hover td.col-stt,
        tr.excel-row:hover td.col-name {
          background: var(--bg-hover) !important;
        }
        .excel-summary-row .col-summary-label {
          position: static !important;
          left: auto !important;
          z-index: auto !important;
          width: auto !important;
          min-width: unset !important;
          max-width: unset !important;
          box-shadow: none !important;
        }

        /* Styling bảng Tổng Hợp TK (QLCTKT) gọn nhẹ, wrap text, font size nhỏ */
        .excel-table-scroll-wrapper table.excel-table.qlctkt-table {
          font-size: 0.72rem !important;
          line-height: 1.15 !important;
        }
        table.excel-table.qlctkt-table th {
          font-size: 0.68rem !important;
          padding: 3px 2px !important;
          white-space: normal !important;
          line-height: 1.15 !important;
          vertical-align: middle !important;
          text-align: center !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
        }
        table.excel-table.qlctkt-table td {
          font-size: 0.72rem !important;
          padding: 2px 3px !important;
          line-height: 1.15 !important;
        }
        table.excel-table.qlctkt-table td.cell-num {
          font-size: 0.73rem !important;
          padding: 2px 3px !important;
        }
        table.excel-table.qlctkt-table .col-stt {
          width: 32px !important;
          min-width: 32px !important;
          max-width: 32px !important;
          font-size: 0.69rem !important;
        }
        table.excel-table.qlctkt-table .col-name {
          left: 32px !important;
          font-size: 0.74rem !important;
          padding: 2.5px 6px !important;
        }

        @media (max-width: 768px) {
          .report-cards-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .report-selector-card {
            padding: 12px 14px !important;
            min-height: auto !important;
          }
          .card-kpi-summary-row {
            padding: 6px 2px !important;
            gap: 2px !important;
          }
          .card-kpi-summary-row span {
            font-size: 0.58rem !important;
          }
          .card-kpi-summary-row strong {
            font-size: 0.8rem !important;
          }
          .table-metric-strip {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 6px !important;
            padding: 8px 10px !important;
          }
          .excel-table th, .excel-table td {
            padding: 4px 6px !important;
            font-size: 0.76rem !important;
          }
          .mobile-swipe-hint {
            display: block !important;
            padding: 6px 12px !important;
            font-size: 0.74rem !important;
            background: rgba(139, 92, 246, 0.08) !important;
            color: #8b5cf6 !important;
            text-align: center !important;
            border-bottom: 1px solid var(--border-color) !important;
          }
        }
      `}</style>

      {/* 0. Top Strip: Badge CĐBR, Month Badge, Data Freshness GMT+7, Refresh button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="badge badge-purple" style={{ fontSize: '0.8rem', fontWeight: 800, gap: '5px' }}>
            <Cable size={14} /> CỐ ĐỊNH BĂNG RỘNG (CĐBR)
          </span>

          {selectedReportKey && !isDateReport && (
            <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.78rem', padding: '3px 10px', fontWeight: 700 }}>
              <Calendar size={12} /> {selectedMonth === 'all' ? 'Tất cả các tháng' : `Tháng ${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]}`}
            </span>
          )}

          {lastUpdatedStr && (
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--bg-tertiary)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              <Clock size={12} /> Dữ liệu cập nhật đến: {lastUpdatedStr}
            </span>
          )}
        </div>

        <button
          onClick={() => {
            refetchReports();
            if (selectedReportKey) refetchStats();
          }}
          disabled={loadingStats}
          className="btn btn-outline"
          style={{ fontSize: '0.82rem', padding: '6px 14px', gap: '6px' }}
          title="Tải lại số liệu mới nhất"
        >
          <RotateCcw size={14} className={loadingStats ? 'spin' : ''} /> Làm mới
        </button>
      </div>

      {/* Banner Xem danh sách Thu Hồi Thiết Bị */}
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          background: 'var(--bg-secondary)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '10px',
          padding: '8px 14px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1rem' }}>📦</span>
          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Thu Hồi Thiết Bị CĐBR:
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Tra cứu danh sách thiết bị tồn đọng cần thu hồi theo Cụm &amp; Nhân viên FT
          </span>
        </div>

        <button
          onClick={() => {
            window.history.pushState({}, '', '/thuhoithietbi');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '5px 14px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.25)',
          }}
        >
          <RotateCcw size={13} /> Xem Danh Sách Thu Hồi Thiết Bị →
        </button>
      </div>

      {/* 1. Category Selector Cards */}
      <ReportCards
        reportsList={reportsList}
        isLoading={loadingReports}
        selectedReportKey={selectedReportKey}
        onSelectReport={handleSelectReport}
      />

      {/* Scroll anchor target for auto-scrolling down to table */}
      <div ref={tableSectionRef} style={{ scrollMarginTop: '80px' }} />

      {/* 2. Main 3-tier Level Table Section */}
      {selectedReportKey && reportConfig && ReportComponent ? (
        loadingStats ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div className="spin" style={{ display: 'inline-block', marginBottom: '12px' }}>
              <RotateCcw size={28} />
            </div>
            <div>Đang tải dữ liệu báo cáo {reportConfig.title}...</div>
          </div>
        ) : (
          <ReportComponent
            statsData={statsData}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            selectedDate={selectedDate || statsData?.selected_date}
            onDateChange={setSelectedDate}
            onDrilldown={handleDrilldown}
            orgMetadata={orgMetadata}
            emptyOrg={isOrgEmpty}
            reportTitle={reportConfig.title}
            lastUpdatedStr={lastUpdatedStr}
          />
        )
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'var(--bg-secondary)',
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: '#8b5cf6',
            }}
          >
            <FileSpreadsheet size={26} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Chọn một bảng báo cáo ở trên để xem chi tiết
          </h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto' }}>
            Bấm vào một trong các thẻ báo cáo (Bảo Dưỡng THC, ĐH Port Kém hoặc Tổng Hợp TK) để xem bảng phân tích số liệu 3 cấp Cụm / Đội / Nhân viên.
          </p>
        </div>
      )}

      {/* 3. Modals */}
      <CodinhDrilldownModal
        isOpen={Boolean(drilldownFilter)}
        onClose={() => setDrilldownFilter(null)}
        filterInfo={drilldownFilter}
        onSelectTask={setSelectedDetailTask}
      />

      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
        />
      )}
    </div>
  );
}
