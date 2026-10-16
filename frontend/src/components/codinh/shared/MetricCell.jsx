import React from 'react';

export default function MetricCell({
  value,
  isRate = false,
  variant, // 'danger' | 'warning' | 'success' | 'cyan' | 'purple' | 'neutral'
  onClick,
  align = 'center',
  formatNumber = true,
  showPlus = false,
}) {
  const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
  const isZero = numVal === 0;
  const isClickable = Boolean(onClick && numVal > 0);

  let displayStr = value;
  if (isRate) {
    displayStr = `${numVal.toFixed(1)}%`;
  } else if (formatNumber && typeof value === 'number') {
    displayStr = value.toLocaleString('vi-VN');
    if (showPlus && numVal > 0) {
      displayStr = `+${displayStr}`;
    }
  }

  let cellClass = 'cell-num';
  const inlineStyle = { textAlign: align, whiteSpace: 'nowrap' };

  if (isClickable) {
    cellClass += ' cell-clickable';
    inlineStyle.cursor = 'pointer';
  }

  if (isRate) {
    const rateColor =
      numVal >= 80 ? 'var(--success-dark)' : numVal >= 50 ? 'var(--warning-dark)' : numVal > 0 ? 'var(--danger-dark)' : 'var(--text-muted)';
    return (
      <td
        className={cellClass}
        style={{ ...inlineStyle, color: rateColor, fontWeight: 700 }}
      >
        {displayStr}
      </td>
    );
  }

  if (isZero) {
    inlineStyle.color = 'var(--text-muted)';
    inlineStyle.fontWeight = 400;
  } else if (variant === 'danger') {
    cellClass += ' cell-overdue';
    inlineStyle.color = 'var(--danger-dark)';
    inlineStyle.fontWeight = 800;
  } else if (variant === 'warning') {
    cellClass += ' cell-pending';
    inlineStyle.color = 'var(--warning-dark)';
    inlineStyle.fontWeight = 700;
  } else if (variant === 'success') {
    cellClass += ' cell-closed';
    inlineStyle.color = 'var(--success-dark)';
    inlineStyle.fontWeight = 700;
  } else if (variant === 'today') {
    cellClass += ' cell-today';
    inlineStyle.color = 'var(--success-dark)';
    inlineStyle.fontWeight = 800;
  } else if (variant === 'yesterday') {
    cellClass += ' cell-yesterday';
    inlineStyle.color = 'var(--success-dark)';
    inlineStyle.fontWeight = 700;
  } else if (variant === 'week') {
    cellClass += ' cell-week';
    inlineStyle.color = 'var(--brand-primary)';
    inlineStyle.fontWeight = 700;
  } else if (variant === 'purple') {
    inlineStyle.color = '#8b5cf6';
    inlineStyle.background = 'rgba(139, 92, 246, 0.08)';
    inlineStyle.fontWeight = 700;
  } else if (variant === 'cyan') {
    inlineStyle.color = '#0891b2';
    inlineStyle.background = 'rgba(6, 182, 212, 0.08)';
    inlineStyle.fontWeight = 700;
  } else {
    inlineStyle.fontWeight = 700;
  }

  return (
    <td
      className={cellClass}
      onClick={isClickable ? onClick : undefined}
      style={inlineStyle}
      title={isClickable ? 'Nhấn để xem danh sách WO chi tiết' : undefined}
    >
      {displayStr}
    </td>
  );
}
