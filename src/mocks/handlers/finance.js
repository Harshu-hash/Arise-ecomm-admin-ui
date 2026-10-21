import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval, requiresApproval } from '../engine/approvals';
import { createJob } from '../engine/jobs';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  badRequest,
  conflict,
  created,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** What each finance list exports as, and who may export it. */
const EXPORTS = {
  payments: { label: 'Payments export', collection: 'payments', perm: 'finance.payment.export' },
  refunds: { label: 'Refunds export', collection: 'refunds', perm: 'finance.refund.export' },
  settlements: { label: 'Settlement lines export', collection: 'settlementLines', perm: 'finance.payout.export' },
  payouts: { label: 'Payout register', collection: 'sellerPayouts', perm: 'finance.payout.export' },
  'tax-summaries': { label: 'TCS / TDS summary (GSTR-8 working)', collection: 'taxSummaries', perm: 'finance.tax.export' },
  'cod-remittances': { label: 'COD remittance export', collection: 'codRemittances', perm: 'finance.cod.export' },
  invoices: { label: 'Invoice register', collection: 'invoices', perm: 'finance.invoice.export' },
  reconciliation: { label: 'Reconciliation export', collection: 'reconciliationRuns', perm: 'finance.recon.export' },
  'wallet-entries': { label: 'Wallet ledger export', collection: 'walletEntries', perm: 'wallet.ledger.export' },
};

/** Payments, refunds and gateway reconciliation. */

function paymentRow(p) {
  const order = findById('orders', p.orderId);
  const refunded = filter('refunds', (r) => r.orderId === p.orderId && r.status !== 'FAILED')
    .reduce((n, r) => n + r.amountPaise, 0);
  return {
    ...p,
    customerName: order?.customerName ?? '—',
    customerId: order?.customerId ?? null,
    orderStatus: order?.status ?? null,
    refundedPaise: refunded,
    // Settled is what actually reached our account after refunds.
    settledPaise: p.amountPaise - refunded,
  };
}

export const financeHandlers = [
  /* ------------------------------------------------------------ payments */
  mswHttp.get(`${BASE}/payments`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.payment.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(db.payments, query, {
      searchFields: ['id', 'orderId', 'txnRef'],
      filterSpec: {
        status: 'status',
        method: 'method',
        gateway: 'gateway',
        createdAt: { path: 'createdAt', kind: 'date' },
        amountPaise: { path: 'amountPaise' },
      },
      sortable: ['createdAt', 'amountPaise', 'status'],
      facetFields: ['status', 'method', 'gateway'],
      map: paymentRow,
    });

    const captured = db.payments.filter((p) => p.status === 'CAPTURED');
    return okList(result.items, {
      ...result.meta,
      summary: {
        capturedPaise: captured.reduce((n, p) => n + p.amountPaise, 0),
        failedCount: db.payments.filter((p) => p.status === 'FAILED').length,
        pendingCodPaise: db.payments
          .filter((p) => p.method === 'COD' && p.status === 'PENDING')
          .reduce((n, p) => n + p.amountPaise, 0),
      },
    });
  }),

  mswHttp.get(`${BASE}/payments/:paymentId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.payment.view');
    if (g.response) return g.response;

    const payment = findById('payments', params.paymentId);
    if (!payment) return notFound('That payment no longer exists.');
    return ok({
      ...paymentRow(payment),
      refunds: filter('refunds', (r) => r.orderId === payment.orderId),
    });
  }),

  /* ------------------------------------------------------------- refunds */
  mswHttp.get(`${BASE}/refunds`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.refund.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-initiatedAt' });
    const rows = db.refunds.map((r) => {
      const order = findById('orders', r.orderId);
      // Refunds are promised within 7 days; past that is an SLA breach
      // customers chase support about.
      const ageDays = Math.floor((mockNow() - new Date(r.initiatedAt).getTime()) / 86400_000);
      return {
        ...r,
        customerName: order?.customerName ?? '—',
        paymentMethod: order?.paymentMethod ?? null,
        ageDays,
        slaBreached: !r.completedAt && ageDays > 7,
      };
    });

    const result = listResult(rows, query, {
      searchFields: ['id', 'orderId', 'arn', 'customerName'],
      filterSpec: {
        status: 'status',
        type: 'type',
        mode: 'mode',
        slaBreached: { path: 'slaBreached', kind: 'boolean' },
        initiatedAt: { path: 'initiatedAt', kind: 'date' },
      },
      sortable: ['initiatedAt', 'amountPaise', 'status', 'ageDays'],
      facetFields: ['status', 'type', 'mode'],
    });

    return okList(result.items, {
      ...result.meta,
      summary: {
        pendingPaise: rows
          .filter((r) => !['COMPLETED', 'FAILED'].includes(r.status))
          .reduce((n, r) => n + r.amountPaise, 0),
        failedCount: rows.filter((r) => r.status === 'FAILED').length,
        breachedCount: rows.filter((r) => r.slaBreached).length,
      },
    });
  }),

  mswHttp.post(`${BASE}/refunds/:refundId/retry`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.refund.retry');
    if (g.response) return g.response;

    const refund = findById('refunds', params.refundId);
    if (!refund) return notFound('That refund no longer exists.');
    if (refund.status !== 'FAILED') {
      return conflict('Only a failed refund can be retried.', 'ILLEGAL_TRANSITION');
    }

    update('refunds', refund.id, {
      status: 'INITIATED',
      failureReason: null,
      retryCount: (refund.retryCount ?? 0) + 1,
      lastRetriedAt: mockNowIso(),
    });
    writeAudit({
      actor: g.user, action: 'refund.retry', entityType: 'refund',
      entityId: refund.id, entityLabel: refund.orderId,
      metadata: { amountPaise: refund.amountPaise },
    });
    scheduleSave();
    return ok(findById('refunds', refund.id));
  }),

  mswHttp.post(`${BASE}/refunds/:refundId/mode`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.refund.switch_mode');
    if (g.response) return g.response;

    const body = await request.json();
    const refund = findById('refunds', params.refundId);
    if (!refund) return notFound('That refund no longer exists.');
    if (['COMPLETED'].includes(refund.status)) {
      return conflict('This refund has already been paid out.', 'ILLEGAL_TRANSITION');
    }
    if (!['ORIGINAL', 'WALLET', 'BANK'].includes(body.mode)) {
      return validationFailed({ mode: 'Choose a refund mode.' });
    }
    if (body.mode === 'BANK' && !body.bankAccount) {
      return validationFailed({ bankAccount: 'Bank details are needed for a bank refund.' });
    }
    if (!body.reason?.trim()) {
      return validationFailed({ reason: 'Say why the mode is being changed.' });
    }

    const before = refund.mode;
    update('refunds', refund.id, {
      mode: body.mode,
      status: refund.status === 'PENDING_DETAILS' ? 'INITIATED' : refund.status,
      bankLast4: body.bankAccount ? String(body.bankAccount).slice(-4) : refund.bankLast4 ?? null,
    });
    writeAudit({
      actor: g.user, action: 'refund.switch_mode', entityType: 'refund',
      entityId: refund.id, entityLabel: refund.orderId, reason: body.reason,
      changes: [{ field: 'mode', from: before, to: body.mode }],
    });
    scheduleSave();
    return ok(findById('refunds', refund.id));
  }),

  /* ------------------------------------------- goodwill / manual refunds */
  mswHttp.post(`${BASE}/refunds`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.refund.issue');
    if (g.response) return g.response;

    const body = await request.json();
    const order = findById('orders', body.orderId);
    if (!order) return validationFailed({ orderId: 'No such order.' });
    if (!body.amountPaise || body.amountPaise <= 0) {
      return validationFailed({ amountPaise: 'Enter an amount.' });
    }
    if (!body.reason?.trim()) return validationFailed({ reason: 'A reason is required.' });

    const goodwill = body.type === 'GOODWILL';
    const actionKey = goodwill ? 'refund.goodwill' : 'refund.issue';
    const makeRefund = () =>
      insert('refunds', {
        id: id('RFD', 7),
        orderId: order.id,
        itemIds: body.itemIds ?? [],
        customerId: order.customerId,
        type: body.type ?? 'MANUAL',
        amountPaise: body.amountPaise,
        mode: body.mode ?? (goodwill ? 'WALLET' : 'ORIGINAL'),
        status: 'INITIATED',
        arn: null,
        failureReason: null,
        initiatedByName: g.user.name,
        initiatedAt: mockNowIso(),
        completedAt: null,
        reason: body.reason,
        version: 1,
      });

    // Goodwill is always four-eyes; a normal refund only above the agent's
    // own limit. Either way the money never moves on one person's say-so.
    if (requiresApproval(actionKey, { actor: g.user, amountPaise: body.amountPaise })) {
      const approval = createApproval({
        actionKey, actor: g.user, entityType: 'order', entityId: order.id,
        entityLabel: order.id, reason: body.reason,
        summary: `Refund of ₹${(body.amountPaise / 100).toLocaleString('en-IN')} on ${order.id}`,
        amountPaise: body.amountPaise, payload: body,
        execute: makeRefund,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    const refund = makeRefund();
    writeAudit({
      actor: g.user, action: 'refund.issue', entityType: 'refund',
      entityId: refund.id, entityLabel: order.id, reason: body.reason,
      metadata: { amountPaise: refund.amountPaise, type: refund.type },
    });
    scheduleSave();
    return created(refund);
  }),

  /**
   * Exports.
   *
   * Finance works in spreadsheets: GSTR-8 filing, the payout register the
   * bank needs, the invoice list the auditor asks for. Each one is a job
   * rather than a download, because the real exports run to lakhs of rows.
   */
  mswHttp.post(`${BASE}/finance/export`, async ({ request }) => {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const spec = EXPORTS[body.dataset];
    if (!spec) return validationFailed({ dataset: 'Unknown export.' });

    const g = await guard(request, url, spec.perm);
    if (g.response) return g.response;

    const job = createJob({
      type: 'EXPORT',
      label: spec.label,
      actor: g.user,
      totalRows: db[spec.collection].length,
      durationMs: 4000,
      resultUrl: `mock://exports/${body.dataset}.csv`,
      metadata: { filters: body.filters ?? null, dataset: body.dataset },
    });
    scheduleSave();
    return ok(job);
  }),

  /* ---------------------------------------------------- reconciliation */
  mswHttp.get(`${BASE}/reconciliation`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.recon.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-runAt' });
    const rows = db.reconciliationRuns.map((r) => ({
      ...r,
      unmatched: r.amountMismatch + r.missingInGateway + r.missingInArise + r.duplicates,
      matchedPct: r.totalRows ? Number(((r.matched / r.totalRows) * 100).toFixed(2)) : 0,
    }));
    const result = listResult(rows, query, {
      searchFields: ['id', 'gateway'],
      filterSpec: { status: 'status', gateway: 'gateway', runAt: { path: 'runAt', kind: 'date' } },
      sortable: ['runAt', 'totalRows', 'matched'],
      facetFields: ['status', 'gateway'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/reconciliation`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.recon.create');
    if (g.response) return g.response;

    const body = await request.json();
    if (!body.periodStart || !body.periodEnd) {
      return validationFailed({ periodStart: 'Choose the period to reconcile.' });
    }
    if (new Date(body.periodStart) > new Date(body.periodEnd)) {
      return badRequest('The period starts after it ends.');
    }

    const rows = filter('payments', (p) => {
      const at = new Date(p.createdAt).getTime();
      return at >= new Date(body.periodStart).getTime() && at <= new Date(body.periodEnd).getTime();
    });

    const run = insert('reconciliationRuns', {
      id: id('REC', 5),
      source: 'GATEWAY',
      gateway: body.gateway ?? 'Razorpay',
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      totalRows: rows.length,
      matched: rows.length,
      amountMismatch: 0,
      missingInGateway: 0,
      missingInArise: 0,
      duplicates: 0,
      status: 'RUNNING',
      runAt: mockNowIso(),
      runByName: g.user.name,
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'recon.run', entityType: 'reconciliationRun',
      entityId: run.id, entityLabel: run.gateway,
      metadata: { rows: rows.length },
    });
    scheduleSave();
    return created(run);
  }),
];
