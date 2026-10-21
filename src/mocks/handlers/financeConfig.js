import { http as mswHttp } from 'msw';
import { db, filter, find, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { diffOf, writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  created,
  notFound,
  ok,
  okList,
  validationFailed,
  versionConflict,
} from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { closingFeePaise, collectionFeePct, computeSettlement } from '../engine/settlement';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Commission and fee rules, tax summaries, COD remittance and invoices. */

export const financeConfigHandlers = [
  /* -------------------------------------------------- commission & fees */
  mswHttp.get(`${BASE}/commission-rules`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.commission.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: 'rootName', defaultPageSize: 50 });
    const result = listResult(db.commissionRules, query, {
      searchFields: ['rootName', 'band'],
      filterSpec: { rootName: 'rootName' },
      sortable: ['rootName', 'commissionPct', 'minPaise'],
      facetFields: ['rootName'],
    });
    return okList(result.items, {
      ...result.meta,
      plans: db.commissionPlans,
      fees: findById('feeConfig', 'fees'),
    });
  }),

  mswHttp.patch(`${BASE}/commission-rules/:ruleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.commission.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const rule = findById('commissionRules', params.ruleId);
    if (!rule) return notFound('That commission rule no longer exists.');
    if (body.version !== undefined && body.version !== rule.version) return versionConflict(rule);

    const pct = Number(body.commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 40) {
      return validationFailed({ commissionPct: 'Commission must be between 0 and 40%.' });
    }
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why the rate is changing.' });

    // Rate-card changes alter what every seller in the category is paid, so
    // they are never applied unilaterally.
    const approval = createApproval({
      actionKey: 'commission.edit', actor: g.user,
      entityType: 'commissionRule', entityId: rule.id,
      entityLabel: `${rule.rootName} · ${rule.band}`, reason: body.reason,
      summary: `Commission for ${rule.rootName} (${rule.band}): ${rule.commissionPct}% → ${pct}%`,
      diff: [{ field: 'commissionPct', from: rule.commissionPct, to: pct }],
      payload: { ruleId: rule.id, commissionPct: pct },
      execute: () => {
        update('commissionRules', rule.id, {
          commissionPct: pct,
          effectiveFrom: body.effectiveFrom ?? mockNowIso(),
        });
        scheduleSave();
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  mswHttp.patch(`${BASE}/fee-config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.commission.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const fees = findById('feeConfig', 'fees');
    if (!fees) return notFound('Fee configuration is missing.');
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why the fees are changing.' });

    const patch = {};
    for (const key of ['collectionFeePrepaidPct', 'collectionFeeCodPct', 'pickPackFeePaise', 'payoutCycle', 'payoutDay']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (!Object.keys(patch).length) return validationFailed({ fees: 'Nothing to change.' });

    const approval = createApproval({
      actionKey: 'commission.edit', actor: g.user,
      entityType: 'feeConfig', entityId: 'fees', entityLabel: 'Platform fees',
      reason: body.reason, summary: 'Change platform fee configuration',
      diff: diffOf(fees, { ...fees, ...patch }),
      payload: patch,
      execute: () => {
        update('feeConfig', 'fees', patch);
        scheduleSave();
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  /**
   * Fee preview: what a seller would actually receive on a given sale.
   *
   * Finance asks this constantly ("what does a ₹499 kurta net us?") and
   * getting it from the same function the payout uses means the answer can
   * never disagree with the money.
   */
  mswHttp.post(`${BASE}/commission-rules/preview`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.commission.view');
    if (g.response) return g.response;

    const body = await request.json();
    const salePaise = Number(body.salePaise);
    if (!Number.isFinite(salePaise) || salePaise <= 0) {
      return validationFailed({ salePaise: 'Enter a sale amount.' });
    }

    const rules = filter('commissionRules', (r) => r.rootName === body.rootName);
    const rule = rules.find((r) => salePaise >= r.minPaise && (r.maxPaise === null || salePaise <= r.maxPaise));
    const settlement = computeSettlement({
      salePaise,
      commissionPct: rule?.commissionPct ?? Number(body.commissionPct ?? 12),
      paymentMethod: body.paymentMethod ?? 'UPI',
      shippingFeePaise: Number(body.shippingFeePaise ?? 4200),
      fulfilledByArise: Boolean(body.fulfilledByArise),
      storageFeePaise: Number(body.storageFeePaise ?? 0),
    });

    return ok({
      ...settlement,
      rule: rule ?? null,
      explain: {
        closingFeePaise: closingFeePaise(salePaise),
        collectionFeePct: collectionFeePct(body.paymentMethod ?? 'UPI'),
        takeRatePct: Number((((salePaise - settlement.netPaise) / salePaise) * 100).toFixed(2)),
      },
    });
  }),

  /* ------------------------------------------------------------------ tax */
  mswHttp.get(`${BASE}/tax-summaries`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.tax.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-tcsPaise' });
    const result = listResult(db.taxSummaries, query, {
      searchFields: ['sellerName', 'gstin', 'pan'],
      filterSpec: {
        period: 'period',
        sellerId: 'sellerId',
        gstr8Filed: { path: 'gstr8Filed', kind: 'boolean' },
      },
      sortable: ['tcsPaise', 'tdsPaise', 'taxableValuePaise', 'sellerName'],
      facetFields: ['period', 'gstr8Filed'],
    });

    return okList(result.items, {
      ...result.meta,
      summary: {
        tcsPaise: db.taxSummaries.reduce((n, t) => n + t.tcsPaise, 0),
        tdsPaise: db.taxSummaries.reduce((n, t) => n + t.tdsPaise, 0),
        taxableValuePaise: db.taxSummaries.reduce((n, t) => n + t.taxableValuePaise, 0),
        sellersWithoutGstin: db.taxSummaries.filter((t) => !t.gstin).length,
      },
    });
  }),

  /* ------------------------------------------------------ COD remittance */
  mswHttp.get(`${BASE}/cod-remittances`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.cod.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-periodEnd' });
    const rows = db.codRemittances.map((r) => ({
      ...r,
      // Cash sitting with a courier past its due date is the single biggest
      // working-capital risk in COD, so overdue is computed, not stored.
      overdue: r.status === 'EXPECTED' && new Date(r.dueAt).getTime() < Date.now(),
      shortfallPct: r.expectedPaise
        ? Number((((r.expectedPaise - r.receivedPaise) / r.expectedPaise) * 100).toFixed(2))
        : 0,
    }));
    const result = listResult(rows, query, {
      searchFields: ['id', 'courierName', 'utr'],
      filterSpec: {
        status: 'status',
        courierId: 'courierId',
        overdue: { path: 'overdue', kind: 'boolean' },
        periodEnd: { path: 'periodEnd', kind: 'date' },
      },
      sortable: ['periodEnd', 'expectedPaise', 'differencePaise'],
      facetFields: ['status', 'courierName'],
    });

    return okList(result.items, {
      ...result.meta,
      summary: {
        outstandingPaise: rows
          .filter((r) => r.status !== 'RECONCILED')
          .reduce((n, r) => n + (r.expectedPaise - r.receivedPaise), 0),
        overdueCount: rows.filter((r) => r.overdue).length,
        shortPaidCount: rows.filter((r) => r.status === 'SHORT_PAID').length,
      },
    });
  }),

  mswHttp.post(`${BASE}/cod-remittances/:remittanceId/dispute`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.cod.dispute');
    if (g.response) return g.response;

    const body = await request.json();
    const row = findById('codRemittances', params.remittanceId);
    if (!row) return notFound('That remittance no longer exists.');
    if (row.status === 'RECONCILED') {
      return conflict('This remittance is already reconciled.', 'ILLEGAL_TRANSITION');
    }
    if (!body.note?.trim()) return validationFailed({ note: 'Describe the shortfall being disputed.' });

    update('codRemittances', row.id, {
      status: 'DISPUTED',
      disputeNote: body.note,
      disputedByName: g.user.name,
      disputedAt: mockNowIso(),
    });
    writeAudit({
      actor: g.user, action: 'cod.dispute', entityType: 'codRemittance',
      entityId: row.id, entityLabel: row.courierName, reason: body.note,
      metadata: { differencePaise: row.differencePaise },
    });
    scheduleSave();
    return ok(findById('codRemittances', row.id));
  }),

  /* -------------------------------------------------------------- invoices */
  mswHttp.get(`${BASE}/invoices`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.invoice.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-issuedAt' });
    const result = listResult(db.invoices, query, {
      searchFields: ['invoiceNo', 'orderId', 'sellerName', 'customerName', 'sellerGstin'],
      filterSpec: {
        type: 'type',
        sellerId: 'sellerId',
        interState: { path: 'interState', kind: 'boolean' },
        placeOfSupply: 'placeOfSupply',
        issuedAt: { path: 'issuedAt', kind: 'date' },
      },
      sortable: ['issuedAt', 'totalPaise', 'invoiceNo'],
      facetFields: ['type', 'placeOfSupply'],
    });

    return okList(result.items, {
      ...result.meta,
      summary: {
        taxablePaise: db.invoices.reduce((n, i) => n + i.taxablePaise, 0),
        taxPaise: db.invoices.reduce((n, i) => n + i.cgstPaise + i.sgstPaise + i.igstPaise, 0),
        creditNoteCount: db.invoices.filter((i) => i.type === 'CREDIT_NOTE').length,
      },
    });
  }),

  mswHttp.get(`${BASE}/invoices/:invoiceId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.invoice.view');
    if (g.response) return g.response;

    const invoice = findById('invoices', params.invoiceId);
    if (!invoice) return notFound('That invoice no longer exists.');

    const order = findById('orders', invoice.orderId);
    return ok({
      ...invoice,
      order: order ? { id: order.id, placedAt: order.placedAt, paymentMethod: order.paymentMethod } : null,
      lines: filter('orderItems', (i) => i.shipmentId === invoice.shipmentId).map((i) => ({
        id: i.id, name: i.name, variantLabel: i.variantLabel, qty: i.qty, linePaise: i.linePaise,
      })),
      creditNotes: filter('invoices', (i) => i.againstInvoiceNo === invoice.invoiceNo),
    });
  }),

  mswHttp.post(`${BASE}/invoices/:invoiceId/regenerate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.invoice.regenerate');
    if (g.response) return g.response;

    const body = await request.json();
    const invoice = findById('invoices', params.invoiceId);
    if (!invoice) return notFound('That invoice no longer exists.');
    if (invoice.type === 'CREDIT_NOTE') {
      return conflict('A credit note cannot be re-generated.', 'ILLEGAL_TRANSITION');
    }
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why it is being re-generated.' });

    // A tax invoice is a statutory document: it is superseded, never edited,
    // so the old number stays on record and a new one is issued.
    update('invoices', invoice.id, { supersededAt: mockNowIso(), supersededReason: body.reason });
    const replacement = insert('invoices', {
      ...invoice,
      id: id('INV', 6),
      invoiceNo: `${invoice.invoiceNo}-R`,
      supersedes: invoice.invoiceNo,
      supersededAt: null,
      supersededReason: null,
      issuedAt: mockNowIso(),
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'invoice.regenerate', entityType: 'invoice',
      entityId: replacement.id, entityLabel: replacement.invoiceNo, reason: body.reason,
      metadata: { supersedes: invoice.invoiceNo },
    });
    scheduleSave();
    return created(replacement);
  }),

  /* ------------------------------------------------- finance dashboard */
  mswHttp.get(`${BASE}/finance/overview`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), ['finance.payment.view', 'finance.payout.view']);
    if (g.response) return g.response;

    const eligible = filter('settlementLines', (l) => l.eligible && !l.batchId);
    const held = filter('settlementLines', (l) => !l.eligible);
    const pendingBatch = find('payoutBatches', (b) => b.status === 'PENDING_APPROVAL');

    return ok({
      gmvPaise: db.orders.reduce((n, o) => n + o.grandTotalPaise, 0),
      capturedPaise: filter('payments', (p) => p.status === 'CAPTURED').reduce((n, p) => n + p.amountPaise, 0),
      commissionPaise: db.settlementLines.reduce((n, l) => n + l.commissionPaise, 0),
      feesPaise: db.settlementLines.reduce((n, l) => n + l.feesBeforeTaxPaise, 0),
      payableNowPaise: eligible.reduce((n, l) => n + l.netPaise, 0),
      heldPaise: held.reduce((n, l) => n + l.netPaise, 0),
      refundsPendingPaise: filter('refunds', (r) => !['COMPLETED', 'FAILED'].includes(r.status))
        .reduce((n, r) => n + r.amountPaise, 0),
      refundsFailedCount: filter('refunds', (r) => r.status === 'FAILED').length,
      codOutstandingPaise: filter('codRemittances', (r) => r.status !== 'RECONCILED')
        .reduce((n, r) => n + (r.expectedPaise - r.receivedPaise), 0),
      tcsPaise: db.taxSummaries.reduce((n, t) => n + t.tcsPaise, 0),
      tdsPaise: db.taxSummaries.reduce((n, t) => n + t.tdsPaise, 0),
      walletLiabilityPaise: db.walletAccounts.reduce((n, w) => n + w.balancePaise, 0),
      giftCardLiabilityPaise: filter('giftCards', (c) => c.status === 'ACTIVE')
        .reduce((n, c) => n + c.balancePaise, 0),
      pendingBatch: pendingBatch
        ? { id: pendingBatch.id, netPaise: pendingBatch.netPaise, sellerCount: pendingBatch.sellerCount }
        : null,
    });
  }),
];
