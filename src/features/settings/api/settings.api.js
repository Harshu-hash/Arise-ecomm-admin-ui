import { api } from '@core/api/axiosInstance';

export const settingsApi = {
  sections: () => api.get('/admin/settings'),
  updateSection: (sectionId, payload) => api.patch(`/admin/settings/${sectionId}`, payload),

  appConfig: () => api.get('/admin/app-config'),
  updateAppConfig: (payload) => api.patch('/admin/app-config', payload),
  setMaintenance: (platform, payload) => api.post(`/admin/app-config/maintenance/${platform}`, payload),

  featureFlags: () => api.get('/admin/feature-flags'),
  createFlag: (payload) => api.post('/admin/feature-flags', payload),
  updateFlag: (id, payload) => api.patch(`/admin/feature-flags/${id}`, payload),
  deleteFlag: (id) => api.delete(`/admin/feature-flags/${id}`),
  previewFlag: (id, context) => api.post(`/admin/feature-flags/${id}/preview`, { context }),

  integrations: () => api.get('/admin/integrations'),
  updateIntegration: (key, payload) => api.patch(`/admin/integrations/${key}`, payload),
  setCredentials: (key, payload) => api.post(`/admin/integrations/${key}/credentials`, payload),
  webhooks: (key, params) => api.get(`/admin/integrations/${key}/webhooks`, params),
};

export const settingsKeys = {
  sections: ['settings', 'sections'],
  appConfig: ['settings', 'appConfig'],
  featureFlags: ['settings', 'featureFlags'],
  integrations: ['settings', 'integrations'],
  webhooks: (key, params) => ['settings', 'webhooks', key, params],
};
