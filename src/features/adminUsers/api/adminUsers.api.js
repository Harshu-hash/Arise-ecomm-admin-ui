import { api } from '@core/api/axiosInstance';

export const adminUsersApi = {
  list: (params) => api.get('/admin-users', params),
  detail: (id) => api.get(`/admin-users/${id}`),
  invite: (payload) => api.post('/admin-users', payload),
  update: (id, payload) => api.patch(`/admin-users/${id}`, payload),
  unlock: (id) => api.post(`/admin-users/${id}/unlock`, {}),
  deactivate: (id, payload) => api.post(`/admin-users/${id}/deactivate`, payload),
  reactivate: (id) => api.post(`/admin-users/${id}/reactivate`, {}),
  reset2fa: (id, payload) => api.post(`/admin-users/${id}/reset-2fa`, payload),
  resendInvite: (id) => api.post(`/admin-users/${id}/resend-invite`, {}),
  revokeSessions: (id, payload) => api.post(`/admin-users/${id}/revoke-sessions`, payload ?? {}),
};

export const rolesApi = {
  list: (params) => api.get('/roles', { pageSize: 100, ...params }),
  detail: (id) => api.get(`/roles/${id}`),
  create: (payload) => api.post('/roles', payload),
  update: (id, payload) => api.patch(`/roles/${id}`, payload),
  clone: (id, payload) => api.post(`/roles/${id}/clone`, payload),
  remove: (id) => api.delete(`/roles/${id}`),
};
