import { api } from '@core/api/axiosInstance';

export const adsApi = {
  sellerProducts: (sellerId) => api.get(`/ads/sellers/${sellerId}/products`),
  campaigns: (params) => api.get('/ads/campaigns', params),
  campaign: (id) => api.get(`/ads/campaigns/${id}`),
  createCampaign: (payload) => api.post('/ads/campaigns', payload),
  submitCampaign: (id) => api.post(`/ads/campaigns/${id}/submit`, {}),
  pauseCampaign: (id, reason) => api.post(`/ads/campaigns/${id}/pause`, { reason }),
  resumeCampaign: (id) => api.post(`/ads/campaigns/${id}/resume`, {}),
  endCampaign: (id) => api.post(`/ads/campaigns/${id}/end`, {}),
  archiveCampaign: (id) => api.post(`/ads/campaigns/${id}/archive`, {}),

  reviewQueue: (params) => api.get('/ads/review', params),
  decideReview: (id, decision, reason) => api.post(`/ads/review/${id}/decide`, { decision, reason }),

  placements: () => api.get('/ads/placements'),
  updatePlacement: (id, payload) => api.patch(`/ads/placements/${id}`, payload),

  wallets: (params) => api.get('/ads/billing/wallets', params),
  wallet: (id) => api.get(`/ads/billing/wallets/${id}`),
  rechargeWallet: (id, amountPaise, note) => api.post(`/ads/billing/wallets/${id}/recharge`, { amountPaise, note }),
  invoices: (params) => api.get('/ads/billing/invoices', params),
  generateInvoice: (payload) => api.post('/ads/billing/invoices/generate', payload),

  invalidClicks: (params) => api.get('/ads/invalid-clicks', params),
  creditInvalidClick: (id, amountPaise) => api.post(`/ads/invalid-clicks/${id}/credit`, { amountPaise }),

  reports: () => api.get('/ads/reports'),
};

export const adsKeys = {
  campaigns: (p) => ['ads', 'campaigns', p],
  campaign: (id) => ['ads', 'campaigns', 'detail', id],
  reviewQueue: (p) => ['ads', 'review', p],
  placements: ['ads', 'placements'],
  wallets: (p) => ['ads', 'wallets', p],
  wallet: (id) => ['ads', 'wallets', 'detail', id],
  invoices: (p) => ['ads', 'invoices', p],
  invalidClicks: (p) => ['ads', 'invalidClicks', p],
  reports: ['ads', 'reports'],
};

/** A campaign's displayed status folds its pause reason in, matching the status domain's own codes. */
export function campaignStatusCode(campaign) {
  if (campaign.status === 'PAUSED' && ['BUDGET_EXHAUSTED', 'WALLET_EMPTY'].includes(campaign.pauseReason)) {
    return campaign.pauseReason;
  }
  return campaign.status;
}
