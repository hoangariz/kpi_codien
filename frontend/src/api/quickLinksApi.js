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
    if (!slug) return null;
    let clean = slug.trim().toLowerCase();
    if (clean.startsWith('s/')) {
      clean = clean.replace(/^s\//, '').trim();
    }
    // 1. Thử gọi API resolve chuyên dụng
    try {
      const res = await api.get(`/quick-links/resolve/${clean}`);
      if (res.data && res.data.url) {
        return res.data;
      }
    } catch (e) {
      // Backend có thể chưa cập nhật endpoint mới, chuyển sang fallback
    }

    // 2. Dự phòng trực tiếp: Lấy danh sách liên kết từ API có sẵn và đối soát slug
    try {
      const res = await api.get('/quick-links?all_status=false');
      const list = res.data || [];
      const matched = list.find((item) => (item.slug || '').toLowerCase() === clean);
      if (matched && matched.url) {
        // Tăng click count trong nền
        api.post(`/quick-links/${matched.id}/click`).catch(() => {});
        return {
          success: true,
          id: matched.id,
          title: matched.title,
          url: matched.url,
          slug: matched.slug,
        };
      }
    } catch (e) {
      console.error('Lỗi khi đối soát danh sách liên kết:', e);
    }

    return null;
  },
};

export default quickLinksApi;
