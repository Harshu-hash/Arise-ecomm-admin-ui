/**
 * The sidebar (plan §9). This is also the source the router uses to generate
 * placeholder routes for modules that land in later phases, so a nav item can
 * never point at a 404.
 *
 * `phase` is the roadmap phase that implements the screen; anything above the
 * current phase renders the "planned" placeholder.
 */

export const CURRENT_PHASE = 8;

export const NAV_GROUPS = [
  {
    key: 'overview',
    icon: 'dashboard',
    items: [{ label: 'Dashboard', path: '/', perm: 'dashboard.dashboard.view', phase: 0 }],
  },
  {
    key: 'orders',
    label: 'Orders',
    icon: 'shopping',
    items: [
      { label: 'All Orders', path: '/orders', perm: 'orders.order.view', phase: 2 },
      { label: 'Cancellations', path: '/orders/cancellations', perm: 'orders.cancellation.view', phase: 2 },
      { label: 'Returns & Replacements', path: '/returns', perm: 'orders.return.view', phase: 2 },
      { label: 'Order Exceptions', path: '/orders/exceptions', perm: 'orders.exception.view', phase: 2 },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    icon: 'appstore',
    items: [
      { label: 'Products', path: '/catalog/products', perm: 'catalog.product.view', phase: 1 },
      { label: 'Listing QC Queue', path: '/catalog/qc', perm: 'catalog.product.view', phase: 1 },
      { label: 'Categories', path: '/catalog/categories', perm: 'catalog.category.view', phase: 1 },
      { label: 'Attributes', path: '/catalog/attributes', perm: 'catalog.attribute.view', phase: 1 },
      { label: 'Brands', path: '/catalog/brands', perm: 'catalog.brand.view', phase: 1 },
      { label: 'Size Charts', path: '/catalog/size-charts', perm: 'catalog.sizechart.view', phase: 1 },
      // Deferred out of Phase 1 (needed the ImportWizard component, and no
      // golden journey depended on it) — delivered in Phase 8 alongside the
      // rest of that phase's catch-up work.
      { label: 'Bulk Uploads', path: '/catalog/imports', perm: 'catalog.import.view', phase: 8 },
      { label: 'HSN & Tax Codes', path: '/catalog/hsn', perm: 'catalog.hsn.view', phase: 1 },
      { label: 'Buy-box & Badge Rules', path: '/catalog/rules', perm: 'catalog.rules.view', phase: 8 },
    ],
  },
  {
    key: 'sellers',
    label: 'Sellers',
    icon: 'shop',
    items: [
      { label: 'All Sellers', path: '/sellers', perm: 'sellers.seller.view', phase: 1 },
      { label: 'Onboarding Applications', path: '/sellers/applications', perm: 'sellers.application.view', phase: 1 },
      { label: 'Brand Approvals', path: '/sellers/brand-approvals', perm: 'sellers.brandapproval.view', phase: 1 },
      { label: 'Performance & SLA', path: '/sellers/performance', perm: 'sellers.seller.view', phase: 1 },
      { label: 'Penalties', path: '/sellers/penalties', perm: 'sellers.penalty.view', phase: 1 },
      { label: 'Seller Claims', path: '/sellers/claims', perm: 'sellers.claim.view', phase: 1 },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: 'team',
    items: [
      { label: 'All Customers', path: '/customers', perm: 'customers.customer.view', phase: 2 },
      { label: 'Privacy Requests', path: '/customers/privacy', perm: 'customers.privacy.view', phase: 2 },
      { label: 'Fraud & Risk', path: '/customers/risk', perm: 'customers.risk.view', phase: 2 },
    ],
  },
  {
    key: 'warehouse',
    label: 'Inventory & Warehouses',
    icon: 'inbox',
    items: [
      { label: 'Warehouses', path: '/warehouses', perm: 'warehouse.warehouse.view', phase: 3 },
      { label: 'Inbound Shipments', path: '/warehouses/inbound', perm: 'warehouse.inbound.view', phase: 3 },
      { label: 'Inventory', path: '/warehouses/inventory', perm: 'warehouse.inventory.view', phase: 3 },
      { label: 'Stock Adjustments', path: '/warehouses/adjustments', perm: 'warehouse.adjustment.view', phase: 3 },
      { label: 'Removal Orders', path: '/warehouses/removals', perm: 'warehouse.removal.view', phase: 3 },
    ],
  },
  {
    key: 'logistics',
    label: 'Logistics',
    icon: 'car',
    items: [
      { label: 'Shipments', path: '/logistics/shipments', perm: 'logistics.shipment.view', phase: 3 },
      { label: 'Pickups & Manifests', path: '/logistics/pickups', perm: 'logistics.pickup.view', phase: 3 },
      { label: 'NDR', path: '/logistics/ndr', perm: 'logistics.ndr.view', phase: 3 },
      { label: 'RTO', path: '/logistics/rto', perm: 'logistics.rto.view', phase: 3 },
      { label: 'Courier Partners', path: '/logistics/couriers', perm: 'logistics.courier.view', phase: 3 },
      { label: 'Pincode Serviceability', path: '/logistics/pincodes', perm: 'logistics.pincode.view', phase: 3 },
      { label: 'Weight Disputes', path: '/logistics/weight-disputes', perm: 'logistics.weight.view', phase: 3 },
      { label: 'Shipping Rules', path: '/logistics/rules', perm: 'logistics.rules.view', phase: 3 },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: 'bank',
    items: [
      { label: 'Payments', path: '/finance/payments', perm: 'finance.payment.view', phase: 4 },
      { label: 'Refunds', path: '/finance/refunds', perm: 'finance.refund.view', phase: 4 },
      { label: 'Seller Payouts', path: '/finance/payouts', perm: 'finance.payout.view', phase: 4 },
      { label: 'Commission & Fees', path: '/finance/commission', perm: 'finance.commission.view', phase: 4 },
      { label: 'Tax (TCS/TDS)', path: '/finance/tax', perm: 'finance.tax.view', phase: 4 },
      { label: 'Invoices', path: '/finance/invoices', perm: 'finance.invoice.view', phase: 4 },
      { label: 'COD Remittance', path: '/finance/cod', perm: 'finance.cod.view', phase: 4 },
      { label: 'Reconciliation', path: '/finance/reconciliation', perm: 'finance.recon.view', phase: 4 },
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet & Gift Cards',
    icon: 'wallet',
    items: [
      { label: 'Wallet Accounts', path: '/wallet/accounts', perm: 'wallet.account.view', phase: 4 },
      { label: 'Wallet Ledger', path: '/wallet/ledger', perm: 'wallet.ledger.view', phase: 4 },
      { label: 'Gift Cards', path: '/wallet/gift-cards', perm: 'wallet.giftcard.view', phase: 4 },
      { label: 'Cashback Rules', path: '/wallet/cashback', perm: 'wallet.cashback.view', phase: 4 },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: 'notification',
    items: [
      { label: 'Coupons', path: '/marketing/coupons', perm: 'marketing.coupon.view', phase: 5 },
      { label: 'Deals', path: '/marketing/deals', perm: 'marketing.deal.view', phase: 5 },
      { label: 'Flash Sales', path: '/marketing/flash-sales', perm: 'marketing.flashsale.view', phase: 5 },
      { label: 'Sale Events', path: '/marketing/events', perm: 'marketing.event.view', phase: 5 },
      { label: 'Referral Program', path: '/marketing/referral', perm: 'marketing.referral.view', phase: 5 },
      { label: 'Campaigns', path: '/marketing/campaigns', perm: 'marketing.campaign.view', phase: 5 },
      { label: 'Customer Segments', path: '/marketing/segments', perm: 'marketing.segment.view', phase: 5 },
      { label: 'Bank Offer Display', path: '/marketing/bank-offers', perm: 'marketing.bankoffer.view', phase: 5 },
    ],
  },
  {
    key: 'ads',
    label: 'Sponsored Ads',
    icon: 'rise',
    items: [
      { label: 'Campaigns', path: '/ads/campaigns', perm: 'ads.campaign.view', phase: 7 },
      { label: 'Ad Review Queue', path: '/ads/review', perm: 'ads.review.view', phase: 7 },
      { label: 'Placements & Pricing', path: '/ads/placements', perm: 'ads.placement.view', phase: 7 },
      { label: 'Advertiser Billing', path: '/ads/billing', perm: 'ads.billing.view', phase: 7 },
      { label: 'Ads Reports', path: '/ads/reports', perm: 'ads.report.view', phase: 7 },
    ],
  },
  {
    key: 'cms',
    label: 'Content',
    icon: 'layout',
    items: [
      { label: 'Home Layout', path: '/cms/home', perm: 'cms.home.view', phase: 5 },
      { label: 'Banners', path: '/cms/banners', perm: 'cms.banner.view', phase: 5 },
      { label: 'Onboarding Slides', path: '/cms/onboarding', perm: 'cms.onboarding.view', phase: 5 },
      { label: 'Help Center', path: '/cms/help', perm: 'cms.help.view', phase: 5 },
      { label: 'Static Pages', path: '/cms/pages', perm: 'cms.page.view', phase: 5 },
      { label: 'Reason Masters', path: '/cms/reasons', perm: 'cms.reasons.view', phase: 5 },
      { label: 'Search Config', path: '/cms/search', perm: 'cms.search.view', phase: 5 },
    ],
  },
  {
    key: 'reviews',
    label: 'Reviews & Q&A',
    icon: 'star',
    items: [
      { label: 'Reviews', path: '/reviews', perm: 'reviews.review.view', phase: 6 },
      { label: 'Questions & Answers', path: '/reviews/qa', perm: 'reviews.qa.view', phase: 6 },
      { label: 'Abuse Reports', path: '/reviews/abuse', perm: 'reviews.abuse.view', phase: 6 },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    icon: 'customerService',
    items: [
      { label: 'Ticket Queues', path: '/support/tickets', perm: 'support.ticket.view', phase: 6 },
      { label: 'Live Chat Console', path: '/support/chat', perm: 'support.chat.handle', phase: 6 },
      { label: 'Macros', path: '/support/macros', perm: 'support.macro.view', phase: 6 },
      { label: 'SLA Policies', path: '/support/sla', perm: 'support.sla.view', phase: 6 },
      { label: 'CSAT', path: '/support/csat', perm: 'support.csat.view', phase: 6 },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'barChart',
    items: [
      { label: 'Analytics Dashboards', path: '/reports/analytics', perm: 'reports.sales.view', phase: 8 },
      { label: 'Report Library', path: '/reports/library', perm: 'reports.library.view', phase: 8 },
      { label: 'Scheduled Reports', path: '/reports/scheduled', perm: 'reports.schedule.view', phase: 8 },
      { label: 'Export Center', path: '/reports/exports', perm: 'reports.export.view', phase: 8 },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'bell',
    items: [
      { label: 'Transactional Templates', path: '/notifications/templates', perm: 'notifications.template.view', phase: 5 },
      { label: 'Delivery Logs', path: '/notifications/logs', perm: 'notifications.log.view', phase: 5 },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    icon: 'setting',
    items: [
      { label: 'Admin Users', path: '/admin/users', perm: 'admin.user.view', phase: 0 },
      { label: 'Roles & Permissions', path: '/admin/roles', perm: 'admin.role.view', phase: 0 },
      { label: 'Approvals', path: '/admin/approvals', perm: 'admin.approval.view', phase: 0 },
      { label: 'Audit Log', path: '/admin/audit', perm: 'admin.audit.view', phase: 0 },
      { label: 'Platform Settings', path: '/admin/settings', perm: 'admin.settings.view', phase: 8 },
      { label: 'App Config', path: '/admin/app-config', perm: 'admin.appconfig.view', phase: 8 },
      { label: 'Integrations', path: '/admin/integrations', perm: 'admin.integration.view', phase: 8 },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, groupKey: g.key, groupLabel: g.label })),
);

export function navItemForPath(path) {
  return ALL_NAV_ITEMS.find((i) => i.path === path) ?? null;
}
