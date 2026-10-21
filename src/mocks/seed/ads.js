import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Sponsored ads (M11). Placements and advertiser wallets come first, since
 * every campaign seeded after them bills against a real wallet and targets
 * a real placement — the same dependency order Phase 4 used for commission
 * rules before settlement lines.
 */

const PLACEMENT_DEFS = [
  ['search_top', 'Search — top of results', 4, [500, 500, 400]],
  ['search_in_grid', 'Search — in-grid', 6, [300, 300, 250]],
  ['pdp_similar', 'Product page — similar products', 3, [250, 250, 200]],
  ['home_sponsored_rail', 'Home — sponsored rail', 8, [350, 350, 300]],
  ['category_page', 'Category page', 4, [280, 280, 230]],
];
const CATEGORY_ROOTS = ['Fashion', 'Electronics', 'Mobiles', 'Beauty', 'Home'];

export function seedAdPlacements() {
  return PLACEMENT_DEFS.map(([key, name, maxAdsPerPage, floorCpcs]) =>
    insert('adPlacements', {
      id: id('APL', 3),
      key,
      name,
      enabled: true,
      maxAdsPerPage,
      positions: Array.from({ length: maxAdsPerPage }, (_, i) => i + 1),
      floorCpcByCategory: Object.fromEntries(CATEGORY_ROOTS.map((c, i) => [c, floorCpcs[i % floorCpcs.length]])),
      adLabelStyle: 'Sponsored',
      qualityWeightPct: 50,
      version: 1,
    }),
  );
}

/** Advertiser wallets — one per active seller, funded either prepaid or deducted from payouts. */
export function seedAdvertiserWallets() {
  const sellers = db.sellers.filter((s) => s.status === 'ACTIVE');
  return sellers.map((seller, i) => {
    const fundingMode = i % 5 === 0 ? 'DEDUCT_FROM_PAYOUT' : 'PREPAID';
    const lowBalance = i % 11 === 0;
    const balance = fundingMode === 'PREPAID'
      ? (lowBalance ? faker.number.int({ min: 0, max: 500 }) * 100 : faker.number.int({ min: 2000, max: 50000 }) * 100)
      : null;

    const wallet = insert('advertiserWallets', {
      id: id('AWL', 4),
      sellerId: seller.id,
      sellerName: seller.storeName,
      fundingMode,
      balancePaise: balance,
      lowBalanceThresholdPaise: 100000,
      createdAt: mockNowIso(),
      version: 1,
    });

    if (fundingMode === 'PREPAID') {
      insert('advertiserLedger', {
        id: id('ADL', 6),
        walletId: wallet.id,
        sellerId: seller.id,
        type: 'RECHARGE',
        amountPaise: (balance ?? 0) + 500000,
        description: 'Initial recharge',
        createdAt: new Date(mockNow() - 20 * 86400_000).toISOString(),
      });
      insert('advertiserLedger', {
        id: id('ADL', 6),
        walletId: wallet.id,
        sellerId: seller.id,
        type: 'SPEND',
        amountPaise: -500000,
        description: 'Ad spend, rolling 20 days',
        createdAt: new Date(mockNow() - 2 * 86400_000).toISOString(),
      });
    }
    return wallet;
  });
}

const CAMPAIGN_STATES = [
  ...Array(2).fill('DRAFT'),
  ...Array(3).fill('PENDING_REVIEW'),
  ...Array(14).fill('ACTIVE'),
  ...Array(4).fill('PAUSED'),
  ...Array(2).fill('REJECTED'),
  ...Array(3).fill('ENDED'),
  ...Array(2).fill('ARCHIVED'),
];
const PAUSE_REASONS = ['ADVERTISER', 'POLICY', 'BUDGET_EXHAUSTED', 'WALLET_EMPTY'];

/** Campaigns, each with one ad group of 2–5 promoted products from that seller's own live catalog. */
export function seedAdCampaigns() {
  const wallets = db.advertiserWallets;
  const campaigns = [];

  CAMPAIGN_STATES.forEach((status, i) => {
    const wallet = wallets[i % wallets.length];
    const sellerOffers = filter('offers', (o) => o.sellerId === wallet.sellerId && o.status === 'LIVE');
    if (!sellerOffers.length) return;

    const dailyBudgetPaise = faker.number.int({ min: 300, max: 3000 }) * 100;
    const totalBudgetPaise = dailyBudgetPaise * faker.number.int({ min: 10, max: 30 });
    const startedDaysAgo = faker.number.int({ min: 5, max: 45 });

    const campaign = insert('adCampaigns', {
      id: id('ADC', 5),
      name: `${wallet.sellerName} — Sponsored Products ${i + 1}`,
      type: 'SPONSORED_PRODUCT',
      sellerId: wallet.sellerId,
      sellerName: wallet.sellerName,
      status,
      dailyBudgetPaise,
      totalBudgetPaise,
      biddingType: i % 4 === 0 ? 'AUTOMATIC' : 'MANUAL_CPC',
      startDate: new Date(mockNow() - startedDaysAgo * 86400_000).toISOString(),
      endDate: ['ENDED', 'ARCHIVED'].includes(status)
        ? new Date(mockNow() - faker.number.int({ min: 1, max: 10 }) * 86400_000).toISOString()
        : null,
      pauseReason: status === 'PAUSED' ? PAUSE_REASONS[i % PAUSE_REASONS.length] : null,
      rejectReason: status === 'REJECTED' ? 'Keywords matched a blocked competitor brand term.' : null,
      submittedAt: status !== 'DRAFT' ? new Date(mockNow() - (startedDaysAgo - 1) * 86400_000).toISOString() : null,
      decidedByName: ['ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED', 'REJECTED'].includes(status) ? 'Tanvi Mehta' : null,
      createdAt: new Date(mockNow() - startedDaysAgo * 86400_000).toISOString(),
      version: 1,
    });
    campaigns.push(campaign);

    const groupProducts = sellerOffers.slice(0, faker.number.int({ min: 2, max: Math.min(5, sellerOffers.length) }));
    const group = insert('adGroups', {
      id: id('ADG', 5),
      campaignId: campaign.id,
      name: 'Ad group 1',
      targetingType: campaign.biddingType === 'AUTOMATIC' ? 'AUTOMATIC' : 'MANUAL',
      defaultBidPaise: faker.number.int({ min: 100, max: 800 }),
      productIds: groupProducts.map((o) => o.productId),
      keywords: campaign.biddingType === 'AUTOMATIC' ? [] : seedKeywords(groupProducts, i),
      version: 1,
    });

    if (['ACTIVE', 'PAUSED', 'ENDED'].includes(status)) {
      seedDailyStats(campaign, group, startedDaysAgo);
    }
  });

  return campaigns;
}

function seedKeywords(offers, seed) {
  const product = db.products.find((p) => p.id === offers[0]?.productId);
  if (!product) return [];
  const words = product.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return words.slice(0, 3).map((term, i) => ({
    term, matchType: ['BROAD', 'PHRASE', 'EXACT'][(seed + i) % 3], bidPaise: faker.number.int({ min: 80, max: 600 }),
  }));
}

/** 14 days of daily stats, with spend naturally capped at the daily budget. */
function seedDailyStats(campaign, group, startedDaysAgo) {
  const days = Math.min(14, startedDaysAgo);
  for (let d = days; d >= 1; d -= 1) {
    const date = new Date(mockNow() - d * 86400_000).toISOString().slice(0, 10);
    const impressions = faker.number.int({ min: 200, max: 8000 });
    const ctr = faker.number.float({ min: 0.3, max: 3.5 }) / 100;
    const clicks = Math.round(impressions * ctr);
    const avgCpc = group.defaultBidPaise * faker.number.float({ min: 0.4, max: 0.9 });
    const spendPaise = Math.min(Math.round(clicks * avgCpc), campaign.dailyBudgetPaise);
    // A fraction of clicks convert; ad GMV is what those orders were worth.
    const adOrders = Math.round(clicks * faker.number.float({ min: 0.02, max: 0.08 }));
    const avgOrderValuePaise = faker.number.int({ min: 400, max: 2500 }) * 100;

    insert('adDailyStats', {
      id: id('ADS', 7),
      campaignId: campaign.id,
      date,
      impressions,
      clicks,
      spendPaise,
      adOrders,
      adGmvPaise: adOrders * avgOrderValuePaise,
      version: 1,
    });
  }
}

/** Invalid traffic: bot/repeat clicks flagged and (mostly) already credited back. */
export function seedInvalidClicks() {
  const active = filter('adCampaigns', (c) => ['ACTIVE', 'PAUSED', 'ENDED'].includes(c.status));
  return active.slice(0, 10).map((campaign, i) => {
    const clickCount = faker.number.int({ min: 5, max: 80 });
    const stats = filter('adDailyStats', (s) => s.campaignId === campaign.id);
    const avgCpc = stats.length ? Math.round(stats.reduce((n, s) => n + s.spendPaise, 0) / Math.max(1, stats.reduce((n, s) => n + s.clicks, 0))) : 150;
    const creditedPaise = clickCount * avgCpc;
    const status = i % 4 === 0 ? 'FLAGGED' : 'CREDITED';

    return insert('invalidClicks', {
      id: id('IVC', 5),
      campaignId: campaign.id,
      sellerId: campaign.sellerId,
      sellerName: campaign.sellerName,
      type: i % 2 === 0 ? 'BOT' : 'REPEAT_CLICK',
      clickCount,
      creditedPaise: status === 'CREDITED' ? creditedPaise : 0,
      status,
      flaggedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 15 }) * 86400_000).toISOString(),
      version: 1,
    });
  });
}

/** Monthly ad invoices, one per seller with prepaid spend this month. */
export function seedAdInvoices() {
  const wallets = filter('advertiserWallets', (w) => w.fundingMode === 'PREPAID');
  return wallets.slice(0, 15).map((wallet) => {
    const spend = filter('advertiserLedger', (l) => l.walletId === wallet.id && l.type === 'SPEND')
      .reduce((n, l) => n + Math.abs(l.amountPaise), 0);
    if (!spend) return null;
    const gst = Math.round(spend * 0.18);

    return insert('adInvoices', {
      id: id('ADI', 6),
      invoiceNo: `ARS/ADS/2026/${wallet.id.replace('AWL-', '')}`,
      sellerId: wallet.sellerId,
      sellerName: wallet.sellerName,
      period: '2026-09',
      spendPaise: spend,
      gstPaise: gst,
      totalPaise: spend + gst,
      issuedAt: new Date(mockNow() - 10 * 86400_000).toISOString(),
      version: 1,
    });
  }).filter(Boolean);
}
