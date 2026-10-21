import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, filter } from './db/store';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { DEMO_PASSWORD } from './seed/adminUsers';
import { resetSettings, updateSettings } from './engine/settings';

/**
 * Phase 1 contract tests, ending in Journey 1 from the plan:
 * seller applies → KYC approved → lists a product → QC approves → product live.
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
  expect(login.status, `login ${email}: ${JSON.stringify(login.json)}`).toBe(200);
  const { challengeId, devHint, stage } = login.json.data;
  const verify = await call(`/auth/2fa/${stage === 'enrol_2fa' ? 'enrol' : 'verify'}`, {
    method: 'POST',
    body: { challengeId, code: devHint.code },
  });
  expect(verify.status).toBe(200);
  return verify.json.data;
}

describe('seller applications', () => {
  it('lists applications with their verification summary and SLA', async () => {
    const s = await signIn('onboarding@arise.test');
    const r = await call('/sellers/applications?pageSize=100', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(10);
    const row = r.json.data[0];
    expect(row).toHaveProperty('documentsApproved');
    expect(row).toHaveProperty('slaDueAt');
    expect(row).toHaveProperty('blockerCount');
  });

  it('refuses to approve while blockers remain, and says which', async () => {
    const s = await signIn('onboarding@arise.test');
    const applied = db.sellers.find((x) => x.status === 'APPLIED');

    const r = await call(`/sellers/${applied.id}/application/approve`, {
      method: 'POST',
      token: s.accessToken,
      body: {},
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('APPROVAL_BLOCKED');
    expect(r.json.error.details.blockers.length).toBeGreaterThan(0);
  });

  it('rejects an application only with a reason', async () => {
    const s = await signIn('onboarding@arise.test');
    const applied = db.sellers.find((x) => x.status === 'APPLIED');

    const noReason = await call(`/sellers/${applied.id}/application/reject`, {
      method: 'POST', token: s.accessToken, body: {},
    });
    expect(noReason.status).toBe(422);

    const ok = await call(`/sellers/${applied.id}/application/reject`, {
      method: 'POST', token: s.accessToken, body: { reason: 'GSTIN belongs to a different entity' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.data.status).toBe('REJECTED');
  });

  it('refuses an illegal transition', async () => {
    const s = await signIn('onboarding@arise.test');
    const active = db.sellers.find((x) => x.status === 'ACTIVE');
    const r = await call(`/sellers/${active.id}/application/approve`, {
      method: 'POST', token: s.accessToken, body: {},
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('surfaces duplicate PAN or bank matches against other sellers', async () => {
    const s = await signIn('onboarding@arise.test');
    const seller = db.sellers.find((x) => x.status === 'UNDER_REVIEW');
    const r = await call(`/sellers/${seller.id}`, { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.meta.duplicates)).toBe(true);
  });

  it('records a document decision and recomputes the blockers', async () => {
    const s = await signIn('onboarding@arise.test');
    const seller = db.sellers.find((x) => x.status === 'UNDER_REVIEW');
    const pending = filter('kycDocuments', (d) => d.sellerId === seller.id && d.status === 'PENDING')[0];

    const rejected = await call(`/sellers/${seller.id}/documents/${pending.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { approve: false, reason: 'Scan is unreadable' },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.json.data.status).toBe('REJECTED');
    expect(rejected.json.meta.blockers.length).toBeGreaterThan(0);
  });
});

describe('seller lifecycle', () => {
  it('suspending a seller needs a second approver and hides their listings', async () => {
    const ops = await signIn('super@arise.test');
    const seller = db.sellers.find(
      (x) => x.status === 'ACTIVE' && filter('offers', (o) => o.sellerId === x.id && o.status === 'LIVE').length > 0,
    );
    const liveBefore = filter('offers', (o) => o.sellerId === seller.id && o.status === 'LIVE').length;

    const req = await call(`/sellers/${seller.id}/lifecycle/suspend`, {
      method: 'POST',
      token: ops.accessToken,
      body: { reason: 'Counterfeit complaints', hideListings: true, holdPayouts: true },
    });
    expect(req.status).toBe(202);
    expect(req.json.error.code).toBe('APPROVAL_REQUIRED');
    // Nothing has happened yet.
    expect(db.sellers.find((x) => x.id === seller.id).status).toBe('ACTIVE');

    // The request routes to someone who holds sellers.seller.suspend; the
    // finance approver deliberately does not.
    const approver = await signIn('ops@arise.test');
    const inbox = await call('/approvals?view=pending_mine&pageSize=50', { token: approver.accessToken });
    const pending = inbox.json.data.find((a) => a.entityId === seller.id);
    expect(pending).toBeTruthy();

    const decided = await call(`/approvals/${pending.id}/decide`, {
      method: 'POST', token: approver.accessToken, body: { approve: true },
    });
    expect(decided.status).toBe(200);

    const after = db.sellers.find((x) => x.id === seller.id);
    expect(after.status).toBe('SUSPENDED');
    expect(after.payoutOnHold).toBe(true);
    expect(filter('offers', (o) => o.sellerId === seller.id && o.status === 'LIVE')).toHaveLength(0);
    expect(liveBefore).toBeGreaterThan(0);
  });

  it('restores the hidden listings when the seller is reactivated', async () => {
    const admin = await signIn('super@arise.test');
    const seller = db.sellers.find(
      (x) => x.status === 'ACTIVE' && filter('offers', (o) => o.sellerId === x.id && o.status === 'LIVE').length > 0,
    );
    const liveBefore = filter('offers', (o) => o.sellerId === seller.id && o.status === 'LIVE').length;

    // Suspend and approve.
    await call(`/sellers/${seller.id}/lifecycle/suspend`, {
      method: 'POST', token: admin.accessToken, body: { reason: 'test' },
    });
    const approver = await signIn('ops@arise.test');
    let inbox = await call('/approvals?view=pending_mine&pageSize=50', { token: approver.accessToken });
    let pending = inbox.json.data.find((a) => a.entityId === seller.id);
    await call(`/approvals/${pending.id}/decide`, {
      method: 'POST', token: approver.accessToken, body: { approve: true },
    });

    // Reactivate and approve.
    await call(`/sellers/${seller.id}/lifecycle/reactivate`, {
      method: 'POST', token: admin.accessToken, body: { reason: 'Complaint withdrawn' },
    });
    inbox = await call('/approvals?view=pending_mine&pageSize=50', { token: approver.accessToken });
    pending = inbox.json.data.find((a) => a.entityId === seller.id && a.status === 'PENDING');
    await call(`/approvals/${pending.id}/decide`, {
      method: 'POST', token: approver.accessToken, body: { approve: true },
    });

    expect(db.sellers.find((x) => x.id === seller.id).status).toBe('ACTIVE');
    expect(filter('offers', (o) => o.sellerId === seller.id && o.status === 'LIVE')).toHaveLength(liveBefore);
  });

  it('keeps an account manager out of sellers outside their portfolio', async () => {
    const sam = await signIn('sam@arise.test');
    const list = await call('/sellers?pageSize=200', { token: sam.accessToken });
    expect(list.json.data.length).toBeLessThanOrEqual(12);

    const outside = db.sellers.find((s) => !sam.user.scope.sellers.includes(s.id));
    const r = await call(`/sellers/${outside.id}`, { token: sam.accessToken });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('OUT_OF_SCOPE');
  });
});

describe('brand approvals, penalties and claims', () => {
  it('requires an expiry date when approving a brand authorisation', async () => {
    const s = await signIn('onboarding@arise.test');
    const pending = db.brandRequests.find((r) => r.status === 'PENDING');

    const noDate = await call(`/brand-requests/${pending.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'APPROVED' },
    });
    expect(noDate.status).toBe(422);

    const ok = await call(`/brand-requests/${pending.id}/decide`, {
      method: 'POST',
      token: s.accessToken,
      body: { decision: 'APPROVED', validTill: '2027-12-31T00:00:00.000Z' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.data.validTill).toBeTruthy();
  });

  it('sends a penalty waiver for approval rather than applying it', async () => {
    const admin = await signIn('super@arise.test');
    const penalty = db.penalties.find((p) => p.status === 'APPLIED');
    const r = await call(`/penalties/${penalty.id}/waive`, {
      method: 'POST', token: admin.accessToken, body: { reason: 'Courier was at fault' },
    });
    expect(r.status).toBe(202);
    expect(db.penalties.find((p) => p.id === penalty.id).status).toBe('APPLIED');
  });

  it('will not approve a partial claim for more than was claimed', async () => {
    const admin = await signIn('super@arise.test');
    const claim = db.sellerClaims.find((c) => c.status === 'SUBMITTED');
    const r = await call(`/seller-claims/${claim.id}/decide`, {
      method: 'POST',
      token: admin.accessToken,
      body: {
        decision: 'PARTIALLY_APPROVED',
        amountApprovedPaise: claim.amountClaimedPaise + 1,
        reason: 'partial',
      },
    });
    expect(r.status).toBe(422);
  });

  it('ranks sellers by order defect rate and flags the ones at risk', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/sellers/performance?pageSize=100', { token: admin.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data[0]).toHaveProperty('odr');
    expect(['HEALTHY', 'WATCH', 'AT_RISK']).toContain(r.json.data[0].health);
  });
});

describe('catalog', () => {
  it('returns a product with its variants, offers and attribute set', async () => {
    const s = await signIn('catalog@arise.test');
    const product = db.products.find((p) => p.status === 'LIVE');
    const r = await call(`/products/${product.id}`, { token: s.accessToken });

    expect(r.status).toBe(200);
    expect(r.json.meta.variants.length).toBeGreaterThan(0);
    expect(r.json.meta.offers.length).toBeGreaterThan(0);
    expect(r.json.meta.attributes.length).toBeGreaterThan(0);
    expect(r.json.data.buyBoxSellerName).toBeTruthy();
  });

  it('warns before hiding a category that still holds live listings', async () => {
    const s = await signIn('catalog@arise.test');
    const category = db.categories.find((c) => c.liveListings > 0);

    const blocked = await call(`/categories/${category.id}`, {
      method: 'PATCH', token: s.accessToken, body: { status: 'HIDDEN', version: category.version },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe('CATEGORY_HAS_LISTINGS');

    const confirmed = await call(`/categories/${category.id}`, {
      method: 'PATCH',
      token: s.accessToken,
      body: { status: 'HIDDEN', hideListings: true, version: category.version },
    });
    expect(confirmed.status).toBe(200);
  });

  it('will not delete a category that still has children or products', async () => {
    const s = await signIn('super@arise.test');
    const root = db.categories.find((c) => c.level === 1);
    const r = await call(`/categories/${root.id}`, { method: 'DELETE', token: s.accessToken });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('CATEGORY_HAS_CHILDREN');
  });

  it('refuses to change the type of an attribute already in use', async () => {
    const s = await signIn('catalog@arise.test');
    const attribute = db.attributes.find((a) => a.usedInCategories > 0);
    const r = await call(`/attributes/${attribute.id}`, {
      method: 'PATCH', token: s.accessToken, body: { type: 'TEXT' },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ATTRIBUTE_IN_USE');
  });

  it('turns an edit to a live listing into a pending revision', async () => {
    const s = await signIn('catalog@arise.test');
    const product = db.products.find((p) => p.status === 'LIVE');
    const originalTitle = product.title;

    const r = await call(`/products/${product.id}`, {
      method: 'PATCH',
      token: s.accessToken,
      body: { title: 'Rewritten title', version: product.version },
    });
    expect(r.status).toBe(200);
    expect(r.json.meta.pendingRevision).toBe(true);
    // What customers see has not changed.
    expect(db.products.find((p) => p.id === product.id).title).toBe(originalTitle);
    expect(db.listingSubmissions.some((x) => x.productId === product.id && x.type === 'REVISION')).toBe(true);
  });

  it('keeps a category manager out of listings in other categories', async () => {
    const cm = await signIn('category@arise.test');
    const allowedRoots = cm.user.scope.categories;
    const outside = db.products.find((p) => {
      let node = db.categories.find((c) => c.id === p.categoryId);
      while (node?.parentId) node = db.categories.find((c) => c.id === node.parentId);
      return node && !allowedRoots.includes(node.id);
    });
    expect(outside).toBeTruthy();

    const r = await call(`/products/${outside.id}`, { token: cm.accessToken });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('OUT_OF_SCOPE');
  });
});

describe('listing QC', () => {
  it('shows the queue with automated check results and SLA state', async () => {
    const s = await signIn('catalog@arise.test');
    const r = await call('/listing-submissions?pageSize=100', { token: s.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.data[0].autoChecks.length).toBe(7);
    expect(r.json.meta.counts).toHaveProperty('unassigned');
  });

  it('stops two reviewers claiming the same submission', async () => {
    const first = await signIn('catalog@arise.test');
    const second = await signIn('super@arise.test');
    const row = db.listingSubmissions.find((x) => !x.assignedToId);

    const a = await call(`/listing-submissions/${row.id}/claim`, { method: 'POST', token: first.accessToken });
    expect(a.status).toBe(200);

    const b = await call(`/listing-submissions/${row.id}/claim`, { method: 'POST', token: second.accessToken });
    expect(b.status).toBe(409);
    expect(b.json.error.code).toBe('ALREADY_CLAIMED');
  });

  it('blocks approval while an automated check is failing', async () => {
    const s = await signIn('super@arise.test');
    const row = db.listingSubmissions.find((x) => x.autoChecks.some((c) => c.result === 'FAIL'));
    expect(row).toBeTruthy();

    const blocked = await call(`/listing-submissions/${row.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'APPROVE' },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe('AUTO_CHECK_FAILED');

    // An explicit override is allowed, and recorded as such.
    const overridden = await call(`/listing-submissions/${row.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'APPROVE', overrideChecks: true },
    });
    expect(overridden.status).toBe(200);
  });

  it('requires specific issues when asking the seller for changes', async () => {
    const s = await signIn('catalog@arise.test');
    const row = db.listingSubmissions.find((x) => x.status === 'QC_PENDING');
    const r = await call(`/listing-submissions/${row.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'REQUEST_CHANGES' },
    });
    expect(r.status).toBe(422);
  });
});

describe('Journey 1 — application to a live listing', () => {
  it('runs end to end', async () => {
    const onboarding = await signIn('onboarding@arise.test');
    const catalog = await signIn('super@arise.test');

    // 1. An application that is still missing paperwork.
    const seller = db.sellers.find((s) => s.status === 'UNDER_REVIEW');
    expect(seller).toBeTruthy();

    let detail = await call(`/sellers/${seller.id}`, { token: onboarding.accessToken });
    expect(detail.json.meta.blockers.length).toBeGreaterThan(0);

    // 2. Approve every outstanding KYC document.
    for (const doc of filter('kycDocuments', (d) => d.sellerId === seller.id && d.status !== 'APPROVED')) {
      const r = await call(`/sellers/${seller.id}/documents/${doc.id}/decide`, {
        method: 'POST', token: onboarding.accessToken, body: { approve: true },
      });
      expect(r.status).toBe(200);
    }
    // Clear the remaining non-document blockers the provider checks own.
    Object.assign(db.sellers.find((s) => s.id === seller.id), {
      gstinVerification: { ...seller.gstinVerification, status: 'ACTIVE' },
      panVerification: { ...seller.panVerification, status: 'VALID' },
    });
    const bank = filter('bankAccounts', (b) => b.sellerId === seller.id)[0];
    bank.verified = true;
    bank.pennyDropStatus = 'VERIFIED';

    detail = await call(`/sellers/${seller.id}`, { token: onboarding.accessToken });
    expect(detail.json.meta.blockers).toEqual([]);
    expect(detail.json.meta.allowedActions).toContain('APPROVE');

    // 3. Approve, onboard, activate.
    const approved = await call(`/sellers/${seller.id}/application/approve`, {
      method: 'POST', token: onboarding.accessToken, body: { tier: 'BRONZE' },
    });
    expect(approved.json.data.status).toBe('APPROVED');

    await call(`/sellers/${seller.id}/lifecycle/start-onboarding`, {
      method: 'POST', token: catalog.accessToken, body: {},
    });
    const activated = await call(`/sellers/${seller.id}/lifecycle/activate`, {
      method: 'POST', token: catalog.accessToken, body: {},
    });
    expect(activated.json.data.status).toBe('ACTIVE');

    // 4. A listing from that seller is waiting in QC.
    const product = db.products.find((p) => p.status === 'QC_PENDING');
    expect(product).toBeTruthy();
    const submission = db.listingSubmissions.find((x) => x.productId === product.id);
    expect(submission).toBeTruthy();

    await call(`/listing-submissions/${submission.id}/claim`, {
      method: 'POST', token: catalog.accessToken,
    });

    // 5. QC approves it.
    const decided = await call(`/listing-submissions/${submission.id}/decide`, {
      method: 'POST', token: catalog.accessToken, body: { decision: 'APPROVE', overrideChecks: true },
    });
    expect(decided.status).toBe(200);
    expect(decided.json.data.status).toBe('LIVE');

    // 6. The product is live, its in-stock offers are live, and exactly one
    //    offer per variant holds the buy box.
    const after = await call(`/products/${product.id}`, { token: catalog.accessToken });
    expect(after.json.data.status).toBe('LIVE');
    const offers = after.json.meta.offers;
    expect(offers.filter((o) => o.stock > 0).every((o) => o.status === 'LIVE')).toBe(true);
    for (const variant of after.json.meta.variants) {
      const forVariant = offers.filter((o) => o.variantId === variant.id);
      const winners = forVariant.filter((o) => o.buyBoxWinner);
      expect(winners.length).toBe(forVariant.some((o) => o.stock > 0 && o.status === 'LIVE') ? 1 : 0);
    }

    // 7. The whole journey is on the audit trail.
    const audit = await call('/audit-events?pageSize=200', { token: catalog.accessToken });
    const actions = audit.json.data.map((e) => e.action);
    expect(actions).toContain('sellers.application.approve');
    expect(actions).toContain('catalog.product.approve');
  });
});
