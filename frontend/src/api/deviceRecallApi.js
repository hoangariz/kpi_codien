import axios from 'axios';

const api = axios.create({
  baseURL: '/api/device-recall',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const deviceRecallApi = {
  // Lấy danh sách các cụm (Trung tâm Cụm xã)
  getClusters: async () => {
    const res = await api.get('/clusters');
    return res.data;
  },

  // Lấy danh sách FT trong cụm
  getFtsByCluster: async (cluster) => {
    const res = await api.get('/fts', { params: { cluster } });
    return res.data;
  },

  // Lấy danh sách chi tiết thiết bị cần thu hồi
  getItems: async (cluster, ft = null, search = null) => {
    const params = { cluster };
    if (ft) params.ft = ft;
    if (search) params.search = search;
    const res = await api.get('/items', { params });
    return res.data;
  },

  // Lấy metadata cập nhật gần nhất
  getMeta: async () => {
    const res = await api.get('/meta');
    return res.data;
  },

  // Nạp file .txt
  uploadFile: async (file, onUploadProgress = null) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return res.data;
  },

  // Nạp lại từ file mẫu thuhoithietbi.txt
  reloadDefault: async () => {
    const res = await api.post('/reload-default');
    return res.data;
  },
};
