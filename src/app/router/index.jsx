import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import AppLayout from '@layouts/AppLayout';
import AuthLayout from '@layouts/AuthLayout';
import { SHOW_DEV_TOOLS } from '@core/config/env';
import { ALL_NAV_ITEMS } from '@shared/constants/navigation';
import { RequireAnonymous, RequireAuth, RequirePermission } from './guards';
import SessionBootstrap from './SessionBootstrap';

/* Route-level code splitting: each page is its own chunk. */
const LoginPage = lazy(() => import('@features/auth/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@features/auth/pages/ResetPasswordPage'));
const AcceptInvitePage = lazy(() => import('@features/auth/pages/AcceptInvitePage'));
const ChangePasswordPage = lazy(() => import('@features/auth/pages/ChangePasswordPage'));

const DashboardPage = lazy(() => import('@features/dashboard/pages/DashboardPage'));

/* Phase 1 — sellers */
const SellersListPage = lazy(() => import('@features/sellers/pages/SellersListPage'));
const SellerApplicationsPage = lazy(() => import('@features/sellers/pages/SellerApplicationsPage'));
const SellerApplicationReviewPage = lazy(() => import('@features/sellers/pages/SellerApplicationReviewPage'));
const SellerDetailPage = lazy(() => import('@features/sellers/pages/SellerDetailPage'));
const SellerPerformancePage = lazy(() => import('@features/sellers/pages/SellerPerformancePage'));
const BrandApprovalsPage = lazy(() => import('@features/sellers/pages/BrandApprovalsPage'));
const PenaltiesPage = lazy(() => import('@features/sellers/pages/PenaltiesPage'));
const SellerClaimsPage = lazy(() => import('@features/sellers/pages/SellerClaimsPage'));

/* Phase 2 — orders & customers */
const OrdersListPage = lazy(() => import('@features/orders/pages/OrdersListPage'));
const OrderDetailPage = lazy(() => import('@features/orders/pages/OrderDetailPage'));
const ReturnsPage = lazy(() => import('@features/orders/pages/ReturnsPage'));
const ReturnDetailPage = lazy(() => import('@features/orders/pages/ReturnDetailPage'));
const CancellationsPage = lazy(() => import('@features/orders/pages/CancellationsPage'));
const OrderExceptionsPage = lazy(() => import('@features/orders/pages/OrderExceptionsPage'));
const CustomersListPage = lazy(() => import('@features/customers/pages/CustomersListPage'));
const CustomerDetailPage = lazy(() => import('@features/customers/pages/CustomerDetailPage'));
const PrivacyRequestsPage = lazy(() => import('@features/customers/pages/PrivacyRequestsPage'));
const FraudRiskPage = lazy(() => import('@features/customers/pages/FraudRiskPage'));

/* Phase 3 — logistics & warehouses */
const ShipmentsPage = lazy(() => import('@features/logistics/pages/ShipmentsPage'));
const PickupsPage = lazy(() => import('@features/logistics/pages/PickupsPage'));
const NdrPage = lazy(() => import('@features/logistics/pages/NdrPage'));
const RtoPage = lazy(() => import('@features/logistics/pages/RtoPage'));
const CouriersPage = lazy(() => import('@features/logistics/pages/CouriersPage'));
const PincodesPage = lazy(() => import('@features/logistics/pages/PincodesPage'));
const WeightDisputesPage = lazy(() => import('@features/logistics/pages/WeightDisputesPage'));
const ShippingRulesPage = lazy(() => import('@features/logistics/pages/ShippingRulesPage'));
const WarehousesPage = lazy(() => import('@features/warehouse/pages/WarehousesPage'));
const InboundPage = lazy(() => import('@features/warehouse/pages/InboundPage'));
const InboundDetailPage = lazy(() => import('@features/warehouse/pages/InboundDetailPage'));
const InventoryPage = lazy(() => import('@features/warehouse/pages/InventoryPage'));
const StockAdjustmentsPage = lazy(() => import('@features/warehouse/pages/StockAdjustmentsPage'));
const RemovalOrdersPage = lazy(() => import('@features/warehouse/pages/RemovalOrdersPage'));

/* Phase 6 — trust & care */
const ReviewsPage = lazy(() => import('@features/reviews/pages/ReviewsPage'));
const QaPage = lazy(() => import('@features/reviews/pages/QaPage'));
const AbuseReportsPage = lazy(() => import('@features/reviews/pages/AbuseReportsPage'));
const TicketsPage = lazy(() => import('@features/support/pages/TicketsPage'));
const TicketDetailPage = lazy(() => import('@features/support/pages/TicketDetailPage'));
const LiveChatPage = lazy(() => import('@features/support/pages/LiveChatPage'));
const MacrosPage = lazy(() => import('@features/support/pages/MacrosPage'));
const SlaPoliciesPage = lazy(() => import('@features/support/pages/SlaPoliciesPage'));
const CsatPage = lazy(() => import('@features/support/pages/CsatPage'));

/* Phase 5 — growth & content */
const CouponsListPage = lazy(() => import('@features/marketing/pages/CouponsListPage'));
const SegmentsPage = lazy(() => import('@features/marketing/pages/SegmentsPage'));
const DealsPage = lazy(() => import('@features/marketing/pages/DealsPage'));
const FlashSalesListPage = lazy(() => import('@features/marketing/pages/FlashSalesListPage'));
const FlashSaleDetailPage = lazy(() => import('@features/marketing/pages/FlashSaleDetailPage'));
const SaleEventsPage = lazy(() => import('@features/marketing/pages/SaleEventsPage'));
const ReferralPage = lazy(() => import('@features/marketing/pages/ReferralPage'));
const CampaignsPage = lazy(() => import('@features/marketing/pages/CampaignsPage'));
const BankOffersPage = lazy(() => import('@features/marketing/pages/BankOffersPage'));
const HomeLayoutPage = lazy(() => import('@features/cms/pages/HomeLayoutPage'));
const BannersPage = lazy(() => import('@features/cms/pages/BannersPage'));
const OnboardingPage = lazy(() => import('@features/cms/pages/OnboardingPage'));
const HelpCenterPage = lazy(() => import('@features/cms/pages/HelpCenterPage'));
const StaticPagesPage = lazy(() => import('@features/cms/pages/StaticPagesPage'));
const ReasonMastersPage = lazy(() => import('@features/cms/pages/ReasonMastersPage'));
const SearchConfigPage = lazy(() => import('@features/cms/pages/SearchConfigPage'));
const TemplatesPage = lazy(() => import('@features/notifications/pages/TemplatesPage'));
const NotificationLogsPage = lazy(() => import('@features/notifications/pages/NotificationLogsPage'));

/* Phase 4 — money */
const PaymentsPage = lazy(() => import('@features/finance/pages/PaymentsPage'));
const RefundsPage = lazy(() => import('@features/finance/pages/RefundsPage'));
const PayoutsPage = lazy(() => import('@features/finance/pages/PayoutsPage'));
const PayoutBatchDetailPage = lazy(() => import('@features/finance/pages/PayoutBatchDetailPage'));
const CommissionPage = lazy(() => import('@features/finance/pages/CommissionPage'));
const TaxPage = lazy(() => import('@features/finance/pages/TaxPage'));
const InvoicesPage = lazy(() => import('@features/finance/pages/InvoicesPage'));
const CodRemittancePage = lazy(() => import('@features/finance/pages/CodRemittancePage'));
const ReconciliationPage = lazy(() => import('@features/finance/pages/ReconciliationPage'));
const WalletAccountsPage = lazy(() => import('@features/wallet/pages/WalletAccountsPage'));
const WalletLedgerPage = lazy(() => import('@features/wallet/pages/WalletLedgerPage'));
const GiftCardsPage = lazy(() => import('@features/wallet/pages/GiftCardsPage'));
const CashbackRulesPage = lazy(() => import('@features/wallet/pages/CashbackRulesPage'));

/* Phase 1 — catalog */
const ProductsListPage = lazy(() => import('@features/catalog/pages/ProductsListPage'));
const ProductDetailPage = lazy(() => import('@features/catalog/pages/ProductDetailPage'));
const QcQueuePage = lazy(() => import('@features/catalog/pages/QcQueuePage'));
const CategoriesPage = lazy(() => import('@features/catalog/pages/CategoriesPage'));
const AttributesPage = lazy(() => import('@features/catalog/pages/AttributesPage'));
const BrandsPage = lazy(() => import('@features/catalog/pages/BrandsPage'));
const SizeChartsPage = lazy(() => import('@features/catalog/pages/SizeChartsPage'));
const HsnCodesPage = lazy(() => import('@features/catalog/pages/HsnCodesPage'));
const BulkUploadsPage = lazy(() => import('@features/catalog/pages/BulkUploadsPage'));
const BuyBoxRulesPage = lazy(() => import('@features/catalog/pages/BuyBoxRulesPage'));
/* Phase 7 — sponsored ads */
const CampaignsListPage = lazy(() => import('@features/ads/pages/CampaignsPage'));
const CampaignDetailPage = lazy(() => import('@features/ads/pages/CampaignDetailPage'));
const AdReviewPage = lazy(() => import('@features/ads/pages/AdReviewPage'));
const PlacementsPage = lazy(() => import('@features/ads/pages/PlacementsPage'));
const AdsBillingPage = lazy(() => import('@features/ads/pages/BillingPage'));
const AdsReportsPage = lazy(() => import('@features/ads/pages/ReportsPage'));

/* Phase 8 — reports, settings & integrations */
const AnalyticsDashboardsPage = lazy(() => import('@features/reports/pages/AnalyticsDashboardsPage'));
const ReportLibraryPage = lazy(() => import('@features/reports/pages/ReportLibraryPage'));
const ScheduledReportsPage = lazy(() => import('@features/reports/pages/ScheduledReportsPage'));
const ExportCenterPage = lazy(() => import('@features/reports/pages/ExportCenterPage'));
const PlatformSettingsPage = lazy(() => import('@features/settings/pages/PlatformSettingsPage'));
const AppConfigPage = lazy(() => import('@features/settings/pages/AppConfigPage'));
const IntegrationsPage = lazy(() => import('@features/settings/pages/IntegrationsPage'));

const AdminUsersListPage = lazy(() => import('@features/adminUsers/pages/AdminUsersListPage'));
const AdminUserDetailPage = lazy(() => import('@features/adminUsers/pages/AdminUserDetailPage'));
const RolesListPage = lazy(() => import('@features/roles/pages/RolesListPage'));
const RoleEditorPage = lazy(() => import('@features/roles/pages/RoleEditorPage'));
const ApprovalsPage = lazy(() => import('@features/approvals/pages/ApprovalsPage'));
const AuditLogPage = lazy(() => import('@features/audit/pages/AuditLogPage'));
const MyAccountPage = lazy(() => import('@features/me/pages/MyAccountPage'));
const ComponentGalleryPage = lazy(() => import('@features/dev/pages/ComponentGalleryPage'));
const NotFoundPage = lazy(() => import('@features/system/pages/NotFoundPage'));
const ModulePlaceholderPage = lazy(() => import('@features/system/pages/ModulePlaceholderPage'));

/** Wraps a page in its permission gate, declared alongside the route. */
function gated(perm, element) {
  return <RequirePermission perm={perm}>{element}</RequirePermission>;
}

/**
 * Screens delivered in Phase 0. Everything else in the nav model gets a
 * placeholder route generated below, so no nav item ever 404s.
 */
const IMPLEMENTED = [
  { path: '/', element: gated('dashboard.dashboard.view', <DashboardPage />) },

  // Sellers. The review workbench is declared before `/sellers/:id` only for
  // readability; React Router matches on specificity, not order.
  { path: '/sellers', element: gated('sellers.seller.view', <SellersListPage />) },
  { path: '/sellers/applications', element: gated('sellers.application.view', <SellerApplicationsPage />) },
  { path: '/sellers/brand-approvals', element: gated('sellers.brandapproval.view', <BrandApprovalsPage />) },
  { path: '/sellers/performance', element: gated('sellers.seller.view', <SellerPerformancePage />) },
  { path: '/sellers/penalties', element: gated('sellers.penalty.view', <PenaltiesPage />) },
  { path: '/sellers/claims', element: gated('sellers.claim.view', <SellerClaimsPage />) },
  { path: '/sellers/:id', element: gated('sellers.seller.view', <SellerDetailPage />) },
  { path: '/sellers/:id/review', element: gated('sellers.application.review', <SellerApplicationReviewPage />) },

  // Orders
  { path: '/orders', element: gated('orders.order.view', <OrdersListPage />) },
  { path: '/orders/cancellations', element: gated('orders.cancellation.view', <CancellationsPage />) },
  { path: '/orders/exceptions', element: gated('orders.exception.view', <OrderExceptionsPage />) },
  { path: '/orders/:id', element: gated('orders.order.view', <OrderDetailPage />) },
  { path: '/returns', element: gated('orders.return.view', <ReturnsPage />) },
  { path: '/returns/:id', element: gated('orders.return.view', <ReturnDetailPage />) },

  // Customers
  { path: '/customers', element: gated('customers.customer.view', <CustomersListPage />) },
  { path: '/customers/privacy', element: gated('customers.privacy.view', <PrivacyRequestsPage />) },
  { path: '/customers/risk', element: gated('customers.risk.view', <FraudRiskPage />) },
  { path: '/customers/:id', element: gated('customers.customer.view', <CustomerDetailPage />) },

  // Logistics
  { path: '/logistics/shipments', element: gated('logistics.shipment.view', <ShipmentsPage />) },
  { path: '/logistics/pickups', element: gated('logistics.pickup.view', <PickupsPage />) },
  { path: '/logistics/ndr', element: gated('logistics.ndr.view', <NdrPage />) },
  { path: '/logistics/rto', element: gated('logistics.rto.view', <RtoPage />) },
  { path: '/logistics/couriers', element: gated('logistics.courier.view', <CouriersPage />) },
  { path: '/logistics/pincodes', element: gated('logistics.pincode.view', <PincodesPage />) },
  { path: '/logistics/weight-disputes', element: gated('logistics.weight.view', <WeightDisputesPage />) },
  { path: '/logistics/rules', element: gated('logistics.rules.view', <ShippingRulesPage />) },

  // Warehouses
  { path: '/warehouses', element: gated('warehouse.warehouse.view', <WarehousesPage />) },
  { path: '/warehouses/inbound', element: gated('warehouse.inbound.view', <InboundPage />) },
  { path: '/warehouses/inbound/:id', element: gated('warehouse.inbound.view', <InboundDetailPage />) },
  { path: '/warehouses/inventory', element: gated('warehouse.inventory.view', <InventoryPage />) },
  { path: '/warehouses/adjustments', element: gated('warehouse.adjustment.view', <StockAdjustmentsPage />) },
  { path: '/warehouses/removals', element: gated('warehouse.removal.view', <RemovalOrdersPage />) },

  // Catalog
  { path: '/catalog/products', element: gated('catalog.product.view', <ProductsListPage />) },
  { path: '/catalog/products/:id', element: gated('catalog.product.view', <ProductDetailPage />) },
  { path: '/catalog/qc', element: gated('catalog.product.view', <QcQueuePage />) },
  { path: '/catalog/categories', element: gated('catalog.category.view', <CategoriesPage />) },
  { path: '/catalog/attributes', element: gated('catalog.attribute.view', <AttributesPage />) },
  { path: '/catalog/brands', element: gated('catalog.brand.view', <BrandsPage />) },
  { path: '/catalog/size-charts', element: gated('catalog.sizechart.view', <SizeChartsPage />) },
  { path: '/catalog/hsn', element: gated('catalog.hsn.view', <HsnCodesPage />) },
  { path: '/catalog/imports', element: gated('catalog.import.view', <BulkUploadsPage />) },
  { path: '/catalog/rules', element: gated('catalog.rules.view', <BuyBoxRulesPage />) },

  // Reviews & Q&A
  { path: '/reviews', element: gated('reviews.review.view', <ReviewsPage />) },
  { path: '/reviews/qa', element: gated('reviews.qa.view', <QaPage />) },
  { path: '/reviews/abuse', element: gated('reviews.abuse.view', <AbuseReportsPage />) },

  // Support
  { path: '/support/tickets', element: gated('support.ticket.view', <TicketsPage />) },
  { path: '/support/tickets/:id', element: gated('support.ticket.view', <TicketDetailPage />) },
  { path: '/support/chat', element: gated('support.chat.handle', <LiveChatPage />) },
  { path: '/support/macros', element: gated('support.macro.view', <MacrosPage />) },
  { path: '/support/sla', element: gated('support.sla.view', <SlaPoliciesPage />) },
  { path: '/support/csat', element: gated('support.csat.view', <CsatPage />) },

  // Marketing
  { path: '/marketing/coupons', element: gated('marketing.coupon.view', <CouponsListPage />) },
  { path: '/marketing/segments', element: gated('marketing.segment.view', <SegmentsPage />) },
  { path: '/marketing/deals', element: gated('marketing.deal.view', <DealsPage />) },
  { path: '/marketing/flash-sales', element: gated('marketing.flashsale.view', <FlashSalesListPage />) },
  { path: '/marketing/flash-sales/:id', element: gated('marketing.flashsale.view', <FlashSaleDetailPage />) },
  { path: '/marketing/events', element: gated('marketing.event.view', <SaleEventsPage />) },
  { path: '/marketing/referral', element: gated('marketing.referral.view', <ReferralPage />) },
  { path: '/marketing/campaigns', element: gated('marketing.campaign.view', <CampaignsPage />) },
  { path: '/marketing/bank-offers', element: gated('marketing.bankoffer.view', <BankOffersPage />) },

  // Content (CMS)
  { path: '/cms/home', element: gated('cms.home.view', <HomeLayoutPage />) },
  { path: '/cms/banners', element: gated('cms.banner.view', <BannersPage />) },
  { path: '/cms/onboarding', element: gated('cms.onboarding.view', <OnboardingPage />) },
  { path: '/cms/help', element: gated('cms.help.view', <HelpCenterPage />) },
  { path: '/cms/pages', element: gated('cms.page.view', <StaticPagesPage />) },
  { path: '/cms/reasons', element: gated('cms.reasons.view', <ReasonMastersPage />) },
  { path: '/cms/search', element: gated('cms.search.view', <SearchConfigPage />) },

  // Notification templates
  { path: '/notifications/templates', element: gated('notifications.template.view', <TemplatesPage />) },
  { path: '/notifications/logs', element: gated('notifications.log.view', <NotificationLogsPage />) },

  // Finance
  { path: '/finance/payments', element: gated('finance.payment.view', <PaymentsPage />) },
  { path: '/finance/refunds', element: gated('finance.refund.view', <RefundsPage />) },
  { path: '/finance/payouts', element: gated('finance.payout.view', <PayoutsPage />) },
  { path: '/finance/payouts/:id', element: gated('finance.payout.view', <PayoutBatchDetailPage />) },
  { path: '/finance/commission', element: gated('finance.commission.view', <CommissionPage />) },
  { path: '/finance/tax', element: gated('finance.tax.view', <TaxPage />) },
  { path: '/finance/invoices', element: gated('finance.invoice.view', <InvoicesPage />) },
  { path: '/finance/cod', element: gated('finance.cod.view', <CodRemittancePage />) },
  { path: '/finance/reconciliation', element: gated('finance.recon.view', <ReconciliationPage />) },

  // Wallet & gift cards
  { path: '/wallet/accounts', element: gated('wallet.account.view', <WalletAccountsPage />) },
  { path: '/wallet/ledger', element: gated('wallet.ledger.view', <WalletLedgerPage />) },
  { path: '/wallet/gift-cards', element: gated('wallet.giftcard.view', <GiftCardsPage />) },
  { path: '/wallet/cashback', element: gated('wallet.cashback.view', <CashbackRulesPage />) },

  // Sponsored Ads
  { path: '/ads/campaigns', element: gated('ads.campaign.view', <CampaignsListPage />) },
  { path: '/ads/campaigns/:id', element: gated('ads.campaign.view', <CampaignDetailPage />) },
  { path: '/ads/review', element: gated('ads.review.view', <AdReviewPage />) },
  { path: '/ads/placements', element: gated('ads.placement.view', <PlacementsPage />) },
  { path: '/ads/billing', element: gated('ads.billing.view', <AdsBillingPage />) },
  { path: '/ads/reports', element: gated('ads.report.view', <AdsReportsPage />) },

  // Reports
  { path: '/reports/analytics', element: gated('reports.sales.view', <AnalyticsDashboardsPage />) },
  { path: '/reports/library', element: gated('reports.library.view', <ReportLibraryPage />) },
  { path: '/reports/scheduled', element: gated('reports.schedule.view', <ScheduledReportsPage />) },
  { path: '/reports/exports', element: gated('reports.export.view', <ExportCenterPage />) },

  { path: '/admin/users', element: gated('admin.user.view', <AdminUsersListPage />) },
  { path: '/admin/users/:id', element: gated('admin.user.view', <AdminUserDetailPage />) },
  { path: '/admin/roles', element: gated('admin.role.view', <RolesListPage />) },
  { path: '/admin/roles/:id', element: gated('admin.role.view', <RoleEditorPage />) },
  { path: '/admin/approvals', element: gated('admin.approval.view', <ApprovalsPage />) },
  { path: '/admin/approvals/:id', element: gated('admin.approval.view', <ApprovalsPage />) },
  { path: '/admin/audit', element: gated('admin.audit.view', <AuditLogPage />) },
  { path: '/admin/settings', element: gated('admin.settings.view', <PlatformSettingsPage />) },
  { path: '/admin/app-config', element: gated('admin.appconfig.view', <AppConfigPage />) },
  { path: '/admin/integrations', element: gated('admin.integration.view', <IntegrationsPage />) },
  { path: '/me', element: <MyAccountPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
];

const implementedPaths = new Set(IMPLEMENTED.map((r) => r.path));

/**
 * Anything in the nav model without a real route gets a placeholder.
 *
 * Keyed off what is actually implemented rather than off the phase number:
 * two Phase 1 screens were deferred, and when the phase marker moved past
 * them their sidebar links started 404ing. This cannot drift.
 */
const placeholderRoutes = ALL_NAV_ITEMS.filter((item) => !implementedPaths.has(item.path)).map(
  (item) => ({
    path: item.path,
    element: gated(item.perm, <ModulePlaceholderPage />),
  }),
);

export const router = createBrowserRouter([
  {
    element: <SessionBootstrap />,
    children: [
      {
        element: <RequireAnonymous />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/forgot-password', element: <ForgotPasswordPage /> },
              { path: '/reset-password', element: <ResetPasswordPage /> },
              { path: '/accept-invite', element: <AcceptInvitePage /> },
            ],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              ...IMPLEMENTED,
              ...placeholderRoutes,
              ...(SHOW_DEV_TOOLS
                ? [{ path: '/dev/components', element: <ComponentGalleryPage /> }]
                : []),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      // A stray /logout link should land somewhere sensible rather than 404.
      { path: '/logout', element: <Navigate to="/login" replace /> },
    ],
  },
]);
