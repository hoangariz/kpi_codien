import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Wrench, 
  Calendar, 
  Layers,
  Users,
  FolderKanban
} from 'lucide-react';
import { statsApi } from '../api/statsApi';
import MaintenanceSpreadsheetTable from '../components/MaintenanceSpreadsheetTable';

export default function MaintenancePage({ onNavigateToTasks }) {
  const [activeTab, setActiveTab] = useState('employee'); // 'employee' | 'group'
  const [activeSubCategoryFilter, setActiveSubCategoryFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['stats-maintenance-special'],
    queryFn: () => statsApi.getMaintenanceSpecial(),
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <Wrench size={36} className="spin" style={{ opacity: 0.5, marginBottom: '12px' }} />
        <p>Đang tải dữ liệu thống kê bảo dưỡng cơ điện...</p>
      </div>
    );
  }

  const { 
    target_task_type, 
    active_month, 
    excluded_closed_prior_months, 
    summary = {},
    by_employee = [], 
    by_group = []
  } = data || {};

  const sub_categories = (data?.sub_categories && data.sub_categories.length > 0)
    ? data.sub_categories
    : (data?.sub_categories_stats && data.sub_categories_stats.length > 0)
      ? data.sub_categories_stats
      : [];

  const formatMonthDisplay = (m) => {
    if (!m) return '';
    const parts = m.split('-');
    if (parts.length === 2) return `Tháng ${parts[1]}/${parts[0]}`;
    return m;
  };

  return (
    <div>
      {/* Banner info */}
      <div 
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span className="badge badge-info">Chuyên Mục Theo Dõi Đặc Thù</span>
          <span className="badge badge-success" style={{ gap: '4px' }}>
            <Calendar size={13} /> {formatMonthDisplay(active_month)}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hệ thống: ICMS</span>
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {target_task_type}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '850px', lineHeight: 1.6, margin: 0 }}>
          Bảng thống kê định dạng Excel: <strong>Đã tự động loại bỏ các công việc đã đóng của tháng trước</strong>.
          Chỉ theo dõi khối lượng việc trong {formatMonthDisplay(active_month)} và các việc tồn đọng quá hạn chưa đóng.
          {excluded_closed_prior_months > 0 && (
            <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}> (Đã lọc bớt {excluded_closed_prior_months} việc đã đóng của các tháng trước).</span>
          )}
        </p>

        {/* Sub-categories Navigator Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingTop: '16px', marginTop: '16px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '4px', whiteSpace: 'nowrap' }}>
            Bộ lọc đầu việc:
          </span>
          <button
            className={`btn ${activeSubCategoryFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveSubCategoryFilter('all')}
            style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: '20px', fontWeight: 700 }}
          >
            📊 Tất Cả (Bảng Mẹ + {sub_categories.length} Bảng Con)
          </button>

          <button
            className={`btn ${activeSubCategoryFilter === 'parent' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveSubCategoryFilter('parent')}
            style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: '20px', fontWeight: 700 }}
          >
            🏛️ Chỉ Bảng Mẹ Tổng Hợp ({summary.total ?? 0})
          </button>

          {sub_categories.map((sub) => {
            const isSelected = activeSubCategoryFilter === String(sub.id);
            const icon = sub.keyword === 'CONDITIONER' ? '❄️' :
                         sub.keyword === 'GENERATOR' ? '⚡' :
                         sub.keyword === 'VENTILATION' ? '🌀' :
                         sub.is_other ? '📦' : '🔧';
            return (
              <button
                key={sub.id}
                className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActiveSubCategoryFilter(String(sub.id))}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  borderRadius: '20px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{icon} {sub.name}</span>
                {sub.keyword && (
                  <span style={{ fontSize: '0.72rem', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>
                    ({sub.keyword})
                  </span>
                )}
                <span 
                  style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(2, 132, 199, 0.15)',
                    color: isSelected ? '#ffffff' : 'var(--brand-primary)',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}
                >
                  {sub.summary?.total ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Case 1: activeSubCategoryFilter === 'all' -> Render Parent + All Child Tables */}
      {activeSubCategoryFilter === 'all' && (
        <>
          <MaintenanceSpreadsheetTable
            title={`BẢNG MẸ: ${target_task_type}`}
            subtitle={`Tổng hợp toàn bộ khối lượng bảo dưỡng ${formatMonthDisplay(active_month)}.`}
            badgeText="BẢNG MẸ TỔNG HỢP"
            badgeType="badge-info"
            isChild={false}
            summary={summary}
            byEmployee={by_employee}
            byGroup={by_group}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            exportFilename={`Bao_cao_me_${active_month || '2026-09'}`}
          />

          {sub_categories.length > 0 && (
            <div style={{ margin: '36px 0 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'rgba(2, 132, 199, 0.15)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Bảng Thống Kê Các Đầu Việc Con ({sub_categories.length} bảng con)
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Phân loại tự động theo từ khóa trong cột <strong>"Nội dung công việc"</strong>. Các công việc không trùng từ khóa nào được tự động chuyển vào bảng <strong>"Còn lại / Khác"</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {sub_categories.map((sub) => {
            const icon = sub.keyword === 'CONDITIONER' ? '❄️ ' :
                         sub.keyword === 'GENERATOR' ? '⚡ ' :
                         sub.keyword === 'VENTILATION' ? '🌀 ' :
                         sub.is_other ? '📦 ' : '🔧 ';
            return (
              <MaintenanceSpreadsheetTable
                key={sub.id}
                title={`${icon}BẢNG CON: ${sub.name}`}
                subtitle={sub.description || (sub.is_other ? 'Bao gồm các công việc không chứa bất kỳ từ khóa con nào phía trên' : `Phân loại tự động theo từ khóa: "${sub.keyword}" trong cột Nội dung công việc`)}
                badgeText={sub.is_other ? 'BẢNG KHÁC' : `TỪ KHÓA: ${sub.keyword}`}
                badgeType={sub.is_other ? 'badge-neutral' : 'badge-primary'}
                isChild={true}
                keyword={sub.keyword}
                isOther={sub.is_other}
                summary={sub.summary || {}}
                byEmployee={sub.by_employee || []}
                byGroup={sub.by_group || []}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                exportFilename={`Bao_cao_con_${sub.keyword || 'khac'}_${active_month || '2026-09'}`}
              />
            );
          })}
        </>
      )}

      {/* Case 2: activeSubCategoryFilter === 'parent' -> Render Parent Table Only */}
      {activeSubCategoryFilter === 'parent' && (
        <div>
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              className="btn btn-outline"
              onClick={() => setActiveSubCategoryFilter('all')}
              style={{ fontSize: '0.84rem', padding: '6px 14px' }}
            >
              ← Quay lại xem tất cả các bảng
            </button>
          </div>
          <MaintenanceSpreadsheetTable
            title={`BẢNG MẸ: ${target_task_type}`}
            subtitle={`Tổng hợp toàn bộ khối lượng bảo dưỡng ${formatMonthDisplay(active_month)}.`}
            badgeText="BẢNG MẸ TỔNG HỢP"
            badgeType="badge-info"
            isChild={false}
            summary={summary}
            byEmployee={by_employee}
            byGroup={by_group}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            exportFilename={`Bao_cao_me_${active_month || '2026-09'}`}
          />
        </div>
      )}

      {/* Case 3: activeSubCategoryFilter is a specific sub_category_id -> Render that Child Table Only */}
      {activeSubCategoryFilter !== 'all' && activeSubCategoryFilter !== 'parent' && (() => {
        const selectedSub = sub_categories.find(s => String(s.id) === String(activeSubCategoryFilter));
        if (!selectedSub) return null;
        const icon = selectedSub.keyword === 'CONDITIONER' ? '❄️ ' :
                     selectedSub.keyword === 'GENERATOR' ? '⚡ ' :
                     selectedSub.keyword === 'VENTILATION' ? '🌀 ' :
                     selectedSub.is_other ? '📦 ' : '🔧 ';
        return (
          <div>
            <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                className="btn btn-outline"
                onClick={() => setActiveSubCategoryFilter('all')}
                style={{ fontSize: '0.84rem', padding: '6px 14px' }}
              >
                ← Quay lại xem tất cả các bảng ({1 + sub_categories.length} bảng)
              </button>
            </div>
            <MaintenanceSpreadsheetTable
              key={selectedSub.id}
              title={`${icon}BẢNG CON: ${selectedSub.name}`}
              subtitle={selectedSub.description || (selectedSub.is_other ? 'Bao gồm các công việc không chứa bất kỳ từ khóa con nào phía trên' : `Phân loại tự động theo từ khóa: "${selectedSub.keyword}" trong cột Nội dung công việc`)}
              badgeText={selectedSub.is_other ? 'BẢNG KHÁC' : `TỪ KHÓA: ${selectedSub.keyword}`}
              badgeType={selectedSub.is_other ? 'badge-neutral' : 'badge-primary'}
              isChild={true}
              keyword={selectedSub.keyword}
              isOther={selectedSub.is_other}
              summary={selectedSub.summary || {}}
              byEmployee={selectedSub.by_employee || []}
              byGroup={selectedSub.by_group || []}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              exportFilename={`Bao_cao_con_${selectedSub.keyword || 'khac'}_${active_month || '2026-09'}`}
            />
          </div>
        );
      })()}
    </div>
  );
}
