import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, resetDb } from '../db/store';
import { seedAdminUsers } from './adminUsers';
import { seedAlerts, seedApprovals, seedAuditEvents, seedDashboard } from './activity';
import {
  seedBrands,
  seedCategories,
  seedCouriers,
  seedSellers,
  seedSupportQueues,
  seedWarehouses,
} from './reference';
import { seedAttributes, seedBuyBoxRules, seedHsn, seedSizeCharts } from './catalogMasters';
import { seedListingSubmissions, seedProducts } from './products';
import {
  seedBlocklist,
  seedCustomers,
  seedPrivacyRequests,
  seedRiskFlags,
  seedRiskRules,
} from './customers';
import {
  seedAllocationRules,
  seedManifests,
  seedNdr,
  seedPincodes,
  seedRateCards,
  seedShippingFeeRules,
  seedWeightDisputes,
} from './logistics';
import { rollUpCustomerStats, seedOrderExceptions, seedOrders } from './orders';
import {
  seedCodRemittances,
  seedCommissionRules,
  seedInvoices,
  seedPayoutBatches,
  seedReconciliation,
  seedSettlementLines,
  seedTaxSummaries,
} from './finance';
import {
  seedCashbackRules,
  seedGiftCards,
  seedPayoutAdjustments,
  seedWallets,
} from './wallet';
import {
  seedBankOffers,
  seedCampaigns,
  seedCouponRedemptions,
  seedCoupons,
  seedDeals,
  seedFlashSales,
  seedReferral,
  seedSaleEvents,
  seedSegments,
} from './marketing';
import {
  seedBanners,
  seedCategoryTabs,
  seedHelp,
  seedHomeLayout,
  seedOnboardingSlides,
  seedReasonLists,
  seedSearchRules,
  seedStaticPages,
  seedTopBrandTabs,
  seedTrendingSearches,
} from './cms';
import { seedNotificationLogs, seedNotificationTemplates } from './notifications';
import { seedQuestions, seedReviews } from './reviews';
import {
  seedChatSessions,
  seedCsatConfig,
  seedMacros,
  seedRoutingRules,
  seedSlaPolicies,
  seedTickets,
} from './support';
import {
  seedAdCampaigns,
  seedAdInvoices,
  seedAdPlacements,
  seedAdvertiserWallets,
  seedInvalidClicks,
} from './ads';
import {
  seedAppConfig,
  seedFeatureFlags,
  seedIntegrations,
  seedPlatformSettings,
  seedReportDefinitions,
  seedScheduledReports,
  seedWebhookEvents,
} from './platform';
import { seedRoles } from './roles';
import { attachVerifications, seedSellerDetail } from './sellerDetail';
import { seedBrandRequests, seedClaims, seedPenalties } from './sellerOps';
import {
  seedInboundConsignments,
  seedInventory,
  seedRemovalOrders,
  seedStockAdjustments,
} from './warehouse';

/**
 * Builds the whole mock dataset. The faker seed is fixed so every developer,
 * screenshot and test sees the same records — without that, a "seller rating
 * 4.2" in a bug report means nothing.
 */
export const SEED = 2026;

export function seedAll() {
  faker.seed(SEED);
  resetDb();

  seedRoles();
  const categories = seedCategories();
  seedBrands();
  const sellers = seedSellers();
  const warehouses = seedWarehouses();
  const queues = seedSupportQueues();
  seedCouriers();

  seedAdminUsers({
    categoryIds: categories.filter((c) => c.level === 1).map((c) => c.id),
    sellerIds: sellers.filter((s) => s.status === 'ACTIVE').map((s) => s.id),
    warehouseIds: warehouses.map((w) => w.id),
    queueIds: queues.map((q) => q.id),
  });

  // Account managers come from the seeded admins, so Seller 360 has an owner.
  const managers = db.adminUsers.filter((u) => u.email.startsWith('sam@') || u.email.startsWith('ops@'));
  sellers.forEach((s, i) => {
    if (s.status === 'ACTIVE') s.accountManagerId = managers[i % managers.length]?.id ?? null;
  });

  // Seller detail depends on couriers and categories; catalog depends on
  // categories, brands and the active sellers that will hold the offers.
  attachVerifications();
  seedSellerDetail();
  seedBrandRequests();
  seedPenalties();
  seedClaims();

  seedAttributes();
  seedHsn();
  seedSizeCharts();
  seedBuyBoxRules();
  seedProducts();
  seedListingSubmissions();

  // Category listing counts come from the catalog rather than being invented.
  const liveByCategory = new Map();
  for (const product of db.products) {
    if (product.status !== 'LIVE') continue;
    liveByCategory.set(product.categoryId, (liveByCategory.get(product.categoryId) ?? 0) + 1);
  }
  for (const category of db.categories) {
    category.liveListings = liveByCategory.get(category.id) ?? 0;
  }

  // Orders depend on customers and on the catalog's live offers.
  seedCustomers();
  seedRiskRules();
  seedOrders();
  seedOrderExceptions();
  rollUpCustomerStats();
  seedRiskFlags();
  seedPrivacyRequests();
  seedBlocklist();

  // Fulfilment. Serviceability and rate cards first, then the records that
  // depend on shipments already existing.
  seedPincodes();
  seedRateCards();
  seedAllocationRules();
  seedShippingFeeRules();
  seedManifests();
  seedNdr();
  seedWeightDisputes();

  seedInventory();
  seedInboundConsignments();
  seedStockAdjustments();
  seedRemovalOrders();

  // Money. Settlement lines are derived from delivered items, so payouts
  // reconcile against the orders that produced them; batches then consume
  // those lines, which is why the order here matters.
  seedCommissionRules();
  seedSettlementLines();
  seedPayoutAdjustments();
  seedPayoutBatches();
  seedCodRemittances();
  seedInvoices();
  seedTaxSummaries();
  seedReconciliation();

  seedWallets();
  seedGiftCards();
  seedCashbackRules();

  // Growth & content. Segments come first because coupons and campaigns
  // target them by id; CMS collections (banners, deals, flash sales) are
  // seeded before the home layout so its sections can link real ids.
  seedSegments();
  seedCoupons();
  seedCouponRedemptions();
  seedDeals();
  seedFlashSales();
  seedSaleEvents();
  seedReferral();
  seedCampaigns();
  seedBankOffers();

  seedCategoryTabs();
  seedTopBrandTabs();
  seedBanners();
  seedOnboardingSlides();
  seedStaticPages();
  seedHelp();
  seedSearchRules();
  seedTrendingSearches();
  seedReasonLists();
  seedHomeLayout();

  seedNotificationTemplates();
  seedNotificationLogs();

  // Trust & care. SLA policies and routing come before tickets, which
  // depend on them for their deadlines; macros come before tickets too,
  // since a resolved ticket's timeline quotes one.
  seedSlaPolicies();
  seedRoutingRules();
  seedMacros();
  seedCsatConfig();
  seedTickets();
  seedChatSessions();
  seedReviews();
  seedQuestions();

  // Sponsored ads. Placements and wallets first — campaigns bill against a
  // real wallet and target a real placement.
  seedAdPlacements();
  seedAdvertiserWallets();
  seedAdCampaigns();
  seedInvalidClicks();
  seedAdInvoices();

  // Reports, settings & integrations. Feature flags come after segments,
  // since one seeded flag targets a real segment id.
  seedPlatformSettings();
  seedAppConfig();
  seedFeatureFlags();
  seedIntegrations();
  seedWebhookEvents();
  seedReportDefinitions();
  seedScheduledReports();

  seedAuditEvents();
  seedApprovals();
  seedAlerts();
  seedDashboard();

  return db;
}
