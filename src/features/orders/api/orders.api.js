import { api } from '@core/api/axiosInstance';

export const ordersApi = {
  list: (params) => api.get('/orders', params),
  detail: (id) => api.get(`/orders/${id}`),
  cancelItems: (id, payload) => api.post(`/orders/${id}/cancel-items`, payload),
  hold: (id, payload) => api.post(`/orders/${id}/hold`, payload),
  release: (id) => api.post(`/orders/${id}/release`, {}),
  changeAddress: (id, payload) => api.post(`/orders/${id}/address`, payload),
  addNote: (id, text) => api.post(`/orders/${id}/notes`, { text }),
  initiateReturn: (orderId, itemId, payload) =>
    api.post(`/orders/${orderId}/items/${itemId}/return`, payload),

  cancellations: (params) => api.get('/orders/cancellations', params),
  exceptions: (params) => api.get('/orders/exceptions', params),
  resolveException: (id, payload) => api.post(`/orders/exceptions/${id}/resolve`, payload),
  assignException: (id) => api.post(`/orders/exceptions/${id}/assign`, {}),

  returns: (params) => api.get('/returns', params),
  returnDetail: (id) => api.get(`/returns/${id}`),
  returnAction: (id, action, payload) => api.post(`/returns/${id}/${action}`, payload ?? {}),
};

export const customersApi = {
  list: (params) => api.get('/customers', params),
  detail: (id) => api.get(`/customers/${id}`),
  action: (id, action, payload) => api.post(`/customers/${id}/${action}`, payload ?? {}),
  privacyRequests: (params) => api.get('/customers/privacy-requests', params),
  privacyDetail: (id) => api.get(`/privacy-requests/${id}`),
  privacyAction: (id, action, payload) => api.post(`/privacy-requests/${id}/${action}`, payload ?? {}),
  risk: (params) => api.get('/customers/risk', params),
  decideFlag: (id, payload) => api.post(`/risk-flags/${id}/decide`, payload),
  addBlocklist: (payload) => api.post('/blocklist', payload),
};

export const orderKeys = {
  all: ['orders'],
  list: (p) => ['orders', 'list', p],
  detail: (id) => ['orders', 'detail', id],
  cancellations: (p) => ['orders', 'cancellations', p],
  exceptions: (p) => ['orders', 'exceptions', p],
  returns: (p) => ['returns', 'list', p],
  returnDetail: (id) => ['returns', 'detail', id],
};

export const customerKeys = {
  all: ['customers'],
  list: (p) => ['customers', 'list', p],
  detail: (id) => ['customers', 'detail', id],
  privacy: (p) => ['customers', 'privacy', p],
  privacyDetail: (id) => ['customers', 'privacy', 'detail', id],
  risk: (p) => ['customers', 'risk', p],
};
