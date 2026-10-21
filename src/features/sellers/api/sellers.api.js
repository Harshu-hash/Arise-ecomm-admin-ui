import { api } from '@core/api/axiosInstance';

export const sellersApi = {
  list: (params) => api.get('/sellers', params),
  applications: (params) => api.get('/sellers/applications', params),
  performance: (params) => api.get('/sellers/performance', params),
  detail: (id) => api.get(`/sellers/${id}`),
  update: (id, payload) => api.patch(`/sellers/${id}`, payload),
  assign: (id, payload) => api.post(`/sellers/${id}/assign`, payload ?? {}),
  addNote: (id, text) => api.post(`/sellers/${id}/notes`, { text }),
  decideDocument: (id, docId, payload) =>
    api.post(`/sellers/${id}/documents/${docId}/decide`, payload),
  decideApplication: (id, decision, payload) =>
    api.post(`/sellers/${id}/application/${decision}`, payload ?? {}),
  lifecycle: (id, action, payload) => api.post(`/sellers/${id}/lifecycle/${action}`, payload ?? {}),
};

export const sellerOpsApi = {
  brandRequests: (params) => api.get('/brand-requests', params),
  decideBrandRequest: (id, payload) => api.post(`/brand-requests/${id}/decide`, payload),
  penalties: (params) => api.get('/penalties', params),
  createPenalty: (payload) => api.post('/penalties', payload),
  waivePenalty: (id, payload) => api.post(`/penalties/${id}/waive`, payload),
  claims: (params) => api.get('/seller-claims', params),
  decideClaim: (id, payload) => api.post(`/seller-claims/${id}/decide`, payload),
};

/** Query keys for every seller-side screen. */
export const sellerKeys = {
  all: ['sellers'],
  list: (p) => ['sellers', 'list', p],
  applications: (p) => ['sellers', 'applications', p],
  performance: (p) => ['sellers', 'performance', p],
  detail: (id) => ['sellers', 'detail', id],
  brandRequests: (p) => ['brandRequests', p],
  penalties: (p) => ['penalties', p],
  claims: (p) => ['sellerClaims', p],
};
