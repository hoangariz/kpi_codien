import api from './client';

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB per chunk
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const CONCURRENT_CHUNKS = 4; // 4 concurrent workers queue

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableError(err) {
  if (!err.response) return true; // Network error or client timeout
  const status = err.response.status;
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
  return false;
}

/**
 * Retry wrapper with linear backoff (1s, 2s, 3s)
 */
async function withLinearRetry(fn, retries = MAX_RETRIES, baseDelay = BASE_RETRY_DELAY_MS) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries || !isRetryableError(err)) {
        throw err;
      }
      const delay = baseDelay * (attempt + 1);
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, err.message);
      await sleep(delay);
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

  // Nạp file gốc WO CĐBR riêng biệt (Hỗ trợ Chunked Upload 8MB, 4 workers queue, retry và phục hồi missing chunks)
  uploadWoFile: async (file, onProgress = null) => {
    // 1. Files <= 8MB: Single request
    if (file.size <= DEFAULT_CHUNK_SIZE) {
      return withLinearRetry(async () => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/codinh/wos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(Math.min(pct, 100));
            }
          },
        });
        if (onProgress) onProgress(100);
        return res.data;
      });
    }

    // 2. Large files: Chunked upload
    // Step 1: Initialize session
    const initForm = new FormData();
    initForm.append('file_name', file.name);
    initForm.append('file_size', file.size.toString());

    const initRes = await withLinearRetry(async () => {
      const res = await api.post('/codinh/wos/chunked/init', initForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      return res.data;
    });

    const importId = initRes.import_id;
    const chunkSize = initRes.chunk_size || DEFAULT_CHUNK_SIZE;
    const totalChunks = initRes.total_chunks || Math.ceil(file.size / chunkSize);

    // Track bytes sent per chunk for smooth onProgress(0..100)
    const sent = new Array(totalChunks).fill(0);

    const updateOverallProgress = () => {
      if (!onProgress) return;
      const totalSent = sent.reduce((acc, b) => acc + b, 0);
      const pct = Math.min(Math.round((totalSent / file.size) * 100), 100);
      onProgress(pct);
    };

    // Helper to upload a single chunk with linear retry & raw octet-stream
    const uploadSingleChunk = async (i) => {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const blob = file.slice(start, end);
      const expectedSize = end - start;

      await withLinearRetry(async () => {
        await api.put(`/codinh/wos/chunked/${importId}/${i}`, blob, {
          headers: { 'Content-Type': 'application/octet-stream' },
          timeout: 180000,
          onUploadProgress: (progressEvent) => {
            sent[i] = Math.min(progressEvent.loaded, expectedSize);
            updateOverallProgress();
          },
        });
        sent[i] = expectedSize;
        updateOverallProgress();
      });
    };

    // Step 2: Upload chunks using 4 concurrent workers queue
    const uploadChunkList = async (chunkIndices) => {
      let nextIdx = 0;
      let poolError = null;

      const worker = async () => {
        while (nextIdx < chunkIndices.length && !poolError) {
          const currentChunk = chunkIndices[nextIdx++];
          try {
            await uploadSingleChunk(currentChunk);
          } catch (err) {
            poolError = err;
            throw err;
          }
        }
      };

      const workers = [];
      const workerCount = Math.min(CONCURRENT_CHUNKS, chunkIndices.length);
      for (let w = 0; w < workerCount; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    };

    // Initial upload of all chunks
    const allChunks = Array.from({ length: totalChunks }, (_, idx) => idx);
    await uploadChunkList(allChunks);

    // Step 3: Finalize with 409 missing_chunks retry
    const finalize = async (canRetryMissing = true) => {
      try {
        const res = await api.post(`/codinh/wos/chunked/${importId}/finalize`, null, {
          timeout: 30000,
        });
        return res.data;
      } catch (err) {
        if (
          canRetryMissing &&
          err.response &&
          err.response.status === 409 &&
          Array.isArray(err.response.data?.detail?.missing_chunks)
        ) {
          const missing = err.response.data.detail.missing_chunks;
          console.warn(`Finalize returned 409, uploading ${missing.length} missing chunks:`, missing);
          for (const mIdx of missing) {
            sent[mIdx] = 0;
          }
          await uploadChunkList(missing);
          return finalize(false);
        }
        throw err;
      }
    };

    const finalRes = await finalize();
    if (onProgress) onProgress(100);
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

