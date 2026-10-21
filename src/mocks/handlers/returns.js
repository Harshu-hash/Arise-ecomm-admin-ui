import { http as mswHttp } from 'msw';
import { db, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  RETURN_TRANSITIONS,
  createRefund,
  recordEvent,
  returnEligibility,
} from '../engine/orderState';
import {
  conflict,
  created,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';
const TRANSITIONS = RETURN_TRANSITIONS();

/** Who caused the return decides who pays the reverse shipping fee. */
const FAULT_BY_REASON = {
  'Item is damaged or defective': 'SELLER',
  'Wrong item delivered': 'SELLER',
  'Item not as described': 'SELLER',
  'Size/fit issue': 'CUSTOMER',
  'Changed my mind': 'CUSTOMER',
};

function returnRow(r) {
  const item = findById('orderItems', r.orderItemId);
  return {
    ...r,
    ageDays: Math.floor((mockNow() - new Date(r.requestedAt).getTime()) / 86400_000),
    faultAttribution: r.faultAttribution ?? FAULT_BY_REASON[r.reason] ?? 'UNKNOWN',
    itemStatus: item?.status ?? null,
    refundStatus: r.refundId ? findById('refunds', r.refundId)?.status ?? null : null,
  };
}

function allowedReturnActions(r, permissions) {
  const has = (k) => permissions.includes('*') || permissions.includes(k);
  const next = TRANSITIONS[r.status] ?? [];
  const out = [];
  if (next.includes('RETURN_APPROVED') && has('orders.return.approve')) out.push('APPROVE');
  if (next.includes('RETURN_REJECTED') && has('orders.return.reject')) out.push('REJECT');
  if (next.includes('PICKUP_SCHEDULED') && has('orders.return.reschedule')) out.push('SCHEDULE_PICKUP');
  if (next.includes('RECEIVED') && has('orders.return.mark_received')) out.push('MARK_RECEIVED');
  if (['QC_PASSED', 'QC_FAILED'].some((s) => next.includes(s)) && has('orders.return.qc')) out.push('RECORD_QC');
  if (r.type === 'REPLACEMENT' && !['CLOSED', 'RETURN_REJECTED'].includes(r.status) && has('orders.return.convert')) {
    out.push('CONVERT_TO_REFUND');
  }
  return out;
}

export const returnHandlers = [
  mswHttp.get(`${BASE}/returns`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'orders.return.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'requestedAt' });
    const rows = db.returns.map(returnRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['id', 'orderId', 'customerName', 'productName', 'sellerName'],
      filterSpec: {
        status: 'status',
        type: 'type',
        reason: 'reason',
        sellerId: 'sellerId',
        faultAttribution: 'faultAttribution',
        requestedAt: { path: 'requestedAt', kind: 'date' },
        qcResult: 'qcResult',
      },
      sortable: ['requestedAt', 'ageDays', 'amountPaise', 'status', 'customerName'],
      facetFields: ['status', 'type'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/returns/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.return.view');
    if (g.response) return g.response;

    const row = findById('returns', params.id);
    if (!row) return notFound('That return no longer exists.');
    const item = findById('orderItems', row.orderItemId);
    const order = findById('orders', row.orderId);

    return ok(returnRow(row), {
      allowedActions: allowedReturnActions(row, g.permissions),
      item,
      order,
      refund: row.refundId ? findById('refunds', row.refundId) : null,
      // The QC checklist a warehouse works through on receipt.
      qcChecklist: [
        'All original packaging present',
        'Accessories and freebies included',
        'No signs of use or damage',
        'Serial number matches the dispatched unit',
        'Tags and labels intact',
      ],
    });
  }),

  /** One endpoint per transition keeps the state machine explicit. */
  mswHttp.post(`${BASE}/returns/:id/:action`, async ({ request, params }) => {
    const map = {
      approve: ['RETURN_APPROVED', 'orders.return.approve'],
      reject: ['RETURN_REJECTED', 'orders.return.reject'],
      'schedule-pickup': ['PICKUP_SCHEDULED', 'orders.return.reschedule'],
      'mark-received': ['RECEIVED', 'orders.return.mark_received'],
      qc: [null, 'orders.return.qc'],
      'convert-to-refund': [null, 'orders.return.convert'],
    };
    const entry = map[params.action];
    if (!entry) return notFound('Unknown action.');
    const [target, permission] = entry;

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    const row = findById('returns', params.id);
    if (!row) return notFound('That return no longer exists.');
    const order = findById('orders', row.orderId);
    const item = findById('orderItems', row.orderItemId);
    const body = await request.json().catch(() => ({}));

    /* ------------------------------------------------------------ QC */
    if (params.action === 'qc') {
      if (!(TRANSITIONS[row.status] ?? []).some((s) => ['QC_PASSED', 'QC_FAILED'].includes(s))) {
        return illegalTransition(row.status, 'record QC');
      }
      if (!['PASS', 'FAIL'].includes(body?.result)) {
        return validationFailed({ result: 'Record whether QC passed or failed.' });
      }
      if (body.result === 'FAIL' && !String(body?.notes ?? '').trim()) {
        return validationFailed({ notes: 'Say what was wrong — the seller may claim against this.' });
      }

      const passed = body.result === 'PASS';
      update('returns', row.id, {
        status: passed ? 'QC_PASSED' : 'QC_FAILED',
        qcResult: body.result,
        qcNotes: body.notes ?? null,
        qcAt: mockNowIso(),
        qcByName: g.user.name,
      });

      // A passed QC is what releases the customer's money.
      //
      // A delivered item has been paid for either way — by card up front, or
      // in cash at the door — so a return always owes a refund. COD refunds
      // are created in PENDING_DETAILS because there is no card to send them
      // back to; they wait on the customer's bank details rather than being
      // silently skipped.
      if (passed && row.type === 'REFUND' && !row.refundId && order) {
        const refund = createRefund({
          order, items: [item], type: 'RETURN',
          amountPaise: row.amountPaise, actor: g.user, reason: row.reason,
        });
        update('returns', row.id, { refundId: refund.id, status: 'CLOSED' });
      }

      writeAudit({
        actor: g.user, action: 'orders.return.qc', entityType: 'return',
        entityId: row.id, entityLabel: `${row.id} — ${row.productName}`,
        metadata: { result: body.result }, reason: body.notes ?? null,
        severity: passed ? 'info' : 'warning',
      });
      scheduleSave();
      return ok(returnRow(findById('returns', row.id)));
    }

    /* --------------------------------------------- replacement → refund */
    if (params.action === 'convert-to-refund') {
      if (row.type !== 'REPLACEMENT') {
        return conflict('This return is already a refund.', 'NOT_A_REPLACEMENT');
      }
      if (!String(body?.reason ?? '').trim()) {
        return validationFailed({ reason: 'Say why the replacement cannot be sent.' });
      }
      update('returns', row.id, { type: 'REFUND', conversionReason: body.reason });
      writeAudit({
        actor: g.user, action: 'orders.return.convert', entityType: 'return',
        entityId: row.id, entityLabel: row.id, reason: body.reason,
      });
      scheduleSave();
      return ok(returnRow(findById('returns', row.id)));
    }

    /* ------------------------------------------------- simple transitions */
    if (!(TRANSITIONS[row.status] ?? []).includes(target)) {
      return illegalTransition(row.status, params.action);
    }
    if (params.action === 'reject' && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Tell the customer why.' });
    }

    const patch = { status: target };
    if (params.action === 'reject') patch.decisionReason = body.reason;
    if (params.action === 'approve') {
      patch.type = body.type ?? row.type;
      patch.faultAttribution = body.faultAttribution ?? FAULT_BY_REASON[row.reason] ?? 'UNKNOWN';
    }
    if (params.action === 'schedule-pickup') {
      patch.pickupScheduledFor = body.pickupDate ?? null;
      patch.pickupAwb = `AWB${Math.floor(Math.random() * 1e10)}`;
    }
    if (params.action === 'mark-received') patch.receivedAt = mockNowIso();

    update('returns', row.id, patch);
    recordEvent({
      orderId: row.orderId, itemId: row.orderItemId, status: target,
      actorName: g.user.name, note: body.reason ?? null,
    });
    writeAudit({
      actor: g.user, action: `orders.return.${params.action.replace(/-/g, '_')}`,
      entityType: 'return', entityId: row.id, entityLabel: `${row.id} — ${row.productName}`,
      reason: body.reason ?? null,
    });
    scheduleSave();
    return ok(returnRow(findById('returns', row.id)));
  }),

  /** Admin-initiated return, raised on a customer's behalf. */
  mswHttp.post(`${BASE}/orders/:orderId/items/:itemId/return`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.item.return_initiate');
    if (g.response) return g.response;

    const item = findById('orderItems', params.itemId);
    const order = findById('orders', params.orderId);
    if (!item || !order || item.orderId !== order.id) return notFound('That item no longer exists.');

    const eligibility = returnEligibility(item);
    if (!eligibility.eligible) return conflict(eligibility.reason, 'RETURN_NOT_ELIGIBLE');

    const body = await request.json();
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Choose a reason.' });

    const row = insert('returns', {
      id: id('RET', 6),
      orderId: order.id,
      orderItemId: item.id,
      customerId: order.customerId,
      customerName: order.customerName,
      sellerId: item.sellerId,
      sellerName: item.sellerName,
      productName: item.name,
      variantLabel: item.variantLabel,
      image: item.image,
      amountPaise: item.linePaise,
      type: body.type === 'REPLACEMENT' ? 'REPLACEMENT' : 'REFUND',
      reason: body.reason,
      comments: body.comments ?? null,
      images: [],
      status: 'RETURN_REQUESTED',
      faultAttribution: FAULT_BY_REASON[body.reason] ?? 'UNKNOWN',
      qcResult: null,
      qcNotes: null,
      pickupAwb: null,
      requestedAt: mockNowIso(),
      raisedByAdmin: true,
      refundId: null,
      version: 1,
    });

    writeAudit({
      actor: g.user, action: 'orders.item.return_initiate', entityType: 'return',
      entityId: row.id, entityLabel: `${order.id} — ${item.name}`, reason: body.reason,
    });
    scheduleSave();
    return created(returnRow(row));
  }),
];
