import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  created,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { summariseCampaignStats } from '../engine/ads';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Placements & pricing, advertiser billing, invalid traffic and ads reports (M11.3–M11.6). */

export const adsConfigHandlers = [
  /* ---------------------------------------------------------- placements */
  mswHttp.get(`${BASE}/ads/placements`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'ads.placement.view');
    if (g.response) return g.response;
    return ok(db.adPlacements);
  }),

  mswHttp.patch(`${BASE}/ads/placements/:placementId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.placement.view');
    if (g.response) return g.response;
    const placement = findById('adPlacements', params.placementId);
    if (!placement) return notFound('That placement no longer exists.');
    const body = await request.json();

    // Enabled/visible toggles and the ad-label style are low-risk display
    // settings; only the floor price touches what every advertiser pays,
    // which is why only that field is routed through maker-checker below.
    if (body.floorCpcByCategory !== undefined) {
      if (!body.reason?.trim()) return validationFailed({ reason: 'Say why the floor price is changing.' });
      const approval = createApproval({
        actionKey: 'ads.placement.edit', actor: g.user,
        entityType: 'adPlacement', entityId: placement.id, entityLabel: placement.name,
        reason: body.reason, summary: `Change floor CPC for ${placement.name}`,
        payload: { placementId: placement.id, floorCpcByCategory: body.floorCpcByCategory },
        execute: () => {
          update('adPlacements', placement.id, { floorCpcByCategory: body.floorCpcByCategory });
          scheduleSave();
        },
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    const patch = {};
    for (const key of ['enabled', 'maxAdsPerPage', 'adLabelStyle', 'qualityWeightPct']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (!Object.keys(patch).length) return validationFailed({ placement: 'Nothing to change.' });
    update('adPlacements', placement.id, patch);
    writeAudit({ actor: g.user, action: 'ads.placement_edit', entityType: 'adPlacement', entityId: placement.id, entityLabel: placement.name, metadata: patch });
    scheduleSave();
    return ok(findById('adPlacements', placement.id));
  }),

  /* -------------------------------------------------------------- billing */
  mswHttp.get(`${BASE}/ads/billing/wallets`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'ads.billing.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: 'balancePaise' });
    const rows = db.advertiserWallets.map((w) => ({
      ...w,
      lowBalance: w.fundingMode === 'PREPAID' && (w.balancePaise ?? 0) < w.lowBalanceThresholdPaise,
    }));
    const result = listResult(rows, query, {
      searchFields: ['sellerName'],
      filterSpec: { fundingMode: 'fundingMode', lowBalance: { path: 'lowBalance', kind: 'boolean' } },
      sortable: ['balancePaise', 'sellerName'],
      facetFields: ['fundingMode'],
    });
    return okList(result.items, {
      ...result.meta,
      summary: { lowBalanceCount: rows.filter((w) => w.lowBalance).length },
    });
  }),

  mswHttp.get(`${BASE}/ads/billing/wallets/:walletId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.billing.view');
    if (g.response) return g.response;
    const wallet = findById('advertiserWallets', params.walletId);
    if (!wallet) return notFound('That advertiser wallet no longer exists.');
    return ok({
      ...wallet,
      ledger: filter('advertiserLedger', (l) => l.walletId === wallet.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      invoices: filter('adInvoices', (inv) => inv.sellerId === wallet.sellerId),
    });
  }),

  mswHttp.post(`${BASE}/ads/billing/wallets/:walletId/recharge`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.billing.credit');
    if (g.response) return g.response;
    const wallet = findById('advertiserWallets', params.walletId);
    if (!wallet) return notFound('That advertiser wallet no longer exists.');
    if (wallet.fundingMode !== 'PREPAID') return conflict('This advertiser is billed by payout deduction, not a prepaid wallet.', 'NOT_PREPAID');
    const body = await request.json();
    if (!(body.amountPaise > 0)) return validationFailed({ amountPaise: 'Enter an amount.' });

    update('advertiserWallets', wallet.id, { balancePaise: (wallet.balancePaise ?? 0) + body.amountPaise });
    insert('advertiserLedger', {
      id: id('ADL', 6), walletId: wallet.id, sellerId: wallet.sellerId,
      type: 'RECHARGE', amountPaise: body.amountPaise, description: body.note ?? 'Manual recharge', createdAt: mockNowIso(),
    });
    writeAudit({ actor: g.user, action: 'ads.wallet_recharge', entityType: 'advertiserWallet', entityId: wallet.id, entityLabel: wallet.sellerName, metadata: { amountPaise: body.amountPaise } });
    scheduleSave();
    return ok(findById('advertiserWallets', wallet.id));
  }),

  /** Generates a monthly invoice for a seller from their prepaid spend this period. */
  mswHttp.post(`${BASE}/ads/billing/invoices/generate`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'ads.billing.credit');
    if (g.response) return g.response;
    const body = await request.json();
    const wallet = findById('advertiserWallets', body.walletId);
    if (!wallet) return validationFailed({ walletId: 'Choose an advertiser wallet.' });
    if (wallet.fundingMode !== 'PREPAID') return conflict('Payout-deducted advertisers are settled through the seller payout, not a separate invoice.', 'NOT_PREPAID');

    const periodStart = body.periodStart ? new Date(body.periodStart).getTime() : 0;
    const periodEnd = body.periodEnd ? new Date(body.periodEnd).getTime() : Date.now();
    const spend = filter(
      'advertiserLedger',
      (l) => l.walletId === wallet.id && l.type === 'SPEND'
        && new Date(l.createdAt).getTime() >= periodStart && new Date(l.createdAt).getTime() <= periodEnd,
    ).reduce((n, l) => n + Math.abs(l.amountPaise), 0);
    if (!spend) return conflict('No spend recorded for this advertiser in that period.', 'NOTHING_TO_INVOICE');

    const gst = Math.round(spend * 0.18);
    const invoiceId = id('ADI', 6);
    const invoice = insert('adInvoices', {
      id: invoiceId,
      invoiceNo: `ARS/ADS/${new Date().getFullYear()}/${invoiceId.replace('ADI-', '')}`,
      sellerId: wallet.sellerId,
      sellerName: wallet.sellerName,
      period: body.period ?? new Date().toISOString().slice(0, 7),
      spendPaise: spend,
      gstPaise: gst,
      totalPaise: spend + gst,
      issuedAt: mockNowIso(),
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'ads.invoice_generate', entityType: 'adInvoice', entityId: invoice.id, entityLabel: invoice.sellerName, metadata: { totalPaise: invoice.totalPaise } });
    scheduleSave();
    return created(invoice);
  }),

  mswHttp.get(`${BASE}/ads/billing/invoices`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'ads.billing.view');
    if (g.response) return g.response;
    const query = parseListQuery(url, { defaultSort: '-issuedAt' });
    const result = listResult(db.adInvoices, query, { searchFields: ['invoiceNo', 'sellerName'], sortable: ['issuedAt', 'totalPaise'] });
    return okList(result.items, result.meta);
  }),

  /* ----------------------------------------------------------- invalid traffic */
  mswHttp.get(`${BASE}/ads/invalid-clicks`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'ads.billing.view');
    if (g.response) return g.response;
    const query = parseListQuery(url, { defaultSort: '-flaggedAt' });
    const result = listResult(db.invalidClicks, query, {
      searchFields: ['sellerName'],
      filterSpec: { status: 'status', type: 'type' },
      sortable: ['flaggedAt', 'clickCount', 'creditedPaise'],
      facetFields: ['status', 'type'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/ads/invalid-clicks/:clickId/credit`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'ads.billing.credit');
    if (g.response) return g.response;
    const row = findById('invalidClicks', params.clickId);
    if (!row) return notFound('That flagged traffic no longer exists.');
    if (row.status === 'CREDITED') return conflict('Already credited.', 'NO_CHANGE');
    const body = await request.json();
    if (!(body.amountPaise > 0)) return validationFailed({ amountPaise: 'Enter a credit amount.' });

    const wallet = db.advertiserWallets.find((w) => w.sellerId === row.sellerId);
    if (wallet?.fundingMode === 'PREPAID') {
      update('advertiserWallets', wallet.id, { balancePaise: (wallet.balancePaise ?? 0) + body.amountPaise });
      insert('advertiserLedger', {
        id: id('ADL', 6), walletId: wallet.id, sellerId: row.sellerId,
        type: 'INVALID_CLICK_CREDIT', amountPaise: body.amountPaise,
        description: `Invalid traffic credit — ${row.type.toLowerCase().replace('_', ' ')}`, createdAt: mockNowIso(),
      });
    }
    update('invalidClicks', row.id, { status: 'CREDITED', creditedPaise: body.amountPaise });
    writeAudit({ actor: g.user, action: 'ads.invalid_click_credit', entityType: 'invalidClick', entityId: row.id, entityLabel: row.sellerName, metadata: { amountPaise: body.amountPaise } });
    scheduleSave();
    return ok(findById('invalidClicks', row.id));
  }),

  /* ------------------------------------------------------------------ reports */
  mswHttp.get(`${BASE}/ads/reports`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'ads.report.view');
    if (g.response) return g.response;

    const byDate = {};
    for (const stat of db.adDailyStats) {
      (byDate[stat.date] ??= []).push(stat);
    }
    const series = Object.entries(byDate)
      .map(([date, rows]) => ({ date, ...summariseCampaignStats(rows) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byAdvertiser = {};
    for (const campaign of db.adCampaigns) {
      const stats = db.adDailyStats.filter((s) => s.campaignId === campaign.id);
      if (!stats.length) continue;
      const totals = summariseCampaignStats(stats);
      (byAdvertiser[campaign.sellerId] ??= { sellerName: campaign.sellerName, spendPaise: 0, adGmvPaise: 0 });
      byAdvertiser[campaign.sellerId].spendPaise += totals.spendPaise;
      byAdvertiser[campaign.sellerId].adGmvPaise += totals.adGmvPaise;
    }
    const topAdvertisers = Object.values(byAdvertiser).sort((a, b) => b.spendPaise - a.spendPaise).slice(0, 10);

    const fillRateByPlacement = db.adPlacements.map((p) => ({
      placement: p.name,
      // A placement "fills" when there was at least one eligible active
      // campaign to serve into it; approximated here from overall demand.
      fillRatePct: Number((Math.min(1, db.adCampaigns.filter((c) => c.status === 'ACTIVE').length / (p.maxAdsPerPage * 3)) * 100).toFixed(1)),
    }));

    const platformTotals = summariseCampaignStats(db.adDailyStats);

    return ok({ series, topAdvertisers, fillRateByPlacement, platformRevenuePaise: platformTotals.spendPaise, platformTotals });
  }),
];
