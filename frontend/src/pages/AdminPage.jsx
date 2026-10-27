import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Settings, 
  Calendar, 
  UploadCloud, 
  Layers, 
  BookmarkCheck, 
  FileSpreadsheet, 
  Network,
  Eye 
} from 'lucide-react';

import { settingsApi } from '../api/settingsApi';
import { reportCategoryApi } from '../api/reportCategoryApi';
import { fixedWoApi } from '../api/fixedWoApi';
import { trackingApi } from '../api/trackingApi';
import { importsApi } from '../api/importsApi';

import AdminMonthSection from '../components/admin/AdminMonthSection';
import AdminCategoriesSection from '../components/admin/AdminCategoriesSection';
import AdminFixedWoSection from '../components/admin/AdminFixedWoSection';
import AdminAllWoHthSection from '../components/admin/AdminAllWoHthSection';
import AdminBoardsSection from '../components/admin/AdminBoardsSection';
import AdminFilesSection from '../components/admin/AdminFilesSection';

export default function AdminPage({ onNavigateToDashboard }) {
  // Settings State
  const [selectedMonth, setSelectedMonth] = useState('2026-09');

  // Left Navbar Active Tab ('month' | 'categories' | 'all_wo_hth' | 'fixed_wo_reports' | 'boards' | 'files' | 'all')
  const [activeAdminNav, setActiveAdminNav] = useState('month');

  // 1. Fetch current settings
  const { data: settingsData } = useQuery({
    queryKey: ['system-settings'],
    queryFn: settingsApi.getSettings,
  });

  useEffect(() => {
    if (settingsData?.current_month) {
      setSelectedMonth(settingsData.current_month);
    }
  }, [settingsData]);

  // Badge queries
  const { data: reportCategories } = useQuery({
    queryKey: ['report-categories', selectedMonth],
    queryFn: () => reportCategoryApi.getCategories(selectedMonth),
  });

  const { data: fixedWoReports } = useQuery({
    queryKey: ['admin-fixed-wo-reports'],
    queryFn: fixedWoApi.getReports,
  });

  const { data: hthReport } = useQuery({
    queryKey: ['admin-all-wo-hth-report'],
    queryFn: fixedWoApi.getAllWoHthReport,
  });

  const { data: trackingBoards } = useQuery({
    queryKey: ['tracking-boards'],
    queryFn: trackingApi.getBoards,
  });

  const { data: importLogs } = useQuery({
    queryKey: ['admin-import-logs'],
    queryFn: () => importsApi.getImportLogs(20),
  });

  const adminNavItems = [
    {
      id: 'month',
      label: 'Cấu Hình Tháng Báo Cáo Hiện Tại',
      icon: Calendar,
      color: '#0284c7',
      badge: selectedMonth,
    },
    {
      id: 'all_wo_hth',
      label: 'Quản Lý Báo Cáo All-Wo-HTH (Tổng Quan)',
      icon: Network,
      color: '#0ea5e9',
      badge: hthReport ? `${hthReport.total_wos} mã WO` : null,
    },
    {
      id: 'categories',
      label: 'Quản Lý Danh Mục Loại Báo Cáo (Hiển Thị Trên Dashboard)',
      icon: Layers,
      color: '#0284c7',
      badge: reportCategories ? `${reportCategories.length} danh mục` : null,
    },
    {
      id: 'fixed_wo_reports',
      label: 'Quản Lý Danh Mục Loại Báo Cáo Cố định WO',
      icon: FileSpreadsheet,
      color: '#f59e0b',
      badge: fixedWoReports ? `${fixedWoReports.length} danh mục` : null,
    },
    {
      id: 'boards',
      label: 'Quản Lý Bảng WO Cần Theo Dõi',
      icon: BookmarkCheck,
      color: '#8b5cf6',
      badge: trackingBoards ? `${trackingBoards.length} bảng` : null,
    },
    {
      id: 'files',
      label: 'Quản Lý File & Dữ Liệu Nguồn',
      icon: UploadCloud,
      color: '#10b981',
      badge: importLogs ? `${importLogs.length} file` : null,
    },
  ];

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 16px' }}>
      {/* Title & Navigation */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={24} style={{ color: 'var(--brand-primary)' }} />
            Trang Quản Trị Hệ Thống (/admin)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Cấu hình tháng báo cáo, quản lý danh mục loại báo cáo, bảng WO theo dõi và quản lý file.
          </p>
        </div>

        <button
          className="btn btn-outline"
          onClick={() => {
            if (onNavigateToDashboard) onNavigateToDashboard();
            else window.location.href = '/';
          }}
          style={{ gap: '6px' }}
        >
          ⬅ Về Trang Tổng Quan
        </button>
      </div>

      {/* 2-Column Grid Layout: Left Navbar + Right Content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
        {/* Left Sticky Navbar */}
        <aside
          style={{
            width: '300px',
            flexShrink: 0,
            position: 'sticky',
            top: '16px',
            zIndex: 10
          }}
        >
          <div
            className="table-card"
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                DANH MỤC QUẢN TRỊ
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', background: 'var(--brand-light)', padding: '2px 8px', borderRadius: '10px' }}>
                Admin
              </span>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {adminNavItems.map(item => {
                const isActive = activeAdminNav === item.id;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveAdminNav(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      width: '100%',
                      padding: '11px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: isActive ? `1.5px solid ${item.color}` : '1.5px solid transparent',
                      background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
                    }}
                  >
                    <div 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: 'var(--radius-sm)', 
                        background: isActive ? `${item.color}20` : 'var(--bg-tertiary)', 
                        color: item.color,
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '1px'
                      }}
                    >
                      <IconComp size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: '0.82rem', 
                        fontWeight: isActive ? 700 : 600, 
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        lineHeight: 1.35,
                        marginBottom: '3px'
                      }}>
                        {item.label}
                      </div>
                      {item.badge && (
                        <span 
                          style={{ 
                            display: 'inline-block',
                            fontSize: '0.68rem', 
                            fontWeight: 700, 
                            color: item.color,
                            background: `${item.color}15`,
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 0' }} />

              <button
                type="button"
                onClick={() => setActiveAdminNav('all')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: activeAdminNav === 'all' ? '1.5px solid var(--brand-primary)' : '1.5px solid transparent',
                  background: activeAdminNav === 'all' ? 'var(--brand-light)' : 'transparent',
                  color: activeAdminNav === 'all' ? 'var(--brand-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: activeAdminNav === 'all' ? 700 : 600,
                  transition: 'all var(--transition-fast)'
                }}
              >
                <Eye size={14} />
                <span>Xem Tất Cả Các Mục</span>
              </button>
            </nav>
          </div>
        </aside>

        {/* Right Main Content Panel */}
        <main style={{ flex: '1 1 700px', minWidth: 0 }}>
          {/* 1. Month Setting Card */}
          {(activeAdminNav === 'all' || activeAdminNav === 'month') && (
            <AdminMonthSection 
              selectedMonth={selectedMonth} 
              setSelectedMonth={setSelectedMonth} 
            />
          )}

          {/* 1b. All-Wo-HTH Report */}
          {(activeAdminNav === 'all' || activeAdminNav === 'all_wo_hth') && (
            <AdminAllWoHthSection />
          )}

          {/* 2. Report Categories */}
          {(activeAdminNav === 'all' || activeAdminNav === 'categories') && (
            <AdminCategoriesSection 
              selectedMonth={selectedMonth} 
            />
          )}

          {/* 3. Fixed WO Reports */}
          {(activeAdminNav === 'all' || activeAdminNav === 'fixed_wo_reports') && (
            <AdminFixedWoSection />
          )}

          {/* 4. Tracking Boards */}
          {(activeAdminNav === 'all' || activeAdminNav === 'boards') && (
            <AdminBoardsSection />
          )}

          {/* 5. Files Upload & Management */}
          {(activeAdminNav === 'all' || activeAdminNav === 'files') && (
            <AdminFilesSection />
          )}
        </main>
      </div>
    </div>
  );
}
