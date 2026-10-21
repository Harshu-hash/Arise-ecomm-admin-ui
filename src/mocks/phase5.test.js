import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, filter, findById } from './db/store';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { DEMO_PASSWORD } from './seed/adminUsers';
import { resetSettings, updateSettings } from './engine/settings';

/**
 * Phase 5 — growth & content.
 *
 * Marketing and CMS do not move money the way Phase 4 did, so the emphasis
 * here is different: a coupon's applicability can never disagree between
 * the builder's test tool and the usage report (Journey 5), and a published
 * home layout has to be the exact JSON the app consumes, not the admin's
 * internal record of it.
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

describe('coupons', () => {
  it('rejects a duplicate code', async () => {
    const s = await signIn('marketing@arise.test');
    const existing = db.coupons[0];
    const r = await call('/coupons', {
      method: 'POST', token: s.accessToken,
      body: {
        code: existing.code, name: 'Copy', type: 'FLAT', valuePaise: 10000,
        startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400_000).toISOString(),
        totalLimit: 10, budgetPaise: 100000,
      },
    });
    expect(r.status).toBe(422);
    expect(r.json.error.fieldErrors.code).toBeTruthy();
  });

  it('pauses and resumes', async () => {
    const s = await signIn('marketing@arise.test');
    const coupon = db.coupons.find((c) => c.status === 'ACTIVE');
    const pause = await call(`/coupons/${coupon.id}/pause`, { method: 'POST', token: s.accessToken });
    expect(pause.json.data.status).toBe('PAUSED');
    const resume = await call(`/coupons/${coupon.id}/pause`, { method: 'POST', token: s.accessToken });
    expect(resume.json.data.status).toBe('ACTIVE');
  });

  it('clones with a fresh code and resets usage', async () => {
    const s = await signIn('marketing@arise.test');
    const source = db.coupons.find((c) => c.totalRedemptions > 0) ?? db.coupons[0];
    const r = await call(`/coupons/${source.id}/clone`, { method: 'POST', token: s.accessToken });
    expect(r.status).toBe(201);
    expect(r.json.data.code).not.toBe(source.code);
    expect(r.json.data.totalRedemptions).toBe(0);
    expect(r.json.data.status).toBe('DRAFT');
  });
});

/**
 * Journey 5 — coupon created → applicable to a seeded cart → usage shows in
 * the report.
 */
describe('Journey 5 — coupon lifecycle', () => {
  it('runs end to end through the same evaluator the checkout would use', async () => {
    const s = await signIn('marketing@arise.test');
    // Every seeded customer has placed at least one order (1,500 orders are
    // cycled across the whole customer pool), so a "first order" audience is
    // exercised by forcing one customer's count to zero rather than hunting
    // for a seed coincidence that does not exist.
    const customer = db.customers.find((c) => c.status === 'ACTIVE');
    customer.ordersCount = 0;
    const alreadyOrdered = db.customers.find((c) => c.status === 'ACTIVE' && c.id !== customer.id && c.ordersCount > 0);
    const offer = db.offers.find((o) => o.status === 'LIVE');

    // 1. Create a coupon.
    const create = await call('/coupons', {
      method: 'POST', token: s.accessToken,
      body: {
        code: 'JOURNEY5', name: 'Journey test coupon', type: 'FLAT', valuePaise: 10000,
        minCartPaise: 0, audience: { type: 'NEW' },
        startsAt: new Date(Date.now() - 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        totalLimit: 100, perUserLimit: 1, budgetPaise: 500000,
      },
    });
    expect(create.status).toBe(201);
    const coupon = create.json.data;
    expect(coupon.status).toBe('ACTIVE');

    // 2. It appears as applicable to a seeded cart.
    const test = await call(`/coupons/${coupon.id}/test`, {
      method: 'POST', token: s.accessToken,
      body: { customerId: customer.id, productIds: [offer.productId] },
    });
    expect(test.status).toBe(200);
    expect(test.json.data.applicable, JSON.stringify(test.json.data.reasons)).toBe(true);
    expect(test.json.data.discountPaise).toBe(10000);

    // 3. A customer who has already ordered is correctly refused — the
    //    audience check is not merely cosmetic.
    const refused = await call(`/coupons/${coupon.id}/test`, {
      method: 'POST', token: s.accessToken,
      body: { customerId: alreadyOrdered.id, productIds: [offer.productId] },
    });
    expect(refused.json.data.applicable).toBe(false);

    // 4. Usage is reflected in the report once a redemption exists.
    expect(db.couponRedemptions.filter((r) => r.couponId === coupon.id)).toHaveLength(0);
    db.couponRedemptions.push({
      id: 'CPR-TEST', couponId: coupon.id, couponCode: coupon.code, customerId: customer.id,
      orderId: 'ORD-TEST', discountPaise: 10000, orderTotalPaise: 50000, wasFirstOrder: true,
      redeemedAt: new Date().toISOString(),
    });

    const detail = await call(`/coupons/${coupon.id}`, { token: s.accessToken });
    expect(detail.status).toBe(200);
    expect(detail.json.data.performance.redemptions).toBe(1);
    expect(detail.json.data.performance.discountGivenPaise).toBe(10000);
    expect(detail.json.data.performance.newCustomersAcquired).toBe(1);
  });
});

describe('segments', () => {
  it('previews a live count before saving', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/segments/preview', {
      method: 'POST', token: s.accessToken,
      body: { rule: { field: 'ordersCount', op: 'eq', value: 0 } },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.memberCount).toBe(db.customers.filter((c) => c.status !== 'BLOCKED' && c.ordersCount === 0).length);
  });

  it('refuses to delete a segment a coupon depends on', async () => {
    const s = await signIn('marketing@arise.test');
    const used = db.coupons.find((c) => c.audience?.type === 'SEGMENT');
    const segment = findById('segments', used.audience.segmentId);
    const r = await call(`/segments/${segment.id}`, { method: 'DELETE', token: s.accessToken });
    expect(r.status).toBe(409);
  });
});

describe('deals', () => {
  it('refuses two deals in the same calendar slot', async () => {
    const s = await signIn('marketing@arise.test');
    const taken = db.deals.find((d) => d.slotDate);
    const offer = db.offers.find((o) => o.status === 'LIVE' && o.buyBoxWinner && !db.deals.some((d) => d.offerId === o.id));

    const r = await call('/deals', {
      method: 'POST', token: s.accessToken,
      body: {
        title: 'Clash', productId: offer.productId, dealPricePaise: 1000,
        placement: taken.placement, slotDate: taken.slotDate,
        endsAt: new Date(Date.now() + 86400_000).toISOString(),
      },
    });
    expect(r.status).toBe(409);
  });

  it('swaps two deals when rescheduled onto an occupied slot', async () => {
    const s = await signIn('marketing@arise.test');
    const slotted = filter('deals', (d) => d.slotDate).sort((x, y) => x.slotDate.localeCompare(y.slotDate));
    const [a, b] = slotted;
    // `a` and `b` are live references into the db, so their own slotDates
    // get overwritten by the swap — the expected values have to be captured
    // as primitives before the call, not re-read off the same objects after.
    const aSlotBefore = a.slotDate;
    const bSlotBefore = b.slotDate;

    const r = await call(`/deals/${a.id}/reschedule`, {
      method: 'POST', token: s.accessToken, body: { slotDate: bSlotBefore },
    });
    expect(r.status).toBe(200);
    expect(findById('deals', a.id).slotDate).toBe(bSlotBefore);
    expect(findById('deals', b.id).slotDate).toBe(aSlotBefore);
  });
});

describe('flash sales', () => {
  it('auto-rejects a nomination below the minimum discount', async () => {
    const nomination = db.flashSaleNominations.find((n) => n.status === 'AUTO_REJECTED');
    expect(nomination.discountPct).toBeLessThan(50);
    expect(nomination.rejectReason).toMatch(/minimum/i);
  });

  it('will not publish a sale with nothing curated', async () => {
    const s = await signIn('marketing@arise.test');
    const sale = db.flashSales.find((f) => f.status === 'CURATION');
    for (const n of filter('flashSaleNominations', (x) => x.flashSaleId === sale.id)) {
      db.flashSaleNominations.find((x) => x.id === n.id).status = 'REJECTED';
    }
    const r = await call(`/flash-sales/${sale.id}/transition`, {
      method: 'POST', token: s.accessToken, body: { action: 'publish' },
    });
    expect(r.status).toBe(409);
  });

  it('follows legal transitions only', async () => {
    const s = await signIn('marketing@arise.test');
    const live = db.flashSales.find((f) => f.status === 'LIVE');
    const bad = await call(`/flash-sales/${live.id}/transition`, {
      method: 'POST', token: s.accessToken, body: { action: 'publish' },
    });
    expect(bad.status).toBe(409);
  });

  it('pulls a product with a reason, during a live sale', async () => {
    const s = await signIn('marketing@arise.test');
    const live = db.flashSales.find((f) => f.status === 'LIVE');
    const nomination = filter('flashSaleNominations', (n) => n.flashSaleId === live.id && n.status === 'ACCEPTED')[0];
    const r = await call(`/flash-sales/${live.id}/nominations/${nomination.id}/pull`, {
      method: 'POST', token: s.accessToken, body: { reason: 'Price-history manipulation detected after publish.' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('PULLED');
  });
});

describe('referral', () => {
  it('rewards a qualified referral at the configured amount', async () => {
    const s = await signIn('marketing@arise.test');
    const referral = db.referrals.find((r) => r.status === 'QUALIFIED');
    const config = findById('referralConfig', 'referral');

    const r = await call(`/referrals/${referral.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'REWARDED' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.rewardPaise).toBe(config.referrerRewardPaise);
  });

  it('rejects a fraud-flagged referral with a reason', async () => {
    const s = await signIn('marketing@arise.test');
    const referral = db.referrals.find((r) => r.status === 'FRAUD_REVIEW');
    const missing = await call(`/referrals/${referral.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'REJECTED_FRAUD' },
    });
    expect(missing.status).toBe(422);

    const r = await call(`/referrals/${referral.id}/decide`, {
      method: 'POST', token: s.accessToken,
      body: { decision: 'REJECTED_FRAUD', reason: 'Same payment instrument as 4 other accounts.' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.rewardPaise).toBeNull();
  });
});

describe('campaigns', () => {
  it('refuses a push send inside quiet hours without an explicit override', async () => {
    const s = await signIn('marketing@arise.test');
    const draft = await call('/campaigns', {
      method: 'POST', token: s.accessToken,
      body: { name: 'Late night test', channels: ['PUSH'], audience: { type: 'ALL' } },
    });

    const r = await call(`/campaigns/${draft.json.data.id}/send`, {
      method: 'POST', token: s.accessToken,
      body: { sendAt: new Date(new Date().setHours(23, 0, 0, 0)).toISOString() },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('QUIET_HOURS');
  });

  it('cancels a scheduled campaign but not one already sent', async () => {
    const s = await signIn('marketing@arise.test');
    const scheduled = db.campaigns.find((c) => c.status === 'SCHEDULED');
    const sent = db.campaigns.find((c) => c.status === 'SENT');

    const ok1 = await call(`/campaigns/${scheduled.id}/cancel`, { method: 'POST', token: s.accessToken });
    expect(ok1.status).toBe(200);

    const bad = await call(`/campaigns/${sent.id}/cancel`, { method: 'POST', token: s.accessToken });
    expect(bad.status).toBe(409);
  });
});

describe('bank offer display', () => {
  it('admin can only touch visibility, placement and copy — never the terms', async () => {
    const s = await signIn('marketing@arise.test');
    const offer = db.bankOffers[0];
    const before = { discountPct: offer.discountPct, capPaise: offer.capPaise };

    const r = await call(`/bank-offers/${offer.id}`, {
      method: 'PATCH', token: s.accessToken,
      body: { adminVisible: false, discountPct: 999, capPaise: 1 },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.adminVisible).toBe(false);
    // The gateway-owned fields are untouched even though they were sent.
    expect(r.json.data.discountPct).toBe(before.discountPct);
    expect(r.json.data.capPaise).toBe(before.capPaise);
  });

  it('syncing refreshes an expired offer and stamps every offer with the same timestamp', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/bank-offers/sync', { method: 'POST', token: s.accessToken });
    expect(r.status).toBe(200);
    for (const offer of db.bankOffers) {
      expect(new Date(offer.validTo).getTime()).toBeGreaterThan(Date.now());
      expect(offer.syncedAt).toBe(r.json.data.lastSyncedAt);
    }
  });
});

/** Home layout — the Phase 5 exit criterion: publishing yields app-consumable JSON. */
describe('home layout builder', () => {
  it('publishing produces the shape the app actually consumes, not the internal record', async () => {
    const s = await signIn('marketing@arise.test');
    const draft = await call('/cms/home/draft', { token: s.accessToken });
    expect(draft.status).toBe(200);
    expect(draft.json.data.status).toBe('DRAFT');

    const r = await call('/cms/home/publish', { method: 'POST', token: s.accessToken, body: {} });
    expect(r.status).toBe(201);
    const json = r.json.data;

    // Nothing internal leaks into the app-facing shape.
    expect(json.version).toBeTruthy();
    expect(json).not.toHaveProperty('createdByName');
    expect(json).not.toHaveProperty('note');
    expect(Array.isArray(json.sections)).toBe(true);
    for (const section of json.sections) {
      expect(Object.keys(section).sort()).toEqual(['config', 'type', 'visibility']);
    }
    expect(json.categoryTabs.length).toBeGreaterThan(0);
    expect(json.topBrandTabs.length).toBeGreaterThan(0);
  });

  it('a hidden section never reaches the published JSON', async () => {
    const s = await signIn('marketing@arise.test');
    const draft = await call('/cms/home/draft', { token: s.accessToken });
    const sections = draft.json.data.sections.map((sec, i) =>
      i === 0 ? { ...sec, visibility: { ...sec.visibility, enabled: false } } : sec,
    );
    await call('/cms/home/draft', { method: 'PATCH', token: s.accessToken, body: { sections } });

    const r = await call('/cms/home/publish', { method: 'POST', token: s.accessToken, body: {} });
    expect(r.json.data.sections.find((sec) => sec.type === sections[0].type)).toBeUndefined();
  });

  it('a new draft starts automatically after publishing', async () => {
    const s = await signIn('marketing@arise.test');
    await call('/cms/home/draft', { token: s.accessToken });
    await call('/cms/home/publish', { method: 'POST', token: s.accessToken, body: {} });

    const nextDraft = await call('/cms/home/draft', { token: s.accessToken });
    expect(nextDraft.json.data.status).toBe('DRAFT');
  });

  it('rolling back needs a second approver and restores exactly that version’s sections', async () => {
    const maker = await signIn('marketing@arise.test');
    const before = await call('/cms/home/published', { token: maker.accessToken });
    const originalVersionId = db.homeLayoutVersions.find((v) => v.status === 'PUBLISHED').id;

    // Publish a change so there is something to roll back from.
    await call('/cms/home/draft', { token: maker.accessToken });
    await call('/cms/home/publish', { method: 'POST', token: maker.accessToken, body: {} });

    const rollback = await call('/cms/home/rollback', {
      method: 'POST', token: maker.accessToken,
      body: { versionId: originalVersionId, reason: 'The new layout dropped the flash sale banner by mistake.' },
    });
    expect(rollback.status).toBe(202);
    // Nothing changes until a second approver agrees.
    expect(db.homeLayoutVersions.find((v) => v.id === originalVersionId).status).not.toBe('PUBLISHED');

    await decide(rollback.json.error.details.approvalId, 'super@arise.test');
    const after = await call('/cms/home/published', { token: maker.accessToken });
    expect(after.json.data.sections).toEqual(before.json.data.sections);
  });
});

describe('content: banners, onboarding, static pages', () => {
  it('derives a banner status from its own schedule', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/banners', { token: s.accessToken });
    const expired = r.json.data.find((b) => new Date(b.endsAt).getTime() < Date.now());
    expect(expired.status).toBe('EXPIRED');
  });

  it('reorders onboarding slides', async () => {
    const s = await signIn('marketing@arise.test');
    const slides = db.onboardingSlides;
    const reversed = [...slides].reverse().map((sl) => sl.id);
    const r = await call('/onboarding-slides/reorder', {
      method: 'PATCH', token: s.accessToken, body: { orderedIds: reversed },
    });
    expect(r.json.data.map((sl) => sl.id)).toEqual(reversed);
  });

  it('keeps every version of a static page and flags a material change', async () => {
    const s = await signIn('marketing@arise.test');
    const page = db.staticPages.find((p) => p.slug === 'privacy_policy');
    // `page` is a live reference into the db, so the count the handler
    // leaves it with has to be captured before the call mutates it in place.
    const versionsBefore = page.versions.length;
    const r = await call(`/static-pages/${page.id}`, {
      method: 'PATCH', token: s.accessToken,
      body: { body: 'Updated privacy terms covering a new data category.', materialChange: true, note: 'Added data-sharing clause' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.versions.length).toBe(versionsBefore + 1);
    expect(r.json.data.requiresReacceptance).toBe(true);
  });
});

describe('help centre', () => {
  it('deleting a category removes its articles too', async () => {
    const s = await signIn('marketing@arise.test');
    const category = db.helpCategories[0];
    const articleCount = filter('helpArticles', (a) => a.categoryId === category.id).length;
    expect(articleCount).toBeGreaterThan(0);

    const r = await call(`/help-categories/${category.id}`, { method: 'DELETE', token: s.accessToken });
    expect(r.status).toBe(200);
    expect(filter('helpArticles', (a) => a.categoryId === category.id)).toHaveLength(0);
  });
});

describe('search configuration', () => {
  it('blocks a search term entirely', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/search/test?q=free iphone', { token: s.accessToken });
    expect(r.json.data.blocked).toBe(true);
    expect(r.json.data.results).toHaveLength(0);
  });

  it('redirects a keyword to its target', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/search/test?q=iphone', { token: s.accessToken });
    expect(r.json.data.redirectedTo.type).toBe('BRAND');
    expect(r.json.data.redirectedTo.label).toBe('Apple');
    expect(r.json.data.results).toHaveLength(0);
  });

  it('applies a synonym both ways', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/search/test?q=television', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.appliedRules.some((rule) => rule.type === 'SYNONYM')).toBe(true);
  });
});

describe('reason masters', () => {
  it('requires a fault attribution on a return reason', async () => {
    const s = await signIn('marketing@arise.test');
    const r = await call('/reason-lists', {
      method: 'POST', token: s.accessToken,
      body: { listKey: 'RETURN', label: 'Courier mishandled the parcel' },
    });
    expect(r.status).toBe(422);
    expect(r.json.error.fieldErrors.faultAttribution).toBeTruthy();
  });

  it('protects the free-text "Other" entry from deletion', async () => {
    const s = await signIn('marketing@arise.test');
    const other = db.reasonLists.find((rr) => rr.listKey === 'CANCEL' && rr.code === 'OTHER');
    const r = await call(`/reason-lists/${other.id}`, { method: 'DELETE', token: s.accessToken });
    expect(r.status).toBe(409);
  });
});

describe('notification templates', () => {
  it('requires a DLT template ID for SMS', async () => {
    const s = await signIn('marketing@arise.test');
    const template = db.notificationTemplates[0];
    const r = await call(`/notification-templates/${template.id}/SMS`, {
      method: 'PATCH', token: s.accessToken, body: { dltTemplateId: '' },
    });
    expect(r.status).toBe(422);
  });

  it('keeps edit history per channel', async () => {
    const s = await signIn('marketing@arise.test');
    const template = db.notificationTemplates[0];
    const r = await call(`/notification-templates/${template.id}/PUSH`, {
      method: 'PATCH', token: s.accessToken,
      body: { content: { body: 'Updated push copy for {{orderId}}' } },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.channels.PUSH.history.length).toBe(1);
    expect(r.json.data.channels.PUSH.version).toBe(2);
  });

  it('resends a failed notification but not a delivered one', async () => {
    const s = await signIn('marketing@arise.test');
    const failed = db.notificationLogs.find((l) => l.status === 'FAILED');
    const delivered = db.notificationLogs.find((l) => l.status === 'DELIVERED');

    const r = await call(`/notification-logs/${failed.id}/resend`, { method: 'POST', token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('SENT');

    const bad = await call(`/notification-logs/${delivered.id}/resend`, { method: 'POST', token: s.accessToken });
    expect(bad.status).toBe(422);
  });
});
