import api from './client';

export const importsApi = {
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/imports', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },
  getImportLogs: async (limit = 50) => {
    const res = await api.get('/imports', { params: { limit } });
    return res.data;
  },
  getImportStatus: async (importId) => {
    const res = await api.get(`/imports/${importId}`);
    return res.data;
  },
  activateFile: async (importId) => {
    const res = await api.post(`/imports/${importId}/activate`);
    return res.data;
  },
  deleteFile: async (importId) => {
    const res = await api.delete(`/imports/${importId}`);
    return res.data;
  },
};

export const metaApi = {
  getFilters: async () => {
    const res = await api.get('/meta/filters');
    return res.data;
  },
};
