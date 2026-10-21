import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, filter } from './db/store';
import { deriveOrderStatus } from './engine/orderState';
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

/** An order whose items are all still cancellable. */
function cancellableOrder() {
  return db.orders.find((o) => {
    const items = filter('orderItems', (i) => i.orderId === o.id);
    return items.length > 0 && items.every((i) => ['PLACED', 'ACCEPTED', 'PACKED'].includes(i.status))
      && o.paymentStatus === 'CAPTURED';
  });
}

describe('deriveOrderStatus', () => {
  it('reports cancelled only when every item is cancelled', () => {
    expect(deriveOrderStatus([{ status: 'CANCELLED' }, { status: 'CANCELLED' }])).toBe('CANCELLED');
    expect(deriveOrderStatus([{ status: 'CANCELLED' }, { status: 'DELIVERED' }])).toBe('DELIVERED');
  });

  it('reports the least-progressed open item, which is what is holding it up', () => {
    expect(deriveOrderStatus([{ status: 'DELIVERED' }, { status: 'PLACED' }])).toBe('PLACED');
    expect(deriveOrderStatus([{ status: 'SHIPPED' }, { status: 'IN_TRANSIT' }])).toBe('SHIPPED');
  });

  it('ignores cancelled items when others are still moving', () => {
    expect(deriveOrderStatus([{ status: 'CANCELLED' }, { status: 'SHIPPED' }])).toBe('SHIPPED');
  });
});

describe('orders list', () => {
  it('returns rows with SLA and seller context', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/orders?pageSize=25', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.meta.total).toBeGreaterThan(1000);
    expect(r.json.data[0]).toHaveProperty('slaBreached');
    expect(r.json.data[0]).toHaveProperty('sellerNames');
  });

  it('filters by payment method and status facets add up', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/orders?paymentMethod=COD&pageSize=1', { token: s.accessToken });
    const all = await call('/orders?pageSize=1', { token: s.accessToken });
    expect(r.json.meta.total).toBeGreaterThan(0);
    expect(r.json.meta.total).toBeLessThan(all.json.meta.total);

    const sum = Object.values(all.json.meta.facets.status).reduce((a, b) => a + b, 0);
    expect(sum).toBe(all.json.meta.total);
  });

  it('filters to orders breaching their SLA', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/orders?slaBreached=true&pageSize=100', { token: s.accessToken });
    expect(r.json.data.every((o) => o.slaBreached)).toBe(true);
  });
});

describe('order detail and cancellation', () => {
  it('groups items into one shipment per seller', async () => {
    const s = await signIn('super@arise.test');
    const multi = db.orders.find((o) => o.sellerCount > 1);
    if (!multi) return;
    const r = await call(`/orders/${multi.id}`, { token: s.accessToken });
    expect(r.json.meta.shipments.length).toBe(multi.sellerCount);
    const total = r.json.meta.shipments.reduce((n, sh) => n + sh.items.length, 0);
    expect(total).toBe(r.json.meta.items.length);
  });

  it('cancels items, refunds the right amount and re-derives the order status', async () => {
    const s = await signIn('super@arise.test');
    const order = cancellableOrder();
    expect(order).toBeTruthy();
    const items = filter('orderItems', (i) => i.orderId === order.id);

    const r = await call(`/orders/${order.id}/cancel-items`, {
      method: 'POST',
      token: s.accessToken,
      body: { itemIds: items.map((i) => i.id), reason: 'Ordered by mistake', actor: 'CUSTOMER' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('CANCELLED');

    // Everything the customer paid comes back, fees included, because the
    // whole order went.
    expect(r.json.meta.refundedPaise).toBe(order.grandTotalPaise);
    const refund = db.refunds.find((x) => x.orderId === order.id && x.type === 'CANCELLATION');
    expect(refund.amountPaise).toBe(order.grandTotalPaise);
  });

  it('pro-rates the discount when only part of an order is cancelled', async () => {
    const s = await signIn('super@arise.test');
    const order = db.orders.find((o) => {
      const items = filter('orderItems', (i) => i.orderId === o.id);
      return items.length > 1
        && items.every((i) => ['PLACED', 'ACCEPTED', 'PACKED'].includes(i.status))
        && o.priceDetails.discountPaise > 0;
    });
    if (!order) return;

    const items = filter('orderItems', (i) => i.orderId === order.id);
    const one = items[0];
    const r = await call(`/orders/${order.id}/cancel-items`, {
      method: 'POST',
      token: s.accessToken,
      body: { itemIds: [one.id], reason: 'Item no longer needed' },
    });
    expect(r.status).toBe(200);
    // Less than list price, because the coupon it carried is clawed back too.
    expect(r.json.meta.refundedPaise).toBeLessThan(one.linePaise);
    expect(r.json.data.status).not.toBe('CANCELLED');
  });

  it('refuses to cancel an item already shipped', async () => {
    const s = await signIn('super@arise.test');
    const item = filter('orderItems', (i) => ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(i.status))[0];
    const r = await call(`/orders/${item.orderId}/cancel-items`, {
      method: 'POST',
      token: s.accessToken,
      body: { itemIds: [item.id], reason: 'Ordered by mistake' },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('requires a reason to cancel', async () => {
    const s = await signIn('super@arise.test');
    const order = cancellableOrder();
    const items = filter('orderItems', (i) => i.orderId === order.id);
    const r = await call(`/orders/${order.id}/cancel-items`, {
      method: 'POST', token: s.accessToken, body: { itemIds: [items[0].id] },
    });
    expect(r.status).toBe(422);
  });

  it('turns a refund above the agent limit into an approval but still cancels', async () => {
    // The support agent's scope caps refunds at ₹5,000.
    const agent = await signIn('agent@arise.test');
    const order = db.orders.find((o) => {
      const items = filter('orderItems', (i) => i.orderId === o.id);
      return items.length > 0
        && items.every((i) => ['PLACED', 'ACCEPTED', 'PACKED'].includes(i.status))
        && o.paymentStatus === 'CAPTURED'
        && o.grandTotalPaise > 500000;
    });
    if (!order) return;

    const items = filter('orderItems', (i) => i.orderId === order.id);
    const r = await call(`/orders/${order.id}/cancel-items`, {
      method: 'POST',
      token: agent.accessToken,
      body: { itemIds: items.map((i) => i.id), reason: 'Ordered by mistake' },
    });
    expect(r.status).toBe(202);
    expect(r.json.error.code).toBe('APPROVAL_REQUIRED');
    // The customer is not made to wait on an internal threshold.
    expect(db.orders.find((o) => o.id === order.id).status).toBe('CANCELLED');
  });
});

describe('holds and address changes', () => {
  it('holds and releases an order, moving its items with it', async () => {
    const s = await signIn('super@arise.test');
    const order = cancellableOrder();

    const held = await call(`/orders/${order.id}/hold`, {
      method: 'POST', token: s.accessToken, body: { reason: 'Payment verification' },
    });
    expect(held.status).toBe(200);
    expect(held.json.data.onHold).toBe(true);

    const released = await call(`/orders/${order.id}/release`, { method: 'POST', token: s.accessToken });
    expect(released.status).toBe(200);
    expect(released.json.data.onHold).toBe(false);
  });

  it('refuses an address change once the parcel has shipped', async () => {
    const s = await signIn('super@arise.test');
    const item = filter('orderItems', (i) => ['SHIPPED', 'IN_TRANSIT'].includes(i.status))[0];
    const r = await call(`/orders/${item.orderId}/address`, {
      method: 'POST',
      token: s.accessToken,
      body: { name: 'A', line: 'B', cityLine: 'C', phone: '9876543210', pincode: '400001' },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ALREADY_SHIPPED');
  });

  it('validates the new pincode', async () => {
    const s = await signIn('super@arise.test');
    const order = cancellableOrder();
    const r = await call(`/orders/${order.id}/address`, {
      method: 'POST',
      token: s.accessToken,
      body: { name: 'A', line: 'B', cityLine: 'C', phone: '9876543210', pincode: '12' },
    });
    expect(r.status).toBe(422);
    expect(r.json.error.fieldErrors.pincode).toBeTruthy();
  });
});

describe('returns', () => {
  it('lists returns with fault attribution derived from the reason', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/returns?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    const damaged = r.json.data.find((x) => x.reason === 'Item is damaged or defective');
    if (damaged) expect(damaged.faultAttribution).toBe('SELLER');
    const remorse = r.json.data.find((x) => x.reason === 'Changed my mind');
    if (remorse) expect(remorse.faultAttribution).toBe('CUSTOMER');
  });

  it('walks a return through to QC and releases the refund on a pass', async () => {
    const s = await signIn('super@arise.test');
    const row = db.returns.find((x) => x.status === 'RECEIVED' && x.type === 'REFUND');
    expect(row).toBeTruthy();

    const qc = await call(`/returns/${row.id}/qc`, {
      method: 'POST', token: s.accessToken, body: { result: 'PASS' },
    });
    expect(qc.status).toBe(200);
    expect(qc.json.data.status).toBe('CLOSED');

    // Passing QC is what creates the customer's money back.
    const refund = db.refunds.find((x) => x.id === qc.json.data.refundId);
    expect(refund).toBeTruthy();
    expect(refund.amountPaise).toBe(row.amountPaise);
  });

  it('requires notes on a QC failure, since the seller may claim against it', async () => {
    const s = await signIn('super@arise.test');
    const row = db.returns.find((x) => x.status === 'RECEIVED');
    const r = await call(`/returns/${row.id}/qc`, {
      method: 'POST', token: s.accessToken, body: { result: 'FAIL' },
    });
    expect(r.status).toBe(422);
  });

  it('refuses an out-of-order transition', async () => {
    const s = await signIn('super@arise.test');
    const row = db.returns.find((x) => x.status === 'RETURN_REQUESTED');
    const r = await call(`/returns/${row.id}/mark-received`, { method: 'POST', token: s.accessToken });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('will not start a second return on the same item', async () => {
    const s = await signIn('super@arise.test');
    const existing = db.returns.find((x) => !['RETURN_REJECTED', 'RETURN_CANCELLED'].includes(x.status));
    const r = await call(`/orders/${existing.orderId}/items/${existing.orderItemId}/return`, {
      method: 'POST', token: s.accessToken, body: { reason: 'Changed my mind' },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('RETURN_NOT_ELIGIBLE');
  });

  it('will not start a return on an item that is not delivered', async () => {
    const s = await signIn('super@arise.test');
    const item = filter('orderItems', (i) => i.status === 'SHIPPED')[0];
    const r = await call(`/orders/${item.orderId}/items/${item.id}/return`, {
      method: 'POST', token: s.accessToken, body: { reason: 'Changed my mind' },
    });
    expect(r.status).toBe(409);
  });
});

describe('cancellations and exceptions', () => {
  it('reports cancellations by actor and stage', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/orders/cancellations?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.meta.byActor).toBeTruthy();
    expect(['PRE_SHIP', 'POST_SHIP']).toContain(r.json.data[0].stage);
  });

  it('resolves an exception with a resolution code', async () => {
    const s = await signIn('super@arise.test');
    const row = db.orderExceptions.find((e) => e.status !== 'RESOLVED');

    const noCode = await call(`/orders/exceptions/${row.id}/resolve`, {
      method: 'POST', token: s.accessToken, body: {},
    });
    expect(noCode.status).toBe(422);

    const ok = await call(`/orders/exceptions/${row.id}/resolve`, {
      method: 'POST', token: s.accessToken, body: { resolutionCode: 'MANUAL_CORRECTION' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.data.status).toBe('RESOLVED');
  });
});

describe('customers', () => {
  it('returns a 360 with linked accounts and lifetime stats', async () => {
    const s = await signIn('super@arise.test');
    const customer = db.customers.find((c) => c.ordersCount > 0);
    const r = await call(`/customers/${customer.id}`, { token: s.accessToken });

    expect(r.status).toBe(200);
    expect(r.json.meta.stats.orders).toBe(customer.ordersCount);
    expect(r.json.meta.recentOrders.length).toBeGreaterThan(0);
    expect(Array.isArray(r.json.meta.linkedAccounts)).toBe(true);
  });

  it('blocks a customer only with a reason', async () => {
    const s = await signIn('super@arise.test');
    const customer = db.customers.find((c) => c.status === 'ACTIVE');

    const noReason = await call(`/customers/${customer.id}/block`, {
      method: 'POST', token: s.accessToken, body: {},
    });
    expect(noReason.status).toBe(422);

    const ok = await call(`/customers/${customer.id}/block`, {
      method: 'POST', token: s.accessToken, body: { reason: 'Refund abuse' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.data.status).toBe('BLOCKED');
  });

  it('blocks the account when a risk flag is confirmed as fraud', async () => {
    const s = await signIn('super@arise.test');
    const flag = db.riskFlags.find((f) => f.status === 'OPEN');
    const r = await call(`/risk-flags/${flag.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'CONFIRMED_FRAUD', reason: 'Ring of 6 accounts' },
    });
    expect(r.status).toBe(200);
    expect(db.customers.find((c) => c.id === flag.entityId).status).toBe('BLOCKED');
  });

  it('refuses a duplicate blocklist entry', async () => {
    const s = await signIn('super@arise.test');
    const existing = db.blocklistEntries[0];
    const r = await call('/blocklist', {
      method: 'POST',
      token: s.accessToken,
      body: { kind: existing.kind, value: existing.value, reason: 'duplicate' },
    });
    expect(r.status).toBe(422);
  });
});

describe('privacy requests', () => {
  it('lists requests with their statutory due date', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/customers/privacy-requests?pageSize=50', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data[0]).toHaveProperty('dueAt');
    expect(r.json.data[0]).toHaveProperty('overdue');
  });

  it('surfaces blockers before an account can be deleted', async () => {
    const s = await signIn('super@arise.test');
    const row = db.privacyRequests.find((p) => p.type === 'ACCOUNT_DELETION' && p.status === 'RECEIVED')
      ?? db.privacyRequests.find((p) => p.type === 'ACCOUNT_DELETION');
    const r = await call(`/privacy-requests/${row.id}`, { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.meta.blockers)).toBe(true);
  });

  it('anonymises the customer but keeps the orders for tax law', async () => {
    const s = await signIn('super@arise.test');
    const row = db.privacyRequests.find((p) => p.type === 'ACCOUNT_DELETION');
    const before = filter('orders', (o) => o.customerId === row.customerId).length;

    const r = await call(`/privacy-requests/${row.id}/process`, {
      method: 'POST', token: s.accessToken, body: { force: true },
    });
    expect(r.status).toBe(200);

    const customer = db.customers.find((c) => c.id === row.customerId);
    expect(customer.status).toBe('DELETED');
    expect(customer.name).toBe('Deleted customer');
    // Order records survive; only the identifying fields are stripped.
    const after = filter('orders', (o) => o.customerId === row.customerId);
    expect(after).toHaveLength(before);
    expect(after.every((o) => o.customerName === 'Deleted customer')).toBe(true);
  });
});

describe('Journey 2 (part one) — cancel, return, refund', () => {
  it('runs the admin-side order lifecycle end to end', async () => {
    const admin = await signIn('super@arise.test');

    // 1. A delivered item inside its return window.
    const item = filter(
      'orderItems',
      (i) => i.status === 'DELIVERED' && i.returnWindowEndsAt
        && new Date(i.returnWindowEndsAt).getTime() > Date.now()
        && !db.returns.some((r) => r.orderItemId === i.id),
    )[0];
    expect(item).toBeTruthy();
    const order = db.orders.find((o) => o.id === item.orderId);

    // 2. Raise a return on the customer's behalf.
    const created = await call(`/orders/${order.id}/items/${item.id}/return`, {
      method: 'POST',
      token: admin.accessToken,
      body: { reason: 'Item is damaged or defective', comments: 'Screen cracked on arrival' },
    });
    expect(created.status).toBe(201);
    const returnId = created.json.data.id;
    // Seller fault, so the seller will carry the reverse shipping fee.
    expect(created.json.data.faultAttribution).toBe('SELLER');

    // 3. Approve, schedule, collect, receive.
    for (const action of ['approve', 'schedule-pickup', 'mark-received']) {
      if (action === 'schedule-pickup') {
        const picked = await call(`/returns/${returnId}/schedule-pickup`, {
          method: 'POST', token: admin.accessToken, body: { pickupDate: '2026-10-20' },
        });
        expect(picked.status).toBe(200);
        const up = await call(`/returns/${returnId}/mark-received`, { method: 'POST', token: admin.accessToken });
        // Cannot skip from scheduled straight to received.
        expect(up.status).toBe(409);
        db.returns.find((r) => r.id === returnId).status = 'IN_TRANSIT_TO_ORIGIN';
        continue;
      }
      const res = await call(`/returns/${returnId}/${action}`, {
        method: 'POST', token: admin.accessToken, body: {},
      });
      expect(res.status, action).toBe(200);
    }

    // 4. QC passes, which releases the refund.
    const qc = await call(`/returns/${returnId}/qc`, {
      method: 'POST', token: admin.accessToken, body: { result: 'PASS' },
    });
    expect(qc.status).toBe(200);
    expect(qc.json.data.status).toBe('CLOSED');

    const refund = db.refunds.find((r) => r.id === qc.json.data.refundId);
    expect(refund.amountPaise).toBe(item.linePaise);
    // A card order refunds to source immediately; a COD order has no card to
    // return to, so it waits on bank details instead of being skipped.
    expect(refund.status).toBe(order.paymentMethod === 'COD' ? 'PENDING_DETAILS' : 'INITIATED');
    expect(refund.mode).toBe(order.paymentMethod === 'COD' ? 'BANK' : 'ORIGINAL');

    // 5. The whole path is on the order timeline and the audit log.
    const detail = await call(`/orders/${order.id}`, { token: admin.accessToken });
    expect(detail.json.meta.returns.some((r) => r.id === returnId)).toBe(true);
    expect(detail.json.meta.refunds.some((r) => r.id === refund.id)).toBe(true);

    const audit = await call('/audit-events?pageSize=200', { token: admin.accessToken });
    const actions = audit.json.data.map((e) => e.action);
    expect(actions).toContain('orders.item.return_initiate');
    expect(actions).toContain('orders.return.qc');
  });
});
