import api from './client';

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
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

export const importsApi = {
  /**
   * Upload file using chunked upload for reliability (bypasses Cloudflare limits).
   * Falls back to single-request upload for files <= 8MB.
   */
  uploadFile: async (file, filterSpm = false, onProgress = null) => {
    // 1. Files <= 8MB: Single request
    if (file.size <= DEFAULT_CHUNK_SIZE) {
      return withLinearRetry(async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filter_spm', filterSpm ? '1' : '0');
        const res = await api.post('/imports', formData, {
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
    initForm.append('filter_spm', filterSpm ? '1' : '0');

    const initRes = await withLinearRetry(async () => {
      const res = await api.post('/imports/chunked/init', initForm, {
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
        await api.put(`/imports/chunked/${importId}/${i}`, blob, {
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
        const res = await api.post(`/imports/chunked/${importId}/finalize`, null, {
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
          updateOverallProgress();

          // Upload missing chunks
          await uploadChunkList(missing);

          // Retry finalize once
          return await finalize(false);
        }
        throw err;
      }
    };

    return await finalize(true);
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
