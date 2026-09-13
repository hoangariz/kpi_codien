import api from './client';

export const metaApi = {
  getFilters: async () => {
    const res = await api.get('/meta/filters');
    return res.data;
  },
};

export default metaApi;
