import { api } from '@core/api/axiosInstance';

export const supportApi = {
  queues: () => api.get('/support/queues'),
  agents: (queueId) => api.get('/support/agents', queueId ? { queueId } : undefined),

  tickets: (params) => api.get('/tickets', params),
  ticket: (id) => api.get(`/tickets/${id}`),
  createTicket: (payload) => api.post('/tickets', payload),
  postMessage: (id, payload) => api.post(`/tickets/${id}/messages`, payload),
  transitionTicket: (id, payload) => api.post(`/tickets/${id}/transition`, payload),
  assignTicket: (id, assigneeId) => api.post(`/tickets/${id}/assign`, { assigneeId }),
  escalateTicket: (id, payload) => api.post(`/tickets/${id}/escalate`, payload),
  mergeTicket: (id, targetTicketId) => api.post(`/tickets/${id}/merge`, { targetTicketId }),

  macros: (params) => api.get('/macros', params),
  createMacro: (payload) => api.post('/macros', payload),
  updateMacro: (id, payload) => api.patch(`/macros/${id}`, payload),
  deleteMacro: (id) => api.delete(`/macros/${id}`),

  slaPolicies: () => api.get('/support/sla-policies'),
  updateSlaPolicy: (id, payload) => api.patch(`/support/sla-policies/${id}`, payload),
  routingRules: () => api.get('/support/routing-rules'),
  updateRoutingRule: (id, payload) => api.patch(`/support/routing-rules/${id}`, payload),
  reorderRoutingRules: (orderedIds) => api.patch('/support/routing-rules/reorder', { orderedIds }),

  csatConfig: () => api.get('/support/csat/config'),
  updateCsatConfig: (payload) => api.patch('/support/csat/config', payload),
  csatDashboard: () => api.get('/support/csat/dashboard'),
  qaReviews: (params) => api.get('/support/qa-reviews', params),
  createQaReview: (payload) => api.post('/support/qa-reviews', payload),

  chatSessions: () => api.get('/chat/sessions'),
  chatSession: (id) => api.get(`/chat/sessions/${id}`),
  claimChat: (id) => api.post(`/chat/sessions/${id}/claim`, {}),
  sendChatMessage: (id, text) => api.post(`/chat/sessions/${id}/messages`, { text }),
  transferChat: (id, agentId) => api.post(`/chat/sessions/${id}/transfer`, { agentId }),
  convertChat: (id) => api.post(`/chat/sessions/${id}/convert`, {}),
  endChat: (id, dispositionCode) => api.post(`/chat/sessions/${id}/end`, { dispositionCode }),
};

export const supportKeys = {
  queues: ['support', 'queues'],
  agents: (queueId) => ['support', 'agents', queueId],
  tickets: (p) => ['support', 'tickets', p],
  ticket: (id) => ['support', 'tickets', 'detail', id],
  macros: (p) => ['support', 'macros', p],
  slaPolicies: ['support', 'slaPolicies'],
  routingRules: ['support', 'routingRules'],
  csatConfig: ['support', 'csatConfig'],
  csatDashboard: ['support', 'csatDashboard'],
  qaReviews: (p) => ['support', 'qaReviews', p],
  chatSessions: ['support', 'chatSessions'],
  chatSession: (id) => ['support', 'chatSessions', 'detail', id],
};
