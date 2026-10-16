import { useState, useMemo, useEffect } from 'react';

/**
 * Custom hook to manage search, sorting, cross-filtering, flat view toggle,
 * and hierarchical grouping for CĐBR LevelTable.
 */
export function useTableState({
  level, // 'cluster' | 'team' | 'employee'
  rows = [],
  summary = null,
  columns = [],
  initialSortKey = null,
  initialSortOrder = 'desc',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);
  const [activeCrossFilter, setActiveCrossFilter] = useState(null); // { type: 'cluster'|'team', id, name, code }
  const [isFlatView, setIsFlatView] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Reset filter/sort when level changes
  useEffect(() => {
    setSearchQuery('');
    setSortKey(initialSortKey);
    setSortOrder(initialSortOrder);
    setExpandedGroups({});
  }, [level, initialSortKey, initialSortOrder]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'ten_cum' || key === 'ten_doi' || key === 'full_name' ? 'asc' : 'desc');
    }
  };

  const clearCrossFilter = () => {
    setActiveCrossFilter(null);
  };

  // 1. Cross-filter application
  const crossFilteredRows = useMemo(() => {
    if (!activeCrossFilter) return rows;

    if (level === 'team' && activeCrossFilter.type === 'cluster') {
      return rows.filter((r) => {
        if (r.is_other) return false;
        return (
          r.cluster_id === activeCrossFilter.id ||
          r.ten_cum === activeCrossFilter.name ||
          (activeCrossFilter.code && r.ma_cum === activeCrossFilter.code)
        );
      });
    }

    if (level === 'employee' && activeCrossFilter.type === 'team') {
      return rows.filter((r) => {
        if (r.is_other) return false;
        return (
          r.team_id === activeCrossFilter.id ||
          r.team_name === activeCrossFilter.name ||
          r.group_name === activeCrossFilter.name
        );
      });
    }

    if (level === 'employee' && activeCrossFilter.type === 'cluster') {
      return rows.filter((r) => {
        if (r.is_other) return false;
        return (
          (activeCrossFilter.id && r.cluster_id === activeCrossFilter.id) ||
          r.cluster_name === activeCrossFilter.name ||
          r.ten_cum === activeCrossFilter.name ||
          r.group_name === activeCrossFilter.name
        );
      });
    }

    return rows;
  }, [rows, activeCrossFilter, level]);

  // 2. Search filter application
  const searchFilteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return crossFilteredRows;

    return crossFilteredRows.filter((r) => {
      const name = (r.full_name || r.ten_doi || r.ten_cum || r.key_name || '').toLowerCase();
      const user = (r.key_name || r.username || '').toLowerCase();
      const code = (r.ma_cum || r.ma_doi || '').toLowerCase();
      const team = (r.team_name || r.ten_doi || '').toLowerCase();
      const cluster = (r.cluster_name || r.ten_cum || '').toLowerCase();

      return (
        name.includes(q) ||
        user.includes(q) ||
        code.includes(q) ||
        team.includes(q) ||
        cluster.includes(q)
      );
    });
  }, [crossFilteredRows, searchQuery]);

  // Helper comparator for sorting
  const getSortValue = (row, key) => {
    if (!key) return 0;
    const val = row[key];
    if (typeof val === 'number') return val;
    if (val === null || val === undefined) return -Infinity;
    return String(val).toLowerCase();
  };

  const sortComparator = (a, b) => {
    // is_other always stays at the bottom
    if (a.is_other && !b.is_other) return 1;
    if (!a.is_other && b.is_other) return -1;
    if (a.is_other && b.is_other) return 0;

    // For employee level, leaders ⭐ stay at the top unless explicit sortKey is set
    if (level === 'employee' && !sortKey) {
      if (a.is_leader && !b.is_leader) return -1;
      if (!a.is_leader && b.is_leader) return 1;
    }

    if (!sortKey) return 0;

    const valA = getSortValue(a, sortKey);
    const valB = getSortValue(b, sortKey);

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    const strA = String(valA);
    const strB = String(valB);
    return sortOrder === 'asc' ? strA.localeCompare(strB, 'vi') : strB.localeCompare(strA, 'vi');
  };

  // 3. Hierarchical Grouping according to Level
  const groupedData = useMemo(() => {
    // If flat view is requested:
    if (isFlatView) {
      const sorted = [...searchFilteredRows].sort(sortComparator);
      return {
        isGrouped: false,
        groups: [],
        flatRows: sorted,
      };
    }

    // Tab Cụm (level === 'cluster'): each cluster is a primary row, collapsible to view teams if available
    if (level === 'cluster') {
      const sorted = [...searchFilteredRows].sort(sortComparator);
      return {
        isGrouped: false,
        groups: [],
        flatRows: sorted,
      };
    }

    // Tab Đội (level === 'team'): Grouped by Cụm
    if (level === 'team') {
      const groupsMap = new Map();
      const otherRows = [];

      searchFilteredRows.forEach((r) => {
        if (r.is_other) {
          otherRows.push(r);
          return;
        }
        const gKey = r.cluster_id || r.ten_cum || 'unknown';
        const gTitle = r.ten_cum || 'Cụm khác';

        if (!groupsMap.has(gKey)) {
          groupsMap.set(gKey, {
            groupId: String(gKey),
            title: gTitle,
            subtitle: r.ma_cum || '',
            rows: [],
            isOther: false,
            // Metric aggregates initialized to 0
            total_wos: 0,
            closed_wos: 0,
            pending_wos: 0,
            overdue_wos: 0,
            home_kem_count: 0,
            port_kem_count: 0,
            total_cabinets: 0,
            completed_cabinets: 0,
            pending_cabinets: 0,
            overdue_cabinets: 0,
          });
        }
        const g = groupsMap.get(gKey);
        g.rows.push(r);
        // Aggregate
        g.total_wos += r.total_wos || 0;
        g.closed_wos += r.closed_wos || 0;
        g.pending_wos += r.pending_wos || 0;
        g.overdue_wos += r.overdue_wos || 0;
        g.home_kem_count += r.home_kem_count || 0;
        g.port_kem_count += r.port_kem_count || 0;
        g.total_cabinets += r.total_cabinets || 0;
        g.completed_cabinets += r.completed_cabinets || 0;
        g.pending_cabinets += r.pending_cabinets || 0;
        g.overdue_cabinets += r.overdue_cabinets || 0;
      });

      const groups = Array.from(groupsMap.values()).map((g) => {
        g.rows.sort(sortComparator);
        g.wo_rate = g.total_wos > 0 ? Number(((g.closed_wos / g.total_wos) * 100).toFixed(1)) : 0;
        g.cabinet_rate = g.total_cabinets > 0 ? Number(((g.completed_cabinets / g.total_cabinets) * 100).toFixed(1)) : 0;
        return g;
      });

      if (otherRows.length > 0) {
        const otherGroup = {
          groupId: 'other_team',
          title: 'Chưa phân cụm / Chưa phân đội',
          subtitle: '',
          rows: otherRows.sort(sortComparator),
          isOther: true,
          total_wos: otherRows.reduce((acc, r) => acc + (r.total_wos || 0), 0),
          closed_wos: otherRows.reduce((acc, r) => acc + (r.closed_wos || 0), 0),
          pending_wos: otherRows.reduce((acc, r) => acc + (r.pending_wos || 0), 0),
          overdue_wos: otherRows.reduce((acc, r) => acc + (r.overdue_wos || 0), 0),
          home_kem_count: otherRows.reduce((acc, r) => acc + (r.home_kem_count || 0), 0),
          port_kem_count: otherRows.reduce((acc, r) => acc + (r.port_kem_count || 0), 0),
          total_cabinets: otherRows.reduce((acc, r) => acc + (r.total_cabinets || 0), 0),
          completed_cabinets: otherRows.reduce((acc, r) => acc + (r.completed_cabinets || 0), 0),
          pending_cabinets: otherRows.reduce((acc, r) => acc + (r.pending_cabinets || 0), 0),
          overdue_cabinets: otherRows.reduce((acc, r) => acc + (r.overdue_cabinets || 0), 0),
        };
        otherGroup.wo_rate = otherGroup.total_wos > 0 ? Number(((otherGroup.closed_wos / otherGroup.total_wos) * 100).toFixed(1)) : 0;
        otherGroup.cabinet_rate = otherGroup.total_cabinets > 0 ? Number(((otherGroup.completed_cabinets / otherGroup.total_cabinets) * 100).toFixed(1)) : 0;
        groups.push(otherGroup);
      }

      return {
        isGrouped: true,
        groups,
        flatRows: [],
      };
    }

    // Tab Nhân viên (level === 'employee'): Grouped by Đội
    if (level === 'employee') {
      const groupsMap = new Map();
      const otherRows = [];

      searchFilteredRows.forEach((r) => {
        if (r.is_other) {
          otherRows.push(r);
          return;
        }
        const gKey = r.team_id || r.team_name || r.ten_doi || 'unknown';
        const gTitle = r.team_name || r.ten_doi || 'Đội khác';
        const gSub = r.cluster_name || r.ten_cum || '';

        if (!groupsMap.has(gKey)) {
          groupsMap.set(gKey, {
            groupId: String(gKey),
            title: gTitle,
            subtitle: gSub,
            rows: [],
            isOther: false,
            total_wos: 0,
            closed_wos: 0,
            pending_wos: 0,
            overdue_wos: 0,
            home_kem_count: 0,
            port_kem_count: 0,
            total_cabinets: 0,
            completed_cabinets: 0,
            pending_cabinets: 0,
            overdue_cabinets: 0,
          });
        }
        const g = groupsMap.get(gKey);
        g.rows.push(r);
        g.total_wos += r.total_wos || 0;
        g.closed_wos += r.closed_wos || 0;
        g.pending_wos += r.pending_wos || 0;
        g.overdue_wos += r.overdue_wos || 0;
        g.home_kem_count += r.home_kem_count || 0;
        g.port_kem_count += r.port_kem_count || 0;
        g.total_cabinets += r.total_cabinets || 0;
        g.completed_cabinets += r.completed_cabinets || 0;
        g.pending_cabinets += r.pending_cabinets || 0;
        g.overdue_cabinets += r.overdue_cabinets || 0;
      });

      const groups = Array.from(groupsMap.values()).map((g) => {
        // Sort inside group: team leader ⭐ at the top, then sortComparator
        g.rows.sort((a, b) => {
          if (!sortKey) {
            if (a.is_leader && !b.is_leader) return -1;
            if (!a.is_leader && b.is_leader) return 1;
          }
          return sortComparator(a, b);
        });
        g.wo_rate = g.total_wos > 0 ? Number(((g.closed_wos / g.total_wos) * 100).toFixed(1)) : 0;
        g.cabinet_rate = g.total_cabinets > 0 ? Number(((g.completed_cabinets / g.total_cabinets) * 100).toFixed(1)) : 0;
        return g;
      });

      if (otherRows.length > 0) {
        const otherGroup = {
          groupId: 'other_employee',
          title: 'Chưa phân đội / Ngoài danh mục',
          subtitle: '',
          rows: otherRows.sort(sortComparator),
          isOther: true,
          total_wos: otherRows.reduce((acc, r) => acc + (r.total_wos || 0), 0),
          closed_wos: otherRows.reduce((acc, r) => acc + (r.closed_wos || 0), 0),
          pending_wos: otherRows.reduce((acc, r) => acc + (r.pending_wos || 0), 0),
          overdue_wos: otherRows.reduce((acc, r) => acc + (r.overdue_wos || 0), 0),
          home_kem_count: otherRows.reduce((acc, r) => acc + (r.home_kem_count || 0), 0),
          port_kem_count: otherRows.reduce((acc, r) => acc + (r.port_kem_count || 0), 0),
          total_cabinets: otherRows.reduce((acc, r) => acc + (r.total_cabinets || 0), 0),
          completed_cabinets: otherRows.reduce((acc, r) => acc + (r.completed_cabinets || 0), 0),
          pending_cabinets: otherRows.reduce((acc, r) => acc + (r.pending_cabinets || 0), 0),
          overdue_cabinets: otherRows.reduce((acc, r) => acc + (r.overdue_cabinets || 0), 0),
        };
        otherGroup.wo_rate = otherGroup.total_wos > 0 ? Number(((otherGroup.closed_wos / otherGroup.total_wos) * 100).toFixed(1)) : 0;
        otherGroup.cabinet_rate = otherGroup.total_cabinets > 0 ? Number(((otherGroup.completed_cabinets / otherGroup.total_cabinets) * 100).toFixed(1)) : 0;
        groups.push(otherGroup);
      }

      return {
        isGrouped: true,
        groups,
        flatRows: [],
      };
    }

    return {
      isGrouped: false,
      groups: [],
      flatRows: searchFilteredRows.sort(sortComparator),
    };
  }, [searchFilteredRows, isFlatView, level, sortKey, sortOrder]);

  // Auto-expand groups when search query is active
  useEffect(() => {
    if (searchQuery.trim() && groupedData.isGrouped) {
      const allExpanded = {};
      groupedData.groups.forEach((g) => {
        allExpanded[g.groupId] = true;
      });
      setExpandedGroups(allExpanded);
    }
  }, [searchQuery, groupedData]);

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const expandAllGroups = () => {
    const all = {};
    groupedData.groups.forEach((g) => {
      all[g.groupId] = true;
    });
    setExpandedGroups(all);
  };

  const collapseAllGroups = () => {
    setExpandedGroups({});
  };

  return {
    searchQuery,
    setSearchQuery,
    sortKey,
    sortOrder,
    handleSort,
    activeCrossFilter,
    setActiveCrossFilter,
    clearCrossFilter,
    isFlatView,
    setIsFlatView,
    expandedGroups,
    toggleGroup,
    expandAllGroups,
    collapseAllGroups,
    groupedData,
    filteredCount: searchFilteredRows.length,
    rawCount: rows.length,
  };
}
