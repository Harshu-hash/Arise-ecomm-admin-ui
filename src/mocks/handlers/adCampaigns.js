import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  conflict,
  created,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { canTransitionCampaign, reviewCampaign, summariseCampaignStats } from '../engine/ads';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Sponsored ad campaigns (M11) — the campaign list, its detail, the ad
 * review queue, and the admin actions (pause for policy, resume, end).
 *
 * A seller is the "advertiser" throughout; there is no seller panel yet
 * (a locked, separate future project), so every campaign here is seeded as
 * already created, and admin-side actions are what this phase builds —
 * creating a campaign on a seller's behalf is a UI convenience over the
 * same endpoints a seller panel would eventually call.
 */

function campaignRow(campaign) {
  const stats = filter('adDailyStats', (s) => s.campaignId === campaign.id);
  const today = stats.find((s) => s.date === new Date().toISOString().slice(0, 10));
  const totals = summariseCampaignStats(stats);
  const groups = filter('adGroups', (g) => g.campaignId === campaign.id);
  return {
    ...campaign,
    spendTodayPaise: today?.spendPaise ?? 0,
    ...totals,
    groupCount: groups.length,
    productCount: groups.reduce((n, g) => n + g.productIds.length, 0),
  };
}

export const adCampaignHandlers = [
  /** A seller's own live, in-stock products — the only ones it can promote. */
  mswHttp.get(`${BASE}/ads/sellers/:sellerId/products`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.create');
    if (g.response) return g.response;
    const offers = filter('offers', (o) => o.sellerId === params.sellerId && o.status === 'LIVE' && o.stock > 0);
    const seen = new Set();
    const options = [];
    for (const offer of offers) {
      if (seen.has(offer.productId)) continue;
      seen.add(offer.productId);
      const product = findById('products', offer.productId);
      if (product) options.push({ value: product.id, label: product.title, sublabel: product.categoryPath });
    }
    return ok(options);
  }),

  mswHttp.get(`${BASE}/ads/campaigns`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'ads.campaign.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(db.adCampaigns.map(campaignRow), query, {
      searchFields: ['name', 'sellerName'],
      filterSpec: { status: 'status', sellerId: 'sellerId', biddingType: 'biddingType' },
      sortable: ['createdAt', 'spendTodayPaise', 'spendPaise', 'impressions', 'clicks', 'ctrPct', 'roas'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/ads/campaigns/:campaignId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.view');
    if (g.response) return g.response;

    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');

    const groups = filter('adGroups', (grp) => grp.campaignId === campaign.id).map((grp) => ({
      ...grp,
      products: grp.productIds.map((pid) => {
        const product = findById('products', pid);
        const offer = db.offers.find((o) => o.productId === pid && o.sellerId === campaign.sellerId);
        return { id: pid, title: product?.title ?? pid, status: product?.status, stock: offer?.stock ?? 0 };
      }),
    }));
    const stats = filter('adDailyStats', (s) => s.campaignId === campaign.id).sort((a, b) => a.date.localeCompare(b.date));

    return ok({ ...campaignRow(campaign), groups, dailyStats: stats });
  }),

  mswHttp.post(`${BASE}/ads/campaigns`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.create');
    if (g.response) return g.response;

    const body = await request.json();
    const seller = findById('sellers', body.sellerId);
    if (!seller) return validationFailed({ sellerId: 'Choose an advertiser.' });
    if (!body.name?.trim()) return validationFailed({ name: 'Give the campaign a name.' });
    if (!body.dailyBudgetPaise || !body.totalBudgetPaise) return validationFailed({ dailyBudgetPaise: 'Set a daily and a total budget.' });
    if (body.totalBudgetPaise < body.dailyBudgetPaise) return validationFailed({ totalBudgetPaise: 'Total budget must be at least the daily budget.' });
    if (!body.productIds?.length) return validationFailed({ productIds: 'Promote at least one product.' });

    const campaign = insert('adCampaigns', {
      id: id('ADC', 5),
      name: body.name.trim(),
      type: 'SPONSORED_PRODUCT',
      sellerId: seller.id,
      sellerName: seller.storeName,
      status: 'DRAFT',
      dailyBudgetPaise: body.dailyBudgetPaise,
      totalBudgetPaise: body.totalBudgetPaise,
      biddingType: body.biddingType ?? 'AUTOMATIC',
      startDate: body.startDate ?? mockNowIso(),
      endDate: body.endDate ?? null,
      pauseReason: null,
      rejectReason: null,
      submittedAt: null,
      decidedByName: null,
      createdAt: mockNowIso(),
      version: 1,
    });
    insert('adGroups', {
      id: id('ADG', 5),
      campaignId: campaign.id,
      name: 'Ad group 1',
      targetingType: body.biddingType === 'AUTOMATIC' ? 'AUTOMATIC' : 'MANUAL',
      defaultBidPaise: body.defaultBidPaise ?? 150,
      productIds: body.productIds,
      keywords: body.keywords ?? [],
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'ads.campaign_create', entityType: 'adCampaign', entityId: campaign.id, entityLabel: campaign.name });
    scheduleSave();
    return created(campaignRow(campaign));
  }),

  /** DRAFT → PENDING_REVIEW. */
  mswHttp.post(`${BASE}/ads/campaigns/:campaignId/submit`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.edit');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!canTransitionCampaign(campaign.status, 'PENDING_REVIEW')) return illegalTransition(campaign.status, 'submit');

    update('adCampaigns', campaign.id, { status: 'PENDING_REVIEW', submittedAt: mockNowIso() });
    scheduleSave();
    return ok(campaignRow(findById('adCampaigns', campaign.id)));
  }),

  /** Admin pause for policy, or the advertiser's own pause — either way, a reason is kept. */
  mswHttp.post(`${BASE}/ads/campaigns/:campaignId/pause`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.pause');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!canTransitionCampaign(campaign.status, 'PAUSED')) return illegalTransition(campaign.status, 'pause');
    const body = await request.json();
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why this campaign is being paused.' });

    update('adCampaigns', campaign.id, { status: 'PAUSED', pauseReason: 'POLICY' });
    writeAudit({ actor: g.user, action: 'ads.campaign_pause', entityType: 'adCampaign', entityId: campaign.id, entityLabel: campaign.name, reason: body.reason });
    scheduleSave();
    return ok(campaignRow(findById('adCampaigns', campaign.id)));
  }),

  mswHttp.post(`${BASE}/ads/campaigns/:campaignId/resume`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.pause');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!canTransitionCampaign(campaign.status, 'ACTIVE')) return illegalTransition(campaign.status, 'resume');
    if (campaign.pauseReason === 'WALLET_EMPTY') {
      const wallet = db.advertiserWallets.find((w) => w.sellerId === campaign.sellerId);
      if (wallet?.fundingMode === 'PREPAID' && (wallet.balancePaise ?? 0) <= 0) {
        return conflict('This advertiser’s wallet is still empty. Recharge it before resuming.', 'WALLET_EMPTY');
      }
    }

    update('adCampaigns', campaign.id, { status: 'ACTIVE', pauseReason: null });
    writeAudit({ actor: g.user, action: 'ads.campaign_resume', entityType: 'adCampaign', entityId: campaign.id, entityLabel: campaign.name });
    scheduleSave();
    return ok(campaignRow(findById('adCampaigns', campaign.id)));
  }),

  mswHttp.post(`${BASE}/ads/campaigns/:campaignId/end`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.pause');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!canTransitionCampaign(campaign.status, 'ENDED')) return illegalTransition(campaign.status, 'end');

    update('adCampaigns', campaign.id, { status: 'ENDED', endDate: mockNowIso() });
    writeAudit({ actor: g.user, action: 'ads.campaign_end', entityType: 'adCampaign', entityId: campaign.id, entityLabel: campaign.name });
    scheduleSave();
    return ok(campaignRow(findById('adCampaigns', campaign.id)));
  }),

  mswHttp.post(`${BASE}/ads/campaigns/:campaignId/archive`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.edit');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!canTransitionCampaign(campaign.status, 'ARCHIVED')) return illegalTransition(campaign.status, 'archive');

    update('adCampaigns', campaign.id, { status: 'ARCHIVED' });
    scheduleSave();
    return ok(campaignRow(findById('adCampaigns', campaign.id)));
  }),

  /**
   * Records a day's delivery stats against a campaign — standing in for
   * the ad server's own reporting pipeline, which in production writes
   * these rows continuously. If the new total reaches the campaign's
   * budget, it pauses itself exactly the way the spec's state machine
   * describes: `BUDGET_EXHAUSTED`, auto-resuming the next day rather than
   * needing a human to notice and click resume.
   */
  mswHttp.post(`${BASE}/ads/campaigns/:campaignId/record-spend`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.campaign.edit');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (campaign.status !== 'ACTIVE') return conflict('Only an active campaign can record spend.', 'ILLEGAL_TRANSITION');

    const body = await request.json();
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const existing = db.adDailyStats.find((s) => s.campaignId === campaign.id && s.date === date);
    const row = existing
      ? update('adDailyStats', existing.id, {
          impressions: existing.impressions + (body.impressions ?? 0),
          clicks: existing.clicks + (body.clicks ?? 0),
          spendPaise: existing.spendPaise + (body.spendPaise ?? 0),
          adOrders: existing.adOrders + (body.adOrders ?? 0),
          adGmvPaise: existing.adGmvPaise + (body.adGmvPaise ?? 0),
        })
      : insert('adDailyStats', {
          id: id('ADS', 7), campaignId: campaign.id, date,
          impressions: body.impressions ?? 0, clicks: body.clicks ?? 0, spendPaise: body.spendPaise ?? 0,
          adOrders: body.adOrders ?? 0, adGmvPaise: body.adGmvPaise ?? 0, version: 1,
        });

    // Ad spend is real money leaving the advertiser's own wallet, not just a
    // number in a reporting table — every call here debits it and leaves a
    // ledger entry, which is also what the monthly invoice is built from.
    const wallet = db.advertiserWallets.find((w) => w.sellerId === campaign.sellerId);
    if (wallet && body.spendPaise) {
      if (wallet.fundingMode === 'PREPAID') {
        update('advertiserWallets', wallet.id, { balancePaise: (wallet.balancePaise ?? 0) - body.spendPaise });
      }
      insert('advertiserLedger', {
        id: id('ADL', 6), walletId: wallet.id, sellerId: campaign.sellerId,
        type: 'SPEND', amountPaise: -body.spendPaise,
        description: `Ad spend — ${campaign.name}`, createdAt: mockNowIso(),
      });
      if (wallet.fundingMode === 'PREPAID' && findById('advertiserWallets', wallet.id).balancePaise <= 0) {
        update('adCampaigns', campaign.id, { status: 'PAUSED', pauseReason: 'WALLET_EMPTY' });
        scheduleSave();
        return ok({ ...campaignRow(findById('adCampaigns', campaign.id)), autoPaused: true });
      }
    }

    const lifetimeSpend = filter('adDailyStats', (s) => s.campaignId === campaign.id).reduce((n, s) => n + s.spendPaise, 0);
    const todaySpend = row.spendPaise;
    const exhausted = lifetimeSpend >= campaign.totalBudgetPaise || todaySpend >= campaign.dailyBudgetPaise;
    if (exhausted) {
      update('adCampaigns', campaign.id, { status: 'PAUSED', pauseReason: 'BUDGET_EXHAUSTED' });
    }
    scheduleSave();
    return ok({ ...campaignRow(findById('adCampaigns', campaign.id)), autoPaused: exhausted });
  }),

  /* -------------------------------------------------------- review queue */
  mswHttp.get(`${BASE}/ads/review`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'ads.review.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-submittedAt' });
    const pending = filter('adCampaigns', (c) => c.status === 'PENDING_REVIEW').map((c) => {
      const groups = filter('adGroups', (grp) => grp.campaignId === c.id);
      const blockedTerms = filter('searchRules', (r) => r.type === 'BLOCKED' && r.active).map((r) => r.term);
      const review = reviewCampaign(c, groups, blockedTerms);
      return { ...campaignRow(c), reviewPassed: review.passed, findings: review.findings };
    });
    const result = listResult(pending, query, {
      searchFields: ['name', 'sellerName'],
      sortable: ['submittedAt'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/ads/review/:campaignId/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.review.decide');
    if (g.response) return g.response;
    const campaign = findById('adCampaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (campaign.status !== 'PENDING_REVIEW') return conflict('This campaign is not awaiting review.', 'ILLEGAL_TRANSITION');

    const body = await request.json();
    if (!['APPROVED', 'REJECTED'].includes(body.decision)) return validationFailed({ decision: 'Approve or reject.' });
    if (body.decision === 'REJECTED' && !body.reason?.trim()) return validationFailed({ reason: 'The advertiser needs a reason.' });

    update('adCampaigns', campaign.id, {
      status: body.decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED',
      rejectReason: body.decision === 'REJECTED' ? body.reason : null,
      decidedByName: g.user.name,
    });
    writeAudit({
      actor: g.user, action: 'ads.review_decide', entityType: 'adCampaign',
      entityId: campaign.id, entityLabel: campaign.name, reason: body.reason,
      metadata: { decision: body.decision },
    });
    scheduleSave();
    return ok(campaignRow(findById('adCampaigns', campaign.id)));
  }),
];
