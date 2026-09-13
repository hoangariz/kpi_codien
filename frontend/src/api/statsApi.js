import api from './client';

// In-memory cache for instant (0ms) drilldown filtering
let maintenanceTasksCache = null;
let maintenanceTasksCacheKey = null;
let maintenanceTasksLoadingPromise = null;

async function loadAllValidMaintenanceTasks(targetType, activeMonth) {
  const cacheKey = `${targetType}_${activeMonth}`;
  if (maintenanceTasksCache && maintenanceTasksCacheKey === cacheKey) {
    return maintenanceTasksCache;
  }
  if (maintenanceTasksLoadingPromise) {
    return maintenanceTasksLoadingPromise;
  }

  maintenanceTasksLoadingPromise = (async () => {
    try {
      // 1. First try backend endpoint /stats/maintenance-special/tasks
      try {
        const res = await api.get('/stats/maintenance-special/tasks', {
          params: { task_type: targetType, month: activeMonth, metric: 'total', page: 1, page_size: 500 }
        });
        if (res.data?.items) {
          let allItems = res.data.items;
          if (res.data.total_pages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= res.data.total_pages; p++) {
              pagePromises.push(api.get('/stats/maintenance-special/tasks', {
                params: { task_type: targetType, month: activeMonth, metric: 'total', page: p, page_size: 500 }
              }));
            }
            const rList = await Promise.all(pagePromises);
            for (const r of rList) {
              if (r.data?.items) allItems = allItems.concat(r.data.items);
            }
          }
          maintenanceTasksCache = allItems;
          maintenanceTasksCacheKey = cacheKey;
          return allItems;
        }
      } catch (err) {
        if (!err.response || err.response.status !== 404) {
          console.warn('Backend maintenance-special endpoint error, falling back:', err.message);
        }
      }

      // 2. Fallback: query /tasks with larger page_size and filter accurately
      const fallbackParams = {
        page: 1,
        page_size: 200,
        loai_cong_viec: targetType,
      };

      const res = await api.get('/tasks', { params: fallbackParams });
      let items = res.data?.items || [];
      if (res.data?.total_pages > 1) {
        const totalPages = Math.min(res.data.total_pages, 20);
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(api.get('/tasks', { params: { ...fallbackParams, page: p } }));
        }
        const results = await Promise.all(pagePromises);
        for (const r of results) {
          if (r.data?.items) {
            items = items.concat(r.data.items);
          }
        }
      }

      // Month Exclusion Rule:
      let monthStart;
      try {
        const [y, m] = activeMonth.split('-').map(Number);
        monthStart = new Date(y, m - 1, 1, 0, 0, 0);
      } catch {
        const n = new Date();
        monthStart = new Date(n.getFullYear(), n.getMonth(), 1, 0, 0, 0);
      }

      const validItems = items.filter(t => {
        if (t.loai_cong_viec !== targetType) return false;
        if (t.trang_thai === 'Đóng' && t.thoi_diem_yeu_cau_ket_thuc) {
          const endDt = new Date(t.thoi_diem_yeu_cau_ket_thuc);
          if (endDt < monthStart) return false;
        }
        return true;
      });

      maintenanceTasksCache = validItems;
      maintenanceTasksCacheKey = cacheKey;
      return validItems;
    } finally {
      maintenanceTasksLoadingPromise = null;
    }
  })();

  return maintenanceTasksLoadingPromise;
}

export const statsApi = {
  getKpiOverview: async () => {
    const res = await api.get('/stats/summary');
    return res.data;
  },
  getByGroup: async (params = {}) => {
    const res = await api.get('/stats/by-group', { params });
    return res.data;
  },
  getByEmployee: async (params = {}) => {
    const res = await api.get('/stats/by-employee', { params });
    return res.data;
  },
  getMaintenanceSpecial: async (params = {}) => {
    const res = await api.get('/stats/maintenance-special', { params });
    return res.data;
  },
  preloadMaintenanceTasks: async (month = '2026-09', targetType = 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS') => {
    return loadAllValidMaintenanceTasks(targetType, month || '2026-09');
  },
  clearMaintenanceCache: () => {
    maintenanceTasksCache = null;
    maintenanceTasksCacheKey = null;
    maintenanceTasksLoadingPromise = null;
  },
  getMaintenanceTasks: async (params = {}) => {
    const targetType = params.target_type || 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS';
    const activeMonth = params.month || '2026-09';

    // Load or slice from memory cache (< 1ms instant access)
    const allValidTasks = await loadAllValidMaintenanceTasks(targetType, activeMonth);
    let items = [...allValidTasks];

    // 1. Dimension Filter
    if (params.filter_type === 'employee') {
      if (params.is_other) {
        items = items.filter(t => !t.employee_assigned_name);
      } else if (params.filter_id != null) {
        items = items.filter(t => t.assigned_to_id === params.filter_id || (params.target_name && t.employee_assigned_name === params.target_name));
      } else if (params.target_name) {
        items = items.filter(t => t.employee_assigned_name === params.target_name);
      }
    } else if (params.filter_type === 'group') {
      if (params.is_other) {
        items = items.filter(t => !t.group_name);
      } else if (params.filter_id != null) {
        items = items.filter(t => t.group_id === params.filter_id || (params.target_name && t.group_name === params.target_name));
      } else if (params.target_name) {
        items = items.filter(t => t.group_name === params.target_name);
      }
    }

    // 2. Metric Filter
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (params.metric === 'closed') {
      items = items.filter(t => t.trang_thai === 'Đóng');
    } else if (params.metric === 'pending') {
      items = items.filter(t => t.trang_thai !== 'Đóng');
    } else if (params.metric === 'overdue') {
      items = items.filter(t => {
        if (t.trang_thai === 'Đóng') return false;
        if (t.thoi_gian_con_lai < 0) return true;
        if (t.thoi_diem_yeu_cau_ket_thuc && new Date(t.thoi_diem_yeu_cau_ket_thuc) < now) return true;
        return false;
      });
    } else if (params.metric === 'closed_today') {
      items = items.filter(t => {
        if (t.trang_thai !== 'Đóng') return false;
        const dateStr = t.thoi_diem_ft_hoan_thanh || t.thoi_diem_cd_dong;
        const ftDate = dateStr ? new Date(dateStr) : null;
        return ftDate && ftDate >= todayStart;
      });
    } else if (params.metric === 'closed_last_7_days') {
      items = items.filter(t => {
        if (t.trang_thai !== 'Đóng') return false;
        const dateStr = t.thoi_diem_ft_hoan_thanh || t.thoi_diem_cd_dong;
        const ftDate = dateStr ? new Date(dateStr) : null;
        return ftDate && ftDate >= sevenDaysAgo;
      });
    } else if (params.metric === 'cho_cd_tiep_nhan') {
      items = items.filter(t => {
        const s = (t.trang_thai || '').toLowerCase();
        return s.includes('chờ') && s.includes('tiếp nhận');
      });
    } else if (params.metric === 'ft_hoan_thanh') {
      items = items.filter(t => {
        const s = (t.trang_thai || '').toLowerCase();
        return s.includes('ft hoàn thành');
      });
    }

    // 3. Search filter
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      items = items.filter(t => 
        (t.ma_cong_viec && t.ma_cong_viec.toLowerCase().includes(q)) ||
        (t.noi_dung_cong_viec && t.noi_dung_cong_viec.toLowerCase().includes(q)) ||
        (t.station_code && t.station_code.toLowerCase().includes(q)) ||
        (t.employee_assigned_name && t.employee_assigned_name.toLowerCase().includes(q)) ||
        (t.group_name && t.group_name.toLowerCase().includes(q))
      );
    }

    // 4. Sort
    const sortKey = params.sort_by;
    const sortOrder = params.sort_order === 'asc' ? 1 : -1;

    if (sortKey) {
      items.sort((a, b) => {
        let va = a[sortKey];
        let vb = b[sortKey];

        // Null / undefined placed at end
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        if (sortKey === 'thoi_gian_con_lai') {
          const na = Number(va);
          const nb = Number(vb);
          if (isNaN(na) && isNaN(nb)) return 0;
          if (isNaN(na)) return 1;
          if (isNaN(nb)) return -1;
          return (na - nb) * sortOrder;
        }

        if (sortKey.startsWith('thoi_diem_')) {
          const ta = new Date(va).getTime();
          const tb = new Date(vb).getTime();
          if (isNaN(ta) && isNaN(tb)) return 0;
          if (isNaN(ta)) return 1;
          if (isNaN(tb)) return -1;
          return (ta - tb) * sortOrder;
        }

        return String(va).localeCompare(String(vb), 'vi', { numeric: true, sensitivity: 'base' }) * sortOrder;
      });
    }

    const total = items.length;
    const page = params.page || 1;
    const pageSize = params.page_size || 50;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pagedItems = items.slice((page - 1) * pageSize, page * pageSize);

    return {
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      items: pagedItems,
      _source: 'instant_cache'
    };
  },
  getTimeline: async (days = 30) => {
    const res = await api.get('/stats/timeline', { params: { days } });
    return res.data;
  },
  getOverdue: async (params = {}) => {
    const res = await api.get('/stats/overdue', { params });
    return res.data;
  },
};

