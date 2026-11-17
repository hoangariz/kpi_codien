import api from './client';

export const quickLinksApi = {
  getLinks: async (allStatus = false) => {
    const res = await api.get(`/quick-links?all_status=${allStatus}`);
    return res.data;
  },
  createLink: async (payload) => {
    const res = await api.post('/quick-links', payload);
    return res.data;
  },
  updateLink: async (id, payload) => {
    const res = await api.put(`/quick-links/${id}`, payload);
    return res.data;
  },
  deleteLink: async (id) => {
    const res = await api.delete(`/quick-links/${id}`);
    return res.data;
  },
  recordClick: async (id) => {
    try {
      const res = await api.post(`/quick-links/${id}/click`);
      return res.data;
    } catch (e) {
      // ignore click tracking errors
      return null;
    }
  },
  toggleActive: async (id, isActive) => {
    const res = await api.put(`/quick-links/${id}`, { is_active: isActive });
    return res.data;
  },
  resolveSlug: async (slug) => {
    const res = await api.get(`/quick-links/resolve/${slug}`);
    return res.data;
  },
};

export default quickLinksApi;
