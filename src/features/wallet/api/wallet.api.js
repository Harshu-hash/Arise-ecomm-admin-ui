import { api } from '@core/api/axiosInstance';

export const walletApi = {
  accounts: (params) => api.get('/wallets', params),
  account: (id) => api.get(`/wallets/${id}`),
  accountEntries: (id, params) => api.get(`/wallets/${id}/entries`, params),
  entries: (params) => api.get('/wallet-entries', params),
  freeze: (id, payload) => api.post(`/wallets/${id}/freeze`, payload),
  adjust: (id, payload) => api.post(`/wallets/${id}/adjust`, payload),

  giftCards: (params) => api.get('/gift-cards', params),
  generateGiftCards: (payload) => api.post('/gift-cards', payload),
  blockGiftCard: (id, payload) => api.post(`/gift-cards/${id}/block`, payload),

  cashbackRules: (params) => api.get('/cashback-rules', params),
  createCashbackRule: (payload) => api.post('/cashback-rules', payload),
  updateCashbackRule: (id, payload) => api.patch(`/cashback-rules/${id}`, payload),
};

export const walletKeys = {
  accounts: (p) => ['wallet', 'accounts', p],
  account: (id) => ['wallet', 'accounts', 'detail', id],
  entries: (p) => ['wallet', 'entries', p],
  giftCards: (p) => ['wallet', 'giftCards', p],
  cashback: (p) => ['wallet', 'cashback', p],
};
