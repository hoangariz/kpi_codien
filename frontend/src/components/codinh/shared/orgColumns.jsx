import React from 'react';
import { getShortClusterName } from '../../../utils/groupFormat';

/**
 * Cột định danh theo cấp cho các bảng CĐBR:
 * - Cụm: Chỉ hiển thị viết tắt cụm (tooltip tên đầy đủ), số đội, số nhân sự
 * - Đội: Tên đội, đội trưởng (⭐), số nhân sự (đã xóa cột Cụm theo yêu cầu)
 * - Nhân viên: Họ và tên (⭐ nếu đội trưởng) (đã xóa Username, Đội và Cụm theo yêu cầu)
 */
export function getOrgColumns(level, { onCrossFilter, orgMetadata = {} } = {}) {
  const { clusterMap = {}, teamMap = {} } = orgMetadata;

  if (level === 'cluster') {
    return [
      {
        key: 'ten_cum',
        label: 'Cụm',
        align: 'left',
        sortable: true,
        isNameCol: true,
        getValue: (row) => getShortClusterName(row.ten_cum, row.ma_cum),
        render: (row) => {
          if (row.is_other) {
            return (
              <span style={{ fontStyle: 'italic', color: 'var(--text-muted, #94a3b8)' }}>
                {row.ten_cum || 'Chưa phân cụm'}
              </span>
            );
          }

          const shortCode = getShortClusterName(row.ten_cum, row.ma_cum);
          const fullName = row.ten_cum || shortCode;

          return onCrossFilter ? (
            <button
              type="button"
              onClick={() =>
                onCrossFilter({
                  type: 'cluster',
                  id: row.cluster_id,
                  name: fullName,
                  code: shortCode,
                })
              }
              className="font-semibold text-brand-primary hover:underline"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--brand-primary, #6366f1)',
                fontWeight: 700,
                fontSize: '0.88rem',
              }}
              title={`${fullName} - Bấm để lọc các đội thuộc cụm này`}
            >
              {shortCode}
            </button>
          ) : (
            <span className="font-semibold" style={{ fontWeight: 700 }} title={fullName}>
              {shortCode}
            </span>
          );
        },
      },
      {
        key: 'team_count',
        label: 'Số đội',
        align: 'center',
        sortable: true,
        getValue: (row) => {
          if (row.is_other) return 0;
          return clusterMap[row.cluster_id]?.team_count ?? (row.teams?.length || 0);
        },
        render: (row) => {
          if (row.is_other) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
          const count = clusterMap[row.cluster_id]?.team_count ?? (row.teams?.length || 0);
          return <span style={{ fontWeight: 600 }}>{count}</span>;
        },
      },
      {
        key: 'employee_count',
        label: 'Số nhân sự',
        align: 'center',
        sortable: true,
        getValue: (row) => {
          if (row.is_other) return 0;
          return clusterMap[row.cluster_id]?.employee_count ?? 0;
        },
        render: (row) => {
          if (row.is_other) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
          const count = clusterMap[row.cluster_id]?.employee_count ?? 0;
          return <span style={{ fontWeight: 600 }}>{count}</span>;
        },
      },
    ];
  }

  if (level === 'team') {
    return [
      {
        key: 'ten_doi',
        label: 'Tên đội',
        align: 'left',
        sortable: true,
        isNameCol: true,
        getValue: (row) => row.ten_doi || row.key_name,
        render: (row) => {
          if (row.is_other) {
            return (
              <span style={{ fontStyle: 'italic', color: 'var(--text-muted, #94a3b8)' }}>
                {row.ten_doi || 'Chưa phân đội'}
              </span>
            );
          }

          return onCrossFilter ? (
            <button
              type="button"
              onClick={() =>
                onCrossFilter({
                  type: 'team',
                  id: row.team_id,
                  name: row.ten_doi,
                  code: row.ma_doi,
                })
              }
              className="font-semibold text-brand-primary hover:underline"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--brand-primary, #6366f1)',
                fontWeight: 600,
              }}
              title={`Bấm để xem danh sách nhân viên đội ${row.ten_doi}`}
            >
              {row.ten_doi}
            </button>
          ) : (
            <span className="font-semibold">{row.ten_doi}</span>
          );
        },
      },
      {
        key: 'leader_name',
        label: 'Đội trưởng',
        align: 'left',
        sortable: true,
        getValue: (row) => teamMap[row.team_id]?.leader_name || '',
        render: (row) => {
          if (row.is_other) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
          const leaderName = teamMap[row.team_id]?.leader_name;
          if (!leaderName) return <span style={{ color: 'var(--text-muted)' }}>Chưa gán</span>;
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
              <span style={{ color: '#f59e0b' }}>⭐</span>
              <span>{leaderName}</span>
            </span>
          );
        },
      },
      {
        key: 'employee_count',
        label: 'Số nhân sự',
        align: 'center',
        sortable: true,
        getValue: (row) => {
          if (row.is_other) return 0;
          return teamMap[row.team_id]?.employee_count ?? 0;
        },
        render: (row) => {
          if (row.is_other) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
          const count = teamMap[row.team_id]?.employee_count ?? 0;
          return <span style={{ fontWeight: 600 }}>{count}</span>;
        },
      },
    ];
  }

  // level === 'employee' (Đã xóa cột Username, Đội và Cụm theo yêu cầu; bảng thừa để trống không giãn full width)
  return [
    {
      key: 'full_name',
      label: 'Họ và tên',
      align: 'left',
      sortable: true,
      isNameCol: true,
      getValue: (row) => row.full_name || row.key_name,
      render: (row) => {
        if (row.is_other) {
          return (
            <span style={{ fontStyle: 'italic', color: 'var(--text-muted, #94a3b8)' }}>
              {row.full_name || 'Chưa gán'}
            </span>
          );
        }

        return (
          <div
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title={row.key_name ? `Username: ${row.key_name}` : ''}
          >
            {row.is_leader && (
              <span style={{ color: '#f59e0b' }} title="Đội trưởng">
                ⭐
              </span>
            )}
            <strong style={{ fontWeight: 700, fontSize: '0.88rem' }}>{row.full_name || row.key_name}</strong>
          </div>
        );
      },
    },
  ];
}
