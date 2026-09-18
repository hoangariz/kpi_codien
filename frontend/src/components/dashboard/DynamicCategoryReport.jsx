import React from 'react';
import { 
  Wrench, 
  Calendar, 
  Layers,
  Filter,
  ArrowLeft
} from 'lucide-react';
import MaintenanceSpreadsheetTable from '../MaintenanceSpreadsheetTable';

export default function DynamicCategoryReport({
  activeCategory,
  maintSpecial,
  loadingMaint = false,
  maintSummary = {},
  byEmployee = [],
  byGroup = [],
  maintActiveTab = 'employee',
  setMaintActiveTab,
  activeSubCategoryFilter = 'parent',
  setActiveSubCategoryFilter,
  selectedBoardId = '',
  setSelectedBoardId,
  selectedBoard = null,
  trackingBoards = [],
  handleOpenDrilldown
}) {
  const formatMonthDisplay = (m) => {
    if (!m) return '';
    const parts = m.split('-');
    if (parts.length === 2) return `Tháng ${parts[1]}/${parts[0]}`;
    return m;
  };

  // Resolve sub-categories: ONLY from backend stats or category definition, NO hardcoded fake fallbacks!
  const subCategoriesList = (maintSpecial?.sub_categories && maintSpecial.sub_categories.length > 0)
    ? maintSpecial.sub_categories
    : (maintSpecial?.sub_categories_stats && maintSpecial.sub_categories_stats.length > 0)
      ? maintSpecial.sub_categories_stats
      : (activeCategory?.sub_categories && activeCategory.sub_categories.length > 0)
        ? activeCategory.sub_categories
        : [];

  const categoryTitle = activeCategory?.name || maintSpecial?.target_task_type || 'Báo Cáo Cơ Điện';

  const handleSelectSubCategory = (subId) => {
    setActiveSubCategoryFilter(subId);
    setTimeout(() => {
      const tableEl = document.querySelector('.excel-table-container');
      if (tableEl) {
        const rect = tableEl.getBoundingClientRect();
        if (rect.top < 70) {
          const navOffset = window.innerWidth <= 768 ? 60 : 76;
          const targetPos = rect.top + window.pageYOffset - navOffset;
          window.scrollTo({ top: Math.max(0, targetPos), behavior: 'smooth' });
        }
      }
    }, 70);
  };

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Header Banner Báo Cáo */}
      <div 
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: subCategoriesList.length > 0 ? '14px' : '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(2, 132, 199, 0.12)',
              color: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Wrench size={20} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                <strong style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {categoryTitle}
                </strong>
                <span className="badge badge-success" style={{ gap: '4px', fontSize: '0.78rem', padding: '2px 9px', fontWeight: 700 }}>
                  <Calendar size={12} /> {formatMonthDisplay(maintSpecial?.active_month)}
                </span>

              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Bảng tính chi tiết và điều phối nhiệm vụ theo từng Nhân viên & Nhóm
              </span>
            </div>
          </div>
        </div>

        {/* Sub-categories Navigator Tabs / Pills - ONLY shown when there ARE configured sub-categories */}
        {subCategoriesList.length > 0 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            overflowX: 'auto', 
            paddingTop: '12px', 
            borderTop: '1px solid var(--border-color)', 
            flexWrap: 'wrap' 
          }}>
            <span style={{ 
              fontSize: '0.82rem', 
              fontWeight: 700, 
              color: 'var(--text-secondary)', 
              marginRight: '4px', 
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <Filter size={14} style={{ color: 'var(--brand-primary)' }} />
              Chọn đầu việc con:
            </span>

            {/* Tab: Tất Cả (Bảng Mẹ) */}
            <button
              onClick={() => handleSelectSubCategory('parent')}
              style={{
                padding: '6px 14px',
                fontSize: '0.82rem',
                borderRadius: '20px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeSubCategoryFilter === 'parent' ? '1px solid var(--brand-primary)' : '1px solid var(--border-color)',
                background: activeSubCategoryFilter === 'parent' ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                color: activeSubCategoryFilter === 'parent' ? '#ffffff' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeSubCategoryFilter === 'parent' ? '0 2px 8px rgba(2, 132, 199, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>🏛️ Tất Cả</span>
              <span style={{
                padding: '1px 6px',
                borderRadius: '10px',
                background: activeSubCategoryFilter === 'parent' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                color: activeSubCategoryFilter === 'parent' ? '#ffffff' : 'var(--text-primary)',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                {maintSummary.total ?? 0}
              </span>
            </button>

            {/* Tab: Each Sub-Category */}
            {subCategoriesList.map((sub) => {
              const isSelected = activeSubCategoryFilter === String(sub.id);
              const icon = sub.keyword === 'CONDITIONER' ? '❄️' :
                           sub.keyword === 'GENERATOR' ? '⚡' :
                           sub.keyword === 'VENTILATION' ? '🌀' :
                           sub.is_other ? '📦' : '🔧';
              return (
                <button
                  key={sub.id}
                  onClick={() => handleSelectSubCategory(String(sub.id))}
                  title={sub.keyword ? `Từ khóa: ${sub.keyword}` : sub.name}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    borderRadius: '20px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: isSelected ? '1px solid var(--brand-primary)' : '1px solid var(--border-color)',
                    background: isSelected ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                    color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.3)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{icon} {sub.name}</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                    color: isSelected ? '#ffffff' : 'var(--text-primary)',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {sub.summary?.total ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Case 1: No sub-categories configured for this category -> Directly render the Parent Table cleanly */}
      {subCategoriesList.length === 0 && (
        <MaintenanceSpreadsheetTable
          key={`maint-summary-${activeCategory?.id || 'main'}-${maintActiveTab}`}
          title={`BẢNG TỔNG HỢP: ${categoryTitle}`}
          badgeText="BẢNG BÁO CÁO TỔNG HỢP"
          badgeType="badge-info"
          isChild={false}
          summary={maintSummary}
          byEmployee={byEmployee}
          byGroup={byGroup}
          activeTab={maintActiveTab}
          onTabChange={setMaintActiveTab}
          onDrilldown={handleOpenDrilldown}
          exportFilename={`Bao_cao_${activeCategory?.id || 'thang'}_${maintSpecial?.active_month || '2026-09'}`}
        />
      )}


      {/* Case 3: Sub-categories exist & filter is 'parent' -> Render Parent Table Only */}
      {subCategoriesList.length > 0 && activeSubCategoryFilter === 'parent' && (
        <div>
          <MaintenanceSpreadsheetTable
            key={`maint-parent-${activeCategory?.id || 'main'}-${maintActiveTab}`}
            title={`BẢNG MẸ: ${categoryTitle}`}
            badgeText="BẢNG MẸ TỔNG HỢP"
            badgeType="badge-info"
            isChild={false}
            summary={maintSummary}
            byEmployee={byEmployee}
            byGroup={byGroup}
            activeTab={maintActiveTab}
            onTabChange={setMaintActiveTab}
            onDrilldown={handleOpenDrilldown}
            exportFilename={`Bao_cao_me_${maintSpecial?.active_month || '2026-09'}`}
          />
        </div>
      )}

      {/* Case 4: Sub-categories exist & filter is a specific child table -> Render that Child Table Only */}
      {subCategoriesList.length > 0 && activeSubCategoryFilter !== 'all' && activeSubCategoryFilter !== 'parent' && (() => {
        const selectedSub = subCategoriesList.find(s => String(s.id) === String(activeSubCategoryFilter));
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
                onClick={() => handleSelectSubCategory('parent')}
                style={{ fontSize: '0.84rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: 'var(--radius-md)' }}
              >
                <ArrowLeft size={15} /> Quay lại tất cả
              </button>
            </div>
            <MaintenanceSpreadsheetTable
              key={`maint-sub-${selectedSub.id}-${maintActiveTab}`}
              title={`${icon}BẢNG CON: ${selectedSub.name}`}
              badgeText={selectedSub.is_other ? 'BẢNG KHÁC' : `TỪ KHÓA: ${selectedSub.keyword}`}
              badgeType={selectedSub.is_other ? 'badge-neutral' : 'badge-primary'}
              isChild={true}
              keyword={selectedSub.keyword}
              isOther={selectedSub.is_other}
              summary={selectedSub.summary || {}}
              byEmployee={selectedSub.by_employee || []}
              byGroup={selectedSub.by_group || []}
              activeTab={maintActiveTab}
              onTabChange={setMaintActiveTab}
              onDrilldown={handleOpenDrilldown}
              subCategoryContext={{
                subCategoryId: selectedSub.id,
                subKeyword: selectedSub.is_other ? null : selectedSub.keyword,
                isSubOther: selectedSub.is_other,
                subCategoryName: selectedSub.name,
                allSubKeywords: subCategoriesList.map(s => s.keyword).filter(Boolean)
              }}
              exportFilename={`Bao_cao_con_${selectedSub.keyword || 'khac'}_${maintSpecial?.active_month || '2026-09'}`}
            />
          </div>
        );
      })()}
    </div>
  );
}
