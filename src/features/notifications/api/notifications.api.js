import { api } from '@core/api/axiosInstance';

export const notificationsApi = {
  templates: () => api.get('/notification-templates'),
  template: (id) => api.get(`/notification-templates/${id}`),
  updateChannel: (templateId, channel, payload) => api.patch(`/notification-templates/${templateId}/${channel}`, payload),
  testSend: (templateId, channel) => api.post(`/notification-templates/${templateId}/${channel}/test`, {}),

  logs: (params) => api.get('/notification-logs', params),
  resendLog: (id) => api.post(`/notification-logs/${id}/resend`, {}),
};

export const notificationsKeys = {
  templates: ['notifications', 'templates'],
  template: (id) => ['notifications', 'templates', 'detail', id],
  logs: (p) => ['notifications', 'logs', p],
};
