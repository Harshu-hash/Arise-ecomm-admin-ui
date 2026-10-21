import { db, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Platform settings, app config, feature flags, integrations and the report
 * library/schedules (M15, M17.5–M17.7).
 *
 * Settings sections and the app config doc live in the existing `settings`
 * collection (one row per id), the same place Phase 0 put the dashboard's
 * seed — there is no reason for platform-wide singletons to get their own
 * one-row collection each.
 */

const SYSTEM_NAME = 'System';

/** Sensitive sections route edits through maker-checker; the rest save directly. */
export const SENSITIVE_SETTINGS_SECTIONS = ['fees', 'approvalThresholds', 'security'];

export const SETTINGS_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    values: {
      platformName: 'Arise',
      supportEmail: 'support@arise.test',
      supportPhone: '1800-123-4567',
      businessAddress: 'Prestige Tech Park, Bengaluru, Karnataka 560103',
      legalEntityName: 'Arise Commerce Technologies Pvt. Ltd.',
      gstins: [
        { state: 'Karnataka', gstin: '29AABCA1234D1Z5' },
        { state: 'Maharashtra', gstin: '27AABCA1234D1Z3' },
        { state: 'Delhi', gstin: '07AABCA1234D1Z9' },
      ],
    },
  },
  {
    id: 'orders',
    label: 'Order settings',
    values: {
      paymentPendingTimeoutMins: 30,
      sellerAcceptSlaHours: 24,
      dispatchSlaHoursSellerFulfilled: 48,
      dispatchSlaHoursFba: 24,
      autoCancelOnSlaBreach: true,
      maxQtyPerOrder: 10,
      codMinPaise: 0,
      codMaxPaise: 5_000_00,
      otpOnDeliveryAbovePaise: 2_000_00,
      otpOnDeliveryAll: false,
    },
  },
  {
    id: 'returns',
    label: 'Return policies',
    values: {
      // Category-wise windows are edited in Catalog (M3.1); this is the
      // platform-wide fallback and the timing rules that apply across all of them.
      defaultReturnWindowDays: 7,
      autoApproveBelowPaise: 500_00,
      refundTimingByTrustTier: { new: 7, standard: 3, trusted: 1 },
    },
  },
  {
    id: 'fees',
    label: 'Fees',
    values: {
      platformFeePaise: 500,
      deliveryFeeFreeThresholdPaise: 499_00,
      codConvenienceFeePaise: 1500,
    },
  },
  {
    id: 'payments',
    label: 'Payments',
    values: {
      enabledMethods: ['UPI', 'CARDS', 'NETBANKING', 'WALLET', 'COD'],
      codEnabled: true,
      walletUsageCapPct: 50,
    },
  },
  {
    id: 'tax',
    label: 'Tax',
    values: {
      // TCS/TDS rates themselves are edited in Finance (M8.6); this is just
      // the invoice numbering series and the HSN default.
      invoiceSeriesPrefix: 'ARS/INV',
      hsnDefaultRatePct: 18,
    },
  },
  {
    id: 'sellerPolicies',
    label: 'Seller policies',
    values: {
      tierGmvThresholdsPaise: { bronze: 0, silver: 5_00_000_00, gold: 25_00_000_00, platinum: 1_00_00_000_00 },
      payoutCycleDay: 'MONDAY',
      reserveHoldPctNewSellers: 10,
    },
  },
  {
    id: 'approvalThresholds',
    label: 'Approval thresholds',
    values: {
      // Informational mirror of the limits the maker-checker engine already
      // enforces (see `GUARDED_ACTIONS`); wiring these fields back into that
      // engine is left for later — see the plan's Phase 8 decisions.
      defaultRefundLimitPaise: 10_00_00,
      defaultWalletAdjustLimitPaise: 50_000,
      payoutAdjustThresholdPaise: 10_000_00,
      giftcardBatchThresholdPaise: 1_00_000_00,
    },
  },
  {
    id: 'security',
    label: 'Security',
    values: {
      sessionIdleTimeoutMins: 30,
      passwordMinLength: 10,
      passwordRequireSymbol: true,
      ipAllowlist: [],
      piiRevealAutoHideSeconds: 20,
    },
  },
  {
    id: 'support',
    label: 'Support',
    values: {
      businessHoursStart: '09:00',
      businessHoursEnd: '21:00',
      holidays: ['2026-01-26', '2026-08-15', '2026-10-02', '2026-10-21'],
      autoCloseDaysAfterResolve: 3,
    },
  },
];

export function seedPlatformSettings() {
  return SETTINGS_SECTIONS.map((section) =>
    insert('settings', {
      id: section.id,
      label: section.label,
      values: section.values,
      version: 1,
      updatedAt: mockNowIso(),
      updatedByName: SYSTEM_NAME,
    }),
  );
}

const APP_PLATFORMS = ['ANDROID', 'IOS', 'WEB'];

export function seedAppConfig() {
  return insert('settings', {
    id: 'appConfig',
    platforms: Object.fromEntries(
      APP_PLATFORMS.map((p) => [
        p,
        {
          latestVersion: '2.6.0',
          minSupportedVersion: '2.3.0',
          softUpdateFromVersion: '2.5.0',
          releaseNotes: 'Bug fixes and performance improvements.',
          storeUrl: p === 'ANDROID'
            ? 'https://play.google.com/store/apps/details?id=com.arise.app'
            : p === 'IOS'
              ? 'https://apps.apple.com/app/arise/id0000000000'
              : 'https://arise.test',
        },
      ]),
    ),
    maintenance: Object.fromEntries(
      APP_PLATFORMS.map((p) => [p, { enabled: false, message: '', eta: null, allowlistUserIds: [] }]),
    ),
    languages: { enabled: ['en', 'hi'], default: 'en' },
    version: 1,
    updatedAt: mockNowIso(),
    updatedByName: SYSTEM_NAME,
  });
}

const FEATURE_FLAGS = [
  ['play_tab', 'Play (shoppable video) tab', 'Shows the Play tab in the app bottom nav.', false, 0, null, 'ALL', null],
  ['supercoins', 'SuperCoins loyalty program', 'Enables SuperCoins earn/redeem across the app.', false, 0, null, 'ALL', null],
  ['plus_membership', 'Plus membership', 'Enables Plus membership enrolment and benefits.', false, 0, null, 'ALL', null],
  ['new_checkout_flow', 'Redesigned checkout flow', 'The single-page checkout redesign.', true, 50, null, 'ALL', '2.4.0'],
  ['wishlist_v2', 'Wishlist v2', 'Folders and price-drop alerts for wishlist items.', true, 100, null, 'ALL', null],
  ['festive_theme', 'Festive home theme', 'Seasonal home screen theming for a targeted segment.', true, 100, null, 'ANDROID', null],
];

export function seedFeatureFlags() {
  return FEATURE_FLAGS.map(([key, label, description, enabled, rolloutPct, , platform, minAppVersion]) =>
    insert('featureFlags', {
      id: id('FLG', 3),
      key,
      label,
      description,
      enabled,
      rolloutPct,
      segmentId: key === 'festive_theme' ? (db.segments[0]?.id ?? null) : null,
      platform,
      minAppVersion,
      updatedAt: mockNowIso(),
      updatedByName: SYSTEM_NAME,
      version: 1,
    }),
  );
}

const INTEGRATIONS = [
  ['payment_gateway', 'Razorpay', 'Payment gateway', 'CONNECTED', 0.4],
  ['courier_delhivery', 'Delhivery', 'Courier partner', 'CONNECTED', 1.1],
  ['courier_bluedart', 'Bluedart', 'Courier partner', 'CONNECTED', 0.8],
  ['courier_ekart', 'Ekart Logistics', 'Courier partner', 'ERROR', 6.4],
  ['sms', 'Kaleyra (DLT)', 'SMS', 'CONNECTED', 2.1],
  ['email', 'Amazon SES', 'Email', 'CONNECTED', 0.2],
  ['whatsapp', 'Interakt', 'WhatsApp', 'NOT_CONFIGURED', 0],
  ['push', 'FCM / APNs', 'Push notifications', 'CONNECTED', 0.6],
  ['kyc', 'Karza', 'KYC verification', 'CONNECTED', 1.4],
  ['maps', 'MapmyIndia', 'Maps / pincode data', 'CONNECTED', 0.3],
];

export function seedIntegrations() {
  return INTEGRATIONS.map(([key, label, category, status, errorRatePct], i) =>
    insert('integrations', {
      id: id('INT', 3),
      key,
      label,
      category,
      status,
      lastSuccessAt: status === 'NOT_CONFIGURED' ? null : new Date(mockNow() - (i + 1) * 1800_000).toISOString(),
      errorRatePct,
      credentialsSetAt: status === 'NOT_CONFIGURED' ? null : new Date(mockNow() - (90 - i) * 86400_000).toISOString(),
      credentialsSetByName: status === 'NOT_CONFIGURED' ? null : 'Harshvardhan Panchal',
      version: 1,
    }),
  );
}

const WEBHOOK_EVENTS = [
  ['payment.captured', 'SUCCESS'],
  ['payment.failed', 'FAILED'],
  ['refund.processed', 'SUCCESS'],
  ['shipment.status_update', 'SUCCESS'],
  ['shipment.ndr', 'SUCCESS'],
  ['sms.delivery_report', 'SUCCESS'],
  ['sms.delivery_report', 'FAILED'],
];

export function seedWebhookEvents() {
  const rows = [];
  const connected = db.integrations.filter((i) => i.status !== 'NOT_CONFIGURED');
  connected.forEach((integration, ii) => {
    for (let n = 0; n < 6; n += 1) {
      const [event, status] = WEBHOOK_EVENTS[(ii + n) % WEBHOOK_EVENTS.length];
      rows.push(
        insert('webhookEvents', {
          id: id('WHE', 6),
          integrationKey: integration.key,
          event,
          status,
          at: new Date(mockNow() - (ii * 6 + n + 1) * 900_000).toISOString(),
          payloadPreview: JSON.stringify({ event, id: `evt_${ii}${n}`, account: '•••redacted•••' }),
        }),
      );
    }
  });
  return rows;
}

export const REPORT_DEFINITIONS = [
  {
    key: 'order_item_report',
    name: 'Order item report',
    domain: 'sales',
    description: 'Every order line with product, seller, price and status.',
    collection: 'orderItems',
    columns: ['orderId', 'name', 'sellerName', 'qty', 'linePaise', 'status'],
    filters: ['dateRange', 'seller', 'category', 'status'],
    perm: 'reports.sales.view',
  },
  {
    key: 'settlement_report',
    name: 'Settlement report',
    domain: 'finance',
    description: 'Per-seller settlement lines with commission, fees and net payable.',
    collection: 'settlementLines',
    columns: ['sellerName', 'orderId', 'salePaise', 'commissionPaise', 'feesBeforeTaxPaise', 'netPaise', 'eligible'],
    filters: ['dateRange', 'seller', 'eligible'],
    perm: 'reports.finance.view',
  },
  {
    key: 'gst_sales_register',
    name: 'GST sales register',
    domain: 'finance',
    description: 'Tax invoices with GSTIN, taxable value, CGST/SGST/IGST and total, by issue date.',
    collection: 'invoices',
    columns: ['invoiceNo', 'sellerGstin', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'totalPaise'],
    filters: ['dateRange', 'sellerGstin'],
    perm: 'reports.finance.view',
  },
  {
    key: 'inventory_ageing',
    name: 'Inventory ageing',
    domain: 'operations',
    description: 'Fulfilled-by-Arise stock by how long it has sat in a warehouse.',
    collection: 'inventory',
    columns: ['sku', 'warehouseCode', 'sellable', 'oldestUnitDays'],
    filters: ['warehouse', 'category'],
    perm: 'reports.operations.view',
  },
  {
    key: 'ndr_report',
    name: 'NDR report',
    domain: 'operations',
    description: 'Non-delivery reports by reason, courier and resolution outcome.',
    collection: 'ndrRecords',
    columns: ['shipmentId', 'courierName', 'reason', 'attempt', 'status'],
    filters: ['dateRange', 'courier', 'reason'],
    perm: 'reports.operations.view',
  },
  {
    key: 'seller_performance_report',
    name: 'Seller performance report',
    domain: 'operations',
    description: 'Per-seller SLA adherence, cancellation and return rates, and rating.',
    collection: 'sellers',
    columns: ['storeName', 'tier', 'lateDispatchPct', 'cancellationPct', 'rating'],
    filters: ['tier'],
    perm: 'reports.operations.view',
  },
  {
    key: 'coupon_usage_report',
    name: 'Coupon usage report',
    domain: 'sales',
    description: 'Every coupon redemption with order, discount given and net GMV.',
    collection: 'couponRedemptions',
    columns: ['couponCode', 'orderId', 'discountPaise', 'orderTotalPaise'],
    filters: ['dateRange', 'coupon'],
    perm: 'reports.sales.view',
  },
];

export function seedReportDefinitions() {
  return REPORT_DEFINITIONS.map((r) => insert('reportDefinitions', { id: id('RPD', 3), ...r, version: 1 }));
}

export function seedScheduledReports() {
  const ops = db.adminUsers.find((u) => u.email.startsWith('ops@'));
  const finance = db.adminUsers.find((u) => u.email.startsWith('finance@'));
  const rows = [
    ['settlement_report', 'Settlement report', 'WEEKLY', 'XLSX', [finance?.id], true],
    ['gst_sales_register', 'GST sales register', 'MONTHLY', 'CSV', [finance?.id], true],
    ['ndr_report', 'NDR report', 'DAILY', 'CSV', [ops?.id], true],
    ['seller_performance_report', 'Seller performance report', 'MONTHLY', 'XLSX', [ops?.id], false],
  ];
  return rows.map(([reportKey, reportName, frequency, format, recipientIds, enabled], i) =>
    insert('scheduledReports', {
      id: id('SCH', 3),
      reportKey,
      reportName,
      frequency,
      format,
      recipientIds: recipientIds.filter(Boolean),
      enabled,
      lastRunAt: new Date(mockNow() - (i + 1) * 86400_000).toISOString(),
      nextRunAt: new Date(mockNow() + (i + 1) * 86400_000).toISOString(),
      createdByName: 'Harshvardhan Panchal',
      version: 1,
    }),
  );
}
