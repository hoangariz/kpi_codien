import api from './client';

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk — safe for Cloudflare
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const isRetryable = !err.response || err.response.status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK';
      if (!isRetryable) throw err;
      console.warn(`Upload attempt ${attempt + 1} failed, retrying in ${delay * (attempt + 1)}ms...`, err.message);
      await sleep(delay * (attempt + 1));
    }
  }
}

export const importsApi = {
  /**
   * Upload file using chunked upload for reliability (bypasses Cloudflare limits).
   * Falls back to single-request upload for small files.
   */
  uploadFile: async (file, filterSpm = false, onProgress = null) => {
    const shouldChunk = file.size > CHUNK_SIZE;

    if (!shouldChunk) {
      // Small file: single request with retry
      return withRetry(async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filter_spm', filterSpm ? '1' : '0');
        const res = await api.post('/imports', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 minutes for upload
        });
        return res.data;
      });
    }

    // Large file: chunked upload
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Initialize chunked upload session
    const initForm = new FormData();
    initForm.append('file_name', file.name);
    initForm.append('file_size', file.size.toString());
    initForm.append('filter_spm', filterSpm ? '1' : '0');
    const initRes = await withRetry(async () => {
      const res = await api.post('/imports/chunked/init', initForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      return res.data;
    });

    const importId = initRes.import_id;

    // 2. Upload each chunk with retry
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);

      await withRetry(async () => {
        const chunkForm = new FormData();
        chunkForm.append('chunk_index', i.toString());
        chunkForm.append('total_chunks', totalChunks.toString());
        chunkForm.append('chunk', chunkBlob, `chunk_${i}`);
        await api.post(`/imports/chunked/${importId}`, chunkForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000, // 2 min per chunk
        });
      });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    // 3. Finalize: trigger ETL processing
    const finalRes = await withRetry(async () => {
      const res = await api.post(`/imports/chunked/${importId}/finalize`, null, {
        timeout: 30000,
      });
      return res.data;
    });

    return finalRes;
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
