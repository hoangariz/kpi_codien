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
};

export default quickLinksApi;
