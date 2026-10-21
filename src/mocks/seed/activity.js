import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow } from '../engine/settings';

/**
 * Seeds the cross-cutting activity surfaces — audit log, pending approvals,
 * admin alerts — plus the dashboard's figures.
 *
 * The dashboard series is generated deterministically from a day index rather
 * than aggregated from orders, because orders only arrive in Phase 2. The
 * handler reads this record, so swapping in real aggregation later touches one
 * file and no UI.
 */

const AUDIT_SAMPLES = [
  ['seller.approve', 'seller', 'Approved seller application'],
  ['catalog.product.approve', 'product', 'Approved listing'],
  ['catalog.product.request_changes', 'product', 'Requested changes on listing'],
  ['orders.item.cancel', 'orderItem', 'Cancelled order item'],
  ['finance.refund.issue', 'refund', 'Issued refund'],
  ['sellers.seller.hold', 'seller', 'Put seller on hold'],
  ['admin.role.edit', 'role', 'Edited role permissions'],
  ['pii.reveal', 'customer', 'Revealed customer phone'],
  ['logistics.ndr.action', 'shipment', 'Marked NDR for reattempt'],
  ['marketing.coupon.create', 'coupon', 'Created coupon'],
  ['cms.home.publish', 'homeLayout', 'Published home layout'],
  ['admin.settings.edit', 'settings', 'Updated platform settings'],
  ['wallet.adjust.create', 'walletAccount', 'Credited customer wallet'],
  ['catalog.category.edit', 'category', 'Edited category policies'],
  ['support.ticket.close', 'ticket', 'Resolved ticket'],
];

export function seedAuditEvents() {
  const users = db.adminUsers.filter((u) => u.status === 'ACTIVE');
  const rows = [];
  for (let i = 0; i < 120; i += 1) {
    const [action, entityType, label] = AUDIT_SAMPLES[i % AUDIT_SAMPLES.length];
    const actor = users[i % users.length];
    const changed = ['admin.role.edit', 'catalog.category.edit', 'admin.settings.edit'].includes(action);
    rows.push(
      insert('auditEvents', {
        id: id('AUD', 8),
        at: new Date(mockNow() - i * 47 * 60 * 1000).toISOString(),
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action,
        module: action.split('.')[0],
        entityType,
        entityId: `${entityType.slice(0, 3).toUpperCase()}-${2000 + i}`,
        entityLabel: label,
        changes: changed
          ? [{ field: 'returnWindowDays', from: 7, to: 10 }]
          : [],
        reason: action.includes('cancel') || action.includes('hold') ? 'Customer request' : null,
        metadata: null,
        severity: action === 'pii.reveal' ? 'warning' : 'info',
        ip: faker.internet.ipv4(),
      }),
    );
  }
  return rows;
}

const APPROVAL_SAMPLES = [
  {
    actionKey: 'payout.release',
    actionLabel: 'Release payout batch',
    approverPermission: 'finance.payout.release',
    entityType: 'payoutBatch',
    entityId: 'PYB-00042',
    entityLabel: 'Weekly batch · 06–12 Oct',
    summary: 'Release ₹48,21,340 across 212 sellers',
    amountPaise: 482134000,
    requester: 'finance',
  },
  {
    actionKey: 'refund.goodwill',
    actionLabel: 'Issue goodwill refund',
    approverPermission: 'finance.refund.issue',
    entityType: 'order',
    entityId: 'ORD-84920',
    entityLabel: 'Order ORD-84920 · Aditya Bhatt',
    summary: 'Goodwill refund of ₹1,304 to wallet — courier lost shipment',
    amountPaise: 130400,
    requester: 'agent',
  },
  {
    actionKey: 'seller.suspend',
    actionLabel: 'Suspend seller',
    approverPermission: 'sellers.seller.suspend',
    entityType: 'seller',
    entityId: 'SEL-0031',
    entityLabel: 'Bhatt Traders',
    summary: 'Suspend for counterfeit complaints · hides 184 listings, holds ₹2,14,500',
    amountPaise: null,
    // Raised by a Super Admin so the Operations Manager can act as the
    // checker; a requester can never approve their own request.
    requester: 'super',
  },
  {
    actionKey: 'commission.edit',
    actionLabel: 'Change commission or fee rules',
    approverPermission: 'finance.commission.edit',
    entityType: 'commissionRule',
    entityId: 'CMR-0007',
    entityLabel: 'Electronics › Audio › True Wireless Earbuds',
    summary: 'Commission 12% → 9.5% effective 01 Nov 2026',
    amountPaise: null,
    requester: 'finance',
    diff: [{ field: 'commissionPct', from: 12, to: 9.5 }],
  },
  {
    actionKey: 'appconfig.maintenance',
    actionLabel: 'Toggle maintenance mode',
    approverPermission: 'admin.appconfig.maintenance',
    entityType: 'appConfig',
    entityId: 'APP-ANDROID',
    entityLabel: 'Android app',
    summary: 'Enable maintenance mode 02:00–03:00 IST for payment gateway migration',
    amountPaise: null,
    requester: 'ops',
    diff: [{ field: 'maintenanceMode', from: false, to: true }],
  },
  {
    actionKey: 'wallet.adjust',
    actionLabel: 'Manual wallet credit / debit',
    approverPermission: 'wallet.adjust.create',
    entityType: 'walletAccount',
    entityId: 'WAL-01288',
    entityLabel: 'Wallet · Priya Sharma',
    summary: 'Credit ₹2,500 as compensation for repeated delivery failure',
    amountPaise: 250000,
    requester: 'supportlead',
  },
];

export function seedApprovals() {
  const byHandle = (h) => db.adminUsers.find((u) => u.email.startsWith(`${h}@`));
  const rows = [];

  APPROVAL_SAMPLES.forEach((s, i) => {
    const requester = byHandle(s.requester);
    rows.push(
      insert('approvalRequests', {
        id: id('APR', 6),
        actionKey: s.actionKey,
        actionLabel: s.actionLabel,
        approverPermission: s.approverPermission,
        status: 'PENDING',
        requestedById: requester?.id ?? 'ADM-001',
        requestedByName: requester?.name ?? 'System',
        requestedAt: new Date(mockNow() - (i + 1) * 3 * 3600_000).toISOString(),
        expiresAt: new Date(mockNow() + (72 - i * 9) * 3600_000).toISOString(),
        decidedAt: null,
        decidedById: null,
        decidedByName: null,
        decisionReason: null,
        entityType: s.entityType,
        entityId: s.entityId,
        entityLabel: s.entityLabel,
        reason: s.summary,
        summary: s.summary,
        diff: s.diff ?? [],
        amountPaise: s.amountPaise,
        payload: null,
        version: 1,
      }),
    );
  });

  // A couple of decided requests so the "All" tab is not empty.
  const decided = [
    ['APPROVED', 'payout.release', 'Release payout batch', 'PYB-00041', 'Weekly batch · 29 Sep–05 Oct'],
    ['REJECTED', 'seller.blacklist', 'Blacklist seller', 'SEL-0107', 'Nair Exports'],
  ];
  decided.forEach(([status, actionKey, actionLabel, entityId, entityLabel], i) => {
    const approver = byHandle('approver');
    rows.push(
      insert('approvalRequests', {
        id: id('APR', 6),
        actionKey,
        actionLabel,
        approverPermission: null,
        status,
        requestedById: byHandle('finance')?.id,
        requestedByName: byHandle('finance')?.name,
        requestedAt: new Date(mockNow() - (6 + i) * 86400_000).toISOString(),
        expiresAt: new Date(mockNow() - (3 + i) * 86400_000).toISOString(),
        decidedAt: new Date(mockNow() - (5 + i) * 86400_000).toISOString(),
        decidedById: approver?.id,
        decidedByName: approver?.name,
        decisionReason: status === 'REJECTED' ? 'Insufficient evidence of counterfeit' : null,
        entityType: 'payoutBatch',
        entityId,
        entityLabel,
        reason: null,
        summary: null,
        diff: [],
        amountPaise: null,
        payload: null,
        version: 1,
      }),
    );
  });

  return rows;
}

const ALERTS = [
  ['warning', 'UPI success rate dropped to 91.2%', 'Down from 97.8% in the last hour.', '/finance/payments'],
  ['error', 'MetroShip pickup failures spiked', '38 pickups missed today across Mumbai and Pune.', '/logistics/pickups'],
  ['warning', '14 tickets breaching SLA', 'Payments & Refunds queue is worst affected.', '/support/tickets'],
  ['info', 'Weekly payout batch is ready', '212 sellers · ₹48,21,340 awaiting approval.', '/finance/payouts'],
  ['warning', 'Seller cancellation spike', 'Bhatt Traders cancelled 23 orders in 24h.', '/sellers/SEL-0031'],
  ['info', '9 seller applications waiting over 48h', 'Onboarding SLA is 48 hours.', '/sellers/applications'],
];

export function seedAlerts() {
  return ALERTS.map(([severity, title, body, link], i) =>
    insert('adminAlerts', {
      id: id('ALR', 3),
      severity,
      title,
      body,
      link,
      at: new Date(mockNow() - (i + 1) * 37 * 60 * 1000).toISOString(),
      readBy: [],
    }),
  );
}

/** Deterministic pseudo-random so the dashboard is stable across reloads. */
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function dailySeries(days) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dow = new Date(mockNow() - i * 86400_000).getDay();
    const weekend = dow === 0 || dow === 6 ? 1.18 : 1;
    const growth = 1 + (days - i) * 0.0022;
    const orders = Math.round((1850 + wobble(i) * 700) * weekend * growth);
    const aovPaise = Math.round((82000 + wobble(i + 99) * 34000) * 1);
    out.push({
      date: new Date(mockNow() - i * 86400_000).toISOString().slice(0, 10),
      orders,
      units: Math.round(orders * (1.3 + wobble(i + 7) * 0.3)),
      gmvPaise: orders * aovPaise,
      newCustomers: Math.round(orders * (0.17 + wobble(i + 31) * 0.06)),
      cancellations: Math.round(orders * (0.03 + wobble(i + 13) * 0.02)),
      returns: Math.round(orders * (0.045 + wobble(i + 17) * 0.02)),
    });
  }
  return out;
}

export function seedDashboard() {
  // Real tickets now exist, so the queue counters and the dashboard's SLA
  // figure are rolled up from them rather than left as placeholder numbers
  // — the same correction Phase 1 made for category.liveListings.
  for (const queue of db.supportQueues) {
    const inQueue = filter('tickets', (t) => t.queueId === queue.id);
    queue.openTickets = inQueue.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)).length;
    queue.breaching = inQueue.filter(
      (t) => !['RESOLVED', 'CLOSED'].includes(t.status) && new Date(t.resolutionDueAt).getTime() < mockNow(),
    ).length;
  }
  const ticketsBreachingSla = filter(
    'tickets',
    (t) => !['RESOLVED', 'CLOSED'].includes(t.status) && new Date(t.resolutionDueAt).getTime() < mockNow(),
  ).length;
  const adCampaignsPendingReview = filter('adCampaigns', (c) => c.status === 'PENDING_REVIEW').length;

  return insert('settings', {
    id: 'dashboard',
    series: dailySeries(120),
    actionCenter: {
      sellerApplicationsPending: db.sellers.filter((s) =>
        ['APPLIED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(s.status),
      ).length,
      listingsInQc: 148,
      brandApprovalsPending: 12,
      ordersNotAccepted: 37,
      notDispatched: 64,
      ndrPending: 212,
      returnsAwaitingQc: 89,
      failedRefunds: 7,
      payoutBatchesAwaitingApproval: 1,
      ticketsBreachingSla,
      adCampaignsPendingReview,
      lowStockFbaSkus: 43,
      weightDisputesOpen: 18,
      privacyRequestsDue: 3,
    },
    paymentMix: [
      { method: 'UPI', sharePct: 48.2, successPct: 96.4 },
      { method: 'Cards', sharePct: 18.7, successPct: 93.1 },
      { method: 'COD', sharePct: 21.4, successPct: 100 },
      { method: 'Net banking', sharePct: 6.2, successPct: 91.8 },
      { method: 'Wallet / Gift card', sharePct: 5.5, successPct: 99.2 },
    ],
    topStates: [
      { state: 'Maharashtra', orders: 18420, gmvPaise: 1_52_00_00_000 },
      { state: 'Karnataka', orders: 14180, gmvPaise: 1_21_00_00_000 },
      { state: 'Gujarat', orders: 11960, gmvPaise: 94_00_00_000 },
      { state: 'Delhi', orders: 10340, gmvPaise: 89_00_00_000 },
      { state: 'Tamil Nadu', orders: 9120, gmvPaise: 77_00_00_000 },
      { state: 'Uttar Pradesh', orders: 8730, gmvPaise: 64_00_00_000 },
    ],
  });
}
