import { db } from '../db/store';
import { resolveAudience } from './segments';
import { mockNow } from './settings';

/**
 * Whether a coupon applies to a given cart, and what it is worth.
 *
 * This is deliberately one function, reused by the "test against a cart"
 * tool in the coupon wizard, the checkout-time application a real backend
 * would run, and the usage report — so a coupon can never show as applicable
 * in the test tool and then be refused at checkout for the same cart.
 *
 * @param {object} coupon
 * @param {object} cart  `{ customerId, items: [{ productId, categoryId, brandId, sellerId, pricePaise, qty }], paymentMethod, platform, fulfillmentType }`
 */
export function evaluateCoupon(coupon, cart) {
  const reasons = [];
  const now = mockNow();

  if (coupon.status !== 'ACTIVE') reasons.push(`Coupon is ${coupon.status.toLowerCase()}, not active`);
  if (new Date(coupon.startsAt).getTime() > now) reasons.push('Coupon has not started yet');
  if (new Date(coupon.endsAt).getTime() < now) reasons.push('Coupon has expired');
  if (coupon.totalRedemptions >= coupon.totalLimit) reasons.push('Total redemption limit reached');
  if (coupon.budgetUsedPaise >= coupon.budgetPaise) reasons.push('Coupon budget is exhausted');

  const customer = db.customers.find((c) => c.id === cart.customerId);
  if (customer) {
    const used = db.couponRedemptions.filter(
      (r) => r.couponId === coupon.id && r.customerId === cart.customerId,
    ).length;
    if (used >= coupon.perUserLimit) reasons.push('You have already used this coupon the maximum number of times');

    if (coupon.audience.type === 'NEW' && customer.ordersCount > 0) {
      reasons.push('Only available on a first order');
    }
    if (coupon.audience.type === 'SEGMENT') {
      const members = new Set(resolveAudience(coupon.audience));
      if (!members.has(customer.id)) reasons.push('Not part of the eligible audience');
    }
    if (coupon.audience.type === 'CUSTOM' && !(coupon.audience.customerIds ?? []).includes(customer.id)) {
      reasons.push('Not on the eligible customer list');
    }
  }

  if (coupon.platforms?.length && cart.platform && !coupon.platforms.includes(cart.platform)) {
    reasons.push(`Not valid on ${cart.platform}`);
  }
  if (coupon.paymentMethods?.length && cart.paymentMethod && !coupon.paymentMethods.includes(cart.paymentMethod)) {
    reasons.push(`Not valid for ${cart.paymentMethod}`);
  }

  // Eligible items are the ones that pass the include/exclude rules; the
  // discount is computed only over these, never over the whole cart.
  const eligibleItems = (cart.items ?? []).filter((item) => itemMatchesScope(coupon.scope, item));
  const eligiblePaise = eligibleItems.reduce((n, i) => n + i.pricePaise * i.qty, 0);
  const cartTotalPaise = (cart.items ?? []).reduce((n, i) => n + i.pricePaise * i.qty, 0);

  if (!eligibleItems.length) reasons.push('No item in the cart is eligible for this coupon');

  const basisPaise = coupon.appliesTo === 'ELIGIBLE_ITEMS' ? eligiblePaise : cartTotalPaise;
  if (basisPaise < coupon.minCartPaise) {
    reasons.push(`Cart must be at least ₹${(coupon.minCartPaise / 100).toLocaleString('en-IN')}`);
  }

  const discountPaise = reasons.length ? 0 : computeDiscount(coupon, basisPaise, eligibleItems);

  return {
    applicable: reasons.length === 0,
    reasons,
    eligibleItemIds: eligibleItems.map((i) => i.productId),
    basisPaise,
    discountPaise,
  };
}

function itemMatchesScope(scope, item) {
  if (!scope) return true;
  const inList = (list, value) => !list?.length || list.includes(value);
  const notExcluded = (list, value) => !list?.length || !list.includes(value);
  return (
    inList(scope.includeCategories, item.categoryId) &&
    notExcluded(scope.excludeCategories, item.categoryId) &&
    inList(scope.includeBrands, item.brandId) &&
    notExcluded(scope.excludeBrands, item.brandId) &&
    inList(scope.includeSellers, item.sellerId) &&
    notExcluded(scope.excludeSellers, item.sellerId) &&
    (!scope.fulfillmentType || scope.fulfillmentType === item.fulfillmentType)
  );
}

function computeDiscount(coupon, basisPaise, eligibleItems) {
  if (coupon.type === 'FLAT') {
    return Math.min(coupon.valuePaise, basisPaise);
  }
  if (coupon.type === 'PERCENT') {
    const raw = Math.round((basisPaise * coupon.valuePct) / 100);
    return coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  }
  if (coupon.type === 'FREE_DELIVERY') {
    // The delivery fee itself is applied by the order total calculator;
    // here the coupon just reports that it waives it.
    return coupon.deliveryFeePaise ?? 4000;
  }
  if (coupon.type === 'BXGY') {
    // Buy X get Y free, same SKU: the cheapest eligible unit beyond X is free.
    const totalQty = eligibleItems.reduce((n, i) => n + i.qty, 0);
    const freeUnits = Math.floor(totalQty / (coupon.buyQty + coupon.getQty)) * coupon.getQty;
    if (!freeUnits) return 0;
    const unitPrices = eligibleItems
      .flatMap((i) => Array(i.qty).fill(i.pricePaise))
      .sort((a, b) => a - b);
    return unitPrices.slice(0, freeUnits).reduce((n, p) => n + p, 0);
  }
  return 0;
}

/** Summarises redemptions for a coupon's performance tab. */
export function couponPerformance(coupon) {
  const redemptions = db.couponRedemptions.filter((r) => r.couponId === coupon.id);
  const newCustomers = new Set(
    redemptions.filter((r) => r.wasFirstOrder).map((r) => r.customerId),
  );
  return {
    redemptions: redemptions.length,
    discountGivenPaise: redemptions.reduce((n, r) => n + r.discountPaise, 0),
    gmvInfluencedPaise: redemptions.reduce((n, r) => n + r.orderTotalPaise, 0),
    newCustomersAcquired: newCustomers.size,
  };
}
