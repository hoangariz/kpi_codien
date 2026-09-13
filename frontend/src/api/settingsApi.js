import api from './client';

export const settingsApi = {
  getSettings: async () => {
    const res = await api.get('/settings');
    return res.data;
  },
  updateSetting: async (key, value, description = '') => {
    const res = await api.post('/settings', { key, value, description });
    return res.data;
  },
};

export default settingsApi;
