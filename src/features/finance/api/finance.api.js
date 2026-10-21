import { api } from '@core/api/axiosInstance';

export const financeApi = {
  overview: () => api.get('/finance/overview'),

  /** Queues an export job; it lands in the Export Center when ready. */
  exportDataset: (dataset, filters) => api.post('/finance/export', { dataset, filters }),

  payments: (params) => api.get('/payments', params),
  payment: (id) => api.get(`/payments/${id}`),

  refunds: (params) => api.get('/refunds', params),
  createRefund: (payload) => api.post('/refunds', payload),
  retryRefund: (id) => api.post(`/refunds/${id}/retry`, {}),
  switchRefundMode: (id, payload) => api.post(`/refunds/${id}/mode`, payload),

  settlements: (params) => api.get('/settlements', params),
  settlementSummary: () => api.get('/settlements/summary'),

  batches: (params) => api.get('/payout-batches', params),
  batch: (id) => api.get(`/payout-batches/${id}`),
  createBatch: (payload) => api.post('/payout-batches', payload),
  releaseBatch: (id) => api.post(`/payout-batches/${id}/release`, {}),
  retryBatch: (id) => api.post(`/payout-batches/${id}/retry`, {}),

  payouts: (params) => api.get('/payouts', params),
  payout: (id) => api.get(`/payouts/${id}`),
  adjustments: (params) => api.get('/payout-adjustments', params),
  createAdjustment: (payload) => api.post('/payout-adjustments', payload),
  holdSellerPayouts: (sellerId, payload) => api.post(`/sellers/${sellerId}/payout-hold`, payload),

  commissionRules: (params) => api.get('/commission-rules', params),
  updateCommissionRule: (id, payload) => api.patch(`/commission-rules/${id}`, payload),
  updateFeeConfig: (payload) => api.patch('/fee-config', payload),
  previewFees: (payload) => api.post('/commission-rules/preview', payload),

  taxSummaries: (params) => api.get('/tax-summaries', params),

  codRemittances: (params) => api.get('/cod-remittances', params),
  disputeRemittance: (id, payload) => api.post(`/cod-remittances/${id}/dispute`, payload),

  invoices: (params) => api.get('/invoices', params),
  invoice: (id) => api.get(`/invoices/${id}`),
  regenerateInvoice: (id, payload) => api.post(`/invoices/${id}/regenerate`, payload),

  reconciliation: (params) => api.get('/reconciliation', params),
  runReconciliation: (payload) => api.post('/reconciliation', payload),
};

export const financeKeys = {
  overview: ['finance', 'overview'],
  payments: (p) => ['finance', 'payments', p],
  refunds: (p) => ['finance', 'refunds', p],
  settlements: (p) => ['finance', 'settlements', p],
  settlementSummary: ['finance', 'settlements', 'summary'],
  batches: (p) => ['finance', 'batches', p],
  batch: (id) => ['finance', 'batches', 'detail', id],
  payouts: (p) => ['finance', 'payouts', p],
  payout: (id) => ['finance', 'payouts', 'detail', id],
  adjustments: (p) => ['finance', 'adjustments', p],
  commission: (p) => ['finance', 'commission', p],
  tax: (p) => ['finance', 'tax', p],
  cod: (p) => ['finance', 'cod', p],
  invoices: (p) => ['finance', 'invoices', p],
  invoice: (id) => ['finance', 'invoices', 'detail', id],
  reconciliation: (p) => ['finance', 'reconciliation', p],
};
