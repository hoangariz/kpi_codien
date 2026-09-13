import api from './client';

export const tasksApi = {
  getTasks: async (params = {}) => {
    const res = await api.get('/tasks', { params });
    return res.data;
  },
  getTaskDetail: async (ma_cong_viec) => {
    const res = await api.get(`/tasks/${encodeURIComponent(ma_cong_viec)}`);
    return res.data;
  },
  getTaskHistory: async (ma_cong_viec) => {
    const res = await api.get(`/tasks/${encodeURIComponent(ma_cong_viec)}/history`);
    return res.data;
  },
  getTaskNotes: async (ma_cong_viec) => {
    const res = await api.get(`/tasks/${encodeURIComponent(ma_cong_viec)}/notes`);
    return res.data;
  },
  addTaskNote: async (ma_cong_viec, note_content, created_by = 'Admin') => {
    const res = await api.post(`/tasks/${encodeURIComponent(ma_cong_viec)}/notes`, {
      note_content,
      created_by,
    });
    return res.data;
  },
};
