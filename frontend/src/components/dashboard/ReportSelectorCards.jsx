import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  ThumbsUp,
  LayoutGrid,
  Table
} from 'lucide-react';

export default function ReportSelectorCards({
  mode = 'codien', // 'codien' | 'nhatram' | 'overview'
  categories = [],
  fixedWoReports = [],
  selectedCard = null,
  onSelectCard,
  liveMaintSummary = {},
  liveFixedWoSummary = {},
}) {
  const [showOtherReports, setShowOtherReports] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('report_selector_view_mode') || 'cards';
    } catch {
      return 'cards';
    }
  });

  const handleSetViewMode = (newMode) => {
    setViewMode(newMode);
    try {
      localStorage.setItem('report_selector_view_mode', newMode);
    } catch (e) {
      console.error(e);
    }
  };

  // Build card items based on mode
  const cards = [];

  // Match items according to mode
  // Chỉ có tick is_all_wo mới được tự động hiển thị ở cả 2 nơi: Tổng Quan và Nhà Trạm
  const isMatchMode = (item, defaultMode) => {
    if (item?.is_all_wo) {
      return mode === 'overview' || mode === 'nhatram';
    }
    const view = item?.dashboard_view || defaultMode;
    if (view === 'all') return true;
    return view === mode;
  };

  const matchingCategories = (categories || []).filter(cat => 
    isMatchMode(cat, mode === 'nhatram' ? 'nhatram' : 'codien')
  );

  const matchingFixedWoReports = (fixedWoReports || []).filter(rep => 
    isMatchMode(rep, 'nhatram')
  );

  // 1. Process matching categories
  matchingCategories.forEach(cat => {
    // 1a. Category Card (Clean, NO "Tổng hợp" text, NO "🏛️" icon)
    const isParentSelected = selectedCard?.type === 'category_parent' && selectedCard?.categoryId === cat.id;
    const parentSum = (isParentSelected && liveMaintSummary?.total != null)
      ? liveMaintSummary
      : (cat.summary || { total: 0, closed: 0, pending: 0, overdue: 0, completion_rate: 0 });

    cards.push({
      id: `cat-${cat.id}-parent`,
      type: 'category_parent',
      categoryId: cat.id,
      category: cat,
      title: cat.name,
      sortOrder: cat.sort_order ?? 0,
      isPriority: Boolean(cat.is_priority),
      isAllWo: Boolean(cat.is_all_wo),
      isStandalone: false,
      badge: null,
      icon: null,
      summary: parentSum,
      isSelected: isParentSelected
    });

    // 1b. Standalone Sub-Category Cards (Mỗi Bảng Độc Lập là 1 Card mới với icon like)
    (cat.sub_categories || []).forEach(sub => {
      if (sub.is_standalone_table) {
        const isSubSelected = selectedCard?.type === 'category_sub' && selectedCard?.categoryId === cat.id && selectedCard?.subId === sub.id;
        const subIcon = sub.keyword === 'CONDITIONER' ? '❄️ ' :
                        sub.keyword === 'GENERATOR' ? '⚡ ' :
                        sub.keyword === 'VENTILATION' ? '🌀 ' :
                        sub.is_other ? '📦 ' : '🔧 ';

        cards.push({
          id: `cat-${cat.id}-sub-${sub.id}`,
          type: 'category_sub',
          categoryId: cat.id,
          category: cat,
          subId: sub.id,
          subCategory: sub,
          title: `${subIcon}${sub.name}`,
          sortOrder: (cat.sort_order ?? 0) * 100 + (sub.sort_order ?? 0),
          isPriority: Boolean(cat.is_priority),
          isAllWo: false,
          isStandalone: true,
          badge: null,
          badgeType: null,
          summary: sub.summary || { total: 0, closed: 0, pending: 0, overdue: 0, completion_rate: 0 },
          isSelected: isSubSelected
        });
      }
    });
  });

  // 2. Process matching Fixed WO reports
  matchingFixedWoReports.forEach(rep => {
    const isFixedSelected = selectedCard?.type === 'fixed_wo' && selectedCard?.reportId === rep.id;
    const repSum = (isFixedSelected && liveFixedWoSummary?.total != null)
      ? liveFixedWoSummary
      : (rep.summary || { total: 0, closed: 0, pending: 0, overdue: 0, completion_rate: 0 });

    cards.push({
      id: `fixed-${rep.id}`,
      type: 'fixed_wo',
      reportId: rep.id,
      fixedWoReport: rep,
      title: rep.name,
      sortOrder: rep.sort_order ?? 0,
      isPriority: Boolean(rep.is_priority),
      isAllWo: Boolean(rep.is_all_wo),
      badge: rep.is_all_wo ? 'ALL-WO' : 'CỐ ĐỊNH WO',
      badgeType: rep.is_all_wo ? 'badge-all-wo' : 'badge-warning',
      summary: repSum,
      isSelected: isFixedSelected
    });
  });

  // Sắp xếp thứ tự hiển thị card:
  // 1. Ưu tiên trước (isPriority: true)
  // 2. sortOrder ASC (số nhỏ đứng trước)
  // 3. title ASC
  cards.sort((a, b) => {
    if (a.isPriority !== b.isPriority) {
      return a.isPriority ? -1 : 1;
    }
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return (a.title || '').localeCompare(b.title || '');
  });

  // Phân chia thành nhóm Ưu Tiên và nhóm Báo Cáo Khác
  const priorityCards = cards.filter(c => c.isPriority);
  const regularCards = cards.filter(c => !c.isPriority);

  // Fallback nếu người dùng chưa đánh dấu ưu tiên cho card nào:
  // Lấy top 4 hoặc top 6 card đầu tiên theo thứ tự sắp xếp làm ưu tiên ban đầu
  let effectivePriorityCards = priorityCards;
  let effectiveOtherCards = regularCards;

  if (priorityCards.length === 0) {
    const fallbackCount = Math.min(cards.length, 6);
    effectivePriorityCards = cards.slice(0, fallbackCount);
    effectiveOtherCards = cards.slice(fallbackCount);
  }

  // Tự động mở rộng nhóm Báo cáo khác nếu card đang chọn nằm trong nhóm đó
  useEffect(() => {
    if (effectiveOtherCards.some(c => c.isSelected)) {
      setShowOtherReports(true);
    }
  }, [selectedCard, effectiveOtherCards]);

  if (mode === 'overview' && cards.length === 0) {
    return null;
  }

  const renderCard = (card) => {
    const sum = card.summary || {};
    const totalTasks = sum.total ?? 0;
    const closedTasks = sum.closed ?? 0;
    const pendingTasks = sum.pending ?? 0;
    const overdueTasks = sum.overdue ?? 0;
    const rateVal = sum.completion_rate != null 
      ? sum.completion_rate 
      : (totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 1000) / 10 : 0);

    return (
      <div 
        key={card.id}
        className="report-selector-card"
        onClick={() => onSelectCard && onSelectCard(card)}
        style={{
          cursor: 'pointer',
          padding: '13px 15px',
          borderRadius: 'var(--radius-lg)',
          border: card.isSelected 
            ? '2px solid var(--brand-primary)' 
            : card.isAllWo
              ? '1.5px solid rgba(139, 92, 246, 0.45)'
              : card.isStandalone 
                ? '1.5px solid rgba(16, 185, 129, 0.45)' 
                : '1px solid var(--border-color)',
          background: card.isSelected 
            ? 'var(--brand-light)' 
            : 'var(--bg-secondary)',
          boxShadow: card.isSelected 
            ? '0 4px 14px -2px rgba(2, 132, 199, 0.25)' 
            : 'var(--shadow-sm)',
          transition: 'all 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          minHeight: '130px'
        }}
      >
        <div>
          {/* Header badge & Total count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', minHeight: '22px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {card.isSelected ? (
                <span 
                  className="badge badge-primary"
                  style={{ gap: '4px', fontWeight: 800, fontSize: '0.72rem', padding: '2px 8px' }}
                >
                  <CheckCircle2 size={12} /> Đang Xem
                </span>
              ) : null}

              {card.isAllWo ? (
                <span 
                  className="badge"
                  style={{ 
                    gap: '4px', 
                    fontWeight: 800, 
                    fontSize: '0.7rem', 
                    padding: '2px 8px',
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 1px 4px rgba(139, 92, 246, 0.35)'
                  }}
                  title="Báo cáo nguồn All-WO hiển thị ở cả Tổng Quan và Nhà Trạm"
                >
                  🌐 ALL-WO
                </span>
              ) : card.badge ? (
                <span 
                  className={`badge ${card.badgeType}`}
                  style={{ gap: '4px', fontWeight: 800, fontSize: '0.72rem', padding: '2px 8px' }}
                >
                  {card.badge}
                </span>
              ) : null}

              {card.isPriority && (
                <span 
                  className="badge badge-warning"
                  style={{ gap: '3px', fontWeight: 800, fontSize: '0.68rem', padding: '2px 7px' }}
                  title="Ưu tiên"
                >
                  ⭐
                </span>
              )}

              {card.isStandalone && (
                <span 
                  className="badge badge-success"
                  style={{ 
                    padding: '3px 7px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderRadius: '6px',
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 1px 3px rgba(16, 185, 129, 0.25)',
                    lineHeight: 1
                  }}
                  title="Bảng độc lập"
                >
                  <ThumbsUp size={12} />
                </span>
              )}
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {totalTasks.toLocaleString()} WO
            </span>
          </div>

          {/* Card Title (Clean, NO icon 🏛️, NO 'Tổng hợp') */}
          <h4 style={{ 
            fontSize: '0.92rem', 
            fontWeight: 800, 
            color: card.isSelected ? 'var(--brand-primary)' : 'var(--text-primary)', 
            marginBottom: '10px', 
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {card.title}
          </h4>
        </div>

        {/* Mini KPI row: TỔNG - ĐÃ ĐÓNG - TỒN - TỈ LỆ - QUÁ HẠN */}
        <div 
          className="card-kpi-summary-row"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '2px',
            padding: '6px 4px',
            background: card.isSelected ? 'rgba(255, 255, 255, 0.65)' : 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            textAlign: 'center',
            fontSize: '0.72rem',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.64rem', display: 'block', fontWeight: 600 }}>TỔNG</span>
            <strong style={{ color: 'var(--text-primary)' }}>{totalTasks.toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.64rem', display: 'block', fontWeight: 600 }}>ĐÃ ĐÓNG</span>
            <strong style={{ color: 'var(--success-dark)' }}>{closedTasks.toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.64rem', display: 'block', fontWeight: 600 }}>TỒN</span>
            <strong style={{ color: 'var(--warning-dark)' }}>{pendingTasks.toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.64rem', display: 'block', fontWeight: 600 }}>TỶ LỆ</span>
            <strong style={{ color: rateVal >= 80 ? 'var(--success-dark)' : 'var(--brand-primary)' }}>{rateVal}%</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.64rem', display: 'block', fontWeight: 600 }}>QUÁ HẠN</span>
            <strong style={{ color: overdueTasks > 0 ? 'var(--danger-dark)' : 'var(--text-muted)' }}>{overdueTasks.toLocaleString()}</strong>
          </div>
        </div>
      </div>
    );
  };

  // Render Table View Row (Spreadsheet / Excel Grid)
  const renderTableRow = (card, index) => {
    const sum = card.summary || {};
    const totalTasks = sum.total ?? 0;
    const closedTasks = sum.closed ?? 0;
    const pendingTasks = sum.pending ?? 0;
    const overdueTasks = sum.overdue ?? 0;
    const rateVal = sum.completion_rate != null 
      ? sum.completion_rate 
      : (totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 1000) / 10 : 0);

    return (
      <tr 
        key={card.id}
        onClick={() => onSelectCard && onSelectCard(card)}
        className="excel-row"
        style={{
          cursor: 'pointer',
          background: card.isSelected 
            ? 'rgba(2, 132, 199, 0.10)' 
            : index % 2 === 1 ? '#f8fafc' : '#ffffff',
          fontWeight: card.isSelected ? 700 : 'normal',
          transition: 'background 0.12s ease'
        }}
        title="Nhấp để xem báo cáo này"
      >
        <td style={{ textAlign: 'center', border: '1px solid #cbd5e1', padding: '6px 4px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {index + 1}
        </td>

        <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', borderLeft: card.isSelected ? '4px solid var(--brand-primary)' : '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: card.isSelected ? 'var(--brand-primary)' : 'var(--text-primary)', fontWeight: card.isSelected ? 800 : 600, fontSize: '0.82rem' }}>
              {card.title}
            </span>

            {card.isSelected && (
              <span className="badge badge-primary" style={{ fontSize: '0.64rem', padding: '1px 5px', gap: '2px', fontWeight: 800 }}>
                <CheckCircle2 size={10} /> Đang Xem
              </span>
            )}

            {card.isAllWo && (
              <span className="badge" style={{ fontSize: '0.64rem', padding: '1px 5px', fontWeight: 800, background: '#8b5cf6', color: '#fff' }}>
                🌐 ALL-WO
              </span>
            )}

            {!card.isAllWo && card.badge && (
              <span className={`badge ${card.badgeType}`} style={{ fontSize: '0.64rem', padding: '1px 5px', fontWeight: 800 }}>
                {card.badge}
              </span>
            )}

            {card.isPriority && (
              <span className="badge badge-warning" style={{ fontSize: '0.64rem', padding: '1px 5px', fontWeight: 800 }} title="Ưu tiên">
                ⭐
              </span>
            )}

            {card.isStandalone && (
              <span className="badge badge-success" style={{ fontSize: '0.64rem', padding: '1px 5px' }} title="Bảng độc lập">
                <ThumbsUp size={10} />
              </span>
            )}
          </div>
        </td>

        <td style={{ textAlign: 'right', border: '1px solid #cbd5e1', padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {totalTasks.toLocaleString()}
        </td>

        <td style={{ textAlign: 'right', border: '1px solid #cbd5e1', padding: '6px 10px', fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 650 }}>
          {closedTasks.toLocaleString()}
        </td>

        <td style={{ textAlign: 'right', border: '1px solid #cbd5e1', padding: '6px 10px', fontFamily: 'var(--font-mono)', color: '#d97706', fontWeight: 650 }}>
          {pendingTasks.toLocaleString()}
        </td>

        <td style={{ textAlign: 'right', border: '1px solid #cbd5e1', padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: rateVal >= 80 ? '#059669' : 'var(--brand-primary)' }}>
          {rateVal}%
        </td>

        <td style={{ textAlign: 'right', border: '1px solid #cbd5e1', padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>
          {overdueTasks > 0 ? (
            <span className="badge badge-danger" style={{ fontSize: '0.68rem', padding: '1px 5px', fontWeight: 800 }}>
              {overdueTasks.toLocaleString()}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>0</span>
          )}
        </td>
      </tr>
    );
  };

  // Render Table Grid Container
  const renderTableView = (cardsList) => (
    <div 
      className="table-responsive"
      style={{
        border: '1px solid #cbd5e1',
        borderRadius: 'var(--radius-md)',
        overflowX: 'auto',
        background: '#ffffff',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <table 
        className="excel-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          margin: 0,
          fontSize: '0.8rem',
          border: '1px solid #cbd5e1'
        }}
      >
        <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f1f5f9' }}>
          <tr>
            <th style={{ width: '40px', textAlign: 'center', border: '1px solid #cbd5e1', padding: '7px 4px', fontWeight: 700 }}>#</th>
            <th style={{ minWidth: '220px', textAlign: 'left', border: '1px solid #cbd5e1', padding: '7px 10px', fontWeight: 700 }}>Tên Báo Cáo</th>
            <th style={{ width: '85px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '7px 10px', fontWeight: 700 }}>Tổng</th>
            <th style={{ width: '85px', textAlign: 'right', color: '#059669', border: '1px solid #cbd5e1', padding: '7px 10px', fontWeight: 700 }}>Đã Đóng</th>
            <th style={{ width: '80px', textAlign: 'right', color: '#d97706', border: '1px solid #cbd5e1', padding: '7px 10px', fontWeight: 700 }}>Tồn</th>
            <th style={{ width: '85px', textAlign: 'right', border: '1px solid #cbd5e1', padding: '7px 10px', fontWeight: 700 }}>Tỷ Lệ</th>
            <th style={{ width: '85px', textAlign: 'right', color: '#dc2626', border: '1px solid #cbd5e1', padding: '7px 10px', fontWeight: 700 }}>Quá Hạn</th>
          </tr>
        </thead>
        <tbody>
          {cardsList.map((c, idx) => renderTableRow(c, idx))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ marginBottom: '22px' }}>
      {/* Header bar: Title + View Switcher (Dạng Thẻ / Dạng Lưới Excel) */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          marginBottom: '12px', 
          flexWrap: 'wrap', 
          gap: '8px' 
        }}
      >
        <div>
          {mode === 'overview' ? (
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📊 Báo Cáo Hiển Thị Trên Tổng Quan ({cards.length})</span>
            </h4>
          ) : (
            <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {mode === 'nhatram' ? '🏢 Báo Cáo Nhà Trạm' : '⚡ Báo Cáo Cơ Điện'} ({cards.length})
            </h4>
          )}
        </div>

        {/* View Switcher Toggle: Dạng Thẻ vs Dạng Lưới Excel */}
        <div 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            background: 'var(--bg-tertiary)', 
            padding: '2px', 
            borderRadius: 'var(--radius-sm)', 
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-xs)'
          }}
        >
          <button
            type="button"
            onClick={() => handleSetViewMode('cards')}
            style={{
              padding: '3px 8px',
              fontSize: '0.73rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: viewMode === 'cards' ? '#ffffff' : 'transparent',
              color: viewMode === 'cards' ? 'var(--brand-primary)' : 'var(--text-secondary)',
              boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            title="Xem dạng thẻ (Grid Cards)"
          >
            <LayoutGrid size={13} />
            <span>Dạng Thẻ</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('table')}
            style={{
              padding: '3px 8px',
              fontSize: '0.73rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: viewMode === 'table' ? '#ffffff' : 'transparent',
              color: viewMode === 'table' ? 'var(--brand-primary)' : 'var(--text-secondary)',
              boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
            title="Xem dạng bảng như Excel (Cột: Tên báo cáo, Tổng, Đã đóng, Tồn, Tỷ lệ, Quá hạn)"
          >
            <Table size={13} />
            <span>Dạng Lưới Excel</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: DẠNG THẺ (GRID CARDS HIỆN TẠI) */}
      {viewMode === 'cards' && (
        <>
          {/* Grid các báo cáo ưu tiên */}
          <div 
            className="report-cards-grid"
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
              gap: '12px',
              marginBottom: '14px'
            }}
          >
            {effectivePriorityCards.map(renderCard)}

            {cards.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', gridColumn: '1 / -1' }}>
                Chưa có báo cáo nào được cấu hình hiển thị ở mục này. Bạn có thể vào <strong>/admin</strong> để chọn vị trí hiển thị cho báo cáo.
              </div>
            )}
          </div>

          {/* Mục Báo Cáo Khác (Thu gọn / Mở rộng) */}
          {effectiveOtherCards.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowOtherReports(prev => !prev)}
                  style={{ 
                    padding: '7px 22px', 
                    fontSize: '0.82rem', 
                    fontWeight: 700, 
                    gap: '8px',
                    borderRadius: '24px',
                    background: showOtherReports ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {showOtherReports ? (
                    <>
                      <ChevronUp size={16} /> Thu gọn {effectiveOtherCards.length} báo cáo khác
                    </>
                  ) : (
                    <>
                      <ChevronDown size={16} /> Xem thêm {effectiveOtherCards.length} báo cáo khác
                    </>
                  )}
                </button>
              </div>

              {showOtherReports && (
                <div style={{ marginTop: '16px' }}>
                  <h5 style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📁 Báo Cáo Khác ({effectiveOtherCards.length})</span>
                  </h5>
                  <div 
                    className="report-cards-grid"
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
                      gap: '12px'
                    }}
                  >
                    {effectiveOtherCards.map(renderCard)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* VIEW MODE 2: DẠNG LƯỚI EXCEL (TABLE SPREADSHEET VIEW) */}
      {viewMode === 'table' && (
        <div>
          {cards.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              Chưa có báo cáo nào được cấu hình hiển thị ở mục này.
            </div>
          ) : (
            <>
              {/* Bảng tính: Khi showOtherReports thì hiển thị toàn bộ, nếu không chỉ hiển thị danh sách ưu tiên */}
              {renderTableView(showOtherReports ? [...effectivePriorityCards, ...effectiveOtherCards] : effectivePriorityCards)}

              {/* Nút Xem thêm / Thu gọn trong dạng Bảng */}
              {effectiveOtherCards.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowOtherReports(prev => !prev)}
                    style={{ 
                      padding: '5px 18px', 
                      fontSize: '0.78rem', 
                      fontWeight: 700, 
                      gap: '6px',
                      borderRadius: '20px',
                      background: showOtherReports ? 'rgba(2, 132, 199, 0.08)' : '#ffffff',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {showOtherReports ? (
                      <>
                        <ChevronUp size={14} /> Thu gọn {effectiveOtherCards.length} báo cáo khác
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} /> Xem thêm {effectiveOtherCards.length} báo cáo khác
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
