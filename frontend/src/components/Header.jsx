import React from 'react';
import { 
  Activity, 
  LayoutDashboard, 
  Search,
  Settings, 
  Sun, 
  Moon, 
  RefreshCw,
  Calendar
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
            <div className="brand-title">KPI Cơ Điện</div>
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
            <span>Tra Cứu & Chi Tiết WO</span>
          </button>

          <button
            className={`header-nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
            title="Quản trị bảng báo cáo, hệ thống và cấu hình"
          >
            <Settings size={16} />
            <span>Quản Trị</span>
          </button>
        </nav>
      </div>

      {/* Right: Date, Theme, Refresh */}
      <div className="header-right">
        <div 
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
    </header>
  );
}
