/**
 * In-memory mock database.
 *
 * A plain collection store (rather than a schema-bound ORM) because the admin
 * panel's lists filter on computed values — SLA breaches, rolling rates,
 * scope intersections — which are far easier to express as predicates over
 * arrays than as ORM queries. Relations are resolved explicitly by the
 * handlers, which also keeps the response shapes honest about what the real
 * backend has to join.
 */

/**
 * Bump this whenever the seed or the stored record shapes change.
 *
 * Without it a snapshot written by an older build is restored forever and the
 * new seed never runs — which during Phase 0 left a browser holding admin
 * accounts that no longer matched the documented sign-in credentials, with no
 * way to recover from inside the app.
 */
export const SNAPSHOT_VERSION = 11;

/** Every collection the mock backend holds. Later phases fill in more. */
export const COLLECTIONS = [
  // Administration
  'adminUsers',
  'roles',
  'adminSessions',
  'authChallenges',
  'passwordResets',
  'loginAttempts',
  'approvalRequests',
  'auditEvents',
  'jobs',
  'adminAlerts',
  'savedViews',
  'settings',
  // Reference data used by scope pickers, lookups and global search
  'categories',
  'brands',
  'sellers',
  'warehouses',
  'supportQueues',
  'couriers',
  // Sellers (Phase 1)
  'kycDocuments',
  'pickupAddresses',
  'bankAccounts',
  'brandRequests',
  'penalties',
  'sellerClaims',
  'sellerNotes',
  // Catalog (Phase 1)
  'attributes',
  'attributeSets',
  'sizeCharts',
  'hsnCodes',
  'products',
  'variants',
  'offers',
  'listingSubmissions',
  'productRevisions',
  // Warehouses & logistics (Phase 3)
  'inventory',
  'inventoryLedger',
  'inboundConsignments',
  'inboundLines',
  'stockAdjustments',
  'removalOrders',
  'pincodes',
  'rateCards',
  'allocationRules',
  'manifests',
  'ndrRecords',
  'weightDisputes',
  'shippingFeeRules',
  // Orders & customers (Phase 2)
  'customers',
  'customerAddresses',
  'customerDevices',
  'privacyRequests',
  'riskRules',
  'riskFlags',
  'blocklistEntries',
  'orders',
  'orderItems',
  'orderEvents',
  'orderNotes',
  'orderExceptions',
  'shipments',
  'returns',
  'payments',
  'refunds',
  // Finance (Phase 4)
  'commissionRules',
  'commissionPlans',
  'feeConfig',
  'settlementLines',
  'payoutBatches',
  'sellerPayouts',
  'payoutAdjustments',
  'codRemittances',
  'invoices',
  'reconciliationRuns',
  'taxSummaries',
  'giftCardPrograms',
  'giftCards',
  'cashbackRules',
  'tickets',
  'ticketEvents',
  'reviews',
  'questions',
  'answers',
  'abuseReports',
  'chatSessions',
  'chatMessages',
  'macros',
  'slaPolicies',
  'routingRules',
  'csatConfig',
  'qaReviews',
  'adCampaigns',
  'adGroups',
  'adDailyStats',
  'adPlacements',
  'advertiserWallets',
  'advertiserLedger',
  'adInvoices',
  'invalidClicks',
  'walletAccounts',
  'walletEntries',
  // Marketing (Phase 5)
  'coupons',
  'couponRedemptions',
  'deals',
  'flashSales',
  'flashSaleNominations',
  'saleEvents',
  'referralConfig',
  'referrals',
  'campaigns',
  'segments',
  'bankOffers',
  // CMS (Phase 5)
  'homeLayoutVersions',
  'categoryTabs',
  'topBrandTabs',
  'banners',
  'onboardingSlides',
  'staticPages',
  'helpCategories',
  'helpArticles',
  'searchRules',
  'trendingSearches',
  'reasonLists',
  // Notification templates (Phase 5)
  'notificationTemplates',
  'notificationLogs',
  // Reports, settings & integrations (Phase 8)
  'reportDefinitions',
  'scheduledReports',
  'featureFlags',
  'integrations',
  'webhookEvents',
];

function emptyDb() {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
}

export const db = emptyDb();

/** Monotonic per-prefix counters so seeded IDs are stable and readable. */
const counters = {};

export function nextSeq(prefix) {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return counters[prefix];
}

/** `id('ORD', 5)` → "ORD-00005" */
export function id(prefix, width = 5) {
  return `${prefix}-${String(nextSeq(prefix)).padStart(width, '0')}`;
}

export function resetDb() {
  for (const c of COLLECTIONS) db[c] = [];
  for (const k of Object.keys(counters)) delete counters[k];
}

/** Replaces the whole database — used when restoring a persisted snapshot. */
export function hydrateDb(snapshot) {
  resetDb();
  for (const c of COLLECTIONS) {
    if (Array.isArray(snapshot?.collections?.[c])) db[c] = snapshot.collections[c];
  }
  for (const [k, v] of Object.entries(snapshot?.counters ?? {})) counters[k] = v;
}

export function snapshotDb() {
  return { version: SNAPSHOT_VERSION, counters: { ...counters }, collections: { ...db } };
}

/* ---------------------------------------------------------------- queries */

export function all(collection) {
  return db[collection];
}

export function find(collection, predicate) {
  return db[collection].find(predicate) ?? null;
}

export function findById(collection, recordId) {
  return db[collection].find((r) => r.id === recordId) ?? null;
}

export function filter(collection, predicate) {
  return db[collection].filter(predicate);
}

export function count(collection, predicate) {
  return predicate ? db[collection].filter(predicate).length : db[collection].length;
}

/* --------------------------------------------------------------- mutations */

export function insert(collection, record) {
  db[collection].push(record);
  return record;
}

export function insertMany(collection, records) {
  db[collection].push(...records);
  return records;
}

/**
 * Patches a record and bumps its `version`. Mutable entities carry a version
 * so handlers can reject stale writes with a 409 (plan §7).
 */
export function update(collection, recordId, patch) {
  const row = findById(collection, recordId);
  if (!row) return null;
  Object.assign(row, patch);
  if (typeof row.version === 'number' && !('version' in patch)) row.version += 1;
  return row;
}

export function remove(collection, recordId) {
  const i = db[collection].findIndex((r) => r.id === recordId);
  if (i === -1) return false;
  db[collection].splice(i, 1);
  return true;
}
