import React from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Wrench, 
  UploadCloud, 
  History, 
  Sun, 
  Moon,
  Activity,
  Settings
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, theme, toggleTheme }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Tổng Quan DĐ', icon: LayoutDashboard },
    { id: 'maintenance', label: 'Bảo Dưỡng Cơ Điện', icon: Wrench, badge: 'Đặc thù' },
    { id: 'tasks', label: 'Danh Sách Công Việc', icon: CheckSquare },
    { id: 'admin', label: 'Quản Trị / Import (/admin)', icon: Settings, badge: 'Admin' },
    { id: 'import-history', label: 'Lịch Sử Import', icon: History },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-logo">
          <Activity size={24} />
        </div>
        <div className="brand-text">
          <h1>KPI Cơ Điện</h1>
          <p>Hệ Thống Theo Dõi VCC</p>
        </div>
      </div>

      <ul className="nav-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <li key={item.id}>
              <a
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(item.id);
                }}
                href={`#${item.id}`}
              >
                <Icon size={18} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                    {item.badge}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        <button
          className="btn btn-outline"
          onClick={toggleTheme}
          style={{ width: '100%', justifyContent: 'flex-start', gap: '8px' }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          <span style={{ fontSize: '0.8rem' }}>
            {theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}
          </span>
        </button>
      </div>
    </aside>
  );
}
