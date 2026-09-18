import React from 'react';
import {
  Activity,
  LayoutDashboard,
  Search,
  Sun,
  Moon,
  RefreshCw,
  Calendar,
  Database,
  Sparkles
} from 'lucide-react';

export default function Header({
  activeTab,
  setActiveTab,
  theme,
  toggleTheme,
  onRefresh,
  isRefreshing
}) {
  const currentDate = new Date().toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });

  return (
    <header className="top-navbar">
      {/* Left: Brand + Status */}
      <div className="header-left">
        <div
          className="brand-box"
          onClick={() => setActiveTab('dashboard')}
          title="Về trang tổng quan"
        >
          <div className="brand-logo">
            <Activity size={22} />
          </div>
          <div>
            <div className="brand-title">KPI</div>
            <div className="brand-subtitle">VCC Network</div>
          </div>
        </div>

        {/* Center Menu Navigation */}
        <nav className="header-nav">
          <button
            className={`header-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
            title="Trang Tổng Quan KPI & Báo Cáo"
          >
            <LayoutDashboard size={16} />
            <span>Tổng Quan</span>
          </button>

          <button
            className={`header-nav-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            title="Tra cứu công việc theo Mã WO, Mã Trạm, FT và ghi chú"
          >
            <Search size={16} />
            <span>Tra Cứu WO</span>
          </button>

          {/* CSDL Tab – Coming Soon */}
          <button
            className={`header-nav-btn ${activeTab === 'csdb' ? 'active' : ''}`}
            onClick={() => setActiveTab('csdb')}
            title="CSDL Trạm & MPĐ — Đang phát triển"
            style={{ position: 'relative' }}
          >
            <Database size={16} />
            <span>CSDL Trạm / MPĐ</span>
            {/* Pulsing badge */}
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-6px',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: '#fff',
              fontSize: '0.55rem',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '8px',
              letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
              animation: 'pulse-badge 2s ease-in-out infinite',
              boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)'
            }}>
              SOON
            </span>
          </button>
        </nav>
      </div>

      {/* Right: Date, Theme, Refresh */}
      <div className="header-right">
        <div
          className="header-date"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            background: 'var(--bg-tertiary)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)'
          }}
        >
          <Calendar size={13} />
          <span>{currentDate}</span>
        </div>

        <button
          className="btn-icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {onRefresh && (
          <button
            className="btn-icon"
            onClick={onRefresh}
            title="Làm mới dữ liệu"
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
          </button>
        )}
      </div>

      {/* Keyframe animation via style tag */}
      <style>{`
        @keyframes pulse-badge {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </header>
  );
}
