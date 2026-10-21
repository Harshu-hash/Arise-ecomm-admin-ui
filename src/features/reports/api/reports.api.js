import { api } from '@core/api/axiosInstance';

export const reportsApi = {
  analytics: (domain, days) => api.get(`/reports/analytics/${domain}`, { days }),
  library: () => api.get('/reports/library'),
  runReport: (reportKey, filters) => api.post(`/reports/library/${reportKey}/run`, { filters }),
  scheduled: (params) => api.get('/reports/scheduled', params),
  createSchedule: (payload) => api.post('/reports/scheduled', payload),
  updateSchedule: (id, payload) => api.patch(`/reports/scheduled/${id}`, payload),
  deleteSchedule: (id) => api.delete(`/reports/scheduled/${id}`),
  jobs: (params) => api.get('/jobs', params),
  job: (id) => api.get(`/jobs/${id}`),
};

export const reportsKeys = {
  analytics: (domain, days) => ['reports', 'analytics', domain, days],
  library: ['reports', 'library'],
  scheduled: (params) => ['reports', 'scheduled', params],
  jobs: (params) => ['reports', 'jobs', params],
};
