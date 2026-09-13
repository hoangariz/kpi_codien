import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 minutes timeout for large operations
});

export default api;
