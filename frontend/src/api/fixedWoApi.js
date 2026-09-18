import axios from 'axios';

const api = axios.create({
  baseURL: '/api/fixed-wo-reports',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fixedWoApi = {
  // Lấy danh sách tất cả các báo cáo cố định WO
  getReports: async () => {
    const res = await api.get('');
    return res.data;
  },

  // Tạo báo cáo cố định WO mới kèm danh sách mã WO
  createReport: async (data) => {
    const res = await api.post('', data);
    return res.data;
  },

  // Lấy chi tiết 1 báo cáo cố định WO
  getReport: async (id) => {
    const res = await api.get(`/${id}`);
    return res.data;
  },

  // Cập nhật tên, mô tả hoặc cập nhật/thay thế mã WO
  updateReport: async (id, data) => {
    const res = await api.put(`/${id}`, data);
    return res.data;
  },

  // Xóa báo cáo cố định WO
  deleteReport: async (id) => {
    const res = await api.delete(`/${id}`);
    return res.data;
  },

  // Lấy danh sách mã WO của báo cáo kèm tình trạng khớp DB
  listWoCodes: async (id, params = {}) => {
    const res = await api.get(`/${id}/wo-codes`, { params });
    return res.data;
  },

  // Lấy thống kê chi tiết theo Cụm và Nhân viên (cho Dashboard)
  getStats: async (id, params = {}) => {
    const res = await api.get(`/${id}/stats`, { params });
    return res.data;
  },

  // Lấy danh sách công việc drilldown
  getTasks: async (id, params = {}) => {
    const res = await api.get(`/${id}/tasks`, { params });
    return res.data;
  },
};
