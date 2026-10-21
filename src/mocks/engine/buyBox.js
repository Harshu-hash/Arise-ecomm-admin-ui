/**
 * Buy-box & badge rules (M3.9): which offer wins the buy box, and which
 * offers earn the Arise Assured badge, are each one pure function so the
 * rules page's own "simulate on product" tool can never disagree with what
 * actually gets published.
 */

export const DEFAULT_WEIGHTS = {
  landedPricePct: 40,
  deliverySpeedPct: 20,
  sellerRatingPct: 20,
  fulfillmentTypePct: 10,
  cancellationRatePct: 10,
};

export const DEFAULT_ARISE_ASSURED = {
  minSellerRating: 4.3,
  maxReturnRatePct: 8,
};

export function weightsSumTo100(weights) {
  return Math.round(Object.values(weights).reduce((a, b) => a + b, 0)) === 100;
}

/** 1 when `value` is the lowest of `values` (cheaper / faster is better), 0 when it's the highest, interpolated between. */
function scoreLowerIsBetter(values, value) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 1;
  return 1 - (value - min) / (max - min);
}

/**
 * Scores one offer against the full set of offers it is competing with
 * (needed to normalise price and delivery speed relative to its rivals).
 */
export function scoreOffer(offer, rivalOffers, seller, weights) {
  const prices = rivalOffers.map((o) => o.sellingPricePaise);
  const slas = rivalOffers.map((o) => o.dispatchSlaHours);

  const priceScore = scoreLowerIsBetter(prices, offer.sellingPricePaise);
  const speedScore = scoreLowerIsBetter(slas, offer.dispatchSlaHours);
  const ratingScore = Math.min(1, (seller?.rating ?? 0) / 5);
  const fulfillmentScore = offer.fulfillmentType === 'ARISE' ? 1 : 0;
  const cancellationScore = Math.max(0, 1 - (seller?.cancellationPct ?? 0) / 100);

  const breakdown = {
    priceScore, speedScore, ratingScore, fulfillmentScore, cancellationScore,
  };
  const score =
    (weights.landedPricePct / 100) * priceScore +
    (weights.deliverySpeedPct / 100) * speedScore +
    (weights.sellerRatingPct / 100) * ratingScore +
    (weights.fulfillmentTypePct / 100) * fulfillmentScore +
    (weights.cancellationRatePct / 100) * cancellationScore;

  return { ...breakdown, score };
}

/**
 * Ranks every in-stock, live offer for one variant. The first row is the
 * buy-box winner. `sellerById` is a `Map` so callers can pass only the
 * sellers the offers actually reference.
 */
export function rankOffers(offers, sellerById, weights) {
  const eligible = offers.filter((o) => o.stock > 0 && o.status === 'LIVE');
  if (!eligible.length) return [];

  return eligible
    .map((o) => ({ ...o, ...scoreOffer(o, eligible, sellerById.get(o.sellerId), weights) }))
    .sort((a, b) => b.score - a.score)
    .map((o, i) => ({ ...o, rank: i + 1 }));
}

/** Fulfilled by Arise, with a seller rating and return rate inside the published thresholds. */
export function isAriseAssured(offer, seller, rules) {
  if (offer.fulfillmentType !== 'ARISE') return false;
  if ((seller?.rating ?? 0) < rules.minSellerRating) return false;
  if ((seller?.returnPct ?? Infinity) > rules.maxReturnRatePct) return false;
  return true;
}
