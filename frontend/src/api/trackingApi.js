import api from './client';

export const trackingApi = {
  getBoards: async () => {
    const res = await api.get('/tracking-boards');
    return res.data;
  },
  createBoard: async (data) => {
    const res = await api.post('/tracking-boards', data);
    return res.data;
  },
  getBoardDetail: async (boardId) => {
    const res = await api.get(`/tracking-boards/${boardId}`);
    return res.data;
  },
  updateBoard: async (boardId, data) => {
    const res = await api.put(`/tracking-boards/${boardId}`, data);
    return res.data;
  },
  deleteBoard: async (boardId) => {
    const res = await api.delete(`/tracking-boards/${boardId}`);
    return res.data;
  },
  addTaskToBoard: async (boardId, ma_cong_viec, note = '') => {
    const res = await api.post(`/tracking-boards/${boardId}/tasks`, { ma_cong_viec, note });
    return res.data;
  },
  bulkAddTasksToBoard: async (boardId, taskCodes, note = '') => {
    const res = await api.post(`/tracking-boards/${boardId}/bulk-tasks`, {
      ma_cong_viec_list: taskCodes,
      note
    });
    return res.data;
  },
  updateTaskNoteInBoard: async (boardId, ma_cong_viec, note) => {
    const res = await api.put(`/tracking-boards/${boardId}/tasks/${ma_cong_viec}`, { note });
    return res.data;
  },
  removeTaskFromBoard: async (boardId, ma_cong_viec) => {
    const res = await api.delete(`/tracking-boards/${boardId}/tasks/${ma_cong_viec}`);
    return res.data;
  },
  clearAllTasksFromBoard: async (boardId) => {
    const res = await api.delete(`/tracking-boards/${boardId}/tasks`);
    return res.data;
  },
  getBoardsForTask: async (ma_cong_viec) => {
    const res = await api.get(`/tracking-boards/task/${ma_cong_viec}`);
    return res.data;
  },
  syncBoard: async (boardId) => {
    const res = await api.post(`/tracking-boards/${boardId}/sync`);
    return res.data;
  }
};
