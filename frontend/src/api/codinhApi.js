import api from './client';

export const codinhApi = {
  // Lấy danh sách danh mục / bảng báo cáo CĐBR
  getCategories: async (month = null, includeSummary = true) => {
    const params = { include_summary: includeSummary };
    if (month) params.month = month;
    const res = await api.get('/codinh/categories', { params });
    return res.data;
  },

  // Tạo bảng báo cáo mới
  createCategory: async (data) => {
    const res = await api.post('/codinh/categories', data);
    return res.data;
  },

  // Sửa bảng báo cáo
  updateCategory: async (id, data) => {
    const res = await api.put(`/codinh/categories/${id}`, data);
    return res.data;
  },

  // Xóa bảng báo cáo
  deleteCategory: async (id) => {
    const res = await api.delete(`/codinh/categories/${id}`);
    return res.data;
  },

  // Lấy thống kê số liệu CĐBR (kép WO & Tủ)
  getStats: async (categoryId = null, month = null) => {
    const params = {};
    if (categoryId) params.category_id = categoryId;
    if (month) params.month = month;
    const res = await api.get('/codinh/stats', { params });
    return res.data;
  },

  // Lấy options loại công việc & hệ thống để tạo báo cáo
  getMetaOptions: async () => {
    const res = await api.get('/codinh/meta/options');
    return res.data;
  },

  // Nạp file gốc WO Cố Định Băng Rộng riêng biệt (không dùng chung với tổng quan)
  uploadWoFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/codinh/wos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    });
    return res.data;
  },

  // Nạp file chi tiết tủ cáp (THC) theo WO
  uploadCabinetFile: async (file, categoryId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (categoryId) formData.append('category_id', categoryId);
    const res = await api.post('/codinh/cabinets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    });
    return res.data;
  },
};

