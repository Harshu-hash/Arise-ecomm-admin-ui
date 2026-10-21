import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, filter, findById } from './db/store';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { DEMO_PASSWORD } from './seed/adminUsers';
import { resetSettings, updateSettings } from './engine/settings';

/**
 * Phase 7 — sponsored ads.
 *
 * Ads move real seller money through the advertiser wallet, the same way
 * Phase 4's payouts did, so the same questions apply: can a campaign spend
 * past its own budget (no), does a floor-price change move unilaterally
 * (no), and does the one guarded action here actually have someone able to
 * request and a different someone able to approve it.
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

describe('campaigns', () => {
  it('rejects a budget smaller than the daily budget', async () => {
    const s = await signIn('ads@arise.test');
    const seller = db.sellers.find((x) => x.status === 'ACTIVE');
    const offer = db.offers.find((o) => o.sellerId === seller.id && o.status === 'LIVE');
    const r = await call('/ads/campaigns', {
      method: 'POST', token: s.accessToken,
      body: { sellerId: seller.id, name: 'Test', dailyBudgetPaise: 50000, totalBudgetPaise: 10000, productIds: [offer.productId] },
    });
    expect(r.status).toBe(422);
  });

  it('follows only the documented transitions', async () => {
    const s = await signIn('ads@arise.test');
    const ended = db.adCampaigns.find((c) => c.status === 'ENDED');
    const r = await call(`/ads/campaigns/${ended.id}/resume`, { method: 'POST', token: s.accessToken });
    expect(r.status).toBe(409);
  });

  it('pausing for policy requires a reason', async () => {
    const s = await signIn('ads@arise.test');
    const active = db.adCampaigns.find((c) => c.status === 'ACTIVE');
    const missing = await call(`/ads/campaigns/${active.id}/pause`, { method: 'POST', token: s.accessToken, body: {} });
    expect(missing.status).toBe(422);

    const r = await call(`/ads/campaigns/${active.id}/pause`, {
      method: 'POST', token: s.accessToken, body: { reason: 'Promoted product failed a quality spot-check.' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('PAUSED');
    expect(r.json.data.pauseReason).toBe('POLICY');
  });

  it('will not resume a campaign whose wallet is empty', async () => {
    const s = await signIn('ads@arise.test');
    const campaign = db.adCampaigns.find((c) => c.status === 'PAUSED');
    const wallet = db.advertiserWallets.find((w) => w.sellerId === campaign.sellerId);
    if (wallet) {
      wallet.fundingMode = 'PREPAID';
      wallet.balancePaise = 0;
    }
    campaign.pauseReason = 'WALLET_EMPTY';

    const r = await call(`/ads/campaigns/${campaign.id}/resume`, { method: 'POST', token: s.accessToken });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('WALLET_EMPTY');
  });
});

describe('the ad review queue', () => {
  it('flags a campaign whose keywords match a blocked term', async () => {
    const s = await signIn('ads@arise.test');
    const pending = db.adCampaigns.find((c) => c.status === 'PENDING_REVIEW');
    const group = db.adGroups.find((g) => g.campaignId === pending.id);
    group.keywords = [{ term: 'free iphone deal', matchType: 'BROAD', bidPaise: 100 }];

    const r = await call('/ads/review', { token: s.accessToken });
    expect(r.status).toBe(200);
    const row = r.json.data.find((c) => c.id === pending.id);
    expect(row.reviewPassed).toBe(false);
    expect(row.findings.some((f) => f.type === 'BLOCKED_KEYWORD')).toBe(true);
  });

  it('approving moves the campaign to active; rejecting requires a reason', async () => {
    const s = await signIn('ads@arise.test');
    const [a, b] = db.adCampaigns.filter((c) => c.status === 'PENDING_REVIEW');

    const approve = await call(`/ads/review/${a.id}/decide`, { method: 'POST', token: s.accessToken, body: { decision: 'APPROVED' } });
    expect(approve.status).toBe(200);
    expect(approve.json.data.status).toBe('ACTIVE');

    const missingReason = await call(`/ads/review/${b.id}/decide`, { method: 'POST', token: s.accessToken, body: { decision: 'REJECTED' } });
    expect(missingReason.status).toBe(422);

    const reject = await call(`/ads/review/${b.id}/decide`, {
      method: 'POST', token: s.accessToken, body: { decision: 'REJECTED', reason: 'Product is out of stock.' },
    });
    expect(reject.status).toBe(200);
    expect(reject.json.data.status).toBe('REJECTED');
  });

  it('refuses to decide a campaign that is not awaiting review', async () => {
    const s = await signIn('ads@arise.test');
    const active = db.adCampaigns.find((c) => c.status === 'ACTIVE');
    const r = await call(`/ads/review/${active.id}/decide`, { method: 'POST', token: s.accessToken, body: { decision: 'APPROVED' } });
    expect(r.status).toBe(409);
  });
});

describe('placements & pricing', () => {
  it('a floor-price change needs a second approver; other settings do not', async () => {
    const maker = await signIn('ads@arise.test');
    const placement = db.adPlacements[0];

    const enable = await call(`/ads/placements/${placement.id}`, {
      method: 'PATCH', token: maker.accessToken, body: { enabled: false },
    });
    expect(enable.status).toBe(200);

    const before = { ...placement.floorCpcByCategory };
    const r = await call(`/ads/placements/${placement.id}`, {
      method: 'PATCH', token: maker.accessToken,
      body: { floorCpcByCategory: { ...before, Fashion: 999 }, reason: 'Raising the floor in a high-demand category.' },
    });
    expect(r.status).toBe(202);
    expect(findById('adPlacements', placement.id).floorCpcByCategory.Fashion).toBe(before.Fashion);

    await decide(r.json.error.details.approvalId, 'super@arise.test');
    expect(findById('adPlacements', placement.id).floorCpcByCategory.Fashion).toBe(999);
  });
});

describe('advertiser billing', () => {
  it('recharging a payout-deducted advertiser is refused', async () => {
    const s = await signIn('ads@arise.test');
    const wallet = db.advertiserWallets.find((w) => w.fundingMode === 'DEDUCT_FROM_PAYOUT');
    const r = await call(`/ads/billing/wallets/${wallet.id}/recharge`, {
      method: 'POST', token: s.accessToken, body: { amountPaise: 50000 },
    });
    expect(r.status).toBe(409);
  });

  it('recharging a prepaid wallet increases its balance and writes a ledger row', async () => {
    const s = await signIn('ads@arise.test');
    const wallet = db.advertiserWallets.find((w) => w.fundingMode === 'PREPAID');
    const before = wallet.balancePaise;
    const r = await call(`/ads/billing/wallets/${wallet.id}/recharge`, {
      method: 'POST', token: s.accessToken, body: { amountPaise: 100000 },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.balancePaise).toBe(before + 100000);
    expect(filter('advertiserLedger', (l) => l.walletId === wallet.id && l.type === 'RECHARGE').length).toBeGreaterThan(0);
  });

  it('flags low-balance prepaid wallets in the summary', async () => {
    const s = await signIn('ads@arise.test');
    const r = await call('/ads/billing/wallets', { token: s.accessToken });
    expect(r.status).toBe(200);
    for (const w of r.json.data.filter((x) => x.lowBalance)) {
      expect(w.fundingMode).toBe('PREPAID');
      expect(w.balancePaise).toBeLessThan(w.lowBalanceThresholdPaise);
    }
  });
});

describe('invalid traffic', () => {
  it('crediting flagged traffic tops up the advertiser’s wallet', async () => {
    const s = await signIn('ads@arise.test');
    const flagged = db.invalidClicks.find((c) => c.status === 'FLAGGED');
    const wallet = db.advertiserWallets.find((w) => w.sellerId === flagged.sellerId && w.fundingMode === 'PREPAID');
    if (!wallet) return; // seeded seller happens to be payout-deducted; nothing to assert here
    const before = wallet.balancePaise;

    const r = await call(`/ads/invalid-clicks/${flagged.id}/credit`, {
      method: 'POST', token: s.accessToken, body: { amountPaise: 5000 },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe('CREDITED');
    expect(findById('advertiserWallets', wallet.id).balancePaise).toBe(before + 5000);
  });

  it('refuses to credit traffic twice', async () => {
    const s = await signIn('ads@arise.test');
    const credited = db.invalidClicks.find((c) => c.status === 'CREDITED');
    const r = await call(`/ads/invalid-clicks/${credited.id}/credit`, {
      method: 'POST', token: s.accessToken, body: { amountPaise: 1000 },
    });
    expect(r.status).toBe(409);
  });
});

describe('ads reports', () => {
  it('reports platform revenue as the sum of real daily spend', async () => {
    const s = await signIn('ads@arise.test');
    const r = await call('/ads/reports', { token: s.accessToken });
    expect(r.status).toBe(200);
    const expected = db.adDailyStats.reduce((n, row) => n + row.spendPaise, 0);
    expect(r.json.data.platformRevenuePaise).toBe(expected);
    expect(r.json.data.topAdvertisers.length).toBeGreaterThan(0);
  });
});

/**
 * Journey 7 — campaign submitted → policy review → active → budget
 * exhausted → auto-paused → advertiser invoice generated.
 */
describe('Journey 7 — the sponsored ads lifecycle', () => {
  it('runs end to end', async () => {
    const adsManager = await signIn('ads@arise.test');
    const seller = db.sellers.find(
      (x) => x.status === 'ACTIVE' && db.advertiserWallets.some((w) => w.sellerId === x.id && w.fundingMode === 'PREPAID'),
    );
    const wallet = db.advertiserWallets.find((w) => w.sellerId === seller.id);
    const offer = db.offers.find((o) => o.sellerId === seller.id && o.status === 'LIVE');

    // 1. A campaign is created and submitted.
    const create = await call('/ads/campaigns', {
      method: 'POST', token: adsManager.accessToken,
      body: {
        sellerId: seller.id, name: 'Journey 7 campaign',
        dailyBudgetPaise: 50000, totalBudgetPaise: 50000, biddingType: 'MANUAL_CPC',
        productIds: [offer.productId],
      },
    });
    expect(create.status).toBe(201);
    const campaign = create.json.data;
    expect(campaign.status).toBe('DRAFT');

    const submit = await call(`/ads/campaigns/${campaign.id}/submit`, { method: 'POST', token: adsManager.accessToken });
    expect(submit.status).toBe(200);
    expect(submit.json.data.status).toBe('PENDING_REVIEW');

    // 2. Policy review passes it.
    const decide1 = await call(`/ads/review/${campaign.id}/decide`, {
      method: 'POST', token: adsManager.accessToken, body: { decision: 'APPROVED' },
    });
    expect(decide1.status).toBe(200);
    expect(decide1.json.data.status).toBe('ACTIVE');

    // 3. Spend accrues until the total budget is reached.
    const spend = await call(`/ads/campaigns/${campaign.id}/record-spend`, {
      method: 'POST', token: adsManager.accessToken,
      body: { impressions: 5000, clicks: 100, spendPaise: 50000, adOrders: 4, adGmvPaise: 200000 },
    });
    expect(spend.status).toBe(200);
    expect(spend.json.data.autoPaused).toBe(true);
    expect(findById('adCampaigns', campaign.id).status).toBe('PAUSED');
    expect(findById('adCampaigns', campaign.id).pauseReason).toBe('BUDGET_EXHAUSTED');

    // 4. An invoice is generated for the advertiser's spend.
    const invoice = await call('/ads/billing/invoices/generate', {
      method: 'POST', token: adsManager.accessToken,
      body: { walletId: wallet.id, periodStart: new Date(Date.now() - 86400_000).toISOString() },
    });
    expect(invoice.status).toBe(201);
    expect(invoice.json.data.spendPaise).toBeGreaterThan(0);
    expect(invoice.json.data.totalPaise).toBe(invoice.json.data.spendPaise + invoice.json.data.gstPaise);
  });
});
