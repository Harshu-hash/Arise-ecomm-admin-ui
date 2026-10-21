import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { matchSegment, resolveAudience } from '../engine/segments';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Marketing (M10): coupons, deals, flash sales, sale events, referral,
 * campaigns, segments and the bank-offer display mirror.
 *
 * Segments are seeded first because coupons and campaigns target them by id,
 * the same dependency order orders had on catalog in earlier phases.
 */

export function seedSegments() {
  const defs = [
    ['High-value customers', 'DYNAMIC', { field: 'gmvPaise', op: 'gte', value: 2000000 }],
    ['Never ordered', 'DYNAMIC', { field: 'ordersCount', op: 'eq', value: 0 }],
    ['Lapsed — inactive 60 days', 'DYNAMIC', { field: 'lastOrderAt', op: 'before_days', value: 60 }],
    ['Mumbai shoppers', 'DYNAMIC', { field: 'city', op: 'eq', value: 'Mumbai' }],
    ['iOS users', 'DYNAMIC', { field: 'platform', op: 'eq', value: 'iOS' }],
    [
      'At-risk of churn',
      'DYNAMIC',
      {
        match: 'ALL',
        conditions: [
          { field: 'ordersCount', op: 'gte', value: 3 },
          { field: 'lastOrderAt', op: 'before_days', value: 45 },
        ],
      },
    ],
  ];

  return defs.map(([name, kind, rule]) => {
    const segment = insert('segments', {
      id: id('SEG', 4),
      name,
      description: `Customers matching: ${name.toLowerCase()}`,
      kind,
      rule,
      memberCount: 0,
      snapshotCustomerIds: null,
      createdByName: 'Varun Kapoor',
      createdAt: mockNowIso(),
      usedByCoupons: 0,
      usedByCampaigns: 0,
      version: 1,
    });
    segment.memberCount = matchSegment(rule).length;
    return segment;
  });
}

const COUPON_DEFS = [
  ['WELCOME50', '50% off your first order', 'PERCENT', 50, { maxDiscountPaise: 15000 }, { type: 'NEW' }, 'ACTIVE'],
  ['FLAT200', '₹200 off orders over ₹999', 'FLAT', 20000, { minCartPaise: 99900 }, { type: 'ALL' }, 'ACTIVE'],
  ['FASHION30', '30% off fashion, up to ₹500', 'PERCENT', 30, { maxDiscountPaise: 50000 }, { type: 'ALL' }, 'ACTIVE'],
  ['FREESHIP', 'Free delivery over ₹499', 'FREE_DELIVERY', 0, { minCartPaise: 49900 }, { type: 'ALL' }, 'ACTIVE'],
  ['MOBILE1K', '₹1,000 off mobiles over ₹15,000', 'FLAT', 100000, { minCartPaise: 1500000 }, { type: 'ALL' }, 'SCHEDULED'],
  ['WINBACK', '₹150 wallet-funded win-back offer', 'FLAT', 15000, { minCartPaise: 0 }, { type: 'SEGMENT' }, 'PAUSED'],
  ['SUMMER25', '25% off, ended', 'PERCENT', 25, { maxDiscountPaise: 40000 }, { type: 'ALL' }, 'EXPIRED'],
  ['BUY2GET1', 'Buy 2 get 1 free on t-shirts', 'BXGY', 0, { buyQty: 2, getQty: 1 }, { type: 'ALL' }, 'ACTIVE'],
];

export function seedCoupons() {
  const lapsed = db.segments.find((s) => s.name.startsWith('Lapsed'));
  const fashionRoot = db.categories.find((c) => c.level === 1 && c.rootName === 'Fashion');

  return COUPON_DEFS.map(([code, name, type, value, extra, audienceBase, status], i) => {
    const startOffsetDays = status === 'SCHEDULED' ? 7 : status === 'EXPIRED' ? -60 : -30;
    const endOffsetDays = status === 'EXPIRED' ? -5 : status === 'SCHEDULED' ? 37 : 60;
    const audience = audienceBase.type === 'SEGMENT' ? { type: 'SEGMENT', segmentId: lapsed?.id } : audienceBase;

    const coupon = insert('coupons', {
      id: id('CPN', 5),
      code,
      name,
      description: `${name}. Terms apply.`,
      terms: 'Cannot be combined with other coupons unless stated. Arise reserves the right to withdraw this offer.',
      type,
      valuePct: type === 'PERCENT' ? value : null,
      valuePaise: type === 'FLAT' ? value : null,
      buyQty: extra.buyQty ?? null,
      getQty: extra.getQty ?? null,
      maxDiscountPaise: extra.maxDiscountPaise ?? null,
      deliveryFeePaise: type === 'FREE_DELIVERY' ? 4000 : null,
      minCartPaise: extra.minCartPaise ?? 0,
      appliesTo: 'CART_TOTAL',
      scope: code === 'FASHION30' ? { includeCategories: [fashionRoot?.id].filter(Boolean) } : null,
      audience,
      platforms: [],
      paymentMethods: [],
      fundedBy: i % 4 === 0 ? 'SELLER' : i % 7 === 0 ? 'CO_FUNDED' : 'ARISE',
      coFundedPct: i % 7 === 0 ? 50 : null,
      stackable: code === 'FREESHIP',
      visibility: code === 'WINBACK' ? 'HIDDEN' : 'PUBLIC',
      totalLimit: 5000,
      totalRedemptions: 0,
      perUserLimit: code === 'WELCOME50' ? 1 : 3,
      budgetPaise: 20_00_000 * 100,
      budgetUsedPaise: 0,
      status,
      startsAt: new Date(mockNow() + startOffsetDays * 86400_000).toISOString(),
      endsAt: new Date(mockNow() + endOffsetDays * 86400_000).toISOString(),
      createdByName: 'Varun Kapoor',
      createdAt: mockNowIso(),
      version: 1,
    });
    return coupon;
  });
}

/** Redemptions against delivered orders, so the performance tab is real. */
export function seedCouponRedemptions() {
  const active = filter('coupons', (c) => ['ACTIVE', 'PAUSED', 'EXPIRED'].includes(c.status));
  const orders = db.orders.filter((o) => o.couponCode);
  const rows = [];

  orders.forEach((order, i) => {
    const coupon = active[i % active.length];
    if (!coupon) return;
    const customer = db.customers.find((c) => c.id === order.customerId);
    const discountPaise = Math.round(order.grandTotalPaise * 0.05);

    rows.push(
      insert('couponRedemptions', {
        id: id('CPR', 7),
        couponId: coupon.id,
        couponCode: coupon.code,
        customerId: order.customerId,
        orderId: order.id,
        discountPaise,
        orderTotalPaise: order.grandTotalPaise,
        wasFirstOrder: (customer?.ordersCount ?? 1) <= 1,
        redeemedAt: order.placedAt,
      }),
    );
    coupon.totalRedemptions += 1;
    coupon.budgetUsedPaise += discountPaise;
  });

  return rows;
}

const DEAL_TAGS = ['BESTSELLER', 'TRENDING', 'SUPER SAVER', 'HOT DEAL'];

export function seedDeals() {
  const liveOffers = filter('offers', (o) => o.status === 'LIVE').slice(0, 40);
  return liveOffers.map((offer, i) => {
    const product = db.products.find((p) => p.id === offer.productId);
    const discountPct = faker.number.int({ min: 20, max: 65 });
    const dealPrice = Math.round(offer.sellingPricePaise * (1 - discountPct / 100));
    const placement = i % 3 === 0 ? 'TOP_VALUE_DEALS' : 'OFFERS_PAGE';

    return insert('deals', {
      id: id('DEA', 5),
      title: product?.title ?? 'Deal',
      label: `Min. ${discountPct}% Off`,
      tag: DEAL_TAGS[i % DEAL_TAGS.length],
      image: product?.images?.[0] ?? null,
      productId: offer.productId,
      offerId: offer.id,
      sellerId: offer.sellerId,
      dealPricePaise: dealPrice,
      mrpPaise: offer.mrpPaise,
      placement,
      // Deal of the Day gets one slot per calendar day; everything else just
      // runs for its schedule window.
      slotDate: placement === 'TOP_VALUE_DEALS' && i < 14
        ? new Date(mockNow() + (i - 7) * 86400_000).toISOString().slice(0, 10)
        : null,
      startsAt: new Date(mockNow() - 2 * 86400_000).toISOString(),
      endsAt: new Date(mockNow() + 14 * 86400_000).toISOString(),
      status: 'ACTIVE',
      version: 1,
    });
  });
}

const FLASH_STATES = ['LIVE', 'SCHEDULED', 'CURATION', 'NOMINATIONS_OPEN', 'ENDED', 'CANCELLED'];

export function seedFlashSales() {
  return FLASH_STATES.map((status, i) => {
    const startsAt = mockNow() + (i - 2) * 2 * 3600_000;
    const sale = insert('flashSales', {
      id: id('FLS', 4),
      name: `${['Electronics', 'Fashion', 'Home & Kitchen', 'Beauty', 'Mobiles', 'Sports'][i]} Flash Sale`,
      banner: null,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(startsAt + 4 * 3600_000).toISOString(),
      categoryRootNames: [['Electronics', 'Fashion', 'Home', 'Beauty', 'Mobiles', 'Sports'][i]],
      minDiscountPct: 50,
      maxUnitsPerCustomer: 2,
      status,
      gmvPaise: status === 'LIVE' || status === 'ENDED' ? faker.number.int({ min: 50_000, max: 8_00_000 }) * 100 : 0,
      unitsSold: status === 'LIVE' || status === 'ENDED' ? faker.number.int({ min: 10, max: 900 }) : 0,
      createdAt: mockNowIso(),
      version: 1,
    });

    const offers = filter('offers', (o) => o.status === 'LIVE').slice(i * 6, i * 6 + 6);
    offers.forEach((offer, n) => {
      const product = db.products.find((p) => p.id === offer.productId);
      const discountPct = faker.number.int({ min: 45, max: 75 });
      const flashPrice = Math.round(offer.sellingPricePaise * (1 - discountPct / 100));
      const nominationStatus = discountPct < 50
        ? 'AUTO_REJECTED'
        : status === 'NOMINATIONS_OPEN' && n % 3 === 0 ? 'PENDING' : 'ACCEPTED';

      insert('flashSaleNominations', {
        id: id('FSN', 6),
        flashSaleId: sale.id,
        productId: offer.productId,
        productTitle: product?.title ?? 'Product',
        sellerId: offer.sellerId,
        sellerName: offer.sellerName,
        currentPricePaise: offer.sellingPricePaise,
        flashPricePaise: flashPrice,
        discountPct,
        committedStock: faker.number.int({ min: 20, max: 300 }),
        unitsSold: ['LIVE', 'ENDED'].includes(status) ? faker.number.int({ min: 0, max: 150 }) : 0,
        order: n,
        hero: n === 0,
        status: nominationStatus,
        rejectReason: nominationStatus === 'AUTO_REJECTED' ? 'Below the minimum 50% discount' : null,
        version: 1,
      });
    });

    return sale;
  });
}

export function seedSaleEvents() {
  const coupon = db.coupons[0];
  const flashSale = db.flashSales.find((f) => f.status === 'SCHEDULED');

  return [
    ['Monsoon Mega Sale', mockNow() + 10 * 86400_000, 'SCHEDULED'],
    ['Festive Big Billion Week', mockNow() - 20 * 86400_000, 'ENDED'],
    ['End of Season Sale', mockNow() - 2 * 86400_000, 'LIVE'],
  ].map(([name, startsAt, status]) =>
    insert('saleEvents', {
      id: id('EVT', 4),
      name,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(startsAt + 6 * 86400_000).toISOString(),
      status,
      earlyAccessHours: name.includes('Billion') ? 12 : 0,
      participatingCategoryRootNames: ['Fashion', 'Electronics', 'Mobiles'],
      minSellerDiscountPct: 20,
      linkedCouponIds: [coupon?.id].filter(Boolean),
      linkedFlashSaleIds: [flashSale?.id].filter(Boolean),
      linkedDealIds: db.deals.slice(0, 5).map((d) => d.id),
      // Readiness is computed rather than stored, but a few sellers are
      // deliberately short of their committed stock so the checklist has
      // something to flag.
      sellerParticipationPct: status === 'ENDED' ? 92 : faker.number.int({ min: 40, max: 85 }),
      inventoryCoveragePct: faker.number.int({ min: 55, max: 95 }),
      bannersScheduled: status !== 'SCHEDULED',
      version: 1,
    }),
  );
}

export function seedReferral() {
  insert('referralConfig', {
    id: 'referral',
    referrerRewardPaise: 10000,
    refereeRewardType: 'WALLET',
    refereeRewardPaise: 10000,
    trigger: 'FIRST_ORDER_DELIVERED_RETURN_WINDOW_CLOSED',
    maxReferralsPerMonth: 10,
    validityDays: 90,
    terms: 'Reward credited once the referred friend’s first order is delivered and its return window has closed.',
    version: 1,
  });

  const customers = db.customers.filter((c) => c.status === 'ACTIVE');
  const statuses = ['SIGNED_UP', 'FIRST_ORDER_PLACED', 'QUALIFIED', 'REWARDED', 'REWARDED', 'FRAUD_REVIEW'];

  const rows = [];
  for (let i = 0; i < 60; i += 1) {
    const referrer = customers[i % customers.length];
    const referee = customers[(i + 37) % customers.length];
    if (referrer.id === referee.id) continue;
    const status = statuses[i % statuses.length];

    rows.push(
      insert('referrals', {
        id: id('REF', 6),
        referrerCustomerId: referrer.id,
        referrerName: referrer.name,
        refereeCustomerId: referee.id,
        refereeName: referee.name,
        code: `${referrer.name.split(' ')[0].toUpperCase().slice(0, 6)}${String(100 + i)}`,
        status,
        rewardPaise: status === 'REWARDED' ? 10000 : null,
        // Auto-held pending review, same as a real fraud engine would flag
        // it — never a final decision until an admin looks at it.
        fraudReason: status === 'FRAUD_REVIEW' ? 'Same device and payment instrument as the referrer' : null,
        createdAt: new Date(mockNow() - faker.number.int({ min: 1, max: 120 }) * 86400_000).toISOString(),
        rewardedAt: status === 'REWARDED' ? mockNowIso() : null,
      }),
    );
  }
  return rows;
}

const CAMPAIGN_DEFS = [
  ['Diwali sale teaser', ['PUSH', 'EMAIL'], 'SENT'],
  ['Cart abandonment nudge', ['PUSH'], 'SENDING'],
  ['New seller brands launch', ['EMAIL', 'IN_APP'], 'SCHEDULED'],
  ['Win-back lapsed customers', ['PUSH', 'SMS'], 'DRAFT'],
  ['Flash sale starts in 1 hour', ['PUSH'], 'SENT'],
  ['Monsoon sale — paused mid-send', ['WHATSAPP'], 'PAUSED'],
];

export function seedCampaigns() {
  const segments = db.segments;
  return CAMPAIGN_DEFS.map(([name, channels, status], i) => {
    const audience = i % 3 === 0 ? { type: 'ALL' } : { type: 'SEGMENT', segmentId: segments[i % segments.length].id };
    const reach = resolveAudience(audience).length;
    const sent = ['SENT', 'SENDING', 'PAUSED'].includes(status);

    return insert('campaigns', {
      id: id('CAM', 5),
      name,
      audience,
      estimatedReach: reach,
      channels,
      content: Object.fromEntries(channels.map((ch) => [ch, {
        title: name,
        message: `${name} — check it out on Arise.`,
        deepLink: { screen: 'Home' },
      }])),
      schedule: { mode: i % 4 === 0 ? 'RECURRING' : 'ONCE', sendAt: mockNowIso() },
      quietHoursRespected: true,
      status,
      stats: sent ? {
        sent: reach,
        delivered: Math.round(reach * 0.94),
        opened: Math.round(reach * 0.31),
        clicked: Math.round(reach * 0.09),
        conversions: Math.round(reach * 0.02),
        gmvPaise: Math.round(reach * 0.02) * 150000,
        unsubscribed: Math.round(reach * 0.004),
      } : null,
      createdByName: 'Varun Kapoor',
      createdAt: mockNowIso(),
      version: 1,
    });
  });
}

const BANKS = [
  ['HDFC Bank', 'CREDIT_CARD', 10, 150000],
  ['ICICI Bank', 'DEBIT_CARD', 5, 75000],
  ['SBI Card', 'CREDIT_CARD', 8, 100000],
  ['Axis Bank', 'CREDIT_CARD', 12, 200000],
  ['Kotak Mahindra Bank', 'DEBIT_CARD', 5, 50000],
  ['IDFC First Bank', 'CREDIT_CARD', 10, 125000],
];

/** Mirrors the payment gateway's offer feed — admin only controls display. */
export function seedBankOffers() {
  return BANKS.map(([bank, cardType, pct, capPaise], i) =>
    insert('bankOffers', {
      id: id('BKO', 4),
      bank,
      cardType,
      discountPct: pct,
      capPaise,
      minSpendPaise: capPaise * 5,
      emiAvailable: i % 2 === 0,
      emiTenures: i % 2 === 0 ? [3, 6, 9, 12] : [],
      validFrom: new Date(mockNow() - 10 * 86400_000).toISOString(),
      validTo: new Date(mockNow() + (i === 5 ? -1 : 30) * 86400_000).toISOString(),
      // Synced read-only from the gateway; admin only controls the three
      // fields below.
      adminVisible: i !== 4,
      placements: ['PDP', 'CHECKOUT', 'OFFERS_PAGE'],
      displayOrder: i,
      titleOverride: null,
      gatewayOfferId: `gw_offer_${faker.string.alphanumeric(10)}`,
      version: 1,
    }),
  );
}
