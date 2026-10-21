import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { couponPerformance, evaluateCoupon } from '../engine/coupons';
import { diffOf, writeAudit } from '../engine/audit';
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
  versionConflict,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Coupons (M10.1) — the spine of Journey 5: a coupon created here has to
 * appear as applicable to a seeded cart and its usage has to show up in the
 * report, through the exact same `evaluateCoupon` the test tool uses.
 */

function budgetBurnPct(coupon) {
  return coupon.budgetPaise ? Math.round((coupon.budgetUsedPaise / coupon.budgetPaise) * 100) : 0;
}

function derivedStatus(coupon) {
  const now = mockNow();
  if (coupon.status === 'DRAFT' || coupon.status === 'PAUSED') return coupon.status;
  if (new Date(coupon.endsAt).getTime() < now) return 'EXPIRED';
  if (coupon.totalRedemptions >= coupon.totalLimit || coupon.budgetUsedPaise >= coupon.budgetPaise) return 'EXHAUSTED';
  if (new Date(coupon.startsAt).getTime() > now) return 'SCHEDULED';
  return 'ACTIVE';
}

function couponRow(coupon) {
  // Status is partly derived (expiry, exhaustion) so the list is never stale
  // just because nobody opened the record since it lapsed.
  const status = derivedStatus(coupon);
  if (status !== coupon.status && !['DRAFT', 'PAUSED'].includes(coupon.status)) {
    update('coupons', coupon.id, { status });
  }
  return { ...coupon, status, budgetBurnPct: budgetBurnPct(coupon) };
}

export const couponHandlers = [
  mswHttp.get(`${BASE}/coupons`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.coupon.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const rows = db.coupons.map(couponRow);
    const result = listResult(rows, query, {
      searchFields: ['code', 'name'],
      filterSpec: { status: 'status', type: 'type', fundedBy: 'fundedBy' },
      sortable: ['createdAt', 'startsAt', 'endsAt', 'totalRedemptions', 'budgetBurnPct'],
      facetFields: ['status', 'type'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/coupons/:couponId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.view');
    if (g.response) return g.response;

    const coupon = findById('coupons', params.couponId);
    if (!coupon) return notFound('That coupon no longer exists.');

    return ok({
      ...couponRow(coupon),
      performance: couponPerformance(coupon),
      redemptions: filter('couponRedemptions', (r) => r.couponId === coupon.id).slice(0, 50),
    });
  }),

  mswHttp.post(`${BASE}/coupons`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.create');
    if (g.response) return g.response;

    const body = await request.json();
    const errors = {};
    if (!body.code?.trim()) errors.code = 'Give the coupon a code.';
    else if (db.coupons.some((c) => c.code.toUpperCase() === body.code.trim().toUpperCase())) {
      errors.code = 'That code is already in use.';
    }
    if (!body.name?.trim()) errors.name = 'Give the coupon a name customers will see.';
    if (!['FLAT', 'PERCENT', 'FREE_DELIVERY', 'BXGY'].includes(body.type)) errors.type = 'Choose a discount type.';
    if (body.type === 'PERCENT' && !(body.valuePct > 0 && body.valuePct <= 100)) errors.valuePct = 'Enter 1–100%.';
    if (body.type === 'FLAT' && !(body.valuePaise > 0)) errors.valuePaise = 'Enter an amount.';
    if (!body.startsAt || !body.endsAt) errors.startsAt = 'Set a validity window.';
    else if (new Date(body.startsAt) >= new Date(body.endsAt)) errors.endsAt = 'Must end after it starts.';
    if (!body.totalLimit) errors.totalLimit = 'Set a total redemption limit.';
    if (!body.budgetPaise) errors.budgetPaise = 'Set a budget cap.';
    if (Object.keys(errors).length) return validationFailed(errors);

    const coupon = insert('coupons', {
      id: id('CPN', 5),
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      description: body.description ?? '',
      terms: body.terms ?? '',
      type: body.type,
      valuePct: body.valuePct ?? null,
      valuePaise: body.valuePaise ?? null,
      buyQty: body.buyQty ?? null,
      getQty: body.getQty ?? null,
      maxDiscountPaise: body.maxDiscountPaise ?? null,
      deliveryFeePaise: body.deliveryFeePaise ?? null,
      minCartPaise: body.minCartPaise ?? 0,
      appliesTo: body.appliesTo ?? 'CART_TOTAL',
      scope: body.scope ?? null,
      audience: body.audience ?? { type: 'ALL' },
      platforms: body.platforms ?? [],
      paymentMethods: body.paymentMethods ?? [],
      fundedBy: body.fundedBy ?? 'ARISE',
      coFundedPct: body.fundedBy === 'CO_FUNDED' ? body.coFundedPct ?? 50 : null,
      stackable: Boolean(body.stackable),
      visibility: body.visibility ?? 'PUBLIC',
      totalLimit: body.totalLimit,
      totalRedemptions: 0,
      perUserLimit: body.perUserLimit ?? 1,
      budgetPaise: body.budgetPaise,
      budgetUsedPaise: 0,
      status: new Date(body.startsAt).getTime() > mockNow() ? 'SCHEDULED' : 'ACTIVE',
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'coupon.create', entityType: 'coupon',
      entityId: coupon.id, entityLabel: coupon.code,
      metadata: { type: coupon.type, fundedBy: coupon.fundedBy },
    });
    scheduleSave();
    return created(couponRow(coupon));
  }),

  mswHttp.patch(`${BASE}/coupons/:couponId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const coupon = findById('coupons', params.couponId);
    if (!coupon) return notFound('That coupon no longer exists.');
    if (body.version !== undefined && body.version !== coupon.version) return versionConflict(coupon);
    if (['EXPIRED', 'EXHAUSTED'].includes(derivedStatus(coupon))) {
      return conflict('This coupon has already ended. Clone it to run a new one.', 'ILLEGAL_TRANSITION');
    }

    const before = { ...coupon };
    const patch = {};
    for (const key of [
      'name', 'description', 'terms', 'minCartPaise', 'scope', 'audience', 'platforms',
      'paymentMethods', 'stackable', 'visibility', 'totalLimit', 'perUserLimit', 'budgetPaise', 'endsAt',
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('coupons', coupon.id, patch);
    writeAudit({
      actor: g.user, action: 'coupon.edit', entityType: 'coupon',
      entityId: coupon.id, entityLabel: coupon.code,
      changes: diffOf(before, { ...before, ...patch }),
    });
    scheduleSave();
    return ok(couponRow(findById('coupons', coupon.id)));
  }),

  mswHttp.post(`${BASE}/coupons/:couponId/pause`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.pause');
    if (g.response) return g.response;

    const coupon = findById('coupons', params.couponId);
    if (!coupon) return notFound('That coupon no longer exists.');
    const pausing = coupon.status !== 'PAUSED';
    const current = derivedStatus(coupon);
    if (pausing && ['EXPIRED', 'EXHAUSTED'].includes(current)) {
      return illegalTransition(current, 'pause');
    }

    update('coupons', coupon.id, {
      status: pausing ? 'PAUSED' : (new Date(coupon.startsAt).getTime() > mockNow() ? 'SCHEDULED' : 'ACTIVE'),
    });
    writeAudit({
      actor: g.user, action: pausing ? 'coupon.pause' : 'coupon.resume', entityType: 'coupon',
      entityId: coupon.id, entityLabel: coupon.code,
    });
    scheduleSave();
    return ok(couponRow(findById('coupons', coupon.id)));
  }),

  mswHttp.post(`${BASE}/coupons/:couponId/end`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.pause');
    if (g.response) return g.response;

    const coupon = findById('coupons', params.couponId);
    if (!coupon) return notFound('That coupon no longer exists.');
    update('coupons', coupon.id, { endsAt: mockNowIso(), status: 'EXPIRED' });
    writeAudit({
      actor: g.user, action: 'coupon.end_early', entityType: 'coupon',
      entityId: coupon.id, entityLabel: coupon.code,
    });
    scheduleSave();
    return ok(couponRow(findById('coupons', coupon.id)));
  }),

  mswHttp.post(`${BASE}/coupons/:couponId/clone`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.create');
    if (g.response) return g.response;

    const source = findById('coupons', params.couponId);
    if (!source) return notFound('That coupon no longer exists.');

    let code = `${source.code}-2`;
    let n = 2;
    while (db.coupons.some((c) => c.code === code)) {
      n += 1;
      code = `${source.code}-${n}`;
    }

    const clone = insert('coupons', {
      ...source,
      id: id('CPN', 5),
      code,
      name: `${source.name} (copy)`,
      status: 'DRAFT',
      totalRedemptions: 0,
      budgetUsedPaise: 0,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'coupon.clone', entityType: 'coupon',
      entityId: clone.id, entityLabel: clone.code, metadata: { clonedFrom: source.code },
    });
    scheduleSave();
    return created(couponRow(clone));
  }),

  /**
   * "Test against a cart": the same evaluator the real checkout would run,
   * so what this tool says can never disagree with what a customer sees.
   */
  mswHttp.post(`${BASE}/coupons/:couponId/test`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.coupon.view');
    if (g.response) return g.response;

    const coupon = findById('coupons', params.couponId);
    if (!coupon) return notFound('That coupon no longer exists.');

    const body = await request.json();
    const customer = findById('customers', body.customerId);
    if (!customer) return validationFailed({ customerId: 'Choose a customer.' });

    const items = (body.productIds ?? []).map((productId) => {
      const product = findById('products', productId);
      const offer = db.offers.find((o) => o.productId === productId && o.status === 'LIVE');
      return {
        productId,
        categoryId: product?.categoryId ?? null,
        brandId: product?.brandId ?? null,
        sellerId: offer?.sellerId ?? null,
        fulfillmentType: offer?.fulfillmentType ?? 'SELLER',
        pricePaise: offer?.sellingPricePaise ?? 0,
        qty: 1,
      };
    });

    const result = evaluateCoupon(couponRow(coupon), {
      customerId: customer.id,
      platform: body.platform ?? 'Android',
      paymentMethod: body.paymentMethod ?? 'UPI',
      items,
    });
    return ok(result);
  }),
];
