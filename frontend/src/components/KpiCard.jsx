import React from 'react';

export default function KpiCard({ title, value, subtext, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: {
      bg: 'var(--brand-light)',
      text: 'var(--brand-primary)',
      bar: 'var(--brand-primary)'
    },
    green: {
      bg: 'var(--success-light)',
      text: 'var(--success-dark)',
      bar: 'var(--success)'
    },
    amber: {
      bg: 'var(--warning-light)',
      text: 'var(--warning-dark)',
      bar: 'var(--warning)'
    },
    red: {
      bg: 'var(--danger-light)',
      text: 'var(--danger-dark)',
      bar: 'var(--danger)'
    },
    indigo: {
      bg: 'var(--info-light)',
      text: 'var(--info)',
      bar: 'var(--info)'
    }
  };

  const scheme = colorMap[color] || colorMap.blue;

  return (
    <div className="kpi-card">
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        <div 
          className="kpi-icon-wrapper" 
          style={{ background: scheme.bg, color: scheme.text }}
        >
          {Icon && <Icon size={20} />}
        </div>
      </div>
      <div className="kpi-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {subtext && <div className="kpi-subtext">{subtext}</div>}
      <div 
        style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          height: '3px', 
          background: scheme.bar 
        }} 
      />
    </div>
  );
}
