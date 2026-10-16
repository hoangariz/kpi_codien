import React from 'react';

export default function SortableTh({
  label,
  sortKey,
  currentSortKey,
  currentSortOrder,
  onSort,
  align = 'left',
  width,
  tooltip,
  className = '',
  style = {},
  rowSpan,
  colSpan,
}) {
  const isSorted = currentSortKey === sortKey;
  const isClickable = Boolean(sortKey && onSort);

  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`${className} ${isClickable ? 'cursor-pointer select-none' : ''}`}
      style={{
        textAlign: align,
        width: width || 'auto',
        minWidth: width || undefined,
        maxWidth: width || undefined,
        whiteSpace: style?.whiteSpace || 'nowrap',
        ...style,
      }}
      title={tooltip || (typeof label === 'string' ? label : '')}
      onClick={isClickable ? () => onSort(sortKey) : undefined}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          width: '100%',
        }}
      >
        <span style={{ flex: 1, textAlign: align, lineHeight: 1.15 }}>{label}</span>
        {isClickable && (
          <span
            style={{
              fontSize: '0.62rem',
              lineHeight: 1,
              color: isSorted ? 'var(--brand-primary, #6366f1)' : 'inherit',
              opacity: isSorted ? 1 : 0.35,
              fontWeight: isSorted ? 800 : 400,
              flexShrink: 0,
            }}
          >
            {isSorted ? (currentSortOrder === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        )}
      </div>
    </th>
  );
}
