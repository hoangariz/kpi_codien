import React from 'react';
import { 
  Activity, 
  LayoutDashboard, 
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

  const isAtAdmin = activeTab === 'admin';

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

        {/* If user is inside /admin, show a clear back button */}
        {isAtAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '3px 8px', gap: '4px' }}>
              <Settings size={12} /> Trang Quản Trị (/admin)
            </span>
            <button
              className="btn btn-outline"
              onClick={() => setActiveTab('dashboard')}
              style={{ padding: '4px 12px', fontSize: '0.78rem', gap: '5px' }}
            >
              ⬅ Về Tổng Quan
            </button>
          </div>
        )}
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
