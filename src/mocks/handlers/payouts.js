import { fakerEN_IN as faker } from '@faker-js/faker';
import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval, requiresApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  created,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { settlementEligibility, summariseSettlements } from '../engine/settlement';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Seller payouts: settlement lines, weekly batches and the money movement.
 *
 * The cycle is deliberately four-eyed. One person builds the batch and a
 * different person releases it — releasing is a `payout.release` guarded
 * action, so it answers 202 and waits in the approvals inbox rather than
 * paying out on one person's click.
 *
 *   eligible lines → DRAFT → PENDING_APPROVAL → PROCESSING
 *                 → PAID | PARTIALLY_FAILED → (retry) → PAID
 */
const BATCH_TRANSITIONS = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PAID', 'PARTIALLY_FAILED'],
  PARTIALLY_FAILED: ['PAID'],
  PAID: [],
  CANCELLED: [],
};

/** A seller the caller is scoped to see. */
function sellerAllowed(sellerId, user) {
  const scope = user.scope?.sellers;
  return !scope?.length || scope.includes(sellerId);
}

function batchRow(batch) {
  const payouts = filter('sellerPayouts', (p) => p.batchId === batch.id);
  return {
    ...batch,
    sellerCount: payouts.length,
    paidCount: payouts.filter((p) => p.status === 'PAID').length,
    failedCount: payouts.filter((p) => p.status === 'FAILED').length,
    lineCount: payouts.reduce((n, p) => n + p.lineCount, 0),
  };
}

export const payoutHandlers = [
  /* -------------------------------------------------- settlement lines */
  mswHttp.get(`${BASE}/settlements/summary`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.view');
    if (g.response) return g.response;

    const lines = db.settlementLines.filter((l) => sellerAllowed(l.sellerId, g.user));
    const eligible = lines.filter((l) => l.eligible && !l.batchId);
    const held = lines.filter((l) => !l.eligible);
    const byReason = {};
    for (const line of held) byReason[line.holdReason] = (byReason[line.holdReason] ?? 0) + 1;

    return ok({
      eligible: { ...summariseSettlements(eligible), sellerCount: new Set(eligible.map((l) => l.sellerId)).size },
      held: { ...summariseSettlements(held), byReason },
      unpaidAgeDays: eligible.length
        ? Math.max(...eligible.map((l) => Math.floor((mockNow() - new Date(l.deliveredAt).getTime()) / 86400_000)))
        : 0,
    });
  }),

  mswHttp.get(`${BASE}/settlements`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.payout.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-deliveredAt' });
    const rows = db.settlementLines.filter((l) => sellerAllowed(l.sellerId, g.user));
    const result = listResult(rows, query, {
      searchFields: ['id', 'orderId', 'sellerName', 'productTitle', 'sku'],
      filterSpec: {
        sellerId: 'sellerId',
        eligible: { path: 'eligible', kind: 'boolean' },
        negative: { path: 'negative', kind: 'boolean' },
        paymentMethod: 'paymentMethod',
        fulfillmentType: 'fulfillmentType',
        batchId: 'batchId',
        unbatched: (row, value) => (String(value) === 'true' ? !row.batchId : true),
        deliveredAt: { path: 'deliveredAt', kind: 'date' },
      },
      sortable: ['deliveredAt', 'salePaise', 'netPaise', 'commissionPaise'],
      facetFields: ['eligible', 'paymentMethod', 'fulfillmentType'],
    });
    return okList(result.items, { ...result.meta, summary: summariseSettlements(result.items) });
  }),

  /* --------------------------------------------------------- batch list */
  mswHttp.get(`${BASE}/payout-batches`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.payout.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-periodEnd' });
    const result = listResult(db.payoutBatches.map(batchRow), query, {
      searchFields: ['id'],
      filterSpec: { status: 'status', periodEnd: { path: 'periodEnd', kind: 'date' } },
      sortable: ['periodEnd', 'netPaise', 'sellerCount', 'status'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  /* ------------------------------------------------------ create a batch */
  mswHttp.post(`${BASE}/payout-batches`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.create');
    if (g.response) return g.response;

    const body = await request.json();
    if (!body.periodStart || !body.periodEnd) {
      return validationFailed({ periodStart: 'Choose the settlement period.' });
    }

    const from = new Date(body.periodStart).getTime();
    const to = new Date(body.periodEnd).getTime();
    const lines = filter('settlementLines', (l) => {
      if (!l.eligible || l.batchId) return false;
      const at = new Date(l.deliveredAt).getTime();
      return at >= from && at <= to;
    });

    if (!lines.length) {
      return conflict(
        'No eligible settlements in that period. Lines on hold are excluded.',
        'NOTHING_TO_PAY',
      );
    }

    const batch = insert('payoutBatches', {
      id: id('PYB', 5),
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      status: 'DRAFT',
      createdAt: mockNowIso(),
      createdById: g.user.id,
      createdByName: g.user.name,
      approvedByName: null,
      approvedAt: null,
      releasedAt: null,
      sellerCount: 0,
      grossPaise: 0,
      netPaise: 0,
      version: 1,
    });

    const bySeller = new Map();
    for (const line of lines) {
      if (!bySeller.has(line.sellerId)) bySeller.set(line.sellerId, []);
      bySeller.get(line.sellerId).push(line);
    }

    let gross = 0;
    let net = 0;
    for (const [sellerId, sellerLines] of bySeller) {
      const seller = findById('sellers', sellerId);
      const totals = summariseSettlements(sellerLines);
      // Approved adjustments are swept into the next batch, which is the
      // only way a penalty or a claim payout ever reaches a seller.
      const adjustments = filter(
        'payoutAdjustments',
        (a) => a.sellerId === sellerId && a.status === 'APPROVED' && !a.batchId,
      );
      const adjustmentsPaise = adjustments.reduce((n, a) => n + a.amountPaise, 0);

      const payout = insert('sellerPayouts', {
        id: id('PYO', 6),
        batchId: batch.id,
        sellerId,
        sellerName: seller?.storeName ?? '—',
        lineCount: sellerLines.length,
        grossPaise: totals.grossPaise,
        feesPaise: totals.feesPaise,
        gstOnFeesPaise: totals.gstOnFeesPaise,
        tcsPaise: totals.tcsPaise,
        tdsPaise: totals.tdsPaise,
        adjustmentsPaise,
        netPaise: totals.netPaise + adjustmentsPaise,
        carriedForward: totals.netPaise + adjustmentsPaise < 0,
        status: 'INCLUDED',
        utr: null,
        failureReason: null,
        bankLast4: findById('bankAccounts', `${sellerId}-primary`)?.last4 ?? faker.string.numeric(4),
        paidAt: null,
        version: 1,
      });

      for (const line of sellerLines) {
        line.batchId = batch.id;
        line.payoutId = payout.id;
      }
      for (const adjustment of adjustments) {
        update('payoutAdjustments', adjustment.id, { status: 'APPLIED', batchId: batch.id });
      }
      gross += totals.grossPaise;
      net += payout.netPaise;
    }

    update('payoutBatches', batch.id, {
      status: 'PENDING_APPROVAL',
      sellerCount: bySeller.size,
      grossPaise: gross,
      netPaise: net,
    });
    writeAudit({
      actor: g.user, action: 'payout.batch_create', entityType: 'payoutBatch',
      entityId: batch.id, entityLabel: batch.id,
      metadata: { lines: lines.length, sellers: bySeller.size, netPaise: net },
    });
    scheduleSave();
    return created(batchRow(findById('payoutBatches', batch.id)));
  }),

  /* --------------------------------------------------------- batch detail */
  mswHttp.get(`${BASE}/payout-batches/:batchId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.view');
    if (g.response) return g.response;

    const batch = findById('payoutBatches', params.batchId);
    if (!batch) return notFound('That payout batch no longer exists.');

    const payouts = filter('sellerPayouts', (p) => p.batchId === batch.id);
    return ok({
      ...batchRow(batch),
      canRelease: batch.status === 'PENDING_APPROVAL',
      // The creator cannot be the releaser: that is the whole point of the
      // two-step cycle, and the UI disables the button rather than letting
      // the call fail.
      releasableByCaller: batch.status === 'PENDING_APPROVAL' && batch.createdById !== g.user.id,
      totals: {
        grossPaise: payouts.reduce((n, p) => n + p.grossPaise, 0),
        feesPaise: payouts.reduce((n, p) => n + p.feesPaise, 0),
        tcsPaise: payouts.reduce((n, p) => n + p.tcsPaise, 0),
        tdsPaise: payouts.reduce((n, p) => n + p.tdsPaise, 0),
        adjustmentsPaise: payouts.reduce((n, p) => n + p.adjustmentsPaise, 0),
        netPaise: payouts.reduce((n, p) => n + p.netPaise, 0),
      },
      payouts,
    });
  }),

  /* -------------------------------------------------------------- release */
  mswHttp.post(`${BASE}/payout-batches/:batchId/release`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.release');
    if (g.response) return g.response;

    const batch = findById('payoutBatches', params.batchId);
    if (!batch) return notFound('That payout batch no longer exists.');
    if (!BATCH_TRANSITIONS[batch.status]?.includes('PROCESSING')) {
      return illegalTransition(batch.status, 'release');
    }
    if (batch.createdById === g.user.id) {
      return conflict(
        'The person who created a batch cannot release it. Ask another approver.',
        'FOUR_EYES_REQUIRED',
      );
    }

    const release = () => {
      const payouts = filter('sellerPayouts', (p) => p.batchId === batch.id);
      let failures = 0;
      for (const payout of payouts) {
        // A negative net is carried forward, not collected: nothing is sent
        // to the bank and the balance waits for the next batch.
        if (payout.netPaise <= 0) {
          update('sellerPayouts', payout.id, { status: 'CARRIED_FORWARD', paidAt: null });
          continue;
        }
        // Bank transfers do fail — stale accounts, IFSC changes, name
        // mismatches. The batch has to survive that partially.
        const failed = Number(payout.id.replace(/\D/g, '')) % 9 === 0;
        if (failed) failures += 1;
        update('sellerPayouts', payout.id, {
          status: failed ? 'FAILED' : 'PAID',
          utr: failed ? null : `UTR${faker.string.numeric(12)}`,
          failureReason: failed ? 'NEFT returned by the beneficiary bank — account details stale' : null,
          paidAt: failed ? null : mockNowIso(),
        });
      }
      update('payoutBatches', batch.id, {
        status: failures ? 'PARTIALLY_FAILED' : 'PAID',
        approvedByName: g.user.name,
        approvedAt: mockNowIso(),
        releasedAt: mockNowIso(),
      });
      scheduleSave();
    };

    const approval = createApproval({
      actionKey: 'payout.release', actor: g.user,
      entityType: 'payoutBatch', entityId: batch.id, entityLabel: batch.id,
      summary: `Release ${batch.sellerCount} seller payouts totalling ₹${(batch.netPaise / 100).toLocaleString('en-IN')}`,
      amountPaise: batch.netPaise, payload: { batchId: batch.id },
      execute: release,
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  /* --------------------------------------------------------- retry failed */
  mswHttp.post(`${BASE}/payout-batches/:batchId/retry`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.release');
    if (g.response) return g.response;

    const batch = findById('payoutBatches', params.batchId);
    if (!batch) return notFound('That payout batch no longer exists.');
    if (batch.status !== 'PARTIALLY_FAILED') {
      return illegalTransition(batch.status, 'retry');
    }

    const failed = filter('sellerPayouts', (p) => p.batchId === batch.id && p.status === 'FAILED');
    if (!failed.length) return conflict('Nothing in this batch has failed.', 'NOTHING_TO_RETRY');

    for (const payout of failed) {
      update('sellerPayouts', payout.id, {
        status: 'PAID',
        utr: `UTR${faker.string.numeric(12)}`,
        failureReason: null,
        retryCount: (payout.retryCount ?? 0) + 1,
        paidAt: mockNowIso(),
      });
    }
    update('payoutBatches', batch.id, { status: 'PAID' });
    writeAudit({
      actor: g.user, action: 'payout.retry', entityType: 'payoutBatch',
      entityId: batch.id, entityLabel: batch.id,
      metadata: { retried: failed.length },
    });
    scheduleSave();
    return ok(batchRow(findById('payoutBatches', batch.id)));
  }),

  /* --------------------------------------------------------- seller payouts */
  mswHttp.get(`${BASE}/payouts`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.payout.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-paidAt' });
    const rows = db.sellerPayouts.filter((p) => sellerAllowed(p.sellerId, g.user));
    const result = listResult(rows, query, {
      searchFields: ['id', 'sellerName', 'utr', 'batchId'],
      filterSpec: {
        status: 'status',
        sellerId: 'sellerId',
        batchId: 'batchId',
        carriedForward: { path: 'carriedForward', kind: 'boolean' },
        paidAt: { path: 'paidAt', kind: 'date' },
      },
      sortable: ['paidAt', 'netPaise', 'grossPaise', 'status'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/payouts/:payoutId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.view');
    if (g.response) return g.response;

    const payout = findById('sellerPayouts', params.payoutId);
    if (!payout) return notFound('That payout no longer exists.');

    return ok({
      ...payout,
      lines: filter('settlementLines', (l) => l.payoutId === payout.id),
      adjustments: filter('payoutAdjustments', (a) => a.batchId === payout.batchId && a.sellerId === payout.sellerId),
    });
  }),

  /* ----------------------------------------------------------- adjustments */
  mswHttp.get(`${BASE}/payout-adjustments`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'finance.payout.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-raisedAt' });
    const result = listResult(db.payoutAdjustments, query, {
      searchFields: ['id', 'sellerName', 'note'],
      filterSpec: { status: 'status', type: 'type', sellerId: 'sellerId' },
      sortable: ['raisedAt', 'amountPaise', 'status'],
      facetFields: ['status', 'type'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/payout-adjustments`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.adjust');
    if (g.response) return g.response;

    const body = await request.json();
    const seller = findById('sellers', body.sellerId);
    if (!seller) return validationFailed({ sellerId: 'Choose a seller.' });
    if (!body.amountPaise || Number(body.amountPaise) === 0) {
      return validationFailed({ amountPaise: 'Enter an amount. Use a negative value to recover money.' });
    }
    if (!body.note?.trim()) return validationFailed({ note: 'Say what this adjustment is for.' });

    const amountPaise = Number(body.amountPaise);
    const makeAdjustment = () =>
      insert('payoutAdjustments', {
        id: id('ADJ', 5),
        sellerId: seller.id,
        sellerName: seller.storeName,
        type: body.type ?? 'MANUAL',
        amountPaise,
        note: body.note,
        status: 'APPROVED',
        batchId: null,
        raisedByName: g.user.name,
        raisedAt: mockNowIso(),
        approvedByName: g.user.name,
        version: 1,
      });

    if (requiresApproval('payout.adjust', { actor: g.user, amountPaise: Math.abs(amountPaise) })) {
      const approval = createApproval({
        actionKey: 'payout.adjust', actor: g.user, entityType: 'seller',
        entityId: seller.id, entityLabel: seller.storeName, reason: body.note,
        summary: `${amountPaise < 0 ? 'Recover' : 'Pay'} ₹${(Math.abs(amountPaise) / 100).toLocaleString('en-IN')} ${amountPaise < 0 ? 'from' : 'to'} ${seller.storeName}`,
        amountPaise: Math.abs(amountPaise), payload: body,
        execute: makeAdjustment,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    const adjustment = makeAdjustment();
    writeAudit({
      actor: g.user, action: 'payout.adjust', entityType: 'seller',
      entityId: seller.id, entityLabel: seller.storeName, reason: body.note,
      metadata: { amountPaise, type: adjustment.type },
    });
    scheduleSave();
    return created(adjustment);
  }),

  /* ------------------------------------------------------------ hold flag */
  mswHttp.post(`${BASE}/sellers/:sellerId/payout-hold`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'finance.payout.hold');
    if (g.response) return g.response;

    const body = await request.json();
    const seller = findById('sellers', params.sellerId);
    if (!seller) return notFound('That seller no longer exists.');
    if (!body.reason?.trim()) return validationFailed({ reason: 'A reason is required.' });

    const onHold = Boolean(body.onHold);
    if (seller.payoutOnHold === onHold) {
      return conflict(
        onHold ? 'Payouts are already on hold for this seller.' : 'Payouts are not on hold.',
        'NO_CHANGE',
      );
    }

    const approval = createApproval({
      actionKey: 'payout.hold', actor: g.user, entityType: 'seller',
      entityId: seller.id, entityLabel: seller.storeName, reason: body.reason,
      summary: `${onHold ? 'Hold' : 'Release'} payouts for ${seller.storeName}`,
      payload: { sellerId: seller.id, onHold },
      execute: () => {
        update('sellers', seller.id, { payoutOnHold: onHold, payoutHoldReason: onHold ? body.reason : null });
        // Held money has to stop moving immediately, so the seller's unbatched
        // lines are re-evaluated now. Eligibility is recomputed from the item
        // rather than toggled, otherwise releasing a hold would also release
        // lines that are held for an entirely different reason — an open
        // return, or a window that has not closed yet.
        for (const line of filter('settlementLines', (l) => l.sellerId === seller.id && !l.batchId)) {
          const item = findById('orderItems', line.orderItemId);
          const returnOpen = db.returns.some(
            (r) => r.orderItemId === line.orderItemId
              && !['CLOSED', 'RETURN_REJECTED', 'RETURN_CANCELLED'].includes(r.status),
          );
          const claimOpen = db.sellerClaims.some(
            (c) => c.sellerId === seller.id
              && ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(c.status),
          );
          const next = settlementEligibility(item ?? { status: 'DELIVERED' }, {
            returnOpen, claimOpen, sellerOnHold: onHold, now: mockNow(),
          });
          line.eligible = next.eligible;
          line.holdReason = next.reason;
        }
        scheduleSave();
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),
];
