import { db } from '../db/store';

/**
 * Sponsored ads: the campaign state machine, the metrics a campaign row and
 * its reports are built from, and the auction score that decides which ad
 * wins a placement.
 *
 *   DRAFT ─submit─▶ PENDING_REVIEW ─approve─▶ ACTIVE ─▶ PAUSED
 *                          └─reject─▶ REJECTED
 *   ACTIVE ─pause (advertiser | policy | BUDGET_EXHAUSTED | WALLET_EMPTY)─▶ PAUSED
 *   PAUSED ─resume─▶ ACTIVE
 *   ACTIVE ─end date / total budget─▶ ENDED
 *   any ─archive─▶ ARCHIVED
 *
 * Kept pure and separate from the handler for the same reason every other
 * state machine in this panel is: the rules have one home, and a seller's
 * spend cannot silently exceed their own daily budget just because the
 * check lived in two places that drifted apart.
 */
export const CAMPAIGN_TRANSITIONS = {
  DRAFT: ['PENDING_REVIEW', 'ARCHIVED'],
  PENDING_REVIEW: ['ACTIVE', 'REJECTED', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ENDED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ENDED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ENDED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionCampaign(from, to) {
  return (CAMPAIGN_TRANSITIONS[from] ?? []).includes(to);
}

/** Pause reasons that resume automatically rather than needing a human to click resume. */
export const AUTO_RESUMABLE_PAUSE_REASONS = ['BUDGET_EXHAUSTED'];

/**
 * What the ad review queue checks before a campaign can go live: every
 * promoted product must be LIVE and in stock, and no keyword may match a
 * blocked term (competitor brand names, prohibited claims).
 */
export function reviewCampaign(campaign, groups, blockedTerms = []) {
  const findings = [];

  for (const group of groups) {
    for (const productId of group.productIds) {
      const product = db.products.find((p) => p.id === productId);
      if (!product || product.status !== 'LIVE') {
        findings.push({ type: 'PRODUCT_NOT_LIVE', groupId: group.id, productId, detail: product?.title ?? productId });
        continue;
      }
      const offer = db.offers.find((o) => o.productId === productId && o.status === 'LIVE' && o.stock > 0);
      if (!offer) {
        findings.push({ type: 'PRODUCT_OUT_OF_STOCK', groupId: group.id, productId, detail: product.title });
      }
    }
    for (const kw of group.keywords ?? []) {
      const lower = kw.term.toLowerCase();
      const blocked = blockedTerms.find((b) => lower.includes(b.toLowerCase()));
      if (blocked) {
        findings.push({ type: 'BLOCKED_KEYWORD', groupId: group.id, detail: `"${kw.term}" matches blocked term "${blocked}"` });
      }
    }
  }

  return { passed: findings.length === 0, findings };
}

/** Rolls up a campaign's daily stats into the figures its list row and detail page show. */
export function summariseCampaignStats(rows) {
  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spendPaise: acc.spendPaise + r.spendPaise,
      adOrders: acc.adOrders + r.adOrders,
      adGmvPaise: acc.adGmvPaise + r.adGmvPaise,
    }),
    { impressions: 0, clicks: 0, spendPaise: 0, adOrders: 0, adGmvPaise: 0 },
  );
  return {
    ...totals,
    ctrPct: totals.impressions ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
    avgCpcPaise: totals.clicks ? Math.round(totals.spendPaise / totals.clicks) : 0,
    // Return on ad spend: every rupee of ad spend bought how many rupees of
    // GMV. Below 1 means the campaign is losing money on its own ads.
    roas: totals.spendPaise ? Number((totals.adGmvPaise / totals.spendPaise).toFixed(2)) : 0,
  };
}

/**
 * Second-price auction with a quality-score weight: the highest
 * (bid × quality) wins, but only pays one paisa more than whatever the
 * second-highest scoring bidder would have needed to beat them — the
 * mechanism that keeps an advertiser from needing to guess the exact
 * minimum winning bid.
 */
export function rankAuction(bidders, qualityWeightPct) {
  const w = qualityWeightPct / 100;
  const scored = bidders.map((b) => ({
    ...b,
    // Quality score blends relevance and historical CTR; both are 0–1.
    qualityScore: b.relevance * (1 - w) + b.ctr * w,
    score: b.bidPaise * (b.relevance * (1 - w) + b.ctr * w),
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.map((b, i) => {
    const next = scored[i + 1];
    const clearingPricePaise = next ? Math.ceil((next.score / b.qualityScore) + 1) : b.bidPaise;
    return { ...b, rank: i + 1, clearingPricePaise: Math.min(b.bidPaise, clearingPricePaise) };
  });
}
