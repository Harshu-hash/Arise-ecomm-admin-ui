import { api } from '@core/api/axiosInstance';

export const logisticsApi = {
  couriers: () => api.get('/couriers'),
  pauseCourier: (id, payload) => api.post(`/couriers/${id}/pause`, payload),
  pincodes: (params) => api.get('/pincodes', params),
  checkPincode: (params) => api.get('/pincodes/check', params),
  overridePincode: (id, payload) => api.post(`/pincodes/${id}/override`, payload),
  shipments: (params) => api.get('/shipments', params),
  shipmentAction: (id, action, payload) => api.post(`/shipments/${id}/${action}`, payload ?? {}),
  manifests: (params) => api.get('/manifests', params),
  rescheduleManifest: (id, payload) => api.post(`/manifests/${id}/reschedule`, payload),
  ndr: (params) => api.get('/ndr', params),
  ndrAction: (payload) => api.post('/ndr/action', payload),
  rto: (params) => api.get('/rto', params),
  weightDisputes: (params) => api.get('/weight-disputes', params),
  decideWeightDispute: (id, payload) => api.post(`/weight-disputes/${id}/decide`, payload),
  rules: () => api.get('/shipping-rules'),
  simulate: (payload) => api.post('/shipping-rules/simulate', payload),
  updateFeeRule: (id, payload) => api.patch(`/shipping-rules/fees/${id}`, payload),
};

export const warehouseApi = {
  warehouses: () => api.get('/warehouses'),
  pauseWarehouse: (id, payload) => api.post(`/warehouses/${id}/pause`, payload),
  inbound: (params) => api.get('/inbound', params),
  inboundDetail: (id) => api.get(`/inbound/${id}`),
  transitionInbound: (id, payload) => api.post(`/inbound/${id}/transition`, payload),
  receiveInbound: (id, payload) => api.post(`/inbound/${id}/receive`, payload),
  inventory: (params) => api.get('/inventory', params),
  inventoryLedger: (id) => api.get(`/inventory/${id}/ledger`),
  adjustments: (params) => api.get('/stock-adjustments', params),
  createAdjustment: (payload) => api.post('/stock-adjustments', payload),
  removals: (params) => api.get('/removal-orders', params),
  approveRemoval: (id) => api.post(`/removal-orders/${id}/approve`, {}),
};

export const logisticsKeys = {
  couriers: ['logistics', 'couriers'],
  pincodes: (p) => ['logistics', 'pincodes', p],
  shipments: (p) => ['logistics', 'shipments', p],
  manifests: (p) => ['logistics', 'manifests', p],
  ndr: (p) => ['logistics', 'ndr', p],
  rto: (p) => ['logistics', 'rto', p],
  weight: (p) => ['logistics', 'weight', p],
  rules: ['logistics', 'rules'],
};

export const warehouseKeys = {
  warehouses: ['warehouse', 'list'],
  inbound: (p) => ['warehouse', 'inbound', p],
  inboundDetail: (id) => ['warehouse', 'inbound', 'detail', id],
  inventory: (p) => ['warehouse', 'inventory', p],
  ledger: (id) => ['warehouse', 'ledger', id],
  adjustments: (p) => ['warehouse', 'adjustments', p],
  removals: (p) => ['warehouse', 'removals', p],
};
