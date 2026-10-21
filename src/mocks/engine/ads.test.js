import { beforeEach, describe, expect, it } from 'vitest';
import { insert, resetDb } from '../db/store';
import { canTransitionCampaign, rankAuction, reviewCampaign, summariseCampaignStats } from './ads';

beforeEach(() => resetDb());

describe('canTransitionCampaign', () => {
  it('allows the documented transitions only', () => {
    expect(canTransitionCampaign('DRAFT', 'PENDING_REVIEW')).toBe(true);
    expect(canTransitionCampaign('PENDING_REVIEW', 'ACTIVE')).toBe(true);
    expect(canTransitionCampaign('PENDING_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransitionCampaign('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionCampaign('PAUSED', 'ACTIVE')).toBe(true);
    expect(canTransitionCampaign('REJECTED', 'ACTIVE')).toBe(false);
    expect(canTransitionCampaign('ENDED', 'ACTIVE')).toBe(false);
    expect(canTransitionCampaign('ARCHIVED', 'ACTIVE')).toBe(false);
  });
});

describe('reviewCampaign', () => {
  function group(overrides) {
    return { id: 'GRP-1', productIds: [], keywords: [], ...overrides };
  }

  it('passes a group whose products are all live and in stock', () => {
    insert('products', { id: 'P1', status: 'LIVE', title: 'Shoe' });
    insert('offers', { id: 'O1', productId: 'P1', status: 'LIVE', stock: 10 });
    const r = reviewCampaign({}, [group({ productIds: ['P1'] })]);
    expect(r.passed).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('flags a product that is not live', () => {
    insert('products', { id: 'P1', status: 'QC_PENDING', title: 'Shoe' });
    const r = reviewCampaign({}, [group({ productIds: ['P1'] })]);
    expect(r.passed).toBe(false);
    expect(r.findings[0].type).toBe('PRODUCT_NOT_LIVE');
  });

  it('flags a live product with no live, in-stock offer', () => {
    insert('products', { id: 'P1', status: 'LIVE', title: 'Shoe' });
    insert('offers', { id: 'O1', productId: 'P1', status: 'LIVE', stock: 0 });
    const r = reviewCampaign({}, [group({ productIds: ['P1'] })]);
    expect(r.passed).toBe(false);
    expect(r.findings[0].type).toBe('PRODUCT_OUT_OF_STOCK');
  });

  it('flags a keyword that matches a blocked term', () => {
    const r = reviewCampaign({}, [group({ keywords: [{ term: 'nike running shoes', matchType: 'BROAD' }] })], ['nike']);
    expect(r.passed).toBe(false);
    expect(r.findings[0].type).toBe('BLOCKED_KEYWORD');
  });

  it('an empty campaign with no groups passes trivially', () => {
    expect(reviewCampaign({}, []).passed).toBe(true);
  });
});

describe('summariseCampaignStats', () => {
  it('computes CTR, average CPC and ROAS from raw totals', () => {
    const rows = [
      { impressions: 1000, clicks: 20, spendPaise: 10000, adOrders: 2, adGmvPaise: 40000 },
      { impressions: 2000, clicks: 30, spendPaise: 15000, adOrders: 3, adGmvPaise: 60000 },
    ];
    const s = summariseCampaignStats(rows);
    expect(s.impressions).toBe(3000);
    expect(s.clicks).toBe(50);
    expect(s.ctrPct).toBe(1.67);
    expect(s.avgCpcPaise).toBe(500);
    expect(s.roas).toBe(4);
  });

  it('returns zeroes for no stats rather than dividing by zero', () => {
    const s = summariseCampaignStats([]);
    expect(s.ctrPct).toBe(0);
    expect(s.avgCpcPaise).toBe(0);
    expect(s.roas).toBe(0);
  });
});

describe('rankAuction', () => {
  it('a lower bid can outrank a higher one on quality', () => {
    const ranked = rankAuction(
      [
        { id: 'A', bidPaise: 500, relevance: 0.5, ctr: 0.01 },
        { id: 'B', bidPaise: 1000, relevance: 0.1, ctr: 0.01 },
      ],
      50,
    );
    expect(ranked[0].id).toBe('A');
  });

  it('never charges more than the bidder’s own bid', () => {
    const ranked = rankAuction([{ id: 'A', bidPaise: 500, relevance: 0.9, ctr: 0.05 }], 50);
    expect(ranked[0].clearingPricePaise).toBeLessThanOrEqual(500);
  });

  it('the winner pays based on the runner-up, not their own full bid', () => {
    const ranked = rankAuction(
      [
        { id: 'A', bidPaise: 1000, relevance: 0.8, ctr: 0.05 },
        { id: 'B', bidPaise: 200, relevance: 0.8, ctr: 0.05 },
      ],
      50,
    );
    expect(ranked[0].clearingPricePaise).toBeLessThan(1000);
    expect(ranked[0].clearingPricePaise).toBeGreaterThanOrEqual(200);
  });
});
