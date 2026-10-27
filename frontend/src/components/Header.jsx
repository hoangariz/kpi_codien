import React from 'react';
import {
  Activity,
  LayoutDashboard,
  Cable,
  Search,
  Sun,
  Moon,
  RefreshCw,
  Calendar,
  Award,
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
            className={`header-nav-btn ${activeTab === 'codinh' || activeTab === 'admincodinh' ? 'active' : ''}`}
            onClick={() => setActiveTab('codinh')}
            title="Báo Cáo Cố Định Băng Rộng (CĐBR) & Tủ Hộp Cáp"
          >
            <Cable size={16} />
            <span>Cố Định BR</span>
          </button>

          <button
            className={`header-nav-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            title="Tra cứu công việc theo Mã WO, Mã Trạm, FT và ghi chú"
          >
            <Search size={16} />
            <span className="nav-text-desktop">Tra Cứu WO</span>
            <span className="nav-text-mobile">Tra Cứu</span>
          </button>

          {/* KPI FT Tab */}
          <button
            className={`header-nav-btn ${activeTab === 'kpi' ? 'active' : ''}`}
            onClick={() => setActiveTab('kpi')}
            title="Bảng đánh giá hệ số KPI FT theo All-WO-HTH"
          >
            <Award size={16} />
            <span className="nav-text-desktop">KPI FT</span>
            <span className="nav-text-mobile">KPI FT</span>
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
