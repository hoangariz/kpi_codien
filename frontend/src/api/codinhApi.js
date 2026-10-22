import api from './client';

const DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunk size (fallback if server doesn't provide)
const CONCURRENT_CHUNKS = 2; // 2 concurrent workers
const MAX_CHUNK_RETRIES = 8; // Max 8 retries per chunk
const CHUNK_TIMEOUT_MS = 60000; // 60s total timeout per chunk attempt
const STALL_TIMEOUT_MS = 20000; // 20s without progress triggers abort & retry
const LOCAL_STORAGE_KEY = 'kpi_codinh_chunked_upload_session';

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

export const codinhApi = {
  // Lấy danh sách báo cáo CĐBR cố định và thẻ tóm tắt KPI
  getReports: async (month = null) => {
    const params = {};
    if (month && month !== 'all') params.month = month;
    const res = await api.get('/codinh/reports', { params });
    return res.data;
  },

  // Lấy danh sách danh mục / bảng báo cáo CĐBR (legacy)
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

  // Lấy thống kê số liệu CĐBR (3 cấp Cụm, Đội, Nhân viên)
  getStats: async (reportOrCatId = null, month = null, date = null) => {
    const params = {};
    if (reportOrCatId !== null && reportOrCatId !== undefined) {
      if (typeof reportOrCatId === 'number' || /^\d+$/.test(String(reportOrCatId))) {
        params.category_id = reportOrCatId;
      } else {
        params.report = reportOrCatId;
      }
    }
    if (month && month !== 'all') params.month = month;
    if (date) params.date = date;
    const res = await api.get('/codinh/stats', { params });
    return res.data;
  },

  // Lấy options loại công việc & hệ thống để tạo báo cáo
  getMetaOptions: async () => {
    const res = await api.get('/codinh/meta/options');
    return res.data;
  },

  /**
   * Resilient chunked WO upload for CĐBR with network fault tolerance, stall detection, and resume capability.
   *
   * @param {File} file - File Excel to upload
   * @param {function} onProgress - Progress callback: (percent, { totalSent, fileSize, isResumed })
   * @param {function} onStatusChange - Status callback: (message) => void
   * @param {AbortSignal} abortSignal - Optional signal to cancel upload
   */
  uploadWoFile: async (file, onProgress = null, onStatusChange = null, abortSignal = null) => {
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
            notifyStatus('Đang kiểm tra phiên tải lên CĐBR trước đó để tiếp tục...');
            const statusRes = await api.get(`/codinh/wos/chunked/${saved.importId}/status`, {
              signal: abortSignal,
              timeout: 15000,
            });
            if (statusRes.data?.status === 'UPLOADING') {
              importId = saved.importId;
              chunkSize = statusRes.data.chunk_size || DEFAULT_CHUNK_SIZE;
              totalChunks = statusRes.data.total_chunks || Math.ceil(file.size / chunkSize);
              receivedChunks = new Set(statusRes.data.received || []);
              isResumed = true;
              notifyStatus(`Tiếp tục phiên upload CĐBR (đã nhận ${receivedChunks.size}/${totalChunks} phần)...`);
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
      notifyStatus('Đang khởi tạo phiên tải lên CĐBR...');
      const initForm = new FormData();
      initForm.append('file_name', file.name);
      initForm.append('file_size', file.size.toString());

      let initAttempt = 0;
      let initRes = null;
      while (initAttempt < 3) {
        checkAborted();
        try {
          const res = await api.post('/codinh/wos/chunked/init', initForm, {
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
            console.warn(`[CĐBR] Chunk ${chunkIndex} stalled (>20s không tiến triển), hủy để thử lại...`);
            chunkController.abort(new Error('Upload stalled: Không có dữ liệu truyền trong 20s'));
          }
        }, 2000);

        try {
          await api.put(`/codinh/wos/chunked/${importId}/${chunkIndex}`, blob, {
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
          notifyStatus(`Đang thử lại chunk CĐBR ${chunkIndex + 1}/${totalChunks} (lần ${attempt + 1}/${MAX_CHUNK_RETRIES})...`);
          console.warn(`[CĐBR] Chunk ${chunkIndex} lỗi: ${err.message}. Thử lại sau ${baseDelay}ms...`);
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
      notifyStatus(`Đang tải lên các phần dữ liệu CĐBR (${receivedChunks.size}/${totalChunks} đã hoàn tất)...`);
      await uploadChunkList(pendingChunks);
    }

    emitProgress(true);

    // -------------------------------------------------------------------------
    // 6. Finalize with up to 3 rounds of missing_chunks retry
    // -------------------------------------------------------------------------
    notifyStatus('Đang hoàn tất và xác thực file CĐBR trên máy chủ...');
    const finalizeWithRetry = async () => {
      for (let round = 1; round <= 3; round++) {
        checkAborted();
        try {
          const res = await api.post(`/codinh/wos/chunked/${importId}/finalize`, null, {
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
            console.warn(`[CĐBR] Finalize 409 (vòng ${round}): gửi bù ${missing.length} chunks:`, missing);

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

  // Trạng thái phiên tải lên chunked CĐBR (kiểm tra các chunks đã nhận)
  getChunkedStatus: async (importId) => {
    const res = await api.get(`/codinh/wos/chunked/${importId}/status`);
    return res.data;
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
  uploadCabinetFile: async (file, report = 'thc', categoryId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (report) formData.append('report', report);
    if (categoryId) formData.append('category_id', categoryId);
    const res = await api.post('/codinh/cabinets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    });
    return res.data;
  },

  // ==========================================
  // CƠ CẤU CỤM / ĐỘI / NHÂN VIÊN (ORG DIRECTORY)
  // ==========================================
  getOrgTree: async () => {
    const res = await api.get('/codinh/org');
    return res.data;
  },

  importOrgExcel: async (file = null) => {
    let res;
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      res = await api.post('/codinh/org/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } else {
      res = await api.post('/codinh/org/import');
    }
    return res.data;
  },

  getUnmatchedUsernames: async () => {
    const res = await api.get('/codinh/org/unmatched');
    return res.data;
  },

  setTeamLeader: async (teamId, employeeId) => {
    const res = await api.post(`/codinh/org/teams/${teamId}/set-leader`, {
      employee_id: employeeId,
    });
    return res.data;
  },

  createCluster: async (data) => {
    const res = await api.post('/codinh/org/clusters', data);
    return res.data;
  },

  updateCluster: async (id, data) => {
    const res = await api.put(`/codinh/org/clusters/${id}`, data);
    return res.data;
  },

  deleteCluster: async (id) => {
    const res = await api.delete(`/codinh/org/clusters/${id}`);
    return res.data;
  },

  createTeam: async (data) => {
    const res = await api.post('/codinh/org/teams', data);
    return res.data;
  },

  updateTeam: async (id, data) => {
    const res = await api.put(`/codinh/org/teams/${id}`, data);
    return res.data;
  },

  deleteTeam: async (id) => {
    const res = await api.delete(`/codinh/org/teams/${id}`);
    return res.data;
  },

  createEmployee: async (data) => {
    const res = await api.post('/codinh/org/employees', data);
    return res.data;
  },

  updateEmployee: async (id, data) => {
    const res = await api.put(`/codinh/org/employees/${id}`, data);
    return res.data;
  },

  deleteEmployee: async (id) => {
    const res = await api.delete(`/codinh/org/employees/${id}`);
    return res.data;
  },

  // ==========================================
  // QLCTKT DAILY IMPORT & WARNINGS
  // ==========================================
  uploadQlctktFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/codinh/qlctkt/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    });
    return res.data;
  },

  getQlctktHistory: async (limit = 20) => {
    const res = await api.get('/codinh/qlctkt/history', { params: { limit } });
    return res.data;
  },

  activateQlctktFile: async (logId) => {
    const res = await api.post(`/codinh/qlctkt/activate/${logId}`);
    return res.data;
  },

  deleteQlctktFile: async (logId) => {
    const res = await api.delete(`/codinh/qlctkt/history/${logId}`);
    return res.data;
  },

  getQlctktUnmatchedNames: async () => {
    const res = await api.get('/codinh/qlctkt/unmatched-names');
    return res.data;
  },

  getOrgWarnings: async () => {
    const res = await api.get('/codinh/org/warnings');
    return res.data;
  },
};

