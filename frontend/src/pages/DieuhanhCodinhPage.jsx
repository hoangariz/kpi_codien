import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  RotateCcw,
  Calendar,
  Clock,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Flame,
  Award,
  Filter,
  X,
  Phone,
  Layers,
  Activity,
  Zap,
  Wrench,
  Wifi,
  Copy,
  Check,
  MapPin,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { codinhApi } from '../api/codinhApi';

const LOCAL_STORAGE_TEAM_KEY = 'vcc_dieuhanh_team_id';
const LOCAL_STORAGE_TAB_KEY = 'vcc_dieuhanh_tab';

function extractPhoneNumbers(text) {
  if (!text) return [];
  const matches = String(text).match(/(0[3|5|7|8|9][0-9]{8})/g);
  return matches ? Array.from(new Set(matches)) : [];
}

export default function DieuhanhCodinhPage({ onNavigateToCodinh }) {
  // 1. Team ID from localStorage (MẶC ĐỊNH LÀ NULL NẾU CHƯA LƯU)
  const [selectedTeamId, setSelectedTeamId] = useState(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_TEAM_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  // 2. Active Tab ('ton' | 'hoanthanh')
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem(LOCAL_STORAGE_TAB_KEY) || 'ton';
  });

  // 3. Date selection
  const [selectedDate, setSelectedDate] = useState('');

  // 4. Modal team picker state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // 5. Employee card filter & search
  const [empSearch, setEmpSearch] = useState('');
  const [empFilter, setEmpFilter] = useState('all'); // 'all', 'has_ton', 'has_overdue', 'has_nt'
  const [expandedEmpId, setExpandedEmpId] = useState(null);

  // 6. Drilldown Detail Modal State
  const [drilldownTarget, setDrilldownTarget] = useState(null);
  // drilldownTarget: { report, metric, label, emp, count }
  const [drilldownSearch, setDrilldownSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Sync tab to localStorage
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem(LOCAL_STORAGE_TAB_KEY, tab);
  };

  // Sync team to localStorage
  const handleSelectTeam = (tId) => {
    setSelectedTeamId(tId);
    localStorage.setItem(LOCAL_STORAGE_TEAM_KEY, String(tId));
    setShowTeamModal(false);
  };

  // 7. Fetch Team Data
  const {
    data: teamData,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['dieuhanhTeamData', selectedTeamId, selectedDate],
    queryFn: () => codinhApi.getDieuhanhTeamData(selectedTeamId, selectedDate || null),
    staleTime: 60 * 1000,
    keepPreviousData: true,
  });

  // 8. Fetch Drilldown Data when modal opens
  const {
    data: drilldownData,
    isLoading: loadingDrilldown,
    refetch: refetchDrilldown,
  } = useQuery({
    queryKey: [
      'dieuhanhDrilldown',
      drilldownTarget?.report,
      drilldownTarget?.metric,
      drilldownTarget?.emp?.id,
      selectedDate || teamData?.selected_date,
    ],
    queryFn: () => {
      if (!drilldownTarget) return null;
      return codinhApi.getDrilldownTasks({
        report: drilldownTarget.report,
        metric: drilldownTarget.metric,
        filter_type: 'employee',
        filter_id: drilldownTarget.emp.id,
        target_name: drilldownTarget.emp.ho_ten || drilldownTarget.emp.username,
        date: selectedDate || teamData?.selected_date || null,
        month: teamData?.selected_month || null,
        page: 1,
        page_size: 500,
      });
    },
    enabled: !!drilldownTarget,
    staleTime: 30 * 1000,
  });

  // Group all teams by Cluster for the Modal
  const groupedTeamsByCluster = useMemo(() => {
    if (!teamData?.all_teams) return {};
    const groups = {};
    const q = teamSearchQuery.toLowerCase().trim();

    teamData.all_teams.forEach((t) => {
      const match =
        !q ||
        t.ten_doi.toLowerCase().includes(q) ||
        t.ma_doi.toLowerCase().includes(q) ||
        t.ten_cum.toLowerCase().includes(q);

      if (match) {
        if (!groups[t.ten_cum]) {
          groups[t.ten_cum] = [];
        }
        groups[t.ten_cum].push(t);
      }
    });
    return groups;
  }, [teamData?.all_teams, teamSearchQuery]);

  // Filtered employees in current team
  const filteredEmployees = useMemo(() => {
    if (!teamData?.employees) return [];
    let list = teamData.employees;

    // Search query
    if (empSearch.trim()) {
      const q = empSearch.toLowerCase().trim();
      list = list.filter(
        (e) =>
          (e.ho_ten && e.ho_ten.toLowerCase().includes(q)) ||
          (e.username && e.username.toLowerCase().includes(q))
      );
    }

    // Filter chip
    if (empFilter === 'has_ton') {
      list = list.filter((e) => (e.ton?.tong_ton || 0) > 0);
    } else if (empFilter === 'has_overdue') {
      list = list.filter((e) => (e.ton?.tong_qua_han || 0) > 0);
    } else if (empFilter === 'has_nt') {
      list = list.filter((e) => (e.hoan_thanh?.trien_khai?.nghiem_thu_n || 0) > 0);
    }

    return list;
  }, [teamData?.employees, empSearch, empFilter]);

  // Filtered tasks in Drilldown Modal
  const filteredDrilldownTasks = useMemo(() => {
    if (!drilldownData?.items) return [];
    let items = drilldownData.items;
    if (drilldownSearch.trim()) {
      const q = drilldownSearch.toLowerCase().trim();
      items = items.filter((t) => {
        const text = [
          t.task_id,
          t.ma_cong_viec,
          t.account,
          t.ten_khach_hang,
          t.dia_chi_lap_dat,
          t.noi_dung_cong_viec,
          t.tram,
          t.ma_tram,
          t.ghi_chu_dau_moi,
          t.ghi_chu,
          t.nv_thuc_hien,
          t.nhan_vien,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(q);
      });
    }
    return items;
  }, [drilldownData?.items, drilldownSearch]);

  const toggleExpand = (id) => {
    setExpandedEmpId((prev) => (prev === id ? null : id));
  };

  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to open Drilldown Modal
  const handleOpenDrilldown = (metricConfig, emp, value) => {
    if (!value || value <= 0) return;
    setDrilldownSearch('');
    setDrilldownTarget({
      ...metricConfig,
      emp,
      count: value,
    });
  };

  const teamInfo = teamData?.team_info;
  const teamSummary = teamData?.team_summary;
  const lastUpdate = teamData?.last_update_vn || 'Chưa cập nhật';
  const availableDates = teamData?.available_dates || [];

  return (
    <div
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '12px 10px 80px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* 1. TOP BAR: Back Navigation + Last Update Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => {
            if (onNavigateToCodinh) onNavigateToCodinh();
            else {
              window.history.pushState({}, '', '/codinh');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          className="btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            padding: '6px 12px',
            borderRadius: '8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={15} /> Báo cáo CĐBR
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Refresh button */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.8rem',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Làm mới dữ liệu"
          >
            <RotateCcw size={14} className={isFetching ? 'spin' : ''} />
          </button>

          {/* Date Selector */}
          {availableDates.length > 0 && (
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={selectedDate || teamData?.selected_date || ''}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  padding: '6px 24px 6px 10px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    Ngày: {d}
                  </option>
                ))}
              </select>
              <Calendar
                size={13}
                style={{
                  position: 'absolute',
                  right: '8px',
                  pointerEvents: 'none',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. PROMINENT LAST UPDATE TIMESTAMP BANNER */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%)',
          border: '1px solid rgba(37, 99, 235, 0.25)',
          borderRadius: '10px',
          padding: '8px 12px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)',
            }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Dữ liệu cập nhật gần nhất:
          </span>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#2563eb',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lastUpdate}
          </span>
        </div>

        <span
          style={{
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}
        >
          📱 Tối ưu hiển thị cho Đội Trưởng
        </span>
      </div>

      {/* 3. NẾU CHƯA CHỌN ĐỘI (DEFAULT LÀ KHÔNG CHỌN ĐỘI NÀO) */}
      {!selectedTeamId ? (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1.5px dashed rgba(37, 99, 235, 0.4)',
            borderRadius: '14px',
            padding: '36px 20px',
            textAlign: 'center',
            marginBottom: '20px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🏢</div>
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Chào mừng bạn đến trang Điều Hành CĐBR
          </div>
          <p
            style={{
              fontSize: '0.86rem',
              color: 'var(--text-secondary)',
              maxWidth: '480px',
              margin: '0 auto 20px',
              lineHeight: 1.5,
            }}
          >
            Vui lòng chọn <strong>Cụm &amp; Đội</strong> của bạn. Lựa chọn này sẽ được tự động lưu trên điện thoại để bạn không cần chọn lại ở các lần truy cập sau.
          </p>

          <button
            onClick={() => setShowTeamModal(true)}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.92rem',
              fontWeight: 700,
              padding: '12px 24px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'transform 0.1s ease',
            }}
          >
            <Users size={18} /> 👉 Bấm Chọn Cụm &amp; Đội Của Bạn
          </button>
        </div>
      ) : (
        /* KHI ĐÃ CÓ ĐỘI ĐƯỢC CHỌN */
        <>
          {/* TEAM SELECTOR CARD (MOBILE-FRIENDLY & AUTO-SAVED) */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '12px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {teamInfo?.ten_cum || 'Chưa chọn Cụm'}
                </div>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    marginTop: '1px',
                  }}
                >
                  {teamInfo?.ten_doi || 'Đang tải đội...'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Mã: <code style={{ fontWeight: 600 }}>{teamInfo?.ma_doi || '---'}</code> • {teamInfo?.total_members || 0} nhân sự
                </div>
              </div>

              <button
                onClick={() => setShowTeamModal(true)}
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  padding: '8px 14px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                  flexShrink: 0,
                }}
              >
                Đổi Đội <ChevronDown size={14} />
              </button>
            </div>
          </div>

          {/* TEAM KPI SUMMARY OVERVIEW CARDS */}
          {teamSummary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: activeTab === 'ton' ? '1fr 1fr' : '1fr 1fr 1fr',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              {activeTab === 'ton' ? (
                <>
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid rgba(249, 115, 22, 0.3)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      TỔNG TỒN ĐỘI
                    </div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 900,
                        color: '#f97316',
                        marginTop: '2px',
                      }}
                    >
                      {teamSummary.tong_ton}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Gồm 5 mảng CĐBR
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: teamSummary.tong_qua_han > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      QUÁ HẠN CẦN XỬ LÝ
                    </div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 900,
                        color: teamSummary.tong_qua_han > 0 ? '#ef4444' : '#10b981',
                        marginTop: '2px',
                      }}
                    >
                      {teamSummary.tong_qua_han}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: teamSummary.tong_qua_han > 0 ? '#ef4444' : '#10b981' }}>
                      {teamSummary.tong_qua_han > 0 ? '⚠️ Cần đôn đốc ngay' : '✓ Đúng hạn'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      NGHIỆM THU NGÀY
                    </div>
                    <div
                      style={{
                        fontSize: '1.35rem',
                        fontWeight: 900,
                        color: '#10b981',
                        marginTop: '2px',
                      }}
                    >
                      {teamSummary.nghiem_thu_n}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Triển khai xong</div>
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      FTTH THÁNG
                    </div>
                    <div
                      style={{
                        fontSize: '1.35rem',
                        fontWeight: 900,
                        color: '#2563eb',
                        marginTop: '2px',
                      }}
                    >
                      {teamSummary.nghiem_thu_ftth_thang}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Lũy kế tháng</div>
                  </div>

                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      NSLĐ TB ĐỘI
                    </div>
                    <div
                      style={{
                        fontSize: '1.35rem',
                        fontWeight: 900,
                        color: '#8b5cf6',
                        marginTop: '2px',
                      }}
                    >
                      {teamSummary.avg_nsld}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Công/NV</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SEGMENTED CONTROL: TỒN vs TIẾN ĐỘ HOÀN THÀNH */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              background: 'var(--bg-tertiary, rgba(0,0,0,0.06))',
              padding: '4px',
              borderRadius: '12px',
              marginBottom: '12px',
            }}
          >
            <button
              onClick={() => handleTabChange('ton')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: '9px',
                fontSize: '0.88rem',
                fontWeight: activeTab === 'ton' ? 800 : 600,
                color: activeTab === 'ton' ? '#ea580c' : 'var(--text-secondary)',
                background: activeTab === 'ton' ? 'var(--bg-secondary)' : 'transparent',
                border: activeTab === 'ton' ? '1px solid rgba(234, 88, 12, 0.25)' : 'none',
                boxShadow: activeTab === 'ton' ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <AlertTriangle size={16} color={activeTab === 'ton' ? '#ea580c' : 'currentColor'} />
              TỒN &amp; NGUY CƠ
              {teamSummary?.tong_ton !== undefined && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: activeTab === 'ton' ? 'rgba(234, 88, 12, 0.15)' : 'rgba(0,0,0,0.06)',
                    fontWeight: 700,
                  }}
                >
                  {teamSummary.tong_ton}
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange('hoanthanh')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                borderRadius: '9px',
                fontSize: '0.88rem',
                fontWeight: activeTab === 'hoanthanh' ? 800 : 600,
                color: activeTab === 'hoanthanh' ? '#16a34a' : 'var(--text-secondary)',
                background: activeTab === 'hoanthanh' ? 'var(--bg-secondary)' : 'transparent',
                border: activeTab === 'hoanthanh' ? '1px solid rgba(22, 163, 74, 0.25)' : 'none',
                boxShadow: activeTab === 'hoanthanh' ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <CheckCircle2 size={16} color={activeTab === 'hoanthanh' ? '#16a34a' : 'currentColor'} />
              TIẾN ĐỘ HOÀN THÀNH
              {teamSummary?.nghiem_thu_n !== undefined && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: activeTab === 'hoanthanh' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(0,0,0,0.06)',
                    fontWeight: 700,
                  }}
                >
                  {teamSummary.nghiem_thu_n}
                </span>
              )}
            </button>
          </div>

          {/* SEARCH & FILTER CHIPS */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Tìm nhân viên theo tên hoặc tài khoản..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  boxSizing: 'border-box',
                }}
              />
              {empSearch && (
                <button
                  onClick={() => setEmpSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
              <button
                onClick={() => setEmpFilter('all')}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: empFilter === 'all' ? 700 : 500,
                  padding: '4px 10px',
                  borderRadius: '20px',
                  border: empFilter === 'all' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: empFilter === 'all' ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)',
                  color: empFilter === 'all' ? '#2563eb' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Tất cả ({teamData?.employees?.length || 0})
              </button>

              {activeTab === 'ton' ? (
                <>
                  <button
                    onClick={() => setEmpFilter('has_ton')}
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: empFilter === 'has_ton' ? 700 : 500,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      border: empFilter === 'has_ton' ? '1px solid #f97316' : '1px solid var(--border-color)',
                      background: empFilter === 'has_ton' ? 'rgba(249, 115, 22, 0.12)' : 'var(--bg-secondary)',
                      color: empFilter === 'has_ton' ? '#ea580c' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Có việc tồn ({teamData?.employees?.filter((e) => (e.ton?.tong_ton || 0) > 0).length || 0})
                  </button>

                  <button
                    onClick={() => setEmpFilter('has_overdue')}
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: empFilter === 'has_overdue' ? 700 : 500,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      border: empFilter === 'has_overdue' ? '1px solid #ef4444' : '1px solid var(--border-color)',
                      background: empFilter === 'has_overdue' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
                      color: empFilter === 'has_overdue' ? '#dc2626' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⚠️ Có quá hạn ({teamData?.employees?.filter((e) => (e.ton?.tong_qua_han || 0) > 0).length || 0})
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEmpFilter('has_nt')}
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: empFilter === 'has_nt' ? 700 : 500,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    border: empFilter === 'has_nt' ? '1px solid #16a34a' : '1px solid var(--border-color)',
                    background: empFilter === 'has_nt' ? 'rgba(22, 163, 74, 0.12)' : 'var(--bg-secondary)',
                    color: empFilter === 'has_nt' ? '#16a34a' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Đã có nghiệm thu ({teamData?.employees?.filter((e) => (e.hoan_thanh?.trien_khai?.nghiem_thu_n || 0) > 0).length || 0})
                </button>
              )}
            </div>
          </div>

          {/* LOADING / EMPTY / ERROR STATE */}
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <RotateCcw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
              <div>Đang tổng hợp dữ liệu toàn bộ báo cáo CĐBR...</div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '10px',
                color: '#dc2626',
                fontSize: '0.86rem',
                textAlign: 'center',
              }}
            >
              Lỗi tải dữ liệu: {error?.message || 'Không thể kết nối máy chủ'}
            </div>
          )}

          {!isLoading && filteredEmployees.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 12px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
              }}
            >
              Không tìm thấy nhân viên nào phù hợp bộ lọc
            </div>
          )}

          {/* EMPLOYEES CARDS LIST (MOBILE-FIRST) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredEmployees.map((emp) => {
              const isExpanded = expandedEmpId === emp.id;
              const isLeader = emp.is_leader;
              const ton = emp.ton || {};
              const ht = emp.hoan_thanh || {};

              return (
                <div
                  key={emp.id}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: isLeader
                      ? '1.5px solid rgba(234, 179, 8, 0.6)'
                      : ton.tong_qua_han > 0
                      ? '1px solid rgba(239, 68, 68, 0.35)'
                      : '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: isLeader ? '0 2px 8px rgba(234, 179, 8, 0.15)' : 'var(--shadow-sm)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Card Header: Name + Roles + Main Badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                      marginBottom: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.98rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {emp.ho_ten || 'Chưa có tên'}
                        </span>
                        {isLeader && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '10px',
                              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            ⭐ Đội Trưởng
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                        }}
                      >
                        TK: <code style={{ color: 'var(--text-secondary)' }}>{emp.username || '---'}</code>
                      </div>
                    </div>

                    {/* Primary High-level Badge (BẤM VÀO ĐỂ XEM CHI TIẾT) */}
                    {activeTab === 'ton' ? (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              { report: 'qlctkt_trien_khai', metric: 'tong_ton', label: 'Tổng Tồn Triển Khai' },
                              emp,
                              ton.trien_khai?.tong || ton.tong_ton
                            )
                          }
                          title="Bấm để xem danh sách việc tồn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 9px',
                            borderRadius: '8px',
                            background: ton.tong_ton > 0 ? 'rgba(249, 115, 22, 0.12)' : 'rgba(16, 185, 129, 0.1)',
                            border: ton.tong_ton > 0 ? '1px solid rgba(249, 115, 22, 0.35)' : '1px solid rgba(16, 185, 129, 0.25)',
                            cursor: ton.tong_ton > 0 ? 'pointer' : 'default',
                            transition: 'transform 0.1s ease',
                          }}
                        >
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tồn:</span>
                          <span
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: ton.tong_ton > 0 ? '#ea580c' : '#10b981',
                              textDecoration: ton.tong_ton > 0 ? 'underline dotted' : 'none',
                            }}
                          >
                            {ton.tong_ton || 0}
                          </span>
                        </div>
                        {ton.tong_qua_han > 0 && (
                          <div
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'qlctkt_trien_khai', metric: 'qua_han', label: 'Tồn Quá Hạn Cần Xử Lý' },
                                emp,
                                ton.tong_qua_han
                              )
                            }
                            title="Bấm xem việc quá hạn"
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#ef4444',
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '2px',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            <AlertTriangle size={11} /> {ton.tong_qua_han} quá hạn
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              { report: 'qlctkt_trien_khai', metric: 'nghiem_thu_n', label: 'Nghiệm Thu Trong Ngày' },
                              emp,
                              ht.trien_khai?.nghiem_thu_n
                            )
                          }
                          title="Bấm xem danh sách nghiệm thu ngày"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 9px',
                            borderRadius: '8px',
                            background: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0,0,0,0.04)',
                            border: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-color)',
                            cursor: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? 'pointer' : 'default',
                          }}
                        >
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>NT ngày:</span>
                          <span
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? '#10b981' : 'var(--text-muted)',
                              textDecoration: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? 'underline dotted' : 'none',
                            }}
                          >
                            {ht.trien_khai?.nghiem_thu_n || 0}
                          </span>
                        </div>
                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              { report: 'qlctkt_trien_khai', metric: 'nghiem_thu_ftth_thang', label: 'Lũy Kế FTTH Tháng' },
                              emp,
                              ht.trien_khai?.nghiem_thu_ftth_thang
                            )
                          }
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#2563eb',
                            marginTop: '2px',
                            cursor: (ht.trien_khai?.nghiem_thu_ftth_thang || 0) > 0 ? 'pointer' : 'default',
                            textDecoration: (ht.trien_khai?.nghiem_thu_ftth_thang || 0) > 0 ? 'underline' : 'none',
                          }}
                        >
                          Tháng: <strong>{ht.trien_khai?.nghiem_thu_ftth_thang || 0}</strong> FTTH
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Body - Metric Rows with Clickable Drilldown */}
                  {activeTab === 'ton' ? (
                    /* TAB 1: TỒN THEO TỪNG BÁO CÁO CĐBR */
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {/* Triển Khai */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: ton.trien_khai?.tong > 0 ? 'rgba(249, 115, 22, 0.05)' : 'transparent',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>📡</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Triển khai:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            (Dây:{' '}
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'qlctkt_trien_khai', metric: 'ton_duong_day', label: 'Tồn Đường Dây Mới' },
                                  emp,
                                  ton.trien_khai?.duong_day
                                )
                              }
                              style={{
                                fontWeight: 700,
                                cursor: ton.trien_khai?.duong_day > 0 ? 'pointer' : 'default',
                                textDecoration: ton.trien_khai?.duong_day > 0 ? 'underline' : 'none',
                                color: ton.trien_khai?.duong_day > 0 ? '#ea580c' : 'inherit',
                              }}
                            >
                              {ton.trien_khai?.duong_day || 0}
                            </span>
                            , LĐTB:{' '}
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'qlctkt_trien_khai', metric: 'ton_ldtb', label: 'Tồn Lắp Đặt Thiết Bị' },
                                  emp,
                                  ton.trien_khai?.ldtb
                                )
                              }
                              style={{
                                fontWeight: 700,
                                cursor: ton.trien_khai?.ldtb > 0 ? 'pointer' : 'default',
                                textDecoration: ton.trien_khai?.ldtb > 0 ? 'underline' : 'none',
                                color: ton.trien_khai?.ldtb > 0 ? '#ea580c' : 'inherit',
                              }}
                            >
                              {ton.trien_khai?.ldtb || 0}
                            </span>
                            )
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {ton.trien_khai?.qua_han > 0 && (
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'qlctkt_trien_khai', metric: 'qua_han', label: 'Triển Khai Quá Hạn' },
                                  emp,
                                  ton.trien_khai?.qua_han
                                )
                              }
                              style={{
                                fontSize: '0.72rem',
                                color: '#ef4444',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              QH: {ton.trien_khai?.qua_han}
                            </span>
                          )}
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'qlctkt_trien_khai', metric: 'tong_ton', label: 'Tổng Tồn Triển Khai' },
                                emp,
                                ton.trien_khai?.tong
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: ton.trien_khai?.tong > 0 ? '#ea580c' : 'var(--text-muted)',
                              cursor: ton.trien_khai?.tong > 0 ? 'pointer' : 'default',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: ton.trien_khai?.tong > 0 ? 'rgba(249, 115, 22, 0.12)' : 'transparent',
                            }}
                          >
                            {ton.trien_khai?.tong || 0}
                          </span>
                        </div>
                      </div>

                      {/* Sự Cố */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: ton.su_co?.tong > 0 ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>⚡</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Sự cố:</span>
                          {ton.su_co?.hot > 0 && (
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'tong_hop_su_co', metric: 'hot', label: 'Sự Cố HOT' },
                                  emp,
                                  ton.su_co?.hot
                                )
                              }
                              style={{
                                fontSize: '0.72rem',
                                color: '#ef4444',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              🔥 {ton.su_co?.hot} HOT
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {ton.su_co?.qua_han > 0 && (
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'tong_hop_su_co', metric: 'qua_han', label: 'Sự Cố Quá Hạn' },
                                  emp,
                                  ton.su_co?.qua_han
                                )
                              }
                              style={{
                                fontSize: '0.72rem',
                                color: '#ef4444',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              QH: {ton.su_co?.qua_han}
                            </span>
                          )}
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'tong_hop_su_co', metric: 'ton_su_co', label: 'Tổng Tồn Sự Cố' },
                                emp,
                                ton.su_co?.tong
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: ton.su_co?.tong > 0 ? '#dc2626' : 'var(--text-muted)',
                              cursor: ton.su_co?.tong > 0 ? 'pointer' : 'default',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: ton.su_co?.tong > 0 ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                            }}
                          >
                            {ton.su_co?.tong || 0}
                          </span>
                        </div>
                      </div>

                      {/* Bảo Dưỡng THC */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🔧</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Bảo dưỡng THC:</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {ton.thc_bao_duong?.qua_han > 0 && (
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'thc', metric: 'overdue', label: 'Bảo Dưỡng THC Quá Hạn' },
                                  emp,
                                  ton.thc_bao_duong?.qua_han
                                )
                              }
                              style={{
                                fontSize: '0.72rem',
                                color: '#ef4444',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              QH: {ton.thc_bao_duong?.qua_han}
                            </span>
                          )}
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'thc', metric: 'pending', label: 'Tồn WO Bảo Dưỡng THC' },
                                emp,
                                ton.thc_bao_duong?.tong
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: ton.thc_bao_duong?.tong > 0 ? '#2563eb' : 'var(--text-muted)',
                              cursor: ton.thc_bao_duong?.tong > 0 ? 'pointer' : 'default',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: ton.thc_bao_duong?.tong > 0 ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                            }}
                          >
                            {ton.thc_bao_duong?.tong || 0}
                          </span>
                        </div>
                      </div>

                      {/* Báo Hỏng THC & Port Kém (Compact row) */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '6px',
                        }}
                      >
                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>🔨 Báo hỏng THC:</span>
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'bao_hong_thc', metric: 'pending', label: 'Tồn WO Báo Hỏng THC' },
                                emp,
                                ton.thc_bao_hong?.tong
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: ton.thc_bao_hong?.tong > 0 ? '#ea580c' : 'var(--text-muted)',
                              cursor: ton.thc_bao_hong?.tong > 0 ? 'pointer' : 'default',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: ton.thc_bao_hong?.tong > 0 ? 'rgba(249, 115, 22, 0.12)' : 'transparent',
                            }}
                          >
                            {ton.thc_bao_hong?.tong || 0}
                          </span>
                        </div>

                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>📶 Port kém:</span>
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'port_kem', metric: 'pending', label: 'Tồn WO Port Kém' },
                                emp,
                                ton.port_kem?.tong
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: ton.port_kem?.tong > 0 ? '#ea580c' : 'var(--text-muted)',
                              cursor: ton.port_kem?.tong > 0 ? 'pointer' : 'default',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: ton.port_kem?.tong > 0 ? 'rgba(249, 115, 22, 0.12)' : 'transparent',
                            }}
                          >
                            {ton.port_kem?.tong || 0}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Detail Drilldown for TỒN */}
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '6px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                            border: '1px dashed var(--border-color)',
                            fontSize: '0.78rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>
                              Tích hẹn dây:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'qlctkt_trien_khai', metric: 'ton_duong_day_th', label: 'Tồn Tích Hẹn Đường Dây' },
                                    emp,
                                    ton.trien_khai?.tich_hen_dd
                                  )
                                }
                                style={{
                                  color: '#2563eb',
                                  cursor: ton.trien_khai?.tich_hen_dd > 0 ? 'pointer' : 'default',
                                  textDecoration: ton.trien_khai?.tich_hen_dd > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ton.trien_khai?.tich_hen_dd || 0}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              Tích hẹn LĐTB:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'qlctkt_trien_khai', metric: 'ton_ldtb_th', label: 'Tồn Tích Hẹn LĐTB' },
                                    emp,
                                    ton.trien_khai?.tich_hen_ldtb
                                  )
                                }
                                style={{
                                  color: '#2563eb',
                                  cursor: ton.trien_khai?.tich_hen_ldtb > 0 ? 'pointer' : 'default',
                                  textDecoration: ton.trien_khai?.tich_hen_ldtb > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ton.trien_khai?.tich_hen_ldtb || 0}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              Tồn VTCI FTTH:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'qlctkt_trien_khai', metric: 'ton_vtci_ftth', label: 'Tồn VTCI FTTH' },
                                    emp,
                                    ton.trien_khai?.vtci_ftth
                                  )
                                }
                                style={{
                                  color: '#dc2626',
                                  cursor: ton.trien_khai?.vtci_ftth > 0 ? 'pointer' : 'default',
                                  textDecoration: ton.trien_khai?.vtci_ftth > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ton.trien_khai?.vtci_ftth || 0}
                              </strong>
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>
                              Tồn PDA:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'bao_hong_thc', metric: 'pda', label: 'Tồn Báo Hỏng PDA' },
                                    emp,
                                    ton.thc_bao_hong?.pda
                                  )
                                }
                                style={{
                                  color: '#ea580c',
                                  cursor: ton.thc_bao_hong?.pda > 0 ? 'pointer' : 'default',
                                  textDecoration: ton.thc_bao_hong?.pda > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ton.thc_bao_hong?.pda || 0}
                              </strong>{' '}
                              (QH: {ton.thc_bao_hong?.qua_han_pda || 0})
                            </span>
                            <span>•</span>
                            <span>
                              Thay hộp:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'bao_hong_thc', metric: 'thay_hop', label: 'Tồn Thay Hộp Cáp' },
                                    emp,
                                    ton.thc_bao_hong?.thay_hop
                                  )
                                }
                                style={{
                                  color: '#ea580c',
                                  cursor: ton.thc_bao_hong?.thay_hop > 0 ? 'pointer' : 'default',
                                  textDecoration: ton.thc_bao_hong?.thay_hop > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ton.thc_bao_hong?.thay_hop || 0}
                              </strong>{' '}
                              (QH: {ton.thc_bao_hong?.qua_han_thay_hop || 0})
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* TAB 2: TIẾN ĐỘ HOÀN THÀNH */
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {/* Triển Khai Hoàn Thành */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>📡</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Nghiệm thu ngày:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            (Dây:{' '}
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'qlctkt_trien_khai', metric: 'dd_nghiem_thu_n', label: 'Nghiệm Thu Đường Dây Ngày n' },
                                  emp,
                                  ht.trien_khai?.dd_nghiem_thu_n
                                )
                              }
                              style={{
                                fontWeight: 700,
                                cursor: ht.trien_khai?.dd_nghiem_thu_n > 0 ? 'pointer' : 'default',
                                textDecoration: ht.trien_khai?.dd_nghiem_thu_n > 0 ? 'underline' : 'none',
                                color: ht.trien_khai?.dd_nghiem_thu_n > 0 ? '#10b981' : 'inherit',
                              }}
                            >
                              {ht.trien_khai?.dd_nghiem_thu_n || 0}
                            </span>
                            , Đấu nối:{' '}
                            <span
                              onClick={() =>
                                handleOpenDrilldown(
                                  { report: 'qlctkt_trien_khai', metric: 'dau_noi_n', label: 'Đấu Nối Mới Ngày n' },
                                  emp,
                                  ht.trien_khai?.dau_noi_n
                                )
                              }
                              style={{
                                fontWeight: 700,
                                cursor: ht.trien_khai?.dau_noi_n > 0 ? 'pointer' : 'default',
                                textDecoration: ht.trien_khai?.dau_noi_n > 0 ? 'underline' : 'none',
                                color: ht.trien_khai?.dau_noi_n > 0 ? '#2563eb' : 'inherit',
                              }}
                            >
                              {ht.trien_khai?.dau_noi_n || 0}
                            </span>
                            )
                          </span>
                        </div>

                        <span
                          onClick={() =>
                            handleOpenDrilldown(
                              { report: 'qlctkt_trien_khai', metric: 'nghiem_thu_n', label: 'Nghiệm Thu Trong Ngày' },
                              emp,
                              ht.trien_khai?.nghiem_thu_n
                            )
                          }
                          style={{
                            fontWeight: 700,
                            color: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? '#10b981' : 'var(--text-muted)',
                            cursor: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? 'pointer' : 'default',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: (ht.trien_khai?.nghiem_thu_n || 0) > 0 ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                          }}
                        >
                          {ht.trien_khai?.nghiem_thu_n || 0}
                        </span>
                      </div>

                      {/* Lũy kế FTTH Tháng + NSLĐ */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '6px',
                        }}
                      >
                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>Lũy kế FTTH:</span>
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'qlctkt_trien_khai', metric: 'nghiem_thu_ftth_thang', label: 'Lũy Kế Nghiệm Thu FTTH Tháng' },
                                emp,
                                ht.trien_khai?.nghiem_thu_ftth_thang
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: '#2563eb',
                              cursor: (ht.trien_khai?.nghiem_thu_ftth_thang || 0) > 0 ? 'pointer' : 'default',
                              textDecoration: (ht.trien_khai?.nghiem_thu_ftth_thang || 0) > 0 ? 'underline' : 'none',
                            }}
                          >
                            {ht.trien_khai?.nghiem_thu_ftth_thang || 0}
                          </span>
                        </div>

                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>NSLĐ:</span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: (ht.trien_khai?.nsld || 0) >= 1 ? '#10b981' : '#f59e0b',
                            }}
                          >
                            {ht.trien_khai?.nsld !== null && ht.trien_khai?.nsld !== undefined ? ht.trien_khai.nsld : '---'}
                          </span>
                        </div>
                      </div>

                      {/* Sự Cố Đóng & Bảo Dưỡng THC */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '6px',
                        }}
                      >
                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>⚡ Đóng sự cố:</span>
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'tong_hop_su_co', metric: 'nghiem_thu_n', label: 'Sự Cố Đã Đóng Trong Ngày' },
                                emp,
                                ht.su_co?.da_dong_n
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: (ht.su_co?.da_dong_n || 0) > 0 ? '#10b981' : 'var(--text-muted)',
                              cursor: (ht.su_co?.da_dong_n || 0) > 0 ? 'pointer' : 'default',
                              textDecoration: (ht.su_co?.da_dong_n || 0) > 0 ? 'underline' : 'none',
                            }}
                          >
                            {ht.su_co?.da_dong_n || 0}
                          </span>
                        </div>

                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'var(--text-secondary)' }}>🔧 Tủ THC xong:</span>
                          <span
                            onClick={() =>
                              handleOpenDrilldown(
                                { report: 'thc', metric: 'closed', label: 'WO Bảo Dưỡng THC Đã Đóng' },
                                emp,
                                ht.thc_bao_duong?.closed_wos
                              )
                            }
                            style={{
                              fontWeight: 700,
                              color: (ht.thc_bao_duong?.completed_cabinets || 0) > 0 ? '#10b981' : 'var(--text-muted)',
                              cursor: (ht.thc_bao_duong?.closed_wos || 0) > 0 ? 'pointer' : 'default',
                              textDecoration: (ht.thc_bao_duong?.closed_wos || 0) > 0 ? 'underline' : 'none',
                            }}
                          >
                            {ht.thc_bao_duong?.completed_cabinets || 0} / {ht.thc_bao_duong?.total_cabinets || 0}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Detail Drilldown for Hoàn Thành */}
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: '6px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                            border: '1px dashed var(--border-color)',
                            fontSize: '0.78rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>
                              TK VTCI ngày:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'qlctkt_trien_khai', metric: 'tk_vtci_ngay_n', label: 'TK VTCI Nghiệm Thu Ngày n' },
                                    emp,
                                    ht.trien_khai?.tk_vtci_ngay_n
                                  )
                                }
                                style={{
                                  color: '#2563eb',
                                  cursor: ht.trien_khai?.tk_vtci_ngay_n > 0 ? 'pointer' : 'default',
                                  textDecoration: ht.trien_khai?.tk_vtci_ngay_n > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ht.trien_khai?.tk_vtci_ngay_n || 0}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              TK VTCI tháng:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'qlctkt_trien_khai', metric: 'tk_vtci_thang_n', label: 'TK VTCI Nghiệm Thu Tháng' },
                                    emp,
                                    ht.trien_khai?.tk_vtci_thang_n
                                  )
                                }
                                style={{
                                  color: '#2563eb',
                                  cursor: ht.trien_khai?.tk_vtci_thang_n > 0 ? 'pointer' : 'default',
                                  textDecoration: ht.trien_khai?.tk_vtci_thang_n > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ht.trien_khai?.tk_vtci_thang_n || 0}
                              </strong>
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span>
                              Báo hỏng THC đóng:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'bao_hong_thc', metric: 'closed', label: 'Báo Hỏng THC Đã Đóng' },
                                    emp,
                                    ht.thc_bao_hong?.closed_wos
                                  )
                                }
                                style={{
                                  color: '#10b981',
                                  cursor: ht.thc_bao_hong?.closed_wos > 0 ? 'pointer' : 'default',
                                  textDecoration: ht.thc_bao_hong?.closed_wos > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ht.thc_bao_hong?.closed_wos || 0}
                              </strong>{' '}
                              (Tỉ lệ: {ht.thc_bao_hong?.wo_rate || '---'})
                            </span>
                            <span>•</span>
                            <span>
                              Port kém đóng:{' '}
                              <strong
                                onClick={() =>
                                  handleOpenDrilldown(
                                    { report: 'port_kem', metric: 'closed', label: 'Port Kém Đã Xử Lý' },
                                    emp,
                                    ht.port_kem?.closed_wos
                                  )
                                }
                                style={{
                                  color: '#10b981',
                                  cursor: ht.port_kem?.closed_wos > 0 ? 'pointer' : 'default',
                                  textDecoration: ht.port_kem?.closed_wos > 0 ? 'underline' : 'none',
                                }}
                              >
                                {ht.port_kem?.closed_wos || 0}
                              </strong>{' '}
                              (Tỉ lệ: {ht.port_kem?.wo_rate || '---'})
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card Footer: Expand toggle button */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid var(--border-color)',
                    }}
                  >
                    <button
                      onClick={() => toggleExpand(emp.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                      }}
                    >
                      {isExpanded ? (
                        <>
                          Thu gọn <ChevronUp size={12} />
                        </>
                      ) : (
                        <>
                          Xem chi tiết VTCI &amp; chỉ số khác <ChevronDown size={12} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 9. BOTTOM SHEET / MODAL: CHỌN CỤM & ĐỘI (AUTO-SAVE) */}
      {showTeamModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 0,
          }}
          onClick={() => setShowTeamModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              maxHeight: '85vh',
              background: 'var(--bg-primary)',
              borderTopLeftRadius: '18px',
              borderTopRightRadius: '18px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              animation: 'slideUp 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Chọn Cụm &amp; Đội Điều Hành
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Lựa chọn sẽ tự động lưu lại cho các lần truy cập sau
                </div>
              </div>

              <button
                onClick={() => setShowTeamModal(false)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Team Input */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '11px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Gõ tên Cụm hoặc tên Đội..."
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 34px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.86rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Teams List grouped by Cluster */}
            <div
              style={{
                padding: '12px 16px',
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {Object.keys(groupedTeamsByCluster).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  Không tìm thấy Cụm / Đội nào
                </div>
              ) : (
                Object.entries(groupedTeamsByCluster).map(([cumName, teams]) => (
                  <div key={cumName}>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '6px',
                        paddingLeft: '4px',
                      }}
                    >
                      {cumName} ({teams.length} đội)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                      {teams.map((t) => {
                        const isCurrent = t.id === selectedTeamId;
                        return (
                          <div
                            key={t.id}
                            onClick={() => handleSelectTeam(t.id)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              border: isCurrent ? '1.5px solid #2563eb' : '1px solid var(--border-color)',
                              background: isCurrent ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: '0.9rem',
                                  fontWeight: isCurrent ? 800 : 600,
                                  color: isCurrent ? '#2563eb' : 'var(--text-primary)',
                                }}
                              >
                                {t.ten_doi}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Mã: <code>{t.ma_doi}</code> • {t.member_count} nhân viên
                              </div>
                            </div>

                            {isCurrent && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: '#2563eb',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: 'rgba(37, 99, 235, 0.15)',
                                }}
                              >
                                Đang chọn ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10. MOBILE-OPTIMIZED DRILLDOWN DRAWER / MODAL */}
      {drilldownTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(3px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 0,
          }}
          onClick={() => setDrilldownTarget(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              height: '90vh',
              maxHeight: '90vh',
              background: 'var(--bg-primary)',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -6px 25px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              animation: 'slideUp 0.22s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Drag Bar & Header */}
            <div
              style={{
                padding: '12px 16px 10px',
                borderBottom: '1px solid var(--border-color)',
                position: 'relative',
              }}
            >
              {/* Drag Handle Pill */}
              <div
                style={{
                  width: '36px',
                  height: '4px',
                  borderRadius: '2px',
                  background: 'var(--border-color)',
                  margin: '0 auto 8px',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.98rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {drilldownTarget.label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '10px',
                        background: '#2563eb',
                        color: '#fff',
                      }}
                    >
                      {filteredDrilldownTasks.length} việc
                    </span>
                  </div>

                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Nhân viên: <strong>{drilldownTarget.emp?.ho_ten}</strong> (<code>{drilldownTarget.emp?.username}</code>)
                  </div>
                </div>

                <button
                  onClick={() => setDrilldownTarget(null)}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Quick Search Inside Drilldown */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ position: 'relative' }}>
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
                  placeholder="Lọc mã WO, tên KH, SĐT, địa chỉ, trạm..."
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                  }}
                />
                {drilldownSearch && (
                  <button
                    onClick={() => setDrilldownSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Drilldown Content Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {loadingDrilldown && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <RotateCcw size={22} className="spin" style={{ margin: '0 auto 6px' }} />
                  <div>Đang nạp chi tiết danh sách công việc...</div>
                </div>
              )}

              {!loadingDrilldown && filteredDrilldownTasks.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 12px',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  Không tìm thấy công việc nào phù hợp
                </div>
              )}

              {/* RENDER COMPACT MOBILE TASK CARDS */}
              {!loadingDrilldown &&
                filteredDrilldownTasks.map((t, idx) => {
                  const taskId = t.task_id || t.ma_cong_viec || `task-${idx}`;
                  const customerName = t.ten_khach_hang || t.noi_dung_cong_viec || 'Khách hàng';
                  const account = t.account || t.so_hop_dong || t.nhan_vien || '';
                  const service = t.dich_vu || t.loai_cong_viec || t.cmtasktypename || '';
                  const address = t.dia_chi_lap_dat || t.don_vi || '';
                  const station = t.tram || t.ma_tram || '';
                  const status = t.tien_do || t.trang_thai || '';
                  const overdueHours = t.so_gio_ton !== undefined ? t.so_gio_ton : t.thoi_gian_con_lai < 0 ? Math.abs(t.thoi_gian_con_lai) : null;
                  const isOverdue = overdueHours !== null && overdueHours > 0;
                  const createdDate = t.ngay_tao || t.thoi_diem_tao || '';
                  const notes = t.ghi_chu_dau_moi || t.ghi_chu || t.ly_do_tich_huy || '';

                  // Detect all phone numbers in task fields
                  const phones = extractPhoneNumbers(`${customerName} ${address} ${notes}`);

                  return (
                    <div
                      key={taskId}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: isOverdue ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: 'var(--shadow-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* Task Card Header: Task ID + Status Badge */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '0.86rem',
                              fontWeight: 800,
                              color: '#2563eb',
                              letterSpacing: '0.2px',
                            }}
                          >
                            {taskId}
                          </span>
                          <button
                            onClick={() => handleCopy(taskId, taskId)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === taskId ? '#10b981' : 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                            title="Sao chép mã"
                          >
                            {copiedId === taskId ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {isOverdue && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                              }}
                            >
                              ⚠️ Trễ {overdueHours}h
                            </span>
                          )}
                          {status && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                background: status.toLowerCase().includes('kết thúc') || status.toLowerCase().includes('đóng') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0,0,0,0.06)',
                                color: status.toLowerCase().includes('kết thúc') || status.toLowerCase().includes('đóng') ? '#10b981' : 'var(--text-secondary)',
                              }}
                            >
                              {status}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Customer & Service Info */}
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {customerName}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {service && (
                            <span
                              style={{
                                fontWeight: 700,
                                color: '#2563eb',
                                marginRight: '6px',
                              }}
                            >
                              [{service}]
                            </span>
                          )}
                          {account && <span>Thuê bao: <code>{account}</code></span>}
                        </div>
                      </div>

                      {/* DIRECT CALL BUTTONS (MOBILE FRIENDLY) */}
                      {phones.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {phones.map((phone) => (
                            <a
                              key={phone}
                              href={`tel:${phone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                padding: '5px 10px',
                                borderRadius: '8px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#059669',
                                textDecoration: 'none',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                              }}
                            >
                              <Phone size={13} /> Gọi {phone}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Address & Station */}
                      {address && (
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '5px',
                            lineHeight: 1.4,
                          }}
                        >
                          <MapPin size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--text-muted)' }} />
                          <span>{address}</span>
                        </div>
                      )}

                      {station && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Trạm / OLT: <strong style={{ color: 'var(--text-secondary)' }}>{station}</strong>
                        </div>
                      )}

                      {/* Creation Date & Schedule */}
                      {createdDate && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> Tạo lúc: {createdDate}
                        </div>
                      )}

                      {/* Notes / Comments */}
                      {notes && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-tertiary, rgba(0,0,0,0.03))',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            borderLeft: '3px solid #2563eb',
                            fontStyle: 'italic',
                          }}
                        >
                          {notes}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Modal Bottom Toolbar */}
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Hiển thị {filteredDrilldownTasks.length} / {drilldownData?.items?.length || 0} công việc
              </div>

              <button
                onClick={() => setDrilldownTarget(null)}
                className="btn"
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  padding: '7px 18px',
                  borderRadius: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
