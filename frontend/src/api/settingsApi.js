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
  exportConfig: async () => {
    const res = await api.get('/settings/export-config', {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/json; charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'kpi_system_config.json');
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
    return true;
  },
  importConfig: async (file, overwrite = true) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/settings/import-config', formData, {
      params: { overwrite },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export default settingsApi;
