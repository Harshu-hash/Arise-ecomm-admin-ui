import { api } from '@core/api/axiosInstance';

export const reviewsApi = {
  reviews: (params) => api.get('/reviews', params),
  review: (id) => api.get(`/reviews/${id}`),
  publishReview: (id) => api.post(`/reviews/${id}/publish`, {}),
  rejectReview: (id, reason) => api.post(`/reviews/${id}/reject`, { reason }),
  hideMedia: (id) => api.post(`/reviews/${id}/hide-media`, {}),
  flagIncentivised: (id) => api.post(`/reviews/${id}/flag-incentivised`, {}),
  bulkReviews: (payload) => api.post('/reviews/bulk', payload),

  questions: (params) => api.get('/questions', params),
  question: (id) => api.get(`/questions/${id}`),
  moderateQuestion: (id, status) => api.post(`/questions/${id}/moderate`, { status }),
  answerQuestion: (id, text) => api.post(`/questions/${id}/answers`, { text }),
  moderateAnswer: (id, status) => api.post(`/answers/${id}/moderate`, { status }),

  abuseReports: (params) => api.get('/abuse-reports', params),
  decideAbuseReport: (id, decision, reason) => api.post(`/abuse-reports/${id}/decide`, { decision, reason }),
};

export const reviewsKeys = {
  reviews: (p) => ['reviews', 'list', p],
  review: (id) => ['reviews', 'detail', id],
  questions: (p) => ['reviews', 'questions', p],
  question: (id) => ['reviews', 'questions', 'detail', id],
  abuseReports: (p) => ['reviews', 'abuseReports', p],
};
