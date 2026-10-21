import { api } from '@core/api/axiosInstance';

/** Thin wrappers over the auth endpoints; all return the unwrapped `data`. */
export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  verify2fa: (payload) => api.post('/auth/2fa/verify', payload).then((r) => r.data),
  enrol2fa: (payload) => api.post('/auth/2fa/enrol', payload).then((r) => r.data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }).then((r) => r.data),
  logout: () => api.post('/auth/logout', {}).then((r) => r.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload) => api.post('/auth/reset-password', payload).then((r) => r.data),
  getInvite: (token) => api.get(`/auth/invite/${token}`).then((r) => r.data),
  acceptInvite: (payload) => api.post('/auth/invite/accept', payload).then((r) => r.data),
  me: () => api.get('/me').then((r) => r.data),
  changePassword: (payload) => api.post('/me/password', payload).then((r) => r.data),
  mySessions: () => api.get('/me/sessions').then((r) => r.data),
  revokeMySession: (id) => api.delete(`/me/sessions/${id}`).then((r) => r.data),
  updatePreferences: (payload) => api.patch('/me/preferences', payload).then((r) => r.data),
  regenerateBackupCodes: () => api.post('/me/2fa/backup-codes', {}).then((r) => r.data),
};
