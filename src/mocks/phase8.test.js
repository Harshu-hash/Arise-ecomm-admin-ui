import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, findById } from './db/store';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { DEMO_PASSWORD } from './seed/adminUsers';
import { resetSettings, updateSettings } from './engine/settings';

/**
 * Phase 8 — insight & hardening.
 *
 * The dashboard's final widgets, Reports & Analytics (M15), and Platform
 * Settings / App Config / Integrations (M17.5–M17.7). The one real risk this
 * phase adds is the same class of bug Phase 7 found for ads_manager: a
 * maker-checker action whose approver permission only one account holds,
 * which would make the request impossible to ever decide. Settings edits,
 * maintenance-mode toggles and integration credential changes are all guarded
 * that way, so a second Super Admin account exists specifically to approve them.
 */

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

async function decide(approvalId, email, approve = true, reason = 'Checked and agreed.') {
  const s = await signIn(email);
  const r = await call(`/approvals/${approvalId}/decide`, { method: 'POST', token: s.accessToken, body: { approve, reason } });
  expect(r.status, `decide ${approvalId}: ${JSON.stringify(r.json)}`).toBe(200);
  return r.json.data;
}

describe('platform settings', () => {
  it('a non-sensitive section saves directly', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/admin/settings/general', {
      method: 'PATCH', token: s.accessToken,
      body: { values: { supportEmail: 'help@arise.test' } },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.values.supportEmail).toBe('help@arise.test');
  });

  it('a sensitive section requires a reason and then a second approver', async () => {
    const s = await signIn('super@arise.test');
    const noReason = await call('/admin/settings/security', {
      method: 'PATCH', token: s.accessToken, body: { values: { sessionIdleTimeoutMins: 15 } },
    });
    expect(noReason.status).toBe(422);

    const r = await call('/admin/settings/security', {
      method: 'PATCH', token: s.accessToken,
      body: { values: { sessionIdleTimeoutMins: 15 }, reason: 'Tightening idle timeout after a security review.' },
    });
    expect(r.status).toBe(202);

    // The only other holder of admin.settings.edit is the second Super Admin
    // account — without it this request could never be decided by anyone.
    const approved = await decide(r.json.error.details.approvalId, 'super2@arise.test');
    expect(approved.status).toBe('APPROVED');
    const section = await call('/admin/settings', { token: s.accessToken });
    expect(section.json.data.find((x) => x.id === 'security').values.sessionIdleTimeoutMins).toBe(15);
  });
});

describe('app config', () => {
  it('platform versions save directly', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/admin/app-config', {
      method: 'PATCH', token: s.accessToken,
      body: { platforms: { ANDROID: { ...findById('settings', 'appConfig').platforms.ANDROID, latestVersion: '2.7.0' } } },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.platforms.ANDROID.latestVersion).toBe('2.7.0');
  });

  it('toggling maintenance mode needs a reason and a second approver', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/admin/app-config/maintenance/ANDROID', {
      method: 'POST', token: s.accessToken,
      body: { enabled: true, message: 'Upgrading payment infra', reason: 'Scheduled infra maintenance.' },
    });
    expect(r.status).toBe(202);
    await decide(r.json.error.details.approvalId, 'super2@arise.test');
    const config = await call('/admin/app-config', { token: s.accessToken });
    expect(config.json.data.maintenance.ANDROID.enabled).toBe(true);
  });

  it('a self-approval attempt on maintenance mode is refused', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/admin/app-config/maintenance/IOS', {
      method: 'POST', token: s.accessToken, body: { enabled: true, reason: 'Testing.' },
    });
    const bad = await call(`/approvals/${r.json.error.details.approvalId}/decide`, {
      method: 'POST', token: s.accessToken, body: { approve: true, reason: 'Approving my own request.' },
    });
    // The permission gate catches this before decideApproval's own check runs.
    expect(bad.status).toBe(403);
  });
});

describe('feature flags', () => {
  it('creating, editing and previewing a flag resolves the same way the app would', async () => {
    const s = await signIn('super@arise.test');
    const create = await call('/admin/feature-flags', {
      method: 'POST', token: s.accessToken,
      body: { key: 'wishlist_v3', label: 'Wishlist v3', enabled: true, rolloutPct: 100, platform: 'ALL' },
    });
    expect(create.status).toBe(200);

    const preview = await call(`/admin/feature-flags/${create.json.data.id}/preview`, {
      method: 'POST', token: s.accessToken, body: { context: { platform: 'ANDROID', deviceId: 'dev-1' } },
    });
    expect(preview.json.data.enabled).toBe(true);

    const off = await call(`/admin/feature-flags/${create.json.data.id}`, {
      method: 'PATCH', token: s.accessToken, body: { enabled: false },
    });
    expect(off.status).toBe(200);
    const previewAfter = await call(`/admin/feature-flags/${create.json.data.id}/preview`, {
      method: 'POST', token: s.accessToken, body: { context: { platform: 'ANDROID', deviceId: 'dev-1' } },
    });
    expect(previewAfter.json.data.enabled).toBe(false);
  });

  it('refuses a duplicate key', async () => {
    const s = await signIn('super@arise.test');
    const existing = db.featureFlags[0];
    const r = await call('/admin/feature-flags', { method: 'POST', token: s.accessToken, body: { key: existing.key } });
    expect(r.status).toBe(422);
  });
});

describe('integrations', () => {
  it('changing credentials needs a reason and a second approver, and never echoes the credential values', async () => {
    const s = await signIn('super@arise.test');
    const integration = db.integrations.find((i) => i.key === 'whatsapp');
    const noReason = await call(`/admin/integrations/${integration.key}/credentials`, {
      method: 'POST', token: s.accessToken, body: { credentials: { apiKey: 'secret-123' } },
    });
    expect(noReason.status).toBe(422);

    const r = await call(`/admin/integrations/${integration.key}/credentials`, {
      method: 'POST', token: s.accessToken,
      body: { credentials: { apiKey: 'secret-123' }, reason: 'Connecting WhatsApp for order updates.' },
    });
    expect(r.status).toBe(202);
    expect(JSON.stringify(r.json)).not.toContain('secret-123');

    await decide(r.json.error.details.approvalId, 'super2@arise.test');
    const after = await call('/admin/integrations', { token: s.accessToken });
    expect(after.json.data.find((i) => i.key === 'whatsapp').status).toBe('CONNECTED');
  });

  it('lists an integration\'s webhook log', async () => {
    const s = await signIn('super@arise.test');
    const integration = db.integrations.find((i) => i.status === 'CONNECTED');
    const r = await call(`/admin/integrations/${integration.key}/webhooks`, { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(0);
  });
});

describe('reports & analytics', () => {
  it('builds every analytics domain without error', async () => {
    const s = await signIn('ops@arise.test');
    for (const domain of ['sales', 'customers', 'catalog', 'sellers', 'fulfilment', 'returns', 'finance', 'marketing', 'support']) {
      const r = await call(`/reports/analytics/${domain}?days=30`, { token: s.accessToken });
      expect(r.status, domain).toBe(200);
      expect(r.json.data.totals).toBeTruthy();
    }
  });

  it('lists the report library and running one creates an export job', async () => {
    const s = await signIn('ops@arise.test');
    const library = await call('/reports/library', { token: s.accessToken });
    expect(library.json.data.length).toBeGreaterThan(0);

    const def = library.json.data[0];
    const run = await call(`/reports/library/${def.key}/run`, { method: 'POST', token: s.accessToken, body: {} });
    expect(run.status).toBe(200);
    expect(run.json.data.type).toBe('EXPORT');

    const job = await call(`/jobs/${run.json.data.id}`, { token: s.accessToken });
    expect(job.status).toBe(200);
  });

  it('scheduled reports can be created, edited and deleted', async () => {
    const s = await signIn('ops@arise.test');
    const def = db.reportDefinitions[0];
    const finance = db.adminUsers.find((u) => u.email.startsWith('finance@'));

    const created = await call('/reports/scheduled', {
      method: 'POST', token: s.accessToken,
      body: { reportKey: def.key, frequency: 'WEEKLY', format: 'CSV', recipientIds: [finance.id] },
    });
    expect(created.status).toBe(201);

    const edited = await call(`/reports/scheduled/${created.json.data.id}`, {
      method: 'PATCH', token: s.accessToken, body: { enabled: false },
    });
    expect(edited.json.data.enabled).toBe(false);

    const removed = await call(`/reports/scheduled/${created.json.data.id}`, { method: 'DELETE', token: s.accessToken });
    expect(removed.status).toBe(200);
  });
});

describe('dashboard final widgets', () => {
  it('the summary includes real top categories, sellers and products', async () => {
    const s = await signIn('super@arise.test');
    const r = await call('/dashboard/summary?days=90', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.data.topSellers)).toBe(true);
    expect(Array.isArray(r.json.data.topProducts)).toBe(true);
    expect(Array.isArray(r.json.data.topCategories)).toBe(true);
  });

  it('marking an alert read is reflected in the unread count', async () => {
    const s = await signIn('super@arise.test');
    const before = await call('/dashboard/alerts', { token: s.accessToken });
    const unreadBefore = before.json.meta.unread;
    const target = before.json.data.find((a) => !a.read);
    await call(`/dashboard/alerts/${target.id}/read`, { method: 'POST', token: s.accessToken });
    const after = await call('/dashboard/alerts', { token: s.accessToken });
    expect(after.json.meta.unread).toBe(unreadBefore - 1);
  });
});

describe('Journey 8 — RBAC: scoping and approval limits hold', () => {
  it('a Category Manager cannot see listings outside assigned categories, and a Finance Executive refund above their limit creates an approval request', async () => {
    const categoryManager = db.adminUsers.find((u) => u.email.startsWith('category@'));
    const scopedIds = categoryManager.scope.categories;
    const s1 = await signIn(categoryManager.email);

    const list = await call('/products?pageSize=200', { token: s1.accessToken });
    expect(list.status).toBe(200);
    for (const row of list.json.data) {
      let node = findById('categories', row.categoryId);
      let inScope = false;
      while (node) {
        if (scopedIds.includes(node.id)) { inScope = true; break; }
        node = node.parentId ? findById('categories', node.parentId) : null;
      }
      expect(inScope, `product ${row.id} outside scope`).toBe(true);
    }

    // Finance Executive's own seeded refund limit is 25,000 rupees.
    const financeExec = db.adminUsers.find((u) => u.email.startsWith('finance@'));
    expect(financeExec.scope.refundLimit).toBe(2500000);
    const s2 = await signIn(financeExec.email);
    const order = db.orders.find((o) => o.status === 'DELIVERED');
    const refund = await call('/refunds', {
      method: 'POST', token: s2.accessToken,
      // The amount, not the order's own total, is what the limit is checked
      // against — this is above the Finance Executive's ₹25,000 limit.
      body: { orderId: order.id, amountPaise: 3_000_000, type: 'MANUAL', reason: 'Goodwill — above my limit.' },
    });
    expect(refund.status).toBe(202);
  });
});

describe('buy-box & badge rules (M3.9, delivered in Phase 8 alongside the rest of its catch-up work)', () => {
  it('rejects weights that do not add up to 100', async () => {
    const s = await signIn('catalog@arise.test');
    const r = await call('/catalog/buybox-rules', {
      method: 'PATCH', token: s.accessToken,
      body: { weights: { landedPricePct: 50, deliverySpeedPct: 20, sellerRatingPct: 20, fulfillmentTypePct: 10, cancellationRatePct: 10 }, reason: 'Testing.' },
    });
    expect(r.status).toBe(422);
  });

  it('publishing needs a reason and a second approver, and then every listing re-ranks', async () => {
    const s = await signIn('catalog@arise.test');
    const before = await call('/catalog/buybox-rules', { token: s.accessToken });
    const priceOnly = { landedPricePct: 100, deliverySpeedPct: 0, sellerRatingPct: 0, fulfillmentTypePct: 0, cancellationRatePct: 0 };

    const noReason = await call('/catalog/buybox-rules', { method: 'PATCH', token: s.accessToken, body: { weights: priceOnly } });
    expect(noReason.status).toBe(422);

    const r = await call('/catalog/buybox-rules', {
      method: 'PATCH', token: s.accessToken, body: { weights: priceOnly, reason: 'Ranking on price alone this quarter.' },
    });
    expect(r.status).toBe(202);
    await decide(r.json.error.details.approvalId, 'super@arise.test');

    const after = await call('/catalog/buybox-rules', { token: s.accessToken });
    expect(after.json.data.weights).toEqual(priceOnly);
    expect(after.json.data.weights).not.toEqual(before.json.data.weights);

    // Under price-only weights, every variant's cheapest in-stock live offer must now be the winner.
    const variant = db.variants.find((v) => db.offers.some((o) => o.variantId === v.id && o.buyBoxWinner));
    const winner = db.offers.find((o) => o.variantId === variant.id && o.buyBoxWinner);
    const cheapestEligible = db.offers
      .filter((o) => o.variantId === variant.id && o.stock > 0 && o.status === 'LIVE')
      .sort((a, b) => a.sellingPricePaise - b.sellingPricePaise)[0];
    expect(winner.id).toBe(cheapestEligible.id);
  });

  it('simulating on a product never mutates the published winner', async () => {
    const s = await signIn('catalog@arise.test');
    const product = db.products.find((p) => db.offers.some((o) => o.productId === p.id && o.buyBoxWinner));
    const winnerBefore = db.offers.find((o) => o.productId === product.id && o.buyBoxWinner)?.id;

    const r = await call('/catalog/buybox-rules/simulate', {
      method: 'POST', token: s.accessToken,
      body: { productId: product.id, weights: { landedPricePct: 0, deliverySpeedPct: 0, sellerRatingPct: 100, fulfillmentTypePct: 0, cancellationRatePct: 0 } },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.variants.length).toBeGreaterThan(0);

    const winnerAfter = db.offers.find((o) => o.productId === product.id && o.buyBoxWinner)?.id;
    expect(winnerAfter).toBe(winnerBefore);
  });
});

describe('bulk uploads (M3.10, delivered in Phase 8 alongside the rest of its catch-up work)', () => {
  it('a price & stock update applies directly, recomputes the buy box, and auto-flips OUT_OF_STOCK back to LIVE', async () => {
    const s = await signIn('catalog@arise.test');
    const offer = db.offers.find((o) => o.status === 'OUT_OF_STOCK');
    const variant = findById('variants', offer.variantId);

    const r = await call('/catalog/imports', {
      method: 'POST', token: s.accessToken,
      body: {
        jobType: 'PRICE_STOCK_UPDATE', importValidOnly: true,
        rows: [{ sku: variant.sku, sellerId: offer.sellerId, sellingPriceRupees: 199, stock: 10 }],
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('COMPLETED');
    expect(r.json.data.failRows).toBe(0);

    const updated = findById('offers', offer.id);
    expect(updated.sellingPricePaise).toBe(19900);
    expect(updated.stock).toBe(10);
    expect(updated.status).toBe('LIVE');
  });

  it('a row for an unknown SKU/seller pair fails that row without failing the whole job, and can be retried', async () => {
    const s = await signIn('catalog@arise.test');
    const offer = db.offers.find((o) => o.stock > 0 && o.status === 'LIVE');
    const variant = findById('variants', offer.variantId);

    const r = await call('/catalog/imports', {
      method: 'POST', token: s.accessToken,
      body: {
        jobType: 'PRICE_STOCK_UPDATE', importValidOnly: false,
        rows: [
          { sku: variant.sku, sellerId: offer.sellerId, sellingPriceRupees: 299, stock: 5 },
          { sku: 'NO-SUCH-SKU', sellerId: 'SEL-9999', sellingPriceRupees: 100, stock: 1 },
        ],
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('COMPLETED_WITH_ERRORS');
    expect(r.json.data.failRows).toBe(1);

    const retryNothing = await call(`/catalog/imports/${r.json.data.id}/retry`, { method: 'POST', token: s.accessToken });
    // The one failed row still fails the same way — nothing changed about the SKU.
    expect(retryNothing.status).toBe(200);
    expect(retryNothing.json.data.failRows).toBe(1);
  });

  it('offer deactivation sets the offer inactive and refuses to deactivate twice', async () => {
    const s = await signIn('catalog@arise.test');
    const offer = db.offers.find((o) => o.status === 'LIVE');
    const variant = findById('variants', offer.variantId);

    const first = await call('/catalog/imports', {
      method: 'POST', token: s.accessToken,
      body: { jobType: 'OFFER_DEACTIVATION', importValidOnly: true, rows: [{ sku: variant.sku, sellerId: offer.sellerId }] },
    });
    expect(first.json.data.failRows).toBe(0);
    expect(findById('offers', offer.id).status).toBe('INACTIVE');

    const second = await call('/catalog/imports', {
      method: 'POST', token: s.accessToken,
      body: { jobType: 'OFFER_DEACTIVATION', importValidOnly: true, rows: [{ sku: variant.sku, sellerId: offer.sellerId }] },
    });
    expect(second.json.data.failRows).toBe(1);
  });
});
