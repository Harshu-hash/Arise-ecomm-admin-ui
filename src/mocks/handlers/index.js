import { adCampaignHandlers } from './adCampaigns';
import { adminUserHandlers } from './adminUsers';
import { adsConfigHandlers } from './adsConfig';
import { appConfigHandlers } from './appConfig';
import { approvalHandlers } from './approvals';
import { auditHandlers } from './audit';
import { authHandlers } from './auth';
import { bankOfferHandlers } from './bankOffers';
import { campaignHandlers } from './campaigns';
import { catalogImportHandlers } from './catalogImports';
import { catalogMasterHandlers } from './catalogMasters';
import { catalogRulesHandlers } from './catalogRules';
import { chatHandlers } from './chat';
import { contentHandlers } from './content';
import { couponHandlers } from './coupons';
import { customerHandlers } from './customers';
import { dashboardHandlers } from './dashboard';
import { dealHandlers } from './deals';
import { devHandlers } from './dev';
import { financeHandlers } from './finance';
import { financeConfigHandlers } from './financeConfig';
import { flashSaleHandlers } from './flashSales';
import { helpHandlers } from './help';
import { homeLayoutHandlers } from './homeLayout';
import { integrationsHandlers } from './integrations';
import { jobHandlers } from './jobs';
import { logisticsHandlers } from './logistics';
import { lookupHandlers } from './lookups';
import { notificationHandlers } from './notifications';
import { orderHandlers } from './orders';
import { payoutHandlers } from './payouts';
import { piiHandlers } from './pii';
import { productHandlers } from './products';
import { reasonHandlers } from './reasons';
import { referralHandlers } from './referral';
import { reportsHandlers } from './reports';
import { returnHandlers } from './returns';
import { reviewHandlers } from './reviews';
import { roleHandlers } from './roles';
import { saleEventHandlers } from './saleEvents';
import { searchHandlers } from './search';
import { segmentHandlers } from './segments';
import { sellerOpsHandlers } from './sellerOps';
import { sellerHandlers } from './sellers';
import { settingsHandlers } from './settings';
import { supportConfigHandlers } from './supportConfig';
import { ticketHandlers } from './tickets';
import { walletHandlers } from './wallet';
import { warehouseHandlers } from './warehouse';

/**
 * MSW matches the first handler whose path matches, so anything with a literal
 * segment that could be read as a parameter must come first:
 *   `/sellers/performance`  before `/sellers/:id`     (sellerOps before sellers)
 *   `/categories/tree`      before `/categories/:id`  (lookups before catalog)
 *   `/customers/privacy-requests` and `/customers/risk` before `/customers/:id`
 *   `/orders/exceptions` and `/orders/cancellations`   before `/orders/:id`
 *   `/pincodes/check`       before `/pincodes/:id`
 *   `/settlements/summary`  before `/settlements`
 *   `/sellers/:id/payout-hold` is registered with payouts, before sellers
 *   New in Phase 5: none of the marketing/CMS routes collide on method +
 *   path, so none needed reordering — `/deals/calendar` and
 *   `/campaigns/reach` are GETs/POSTs with no same-method `:id` sibling.
 *   New in Phase 6: same story — `/support/*`, `/chat/*`, `/questions`,
 *   `/answers` and `/abuse-reports` are their own literal prefixes.
 *   New in Phase 7: none either — `/ads/*` is its own literal prefix.
 *   New in Phase 8: `/admin/settings`, `/admin/app-config`,
 *   `/admin/integrations` and `/reports/*` are each their own literal
 *   prefix alongside the existing `/admin/*` routes, so again no reordering.
 *   `/catalog/buybox-rules` and `/catalog/imports` (M3.9/M3.10, deferred
 *   from Phase 1) are new literal prefixes too — every existing catalog
 *   route is flat (`/products`, `/categories`, …), never nested under
 *   `/catalog/`, so there is nothing for these to collide with.
 * Within a file the same rule applies to declaration order.
 */
export const handlers = [
  ...devHandlers,
  ...authHandlers,
  ...dashboardHandlers,
  ...approvalHandlers,
  ...auditHandlers,
  ...adminUserHandlers,
  ...roleHandlers,
  ...settingsHandlers,
  ...appConfigHandlers,
  ...integrationsHandlers,
  ...reportsHandlers,
  ...lookupHandlers,
  ...piiHandlers,
  ...adCampaignHandlers,
  ...adsConfigHandlers,
  ...couponHandlers,
  ...segmentHandlers,
  ...reviewHandlers,
  ...ticketHandlers,
  ...supportConfigHandlers,
  ...chatHandlers,
  ...dealHandlers,
  ...flashSaleHandlers,
  ...saleEventHandlers,
  ...referralHandlers,
  ...campaignHandlers,
  ...bankOfferHandlers,
  ...homeLayoutHandlers,
  ...contentHandlers,
  ...helpHandlers,
  ...searchHandlers,
  ...reasonHandlers,
  ...notificationHandlers,
  ...financeConfigHandlers,
  ...financeHandlers,
  ...payoutHandlers,
  ...walletHandlers,
  ...sellerOpsHandlers,
  ...sellerHandlers,
  ...catalogMasterHandlers,
  ...catalogRulesHandlers,
  ...catalogImportHandlers,
  ...productHandlers,
  ...customerHandlers,
  ...returnHandlers,
  ...orderHandlers,
  ...logisticsHandlers,
  ...warehouseHandlers,
  ...jobHandlers,
];
