import { describe, expect, it } from 'vitest';
import { DEFAULT_ARISE_ASSURED, DEFAULT_WEIGHTS, isAriseAssured, rankOffers, weightsSumTo100 } from './buyBox';

describe('weightsSumTo100', () => {
  it('accepts the default weights', () => {
    expect(weightsSumTo100(DEFAULT_WEIGHTS)).toBe(true);
  });

  it('rejects weights that do not sum to 100', () => {
    expect(weightsSumTo100({ ...DEFAULT_WEIGHTS, landedPricePct: 41 })).toBe(false);
  });
});

describe('rankOffers', () => {
  const sellerById = new Map([
    ['SEL-1', { rating: 4.8, cancellationPct: 0.5 }],
    ['SEL-2', { rating: 3.9, cancellationPct: 4 }],
  ]);

  it('excludes offers that are out of stock or not live', () => {
    const offers = [
      { sellerId: 'SEL-1', sellingPricePaise: 100, dispatchSlaHours: 24, fulfillmentType: 'SELLER', stock: 0, status: 'LIVE' },
      { sellerId: 'SEL-2', sellingPricePaise: 110, dispatchSlaHours: 24, fulfillmentType: 'SELLER', stock: 5, status: 'INACTIVE' },
    ];
    expect(rankOffers(offers, sellerById, DEFAULT_WEIGHTS)).toEqual([]);
  });

  it('a cheaper offer can still lose to a slower, lower-rated one if price is weighted low enough', () => {
    const offers = [
      { sellerId: 'SEL-2', sellingPricePaise: 100, dispatchSlaHours: 72, fulfillmentType: 'SELLER', stock: 5, status: 'LIVE' },
      { sellerId: 'SEL-1', sellingPricePaise: 120, dispatchSlaHours: 12, fulfillmentType: 'ARISE', stock: 5, status: 'LIVE' },
    ];
    // Price barely counts; speed, rating, fulfilment and low cancellation all favour SEL-1.
    const priceIrrelevant = { landedPricePct: 5, deliverySpeedPct: 30, sellerRatingPct: 30, fulfillmentTypePct: 25, cancellationRatePct: 10 };
    const ranked = rankOffers(offers, sellerById, priceIrrelevant);
    expect(ranked[0].sellerId).toBe('SEL-1');
    expect(ranked[0].rank).toBe(1);
  });

  it('with price as the only weight, the cheapest eligible offer always wins', () => {
    const offers = [
      { sellerId: 'SEL-2', sellingPricePaise: 100, dispatchSlaHours: 72, fulfillmentType: 'SELLER', stock: 5, status: 'LIVE' },
      { sellerId: 'SEL-1', sellingPricePaise: 120, dispatchSlaHours: 12, fulfillmentType: 'ARISE', stock: 5, status: 'LIVE' },
    ];
    const priceOnly = { landedPricePct: 100, deliverySpeedPct: 0, sellerRatingPct: 0, fulfillmentTypePct: 0, cancellationRatePct: 0 };
    const ranked = rankOffers(offers, sellerById, priceOnly);
    expect(ranked[0].sellerId).toBe('SEL-2');
  });
});

describe('isAriseAssured', () => {
  const rules = DEFAULT_ARISE_ASSURED;

  it('requires Arise fulfilment', () => {
    const offer = { fulfillmentType: 'SELLER' };
    const seller = { rating: 5, returnPct: 0 };
    expect(isAriseAssured(offer, seller, rules)).toBe(false);
  });

  it('requires both the rating floor and the return-rate ceiling', () => {
    const offer = { fulfillmentType: 'ARISE' };
    expect(isAriseAssured(offer, { rating: 4.0, returnPct: 2 }, rules)).toBe(false);
    expect(isAriseAssured(offer, { rating: 4.5, returnPct: 20 }, rules)).toBe(false);
    expect(isAriseAssured(offer, { rating: 4.5, returnPct: 2 }, rules)).toBe(true);
  });
});
