import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, filter } from './db/store';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { DEMO_PASSWORD } from './seed/adminUsers';
import { resetSettings, updateSettings } from './engine/settings';

const server = setupServer(...handlers);
const BASE = `${window.location.origin}/api/admin/v1`;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  seedAll();
  resetSettings();
  updateSettings({ latencyMs: 0 });
});

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function signIn(email) {
  const login = await call('/auth/login', { method: 'POST', body: { email, password: DEMO_PASSWORD } });
  expect(login.status, `login ${email}`).toBe(200);
  const { challengeId, devHint, stage } = login.json.data;
  const verify = await call(`/auth/2fa/${stage === 'enrol_2fa' ? 'enrol' : 'verify'}`, {
    method: 'POST',
    body: { challengeId, code: devHint.code },
  });
  return verify.json.data;
}

describe('serviceability', () => {
  it('ranks courier options by landed cost for a pincode and weight', async () => {
    const s = await signIn('ops@arise.test');
    const metro = db.pincodes.find((p) => p.zone === 'METRO' && p.codAvailable);
    const r = await call(`/pincodes/check?pincode=${metro.pincode}&weightG=800&paymentMode=PREPAID`, {
      token: s.accessToken,
    });

    expect(r.status).toBe(200);
    expect(r.json.data.serviceable).toBe(true);
    expect(r.json.data.options.length).toBeGreaterThan(0);
    // Cheapest first.
    const prices = r.json.data.options.map((o) => o.pricePaise);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('charges more for a heavier parcel', async () => {
    const s = await signIn('ops@arise.test');
    const p = db.pincodes.find((x) => x.zone === 'METRO');
    const light = await call(`/pincodes/check?pincode=${p.pincode}&weightG=400`, { token: s.accessToken });
    const heavy = await call(`/pincodes/check?pincode=${p.pincode}&weightG=4500`, { token: s.accessToken });
    expect(heavy.json.data.options[0].pricePaise).toBeGreaterThan(light.json.data.options[0].pricePaise);
  });

  it('refuses COD where the pincode has it switched off', async () => {
    const s = await signIn('ops@arise.test');
    const blocked = db.pincodes.find((p) => !p.codAvailable);
    expect(blocked).toBeTruthy();
    const r = await call(`/pincodes/check?pincode=${blocked.pincode}&paymentMode=COD`, { token: s.accessToken });
    expect(r.json.data.codAvailable).toBe(false);
    expect(r.json.data.options).toEqual([]);
  });

  it('reports an unknown pincode as unserviceable rather than erroring', async () => {
    const s = await signIn('ops@arise.test');
    const r = await call('/pincodes/check?pincode=999999', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.serviceable).toBe(false);
  });

  it('adds extra days for an out-of-delivery-area pincode', async () => {
    const s = await signIn('ops@arise.test');
    const oda = db.pincodes.find((p) => p.oda);
    const r = await call(`/pincodes/check?pincode=${oda.pincode}`, { token: s.accessToken });
    expect(r.json.data.options[0].tatDays).toBeGreaterThan(oda.tatDays);
  });

  it('switches COD off for a pincode and records why', async () => {
    const s = await signIn('ops@arise.test');
    const p = db.pincodes.find((x) => x.codAvailable);
    const r = await call(`/pincodes/${p.id}/override`, {
      method: 'POST',
      token: s.accessToken,
      body: { override: 'COD_DISABLED', reason: 'RTO above 40% for three months' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.codAvailable).toBe(false);
  });
});

describe('allocation rules', () => {
  it('picks the highest-priority matching rule', async () => {
    const s = await signIn('ops@arise.test');
    const metro = db.pincodes.find((p) => p.zone === 'METRO');
    const r = await call('/shipping-rules/simulate', {
      method: 'POST',
      token: s.accessToken,
      body: { pincode: metro.pincode, weightG: 500, paymentMode: 'PREPAID' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.matchedRule.name).toBe('Metro prepaid, light');
    expect(r.json.data.courierSplit.reduce((n, c) => n + c.sharePct, 0)).toBe(100);
  });

  it('routes COD down the COD rule regardless of zone', async () => {
    const s = await signIn('ops@arise.test');
    const metro = db.pincodes.find((p) => p.zone === 'METRO');
    const r = await call('/shipping-rules/simulate', {
      method: 'POST',
      token: s.accessToken,
      body: { pincode: metro.pincode, weightG: 500, paymentMode: 'COD' },
    });
    expect(r.json.data.matchedRule.name).toBe('COD anywhere');
  });

  it('falls through to the catch-all for an unusual combination', async () => {
    const s = await signIn('ops@arise.test');
    const rest = db.pincodes.find((p) => p.zone === 'REST_OF_INDIA');
    const r = await call('/shipping-rules/simulate', {
      method: 'POST',
      token: s.accessToken,
      body: { pincode: rest.pincode, weightG: 1500, paymentMode: 'PREPAID' },
    });
    expect(r.json.data.matchedRule.name).toBe('Everything else');
  });

  it('sends a customer-facing fee change for approval', async () => {
    const s = await signIn('super@arise.test');
    const rule = db.shippingFeeRules[0];
    const r = await call(`/shipping-rules/fees/${rule.id}`, {
      method: 'PATCH',
      token: s.accessToken,
      body: { freeAbovePaise: 99900, reason: 'Margin pressure' },
    });
    expect(r.status).toBe(202);
    expect(db.shippingFeeRules[0].freeAbovePaise).toBe(rule.freeAbovePaise);
  });
});

describe('shipments and couriers', () => {
  it('flags parcels with no courier scan for days', async () => {
    const s = await signIn('ops@arise.test');
    const r = await call('/shipments?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data[0]).toHaveProperty('daysSinceScan');
    expect(r.json.data[0]).toHaveProperty('promisedBreached');
  });

  it('refuses to reallocate a parcel the courier already has', async () => {
    const s = await signIn('ops@arise.test');
    const picked = db.shipments.find((x) => x.lastScanAt && x.awb);
    const other = db.couriers.find((c) => c.id !== picked.courierId);
    const r = await call(`/shipments/${picked.id}/reallocate`, {
      method: 'POST', token: s.accessToken, body: { courierId: other.id },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ALREADY_PICKED_UP');
  });

  it('marking a shipment lost takes its items with it', async () => {
    const s = await signIn('ops@arise.test');
    const shipment = db.shipments.find((x) => x.status === 'IN_TRANSIT');
    const r = await call(`/shipments/${shipment.id}/mark-lost`, {
      method: 'POST', token: s.accessToken, body: { reason: 'No scan for 12 days' },
    });
    expect(r.status).toBe(200);
    const items = filter('orderItems', (i) => i.shipmentId === shipment.id);
    expect(items.every((i) => i.status === 'LOST_IN_TRANSIT')).toBe(true);
  });

  it('pausing a courier leaves parcels already with them alone', async () => {
    const s = await signIn('ops@arise.test');
    const courier = db.couriers.find((c) => c.status === 'ACTIVE');
    const before = filter('shipments', (x) => x.courierId === courier.id && x.awb).length;

    const r = await call(`/couriers/${courier.id}/pause`, {
      method: 'POST', token: s.accessToken, body: { reason: 'API failing' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('PAUSED');
    expect(filter('shipments', (x) => x.courierId === courier.id && x.awb)).toHaveLength(before);
  });
});

describe('NDR', () => {
  it('lists open NDRs with their action deadline', async () => {
    const s = await signIn('ops@arise.test');
    const r = await call('/ndr?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.data[0]).toHaveProperty('actionDueAt');
    expect(r.json.meta.byReason).toBeTruthy();
  });

  it('reattempts delivery and moves the shipment back out', async () => {
    const s = await signIn('ops@arise.test');
    const row = db.ndrRecords.find((n) => n.status === 'OPEN' && n.attempt < 3);
    const r = await call('/ndr/action', {
      method: 'POST',
      token: s.accessToken,
      body: { ids: [row.id], action: 'REATTEMPT', reattemptDate: '2026-10-20' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.succeeded).toBe(1);
    expect(db.shipments.find((x) => x.id === row.shipmentId).status).toBe('OUT_FOR_DELIVERY');
  });

  it('refuses a fourth attempt and says to send it back', async () => {
    const s = await signIn('ops@arise.test');
    const row = db.ndrRecords.find((n) => n.status === 'OPEN');
    row.attempt = 3;
    const r = await call('/ndr/action', {
      method: 'POST', token: s.accessToken, body: { ids: [row.id], action: 'REATTEMPT' },
    });
    expect(r.json.data.results[0].ok).toBe(false);
    expect(r.json.data.results[0].error).toMatch(/send it back/i);
  });

  it('reports per-row outcomes on a bulk action instead of failing wholesale', async () => {
    const s = await signIn('ops@arise.test');
    const good = db.ndrRecords.find((n) => n.status === 'OPEN' && n.attempt < 3);
    const r = await call('/ndr/action', {
      method: 'POST',
      token: s.accessToken,
      body: { ids: [good.id, 'NDR-999999'], action: 'REATTEMPT' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.succeeded).toBe(1);
    expect(r.json.data.results.find((x) => x.id === 'NDR-999999').ok).toBe(false);
  });

  it('sending to RTO needs a reason and moves the items', async () => {
    const s = await signIn('ops@arise.test');
    const row = db.ndrRecords.find((n) => n.status === 'OPEN');

    const noReason = await call('/ndr/action', {
      method: 'POST', token: s.accessToken, body: { ids: [row.id], action: 'RTO' },
    });
    expect(noReason.status).toBe(422);

    const ok = await call('/ndr/action', {
      method: 'POST',
      token: s.accessToken,
      body: { ids: [row.id], action: 'RTO', reason: 'Three failed attempts' },
    });
    expect(ok.status).toBe(200);
    expect(db.shipments.find((x) => x.id === row.shipmentId).status).toBe('RTO_INITIATED');
  });

  it('surfaces the pincodes RTO actually comes from', async () => {
    const s = await signIn('ops@arise.test');
    const r = await call('/rto?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.meta.topPincodes)).toBe(true);
  });
});

describe('weight disputes', () => {
  it('accepting one can correct the SKU master so it stops recurring', async () => {
    const s = await signIn('ops@arise.test');
    const row = db.weightDisputes.find((d) => d.status === 'DISPUTED_BY_SELLER' || d.status === 'RAISED_BY_COURIER');
    const variant = db.variants.find((v) => v.sku === row.sku);

    const r = await call(`/weight-disputes/${row.id}/decide`, {
      method: 'POST',
      token: s.accessToken,
      body: { decision: 'ACCEPTED', reason: 'Courier photographs are conclusive', updateSkuWeight: true },
    });
    expect(r.status).toBe(200);
    if (variant) {
      expect(db.variants.find((v) => v.id === variant.id).weightG).toBe(row.chargedWeightG);
    }
  });

  it('will not decide the same dispute twice', async () => {
    const s = await signIn('ops@arise.test');
    const row = db.weightDisputes.find((d) => d.status === 'ACCEPTED');
    const r = await call(`/weight-disputes/${row.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'REJECTED', reason: 'x' },
    });
    expect(r.status).toBe(409);
  });
});

describe('warehouses and inventory', () => {
  it('reports stock split into buckets with days of cover', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/inventory?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    const row = r.json.data[0];
    expect(row).toHaveProperty('available');
    expect(row).toHaveProperty('daysOfCover');
    expect(row.available).toBe(row.sellable - row.reserved);
    expect(r.json.meta.totals).toHaveProperty('agedOver180');
  });

  it('scopes a warehouse manager to their own sites', async () => {
    const wm = await signIn('warehouse@arise.test');
    // The seeded manager must change their password first, but the scope is
    // already attached to the session.
    expect(wm.user.scope.warehouses).toHaveLength(1);
    const allowed = wm.user.scope.warehouses[0];

    const r = await call('/inventory?pageSize=200', { token: wm.accessToken });
    expect(r.json.data.every((i) => i.warehouseId === allowed)).toBe(true);
  });

  it('refuses a write-off larger than the stock on hand', async () => {
    const s = await signIn('super@arise.test');
    const inv = db.inventory.find((i) => i.sellable > 0);
    const r = await call('/stock-adjustments', {
      method: 'POST',
      token: s.accessToken,
      body: {
        inventoryId: inv.id, fromBucket: 'sellable', toBucket: 'unsellable',
        qty: inv.sellable + 10, reasonCode: 'DAMAGED_IN_WAREHOUSE', evidence: 'photos',
      },
    });
    expect(r.status).toBe(422);
    expect(r.json.error.fieldErrors.qty).toMatch(/on hand/);
  });

  it('a write-off moves the units and raises a claim for the seller', async () => {
    const s = await signIn('super@arise.test');
    const inv = db.inventory.find((i) => i.sellable > 20);
    // `inv` is a live reference into the mock database, so the counts have to
    // be snapshotted before the call or they mutate under the assertion.
    const sellableBefore = inv.sellable;
    const unsellableBefore = inv.unsellable;
    const claimsBefore = db.sellerClaims.length;

    const r = await call('/stock-adjustments', {
      method: 'POST',
      token: s.accessToken,
      body: {
        inventoryId: inv.id, fromBucket: 'sellable', toBucket: 'unsellable',
        qty: 5, reasonCode: 'DAMAGED_IN_WAREHOUSE', evidence: 'Forklift damage, photos attached',
      },
    });
    expect(r.status).toBe(201);

    const fresh = db.inventory.find((i) => i.id === inv.id);
    expect(fresh.sellable).toBe(sellableBefore - 5);
    expect(fresh.unsellable).toBe(unsellableBefore + 5);
    // Stock lost in our care is the seller's money.
    expect(db.sellerClaims.length).toBe(claimsBefore + 1);
    expect(db.inventoryLedger.some((l) => l.inventoryId === inv.id && l.type === 'ADJUSTMENT')).toBe(true);
  });

  it('pausing inbound stops new appointments', async () => {
    const s = await signIn('super@arise.test');
    const warehouse = db.warehouses.find((w) => w.type === 'FULFILMENT');
    await call(`/warehouses/${warehouse.id}/pause`, {
      method: 'POST', token: s.accessToken, body: { flow: 'inbound', reason: 'Dock refurbishment' },
    });

    const consignment = db.inboundConsignments.find(
      (c) => c.warehouseId === warehouse.id && c.status === 'SUBMITTED',
    );
    if (!consignment) return;
    const r = await call(`/inbound/${consignment.id}/transition`, {
      method: 'POST',
      token: s.accessToken,
      body: { status: 'APPOINTMENT_BOOKED', appointmentAt: '2026-10-20T11:00:00.000Z' },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('WAREHOUSE_INBOUND_PAUSED');
  });

  it('refuses an out-of-order inbound transition', async () => {
    const s = await signIn('super@arise.test');
    const draft = db.inboundConsignments.find((c) => c.status === 'DRAFT');
    const r = await call(`/inbound/${draft.id}/transition`, {
      method: 'POST', token: s.accessToken, body: { status: 'RECEIVED' },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('refuses a GRN that counts more than was declared', async () => {
    const s = await signIn('super@arise.test');
    const consignment = db.inboundConsignments.find((c) => c.status === 'ARRIVED')
      ?? db.inboundConsignments.find((c) => c.status === 'RECEIVING');
    if (!consignment) return;
    const line = db.inboundLines.find((l) => l.consignmentId === consignment.id);

    const r = await call(`/inbound/${consignment.id}/receive`, {
      method: 'POST',
      token: s.accessToken,
      body: { lines: [{ id: line.id, sellable: line.declaredQty + 5, damaged: 0, missing: 0 }] },
    });
    expect(r.status).toBe(422);
  });
});

describe('Journey 3 — inbound to sellable stock', () => {
  it('receives a consignment with a discrepancy and puts the good units on sale', async () => {
    const admin = await signIn('super@arise.test');

    // 1. A booked consignment arriving at the dock.
    const consignment = db.inboundConsignments.find((c) => c.status === 'APPOINTMENT_BOOKED');
    expect(consignment).toBeTruthy();

    const arrived = await call(`/inbound/${consignment.id}/transition`, {
      method: 'POST',
      token: admin.accessToken,
      body: { status: 'ARRIVED', vehicleNo: 'MH12AB1234' },
    });
    expect(arrived.status).toBe(200);

    // 2. Count it. One line comes up short and damaged.
    const detail = await call(`/inbound/${consignment.id}`, { token: admin.accessToken });
    const lines = detail.json.meta.lines;
    expect(lines.length).toBeGreaterThan(0);

    const line = lines[0];
    const sellable = line.declaredQty - 6;
    const stockBefore = db.inventory.find(
      (i) => i.variantId === line.variantId && i.warehouseId === consignment.warehouseId,
    )?.sellable ?? 0;

    const grn = await call(`/inbound/${consignment.id}/receive`, {
      method: 'POST',
      token: admin.accessToken,
      body: {
        lines: [
          { id: line.id, sellable, damaged: 2, missing: 4, note: 'Carton 3 crushed' },
          ...lines.slice(1).map((l) => ({ id: l.id, sellable: l.declaredQty, damaged: 0, missing: 0 })),
        ],
      },
    });
    expect(grn.status).toBe(200);
    expect(grn.json.data.status).toBe('RECEIVED');
    expect(grn.json.meta.discrepancy).toBe(true);
    expect(grn.json.meta.note).toMatch(/discrepancy report/i);

    // 3. The good units are now sellable; the damaged ones are not.
    const after = db.inventory.find(
      (i) => i.variantId === line.variantId && i.warehouseId === consignment.warehouseId,
    );
    expect(after.sellable).toBe(stockBefore + sellable);
    expect(after.unsellable).toBeGreaterThanOrEqual(2);

    // 4. The movement is on the ledger, so the count can be reconciled later.
    const entries = db.inventoryLedger.filter(
      (l) => l.inventoryId === after.id && l.type === 'GRN',
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.at(-1).reference).toBe(consignment.id);

    // 5. Stock on hand makes the seller's offer buyable again.
    const offer = db.offers.find(
      (o) => o.variantId === line.variantId && o.sellerId === consignment.sellerId,
    );
    if (offer) expect(offer.status).not.toBe('OUT_OF_STOCK');

    // 6. And the whole thing is on the audit trail.
    const audit = await call('/audit-events?pageSize=200', { token: admin.accessToken });
    expect(audit.json.data.map((e) => e.action)).toContain('warehouse.inbound.receive');
  });
});
