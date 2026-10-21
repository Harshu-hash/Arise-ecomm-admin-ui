import { db, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Content (M12): home layout, banners, onboarding, static pages, help
 * centre, search configuration and reason masters.
 *
 * Sections and tabs are seeded to match the mobile app's own
 * `features/home/data/homeData.js` exactly (`CATEGORY_TABS`, `BRAND_TABS`,
 * `BRANDS_SPOTLIGHT`, `TOP_VALUE_DEALS`, …), so the first published layout
 * this panel produces is the layout the app already renders, not a
 * different one the admin happens to invent.
 */

const CATEGORY_TAB_DEFS = [
  ['For You', 'bag-handle-outline', ['#FFCB9D', '#FFFFFF']],
  ['Fashion', 'shirt-outline', ['#FFB6C1', '#FFFFFF']],
  ['Mobiles', 'phone-portrait-outline', ['#A7C7FF', '#FFFFFF']],
  ['Electronics', 'laptop-outline', ['#C3B8FF', '#FFFFFF']],
  ['Beauty', 'sparkles-outline', ['#FFD1E8', '#FFFFFF']],
  ['Home', 'home-outline', ['#B8F0D1', '#FFFFFF']],
];

export function seedCategoryTabs() {
  return CATEGORY_TAB_DEFS.map(([label, icon, gradient], i) =>
    insert('categoryTabs', {
      id: id('CTB', 3),
      label,
      icon,
      gradient,
      layoutVariant: label === 'For You' ? 'FOR_YOU' : 'CATEGORY',
      order: i,
      active: true,
      version: 1,
    }),
  );
}

export function seedTopBrandTabs() {
  return [
    ['Arise', 'sunrise', { screen: 'Home' }],
    ['Deals', 'percent', { screen: 'Offers' }],
  ].map(([label, icon, target], i) =>
    insert('topBrandTabs', {
      id: id('TBT', 3),
      label,
      icon,
      logo: null,
      target,
      order: i,
      active: true,
      version: 1,
    }),
  );
}

const BANNER_DEFS = [
  ['Monsoon sale hero', 'HERO', 'LIVE'],
  ['Flash sale countdown', 'HERO', 'LIVE'],
  ['New seller brands', 'TILE', 'LIVE'],
  ['Festive teaser — not yet live', 'HERO', 'SCHEDULED'],
  ['Old Diwali banner', 'TILE', 'EXPIRED'],
  ['Draft concept', 'TILE', 'DRAFT'],
];

export function seedBanners() {
  return BANNER_DEFS.map(([name, kind, status], i) =>
    insert('banners', {
      id: id('BNR', 4),
      name,
      kind,
      images: {
        mobile_16_9: null,
        tile_1_1: null,
        web: null,
      },
      altText: name,
      deepLink: { screen: 'Home' },
      placements: kind === 'HERO' ? ['HOME_HERO'] : ['HOME_AD_TILES', 'OFFERS_PAGE'],
      targeting: { segmentId: null, city: null, platform: null },
      priority: i,
      status,
      startsAt: status === 'SCHEDULED'
        ? new Date(mockNow() + 5 * 86400_000).toISOString()
        : new Date(mockNow() - 5 * 86400_000).toISOString(),
      endsAt: status === 'EXPIRED'
        ? new Date(mockNow() - 1 * 86400_000).toISOString()
        : new Date(mockNow() + 20 * 86400_000).toISOString(),
      impressions: status === 'LIVE' ? Math.floor(Math.random() * 500000) + 20000 : 0,
      clicks: status === 'LIVE' ? Math.floor(Math.random() * 15000) + 500 : 0,
      createdByName: 'Varun Kapoor',
      createdAt: mockNowIso(),
      version: 1,
    }),
  );
}

export function seedOnboardingSlides() {
  const defs = [
    ['shopping-bag', 'Millions of products', 'Fashion, electronics, home & more — everything you need, all in one app.', '#EFF6FF'],
    ['truck', 'Fast, reliable delivery', 'Track every order in real time, right from checkout to your doorstep.', '#EAF7EC'],
    ['shield', 'Safe & secure payments', 'Pay your way with UPI, cards or wallet, protected at every step.', '#FFF3E0'],
  ];
  return defs.map(([icon, title, description, bg], i) =>
    insert('onboardingSlides', {
      id: id('OBS', 3),
      icon,
      title,
      description,
      bg,
      order: i,
      active: true,
      version: 1,
    }),
  );
}

const STATIC_PAGE_DEFS = [
  ['about', 'About Arise', 'Arise is India’s marketplace for everything — connecting sellers to customers nationwide.'],
  ['privacy_policy', 'Privacy Policy', 'This policy explains what personal data Arise collects and how it is used.'],
  ['terms_conditions', 'Terms & Conditions', 'These terms govern your use of the Arise app and marketplace.'],
  ['return_policy', 'Return Policy', 'Most items can be returned within the category’s return window, subject to condition checks.'],
  ['shipping_policy', 'Shipping Policy', 'Delivery timelines depend on the seller’s location, the fulfilment type and the destination pincode.'],
  ['seller_policies', 'Seller Policies', 'Sellers on Arise must meet quality, dispatch and conduct standards set out here.'],
];

export function seedStaticPages() {
  return STATIC_PAGE_DEFS.map(([slug, title, body]) =>
    insert('staticPages', {
      id: id('PAG', 3),
      slug,
      title,
      body,
      status: 'PUBLISHED',
      materialChange: false,
      versions: [{ body, editedByName: 'Varun Kapoor', editedAt: mockNowIso(), note: 'Initial version' }],
      publishedAt: mockNowIso(),
      requiresReacceptance: false,
      version: 1,
    }),
  );
}

const HELP_CATEGORY_DEFS = [
  ['orders', 'package', 'Orders & Shipping', 'Track, delay, address change', [
    ['Where is my order?', 'You can track your order in real time from the Orders section. Go to My Orders, select the order, and tap "Track Order" to see live status, courier details, and estimated delivery date.'],
    ['How do I track my order?', 'Open the app, go to Account > Orders, and select the order you want to track. You will see a step-by-step timeline from Order Confirmed through to Delivered.'],
    ['My order is delayed, what do I do?', 'Check the latest status on the tracking page first. If the delivery date has passed by more than 2 days, raise a ticket and support will investigate within 24 hours.'],
    ['Can I change my delivery address after placing an order?', 'Address changes are only possible before the order is packed. Once shipped, the address cannot be changed — cancel and reorder instead.'],
  ]],
  ['payments', 'credit-card', 'Payments & Refunds', 'Failed payments, refund status', [
    ['Payment failed but amount was deducted', 'This is usually auto-reversed by your bank within 5-7 business days. If not credited back after 7 days, raise a ticket with your transaction ID.'],
    ['How long do refunds take?', 'UPI and wallet refunds land within 24-48 hours. Cards take 5-7 business days, net banking 3-5 business days after the return is QC-passed.'],
    ['Which payment methods are accepted?', 'UPI, credit and debit cards, net banking, wallet, EMI on select cards, and Cash on Delivery for eligible orders.'],
  ]],
  ['returns', 'rotate-ccw', 'Returns, Exchange & Refund', 'Return window, pickup, QC', [
    ['How do I return an item?', 'Go to My Orders, select the item, and choose Return. Pick a reason, schedule a pickup, and the refund is processed after QC passes.'],
    ['Why was my return rejected?', 'A return fails QC if the item shows signs of use, is missing accessories, or does not match what was shipped.'],
  ]],
  ['account', 'user', 'Account & Profile', 'Login, addresses, preferences', [
    ['How do I update my phone number?', 'Go to Account > Profile > Edit, and verify the new number with an OTP.'],
    ['How do I delete my account?', 'Raise a privacy request from Account > Privacy Center. It is processed within the statutory timeline.'],
  ]],
  ['seller', 'store', 'Product & Seller Issues', 'Wrong item, seller conduct', [
    ['The seller sent the wrong item', 'Raise a return with "Wrong item delivered" as the reason — this is attributed to the seller and does not affect your return window.'],
  ]],
];

export function seedHelp() {
  HELP_CATEGORY_DEFS.forEach(([key, icon, title, subtitle, articles], i) => {
    const category = insert('helpCategories', {
      id: id('HLC', 3),
      key,
      icon,
      title,
      subtitle,
      order: i,
      active: true,
      version: 1,
    });

    articles.forEach(([question, answer], n) => {
      insert('helpArticles', {
        id: id('HLA', 4),
        categoryId: category.id,
        question,
        answer,
        relatedAction: key === 'orders' ? { label: 'Track order', screen: 'OrderTracking' } : null,
        helpfulVotes: Math.floor(Math.random() * 400),
        notHelpfulVotes: Math.floor(Math.random() * 40),
        order: n,
        status: 'PUBLISHED',
        version: 1,
      });
    });
  });

  // Search terms with no result — what Search Analytics on this screen surfaces.
  return { categories: db.helpCategories, articles: db.helpArticles };
}

const SEARCH_RULE_DEFS = [
  ['SYNONYM', { term: 'tv', synonym: 'television', direction: 'BOTH' }],
  ['SYNONYM', { term: 'earbuds', synonym: 'tws', direction: 'ONE_WAY' }],
  ['SYNONYM', { term: 'mobile', synonym: 'smartphone', direction: 'BOTH' }],
  ['REDIRECT', { keyword: 'iphone', targetType: 'BRAND', targetLabel: 'Apple' }],
  ['REDIRECT', { keyword: 'diwali sale', targetType: 'LANDING', targetLabel: 'Festive Big Billion Week' }],
  ['BOOST', { scopeType: 'SELLER_FLAG', scopeLabel: 'Assured sellers', weight: 20 }],
  ['BOOST', { scopeType: 'STOCK', scopeLabel: 'In stock', weight: 10 }],
  ['BURY', { scopeType: 'SELLER_FLAG', scopeLabel: 'New sellers (< 30 days)', weight: -15 }],
  ['BLOCKED', { term: 'free iphone' }],
  ['BLOCKED', { term: 'covid cure' }],
];

export function seedSearchRules() {
  return SEARCH_RULE_DEFS.map(([type, rest], i) =>
    insert('searchRules', {
      id: id('SCH', 4),
      type,
      ...rest,
      active: true,
      createdByName: 'Varun Kapoor',
      createdAt: mockNowIso(),
      order: i,
      version: 1,
    }),
  );
}

export function seedTrendingSearches() {
  const terms = [
    'wireless earbuds', 'running shoes', 'smart watch', 'diwali sale',
    'kurti', 'air fryer', 'bluetooth speaker', 'laptop bag',
  ];
  return terms.map((term, i) =>
    insert('trendingSearches', {
      id: id('TRS', 3),
      term,
      searchCount: Math.floor(Math.random() * 50000) + 1000,
      pinned: i < 2,
      order: i,
      version: 1,
    }),
  );
}

/** One place for every reason list the app and admin use (M12.7). */
const REASON_LIST_DEFS = {
  CANCEL: ['Ordered by mistake', 'Found a better price elsewhere', 'Item no longer needed', 'Delivery time is too long'],
  RETURN: [
    ['Item is damaged or defective', 'SELLER'],
    ['Wrong item delivered', 'SELLER'],
    ['Item not as described', 'SELLER'],
    ['Size/fit issue', 'CUSTOMER'],
    ['Changed my mind', 'CUSTOMER'],
  ],
  TICKET_SUBJECT: ['Delivery Issue', 'Payment Issue', 'Product Quality', 'Refund Query', 'Account Issue'],
  ADMIN_ACTION: ['Policy violation', 'Customer complaint pattern', 'Fraud suspected', 'Requested by seller/customer', 'Compliance requirement'],
  NDR: ['Customer unavailable', 'Address incomplete', 'Customer refused', 'Phone unreachable'],
};

export function seedReasonLists() {
  const rows = [];
  for (const [listKey, defs] of Object.entries(REASON_LIST_DEFS)) {
    defs.forEach((def, i) => {
      const [label, faultAttribution] = Array.isArray(def) ? def : [def, null];
      rows.push(
        insert('reasonLists', {
          id: id('RSN', 4),
          listKey,
          label,
          code: label.toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, ''),
          faultAttribution,
          requiresNote: false,
          order: i,
          active: true,
          version: 1,
        }),
      );
    });
    // Every list ends with a free-text "Other" per the app's own screens.
    rows.push(
      insert('reasonLists', {
        id: id('RSN', 4),
        listKey,
        label: 'Other',
        code: 'OTHER',
        faultAttribution: null,
        requiresNote: true,
        order: defs.length,
        active: true,
        version: 1,
      }),
    );
  }
  return rows;
}

/**
 * Home layout. Sections mirror `HomeScreen.js` exactly, so the first
 * published version is the layout the app already renders.
 */
export function seedHomeLayout() {
  const flashSale = db.flashSales.find((f) => f.status === 'LIVE');
  const sections = [
    { type: 'HERO_BANNER_CAROUSEL', config: { bannerIds: db.banners.filter((b) => b.kind === 'HERO' && b.status === 'LIVE').map((b) => b.id), autoplayMs: 4000 } },
    { type: 'AD_SHEET_CARD', config: { bannerIds: db.banners.filter((b) => b.kind === 'TILE' && b.status === 'LIVE').map((b) => b.id) } },
    { type: 'RECENTLY_VIEWED_RAIL', config: {} },
    { type: 'FLASH_SALE_BANNER', config: { flashSaleId: flashSale?.id ?? null, autoHideWhenNone: true } },
    { type: 'AD_TILE_ROW', config: { tiles: [{ bannerText: 'Min. 35% Off', label: "Women's trousers", deepLink: { screen: 'Category', params: { id: 'fashion' } } }] } },
    { type: 'SUGGESTED_FOR_YOU', config: { source: 'PERSONALISED', count: 12 } },
    { type: 'BRANDS_SPOTLIGHT', config: { brandIds: db.brands.slice(0, 3).map((b) => b.id) } },
    { type: 'TOP_VALUE_DEALS', config: { dealIds: db.deals.filter((d) => d.placement === 'TOP_VALUE_DEALS').slice(0, 6).map((d) => d.id) } },
    { type: 'PRODUCT_FEED', config: { source: 'PERSONALISED', infiniteScroll: true } },
  ].map((s) => ({ ...s, visibility: { enabled: true, segmentId: null, city: null, platform: null, minAppVersion: null } }));

  const published = insert('homeLayoutVersions', {
    id: id('HLV', 4),
    status: 'PUBLISHED',
    sections,
    createdByName: 'Varun Kapoor',
    createdAt: new Date(mockNow() - 5 * 86400_000).toISOString(),
    publishedByName: 'Varun Kapoor',
    publishedAt: new Date(mockNow() - 5 * 86400_000).toISOString(),
    note: 'Initial launch layout',
    version: 1,
  });

  // A draft in progress, so the builder has something to show being edited.
  const draftSections = sections.map((s) => ({ ...s }));
  draftSections.push({
    type: 'SPONSORED_RAIL',
    config: { placement: 'HOME_SPONSORED_RAIL' },
    visibility: { enabled: true, segmentId: null, city: null, platform: null, minAppVersion: null },
  });
  insert('homeLayoutVersions', {
    id: id('HLV', 4),
    status: 'DRAFT',
    sections: draftSections,
    createdByName: 'Varun Kapoor',
    createdAt: mockNowIso(),
    publishedByName: null,
    publishedAt: null,
    note: null,
    version: 1,
  });

  return published;
}
