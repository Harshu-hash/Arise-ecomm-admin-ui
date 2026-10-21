import { api } from '@core/api/axiosInstance';

export const marketingApi = {
  coupons: (params) => api.get('/coupons', params),
  coupon: (id) => api.get(`/coupons/${id}`),
  createCoupon: (payload) => api.post('/coupons', payload),
  updateCoupon: (id, payload) => api.patch(`/coupons/${id}`, payload),
  pauseCoupon: (id) => api.post(`/coupons/${id}/pause`, {}),
  endCoupon: (id) => api.post(`/coupons/${id}/end`, {}),
  cloneCoupon: (id) => api.post(`/coupons/${id}/clone`, {}),
  testCoupon: (id, payload) => api.post(`/coupons/${id}/test`, payload),

  segments: (params) => api.get('/segments', params),
  segment: (id) => api.get(`/segments/${id}`),
  previewSegment: (rule) => api.post('/segments/preview', { rule }),
  createSegment: (payload) => api.post('/segments', payload),
  updateSegment: (id, payload) => api.patch(`/segments/${id}`, payload),
  deleteSegment: (id) => api.delete(`/segments/${id}`),

  deals: (params) => api.get('/deals', params),
  dealsCalendar: () => api.get('/deals/calendar'),
  createDeal: (payload) => api.post('/deals', payload),
  rescheduleDeal: (id, slotDate) => api.post(`/deals/${id}/reschedule`, { slotDate }),
  deleteDeal: (id) => api.delete(`/deals/${id}`),

  flashSales: (params) => api.get('/flash-sales', params),
  flashSale: (id) => api.get(`/flash-sales/${id}`),
  createFlashSale: (payload) => api.post('/flash-sales', payload),
  transitionFlashSale: (id, action, reason) => api.post(`/flash-sales/${id}/transition`, { action, reason }),
  decideNomination: (saleId, nominationId, decision, reason) =>
    api.post(`/flash-sales/${saleId}/nominations/${nominationId}/decide`, { decision, reason }),
  reorderNominations: (saleId, orderedNominationIds) =>
    api.post(`/flash-sales/${saleId}/nominations/reorder`, { orderedNominationIds }),
  flashSaleLive: (id) => api.get(`/flash-sales/${id}/live`),
  pullNomination: (saleId, nominationId, reason) =>
    api.post(`/flash-sales/${saleId}/nominations/${nominationId}/pull`, { reason }),

  saleEvents: (params) => api.get('/sale-events', params),
  saleEvent: (id) => api.get(`/sale-events/${id}`),
  createSaleEvent: (payload) => api.post('/sale-events', payload),
  updateSaleEvent: (id, payload) => api.patch(`/sale-events/${id}`, payload),
  deleteSaleEvent: (id) => api.delete(`/sale-events/${id}`),

  referralConfig: () => api.get('/referral/config'),
  updateReferralConfig: (payload) => api.patch('/referral/config', payload),
  referrals: (params) => api.get('/referrals', params),
  decideReferral: (id, decision, reason) => api.post(`/referrals/${id}/decide`, { decision, reason }),

  campaigns: (params) => api.get('/campaigns', params),
  campaign: (id) => api.get(`/campaigns/${id}`),
  campaignReach: (audience) => api.post('/campaigns/reach', { audience }),
  createCampaign: (payload) => api.post('/campaigns', payload),
  testSendCampaign: (id) => api.post(`/campaigns/${id}/test-send`, {}),
  sendCampaign: (id, payload) => api.post(`/campaigns/${id}/send`, payload),
  cancelCampaign: (id) => api.post(`/campaigns/${id}/cancel`, {}),

  bankOffers: (params) => api.get('/bank-offers', params),
  updateBankOffer: (id, payload) => api.patch(`/bank-offers/${id}`, payload),
  syncBankOffers: () => api.post('/bank-offers/sync', {}),
};

export const marketingKeys = {
  coupons: (p) => ['marketing', 'coupons', p],
  coupon: (id) => ['marketing', 'coupons', 'detail', id],
  segments: (p) => ['marketing', 'segments', p],
  segment: (id) => ['marketing', 'segments', 'detail', id],
  deals: (p) => ['marketing', 'deals', p],
  dealsCalendar: ['marketing', 'deals', 'calendar'],
  flashSales: (p) => ['marketing', 'flashSales', p],
  flashSale: (id) => ['marketing', 'flashSales', 'detail', id],
  saleEvents: (p) => ['marketing', 'saleEvents', p],
  saleEvent: (id) => ['marketing', 'saleEvents', 'detail', id],
  referralConfig: ['marketing', 'referral', 'config'],
  referrals: (p) => ['marketing', 'referrals', p],
  campaigns: (p) => ['marketing', 'campaigns', p],
  campaign: (id) => ['marketing', 'campaigns', 'detail', id],
  bankOffers: (p) => ['marketing', 'bankOffers', p],
};
