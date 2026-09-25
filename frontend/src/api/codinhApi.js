import api from './client';

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const isRetryable =
        !err.response ||
        err.response.status >= 500 ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ERR_NETWORK';
      if (!isRetryable) throw err;
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, err.message);
      await sleep(delay * (attempt + 1));
    }
  }
}

export const codinhApi = {
  // Lấy danh sách danh mục / bảng báo cáo CĐBR
  getCategories: async (month = null, includeSummary = true) => {
    const params = { include_summary: includeSummary };
    if (month) params.month = month;
    const res = await api.get('/codinh/categories', { params });
    return res.data;
  },

  // Tạo bảng báo cáo mới
  createCategory: async (data) => {
    const res = await api.post('/codinh/categories', data);
    return res.data;
  },

  // Sửa bảng báo cáo
  updateCategory: async (id, data) => {
    const res = await api.put(`/codinh/categories/${id}`, data);
    return res.data;
  },

  // Xóa bảng báo cáo
  deleteCategory: async (id) => {
    const res = await api.delete(`/codinh/categories/${id}`);
    return res.data;
  },

  // Lấy thống kê số liệu CĐBR (kép WO & Tủ)
  getStats: async (categoryId = null, month = null) => {
    const params = {};
    if (categoryId) params.category_id = categoryId;
    if (month) params.month = month;
    const res = await api.get('/codinh/stats', { params });
    return res.data;
  },

  // Lấy options loại công việc & hệ thống để tạo báo cáo
  getMetaOptions: async () => {
    const res = await api.get('/codinh/meta/options');
    return res.data;
  },

  // Nạp file gốc WO CĐBR riêng biệt (Hỗ trợ Chunked Upload tự động chia nhỏ file và retry)
  uploadWoFile: async (file, onProgress = null) => {
    const shouldChunk = file.size > CHUNK_SIZE;

    if (!shouldChunk) {
      // Small file: single request
      return withRetry(async () => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/codinh/wos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(percent);
            }
          },
        });
        return res.data;
      });
    }

    // Large file: chunked upload
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init chunked session
    const initForm = new FormData();
    initForm.append('file_name', file.name);
    initForm.append('file_size', file.size.toString());
    const initRes = await withRetry(async () => {
      const res = await api.post('/codinh/wos/chunked/init', initForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      return res.data;
    });

    const importId = initRes.import_id;

    // 2. Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);

      await withRetry(async () => {
        const chunkForm = new FormData();
        chunkForm.append('chunk_index', i.toString());
        chunkForm.append('total_chunks', totalChunks.toString());
        chunkForm.append('chunk', chunkBlob, `chunk_${i}`);
        await api.post(`/codinh/wos/chunked/${importId}`, chunkForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
      });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    // 3. Finalize chunked session
    const finalRes = await withRetry(async () => {
      const res = await api.post(`/codinh/wos/chunked/${importId}/finalize`, null, {
        timeout: 30000,
      });
      return res.data;
    });

    return finalRes;
  },

  // Lấy lịch sử các file CĐBR đã nạp
  getImportLogs: async (limit = 50) => {
    const res = await api.get('/codinh/import-logs', { params: { limit } });
    return res.data;
  },

  // Kiểm tra trạng thái nạp live của file CĐBR
  getImportStatus: async (importId) => {
    const res = await api.get(`/codinh/import-logs/${importId}`);
    return res.data;
  },

  // Kích hoạt / Nạp lại file CĐBR cũ
  activateFile: async (importId) => {
    const res = await api.post(`/codinh/import-logs/${importId}/activate`);
    return res.data;
  },

  // Xóa file CĐBR
  deleteFile: async (importId) => {
    const res = await api.delete(`/codinh/import-logs/${importId}`);
    return res.data;
  },

  // Lấy danh sách việc chi tiết khi bấm vào số liệu (Drilldown)
  getDrilldownTasks: async (params = {}) => {
    const res = await api.get('/codinh/drilldown', { params });
    return res.data;
  },

  // Nạp file chi tiết tủ cáp (THC) theo WO
  uploadCabinetFile: async (file, categoryId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (categoryId) formData.append('category_id', categoryId);
    const res = await api.post('/codinh/cabinets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    });
    return res.data;
  },
};

