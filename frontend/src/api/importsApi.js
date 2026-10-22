import api from './client';

const DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunk size (fallback if server doesn't provide)
const CONCURRENT_CHUNKS = 2; // 2 concurrent workers
const MAX_CHUNK_RETRIES = 8; // Max 8 retries per chunk
const CHUNK_TIMEOUT_MS = 60000; // 60s total timeout per chunk attempt
const STALL_TIMEOUT_MS = 20000; // 20s without progress triggers abort & retry
const LOCAL_STORAGE_KEY = 'kpi_chunked_upload_session';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Determine if an error during chunk upload should be retried.
 * Retries network errors, stall aborts, 5xx, 408, 429, 499.
 * Does NOT retry regular 4xx client errors (e.g. 400, 401, 403, 404).
 */
function isRetryableChunkError(err) {
  if (!err) return true;
  // If aborted due to user cancellation, do NOT retry
  if (err.name === 'CanceledError' && err.message?.includes('hủy')) return false;
  if (!err.response) return true; // Network disconnect, timeout, or stall abort
  const status = err.response.status;
  if (status >= 500) return true;
  if (status === 408 || status === 429 || status === 499) return true;
  return false;
}

export const importsApi = {
  /**
   * Resilient chunked file upload with network fault tolerance, stall detection, and resume capability.
   *
   * @param {File} file - File to upload
   * @param {boolean} filterSpm - Whether to filter SPM rows in ETL
   * @param {function} onProgress - Progress callback: (percent, { totalSent, fileSize, isResumed })
   * @param {function} onStatusChange - Status callback: (message) => void
   * @param {AbortSignal} abortSignal - Optional signal to cancel upload
   */
  uploadFile: async (file, filterSpm = false, onProgress = null, onStatusChange = null, abortSignal = null) => {
    let importId = null;
    let chunkSize = DEFAULT_CHUNK_SIZE;
    let totalChunks = 0;
    let receivedChunks = new Set();
    let isResumed = false;

    // Helper to notify status
    const notifyStatus = (msg) => {
      if (onStatusChange) onStatusChange(msg);
    };

    // Helper to check abort
    const checkAborted = () => {
      if (abortSignal?.aborted) {
        throw new Error('Upload đã bị người dùng hủy');
      }
    };

    // -------------------------------------------------------------------------
    // 1. Check for resumable session in localStorage
    // -------------------------------------------------------------------------
    try {
      const savedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (
          saved &&
          saved.importId &&
          saved.name === file.name &&
          saved.size === file.size &&
          saved.lastModified === file.lastModified
        ) {
          try {
            notifyStatus('Đang kiểm tra phiên tải lên trước đó để tiếp tục...');
            const statusRes = await api.get(`/imports/chunked/${saved.importId}/status`, {
              signal: abortSignal,
              timeout: 15000,
            });
            if (statusRes.data?.status === 'UPLOADING') {
              importId = saved.importId;
              chunkSize = statusRes.data.chunk_size || DEFAULT_CHUNK_SIZE;
              totalChunks = statusRes.data.total_chunks || Math.ceil(file.size / chunkSize);
              receivedChunks = new Set(statusRes.data.received || []);
              isResumed = true;
              notifyStatus(`Tiếp tục phiên upload (đã nhận ${receivedChunks.size}/${totalChunks} phần)...`);
            } else {
              localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
          } catch (stErr) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      // LocalStorage access or parse error
    }

    checkAborted();

    // -------------------------------------------------------------------------
    // 2. Initialize new session if not resumed
    // -------------------------------------------------------------------------
    if (!importId) {
      notifyStatus('Đang khởi tạo phiên tải lên...');
      const initForm = new FormData();
      initForm.append('file_name', file.name);
      initForm.append('file_size', file.size.toString());
      initForm.append('filter_spm', filterSpm ? '1' : '0');

      let initAttempt = 0;
      let initRes = null;
      while (initAttempt < 3) {
        checkAborted();
        try {
          const res = await api.post('/imports/chunked/init', initForm, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
            signal: abortSignal,
          });
          initRes = res.data;
          break;
        } catch (err) {
          initAttempt++;
          if (initAttempt >= 3 || !isRetryableChunkError(err)) throw err;
          await sleep(1000 * initAttempt);
        }
      }

      importId = initRes.import_id;
      chunkSize = initRes.chunk_size || DEFAULT_CHUNK_SIZE;
      totalChunks = initRes.total_chunks || Math.ceil(file.size / chunkSize);

      try {
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({
            importId,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
          })
        );
      } catch (e) {}
    }

    // -------------------------------------------------------------------------
    // 3. Track progress and throttle updates (max 4 times/sec = 250ms)
    // -------------------------------------------------------------------------
    const sentBytes = new Array(totalChunks).fill(0);

    // Pre-fill already received chunks
    for (const rIdx of receivedChunks) {
      const start = rIdx * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      sentBytes[rIdx] = end - start;
    }

    let lastProgressEmit = 0;
    const emitProgress = (force = false) => {
      if (!onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressEmit < 250) return;
      lastProgressEmit = now;
      const totalSent = sentBytes.reduce((acc, b) => acc + b, 0);
      const pct = Math.min(Math.round((totalSent / file.size) * 100), 100);
      onProgress(pct, { totalSent, fileSize: file.size, isResumed });
    };

    emitProgress(true);

    // -------------------------------------------------------------------------
    // 4. Upload single chunk with stall detection & retry
    // -------------------------------------------------------------------------
    const uploadSingleChunk = async (chunkIndex) => {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const blob = file.slice(start, end);
      const expectedSize = end - start;

      for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
        checkAborted();

        const chunkController = new AbortController();
        let lastLoaded = 0;
        let lastProgressTime = Date.now();
        let stallInterval = null;

        // Link external abort signal to chunk controller
        const onExternalAbort = () => {
          chunkController.abort(new Error('Upload đã bị người dùng hủy'));
        };
        if (abortSignal) {
          abortSignal.addEventListener('abort', onExternalAbort);
        }

        // Stall detector: abort if no byte progress for 20s
        stallInterval = setInterval(() => {
          if (Date.now() - lastProgressTime >= STALL_TIMEOUT_MS) {
            console.warn(`Chunk ${chunkIndex} stalled (>20s không tiến triển), hủy để thử lại...`);
            chunkController.abort(new Error('Upload stalled: Không có dữ liệu truyền trong 20s'));
          }
        }, 2000);

        try {
          await api.put(`/imports/chunked/${importId}/${chunkIndex}`, blob, {
            headers: { 'Content-Type': 'application/octet-stream' },
            timeout: CHUNK_TIMEOUT_MS,
            signal: chunkController.signal,
            onUploadProgress: (pe) => {
              if (pe.loaded > lastLoaded) {
                lastLoaded = pe.loaded;
                lastProgressTime = Date.now();
              }
              sentBytes[chunkIndex] = Math.min(pe.loaded, expectedSize);
              emitProgress();
            },
          });

          // Chunk completed successfully
          sentBytes[chunkIndex] = expectedSize;
          receivedChunks.add(chunkIndex);
          emitProgress();
          return;
        } catch (err) {
          checkAborted();
          if (attempt === MAX_CHUNK_RETRIES || !isRetryableChunkError(err)) {
            throw err;
          }

          // Exponential backoff with jitter: 1s, 2s, 4s... max 15s
          const baseDelay = Math.min(15000, Math.round(1000 * Math.pow(1.8, attempt) + Math.random() * 500));
          notifyStatus(`Đang thử lại chunk ${chunkIndex + 1}/${totalChunks} (lần ${attempt + 1}/${MAX_CHUNK_RETRIES})...`);
          console.warn(`Chunk ${chunkIndex} lỗi: ${err.message}. Thử lại sau ${baseDelay}ms...`);
          await sleep(baseDelay);
        } finally {
          if (stallInterval) clearInterval(stallInterval);
          if (abortSignal) abortSignal.removeEventListener('abort', onExternalAbort);
        }
      }
    };

    // -------------------------------------------------------------------------
    // 5. Worker queue with CONCURRENT_CHUNKS = 2
    // -------------------------------------------------------------------------
    const uploadChunkList = async (chunkIndices) => {
      let nextPos = 0;
      let workerError = null;

      const worker = async () => {
        while (nextPos < chunkIndices.length && !workerError) {
          checkAborted();
          const currentChunk = chunkIndices[nextPos++];
          try {
            await uploadSingleChunk(currentChunk);
          } catch (err) {
            workerError = err;
            throw err;
          }
        }
      };

      const workers = [];
      const numWorkers = Math.min(CONCURRENT_CHUNKS, chunkIndices.length);
      for (let w = 0; w < numWorkers; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    };

    // Identify missing chunks to upload
    const pendingChunks = Array.from({ length: totalChunks }, (_, idx) => idx).filter(
      (idx) => !receivedChunks.has(idx)
    );

    if (pendingChunks.length > 0) {
      notifyStatus(`Đang tải lên các phần dữ liệu (${receivedChunks.size}/${totalChunks} đã hoàn tất)...`);
      await uploadChunkList(pendingChunks);
    }

    emitProgress(true);

    // -------------------------------------------------------------------------
    // 6. Finalize with up to 3 rounds of missing_chunks retry
    // -------------------------------------------------------------------------
    notifyStatus('Đang hoàn tất và xác thực file trên máy chủ...');
    const finalizeWithRetry = async () => {
      for (let round = 1; round <= 3; round++) {
        checkAborted();
        try {
          const res = await api.post(`/imports/chunked/${importId}/finalize`, null, {
            timeout: 45000,
            signal: abortSignal,
          });

          // Finalize success: remove saved resume session
          try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
          } catch (e) {}

          return res.data;
        } catch (err) {
          checkAborted();
          if (
            round < 3 &&
            err.response &&
            err.response.status === 409 &&
            Array.isArray(err.response.data?.detail?.missing_chunks)
          ) {
            const missing = err.response.data.detail.missing_chunks;
            notifyStatus(`Phát hiện thiếu ${missing.length} phần, đang gửi bù (vòng ${round}/3)...`);
            console.warn(`Finalize 409 (vòng ${round}): gửi bù ${missing.length} chunks:`, missing);

            for (const mIdx of missing) {
              sentBytes[mIdx] = 0;
              receivedChunks.delete(mIdx);
            }
            emitProgress(true);

            await uploadChunkList(missing);
            continue;
          }
          throw err;
        }
      }
    };

    return await finalizeWithRetry();
  },

  getChunkedStatus: async (importId) => {
    const res = await api.get(`/imports/chunked/${importId}/status`);
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
