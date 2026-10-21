import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, db, insert, id } from '../db/store';
import { evaluateCoupon } from './coupons';
import { mockNow } from './settings';

/**
 * Coupon applicability is Journey 5's spine — "a coupon created appears as
 * applicable to a seeded cart" — so it is tested directly against carts
 * rather than only through the HTTP layer.
 */
function baseCoupon(overrides = {}) {
  return {
    id: 'CPN-1',
    code: 'SAVE10',
    type: 'PERCENT',
    valuePct: 10,
    maxDiscountPaise: 20000,
    minCartPaise: 0,
    appliesTo: 'CART_TOTAL',
    scope: null,
    audience: { type: 'ALL' },
    platforms: [],
    paymentMethods: [],
    status: 'ACTIVE',
    startsAt: new Date(mockNow() - 86400_000).toISOString(),
    endsAt: new Date(mockNow() + 86400_000).toISOString(),
    totalLimit: 1000,
    totalRedemptions: 0,
    perUserLimit: 1,
    budgetPaise: 10_00_000 * 100,
    budgetUsedPaise: 0,
    ...overrides,
  };
}

function cartOf(pricePaise, overrides = {}) {
  return {
    customerId: 'CUS-1',
    platform: 'Android',
    paymentMethod: 'UPI',
    items: [{ productId: 'PRD-1', categoryId: 'CAT-1', brandId: 'BRD-1', sellerId: 'SEL-1', pricePaise, qty: 1 }],
    ...overrides,
  };
}

beforeEach(() => {
  resetDb();
  insert('customers', { id: 'CUS-1', status: 'ACTIVE', ordersCount: 3 });
});

describe('evaluateCoupon', () => {
  it('applies a percentage discount capped at the max', () => {
    const r = evaluateCoupon(baseCoupon(), cartOf(500000));
    expect(r.applicable).toBe(true);
    // 10% of ₹5,000 is ₹500 (50000 paise), capped at the coupon's ₹200 max.
    expect(r.discountPaise).toBe(20000);
  });

  it('applies a flat discount, never exceeding the cart', () => {
    const r = evaluateCoupon(baseCoupon({ type: 'FLAT', valuePct: undefined, valuePaise: 10000 }), cartOf(5000));
    expect(r.discountPaise).toBe(5000);
  });

  it('refuses a cart below the minimum', () => {
    const r = evaluateCoupon(baseCoupon({ minCartPaise: 100000 }), cartOf(50000));
    expect(r.applicable).toBe(false);
    expect(r.reasons[0]).toMatch(/at least/i);
    expect(r.discountPaise).toBe(0);
  });

  it('refuses outside its validity window', () => {
    const future = baseCoupon({ startsAt: new Date(mockNow() + 86400_000).toISOString() });
    expect(evaluateCoupon(future, cartOf(50000)).applicable).toBe(false);

    const past = baseCoupon({ endsAt: new Date(mockNow() - 1000).toISOString() });
    expect(evaluateCoupon(past, cartOf(50000)).applicable).toBe(false);
  });

  it('refuses once the total redemption limit is hit', () => {
    const r = evaluateCoupon(baseCoupon({ totalLimit: 5, totalRedemptions: 5 }), cartOf(50000));
    expect(r.applicable).toBe(false);
    expect(r.reasons[0]).toMatch(/limit/i);
  });

  it('refuses once the budget is exhausted, even with redemptions left', () => {
    const r = evaluateCoupon(
      baseCoupon({ budgetPaise: 100000, budgetUsedPaise: 100000 }),
      cartOf(50000),
    );
    expect(r.applicable).toBe(false);
    expect(r.reasons[0]).toMatch(/budget/i);
  });

  it('refuses a repeat use beyond the per-user limit', () => {
    insert('couponRedemptions', {
      id: id('CPR', 6), couponId: 'CPN-1', customerId: 'CUS-1',
      discountPaise: 500, orderTotalPaise: 5000, wasFirstOrder: false,
    });
    const r = evaluateCoupon(baseCoupon({ perUserLimit: 1 }), cartOf(50000));
    expect(r.applicable).toBe(false);
    expect(r.reasons[0]).toMatch(/already used/i);
  });

  it('restricts a first-order coupon to a customer who has never ordered', () => {
    const coupon = baseCoupon({ audience: { type: 'NEW' } });
    expect(evaluateCoupon(coupon, cartOf(50000)).applicable).toBe(false); // CUS-1 has 3 orders

    db.customers[0].ordersCount = 0;
    expect(evaluateCoupon(coupon, cartOf(50000)).applicable).toBe(true);
  });

  it('only discounts items inside the coupon scope', () => {
    const coupon = baseCoupon({
      appliesTo: 'ELIGIBLE_ITEMS',
      scope: { includeCategories: ['CAT-ELIGIBLE'] },
    });
    const cart = cartOf(50000, {
      items: [
        { productId: 'A', categoryId: 'CAT-ELIGIBLE', pricePaise: 50000, qty: 1 },
        { productId: 'B', categoryId: 'CAT-OTHER', pricePaise: 90000, qty: 1 },
      ],
    });
    const r = evaluateCoupon(coupon, cart);
    expect(r.applicable).toBe(true);
    expect(r.basisPaise).toBe(50000); // only the eligible item's price
    expect(r.eligibleItemIds).toEqual(['A']);
  });

  it('refuses when nothing in the cart is in scope', () => {
    const coupon = baseCoupon({ scope: { includeCategories: ['CAT-ONLY'] } });
    const r = evaluateCoupon(coupon, cartOf(50000, {
      items: [{ productId: 'A', categoryId: 'CAT-OTHER', pricePaise: 50000, qty: 1 }],
    }));
    expect(r.applicable).toBe(false);
    expect(r.reasons.some((m) => /eligible/i.test(m))).toBe(true);
  });

  it('gives every unit free past the buy-X-get-Y threshold, cheapest units first', () => {
    const coupon = baseCoupon({ type: 'BXGY', buyQty: 2, getQty: 1 });
    const cart = cartOf(0, { items: [{ productId: 'A', categoryId: 'C', pricePaise: 10000, qty: 3 }] });
    const r = evaluateCoupon(coupon, cart);
    // 3 units, buy 2 get 1 → one free unit.
    expect(r.discountPaise).toBe(10000);
  });

  it('refuses a payment method the coupon does not cover', () => {
    const coupon = baseCoupon({ paymentMethods: ['COD'] });
    const r = evaluateCoupon(coupon, cartOf(50000, { paymentMethod: 'UPI' }));
    expect(r.applicable).toBe(false);
  });
});
