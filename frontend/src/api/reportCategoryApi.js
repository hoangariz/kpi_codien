import api from './client';

export const reportCategoryApi = {
  getCategories: async (month = null, domain = 'codien') => {
    const params = {};
    if (month) params.month = month;
    if (domain && domain !== 'all') params.domain = domain;
    const res = await api.get('/reports/categories', { params });
    return res.data;
  },
  createCategory: async (data) => {
    const res = await api.post('/reports/categories', data);
    return res.data;
  },
  updateCategory: async (id, data) => {
    const res = await api.put(`/reports/categories/${id}`, data);
    return res.data;
  },
  deleteCategory: async (id) => {
    const res = await api.delete(`/reports/categories/${id}`);
    return res.data;
  },
  createSubCategory: async (categoryId, data) => {
    const res = await api.post(`/reports/categories/${categoryId}/sub-categories`, data);
    return res.data;
  },
  updateSubCategory: async (subId, data) => {
    const res = await api.put(`/reports/categories/sub-categories/${subId}`, data);
    return res.data;
  },
  deleteSubCategory: async (subId) => {
    const res = await api.delete(`/reports/categories/sub-categories/${subId}`);
    return res.data;
  }
};

export default reportCategoryApi;
