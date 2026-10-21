import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval, requiresApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  CANCELLABLE,
  createRefund,
  recordEvent,
  refreshOrder,
  refundableAmount,
  returnEligibility,
} from '../engine/orderState';
import {
  approvalRequired,
  conflict,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** SLA clocks the order queues are managed against. */
function slaFor(order, items) {
  const placed = new Date(order.placedAt).getTime();
  const unaccepted = items.some((i) => ['PLACED', 'ON_HOLD'].includes(i.status));
  const undispatched = items.some((i) => ['ACCEPTED', 'PACKED'].includes(i.status));
  if (unaccepted) return { label: 'Accept', dueAt: new Date(placed + 24 * 3600_000).toISOString() };
  if (undispatched) return { label: 'Dispatch', dueAt: new Date(placed + 48 * 3600_000).toISOString() };
  return { label: null, dueAt: null };
}

function orderRow(order) {
  const items = filter('orderItems', (i) => i.orderId === order.id);
  const shipments = filter('shipments', (s) => s.orderId === order.id);
  const sla = slaFor(order, items);

  return {
    ...order,
    itemCount: items.length,
    sellerNames: Array.from(new Set(items.map((i) => i.sellerName))),
    firstItemName: items[0]?.name ?? null,
    firstItemImage: items[0]?.image ?? null,
    courierNames: Array.from(new Set(shipments.map((s) => s.courierName).filter(Boolean))),
    promisedDate: shipments[0]?.promisedDate ?? null,
    slaLabel: sla.label,
    slaDueAt: sla.dueAt,
    slaBreached: Boolean(sla.dueAt && new Date(sla.dueAt).getTime() < mockNow()),
    hasReturn: db.returns.some((r) => r.orderId === order.id),
    fulfillmentType: shipments.length
      ? (shipments.every((s) => s.fulfillmentType === 'ARISE') ? 'ARISE'
        : shipments.every((s) => s.fulfillmentType === 'SELLER') ? 'SELLER' : 'MIXED')
      : null,
  };
}

function allowedOrderActions(order, items, permissions) {
  const has = (k) => permissions.includes('*') || permissions.includes(k);
  const out = [];
  if (items.some((i) => CANCELLABLE.includes(i.status)) && has('orders.item.cancel')) out.push('CANCEL_ITEMS');
  if (items.some((i) => returnEligibility(i).eligible) && has('orders.item.return_initiate')) {
    out.push('INITIATE_RETURN');
  }
  // Address can only change before the parcel is handed to a courier.
  if (items.every((i) => CANCELLABLE.includes(i.status) || i.status === 'CANCELLED') && has('orders.order.edit_address')) {
    out.push('CHANGE_ADDRESS');
  }
  if (!order.onHold && has('orders.order.hold')) out.push('HOLD');
  if (order.onHold && has('orders.order.release')) out.push('RELEASE');
  if (has('orders.order.note')) out.push('NOTE');
  if (has('finance.refund.issue')) out.push('GOODWILL_REFUND');
  return out;
}

export const orderHandlers = [
  mswHttp.get(`${BASE}/orders`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'orders.order.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-placedAt' });
    const rows = db.orders.map(orderRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['id', 'customerName', 'customerPhone', 'firstItemName'],
      filterSpec: {
        status: 'status',
        paymentMethod: 'paymentMethod',
        paymentStatus: 'paymentStatus',
        channel: 'channel',
        fulfillmentType: 'fulfillmentType',
        state: 'address.state',
        city: 'address.city',
        pincode: 'address.pincode',
        couponCode: 'couponCode',
        placedAt: { path: 'placedAt', kind: 'date' },
        grandTotalPaise: { path: 'grandTotalPaise' },
        slaBreached: { path: 'slaBreached', kind: 'boolean' },
        hasReturn: { path: 'hasReturn', kind: 'boolean' },
        onHold: { path: 'onHold', kind: 'boolean' },
        sellerId: (row, v) => filter('orderItems', (i) => i.orderId === row.id).some((i) => i.sellerId === v),
        riskLevel: (row, v) =>
          v === 'HIGH' ? row.riskScore >= 60 : v === 'MEDIUM' ? row.riskScore >= 35 && row.riskScore < 60 : row.riskScore < 35,
      },
      sortable: ['placedAt', 'grandTotalPaise', 'status', 'customerName', 'slaDueAt'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/orders/exceptions`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'orders.exception.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'openedAt' });
    const rows = db.orderExceptions.map((e) => ({
      ...e,
      ageHours: Math.floor((mockNow() - new Date(e.openedAt).getTime()) / 3600_000),
    }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['orderId', 'customerName', 'typeLabel', 'id'],
      filterSpec: { type: 'type', status: 'status', priority: 'priority', openedAt: { path: 'openedAt', kind: 'date' } },
      sortable: ['openedAt', 'ageHours', 'priority', 'amountPaise', 'status'],
      facetFields: ['status', 'type'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/orders/cancellations`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'orders.cancellation.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-cancelledAt' });
    const rows = filter('orderItems', (i) => i.status === 'CANCELLED').map((item) => {
      const order = db.orders.find((o) => o.id === item.orderId);
      const event = db.orderEvents.find((e) => e.itemId === item.id && e.status === 'CANCELLED');
      const refund = db.refunds.find((r) => r.itemIds.includes(item.id));
      return {
        id: item.id,
        orderId: item.orderId,
        productName: item.name,
        variantLabel: item.variantLabel,
        image: item.image,
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        customerName: order?.customerName,
        amountPaise: item.linePaise,
        cancelledBy: item.cancelledBy ?? 'SYSTEM',
        cancelReason: item.cancelReason,
        cancelledAt: event?.at ?? order?.placedAt,
        // Where in the journey it was cancelled decides who absorbs the cost.
        stage: item.shipmentId && db.shipments.find((s) => s.id === item.shipmentId)?.awb ? 'POST_SHIP' : 'PRE_SHIP',
        refundStatus: refund?.status ?? (order?.paymentMethod === 'COD' ? 'NOT_APPLICABLE' : 'NONE'),
      };
    });

    const { items, meta } = listResult(rows, query, {
      searchFields: ['orderId', 'productName', 'sellerName', 'customerName'],
      filterSpec: {
        cancelledBy: 'cancelledBy',
        stage: 'stage',
        sellerId: 'sellerId',
        refundStatus: 'refundStatus',
        cancelledAt: { path: 'cancelledAt', kind: 'date' },
      },
      sortable: ['cancelledAt', 'amountPaise', 'sellerName'],
      facetFields: ['cancelledBy'],
    });

    const byActor = rows.reduce((acc, r) => ({ ...acc, [r.cancelledBy]: (acc[r.cancelledBy] ?? 0) + 1 }), {});
    return okList(items, { ...meta, byActor });
  }),

  mswHttp.get(`${BASE}/orders/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.order.view');
    if (g.response) return g.response;

    const order = findById('orders', params.id);
    if (!order) return notFound('That order no longer exists.');

    const items = filter('orderItems', (i) => i.orderId === order.id).map((i) => ({
      ...i,
      cancellable: CANCELLABLE.includes(i.status),
      returnEligibility: returnEligibility(i),
      returnId: db.returns.find((r) => r.orderItemId === i.id)?.id ?? null,
    }));
    const shipments = filter('shipments', (s) => s.orderId === order.id).map((s) => ({
      ...s,
      items: items.filter((i) => i.shipmentId === s.id),
    }));
    const customer = findById('customers', order.customerId);

    return ok(orderRow(order), {
      allowedActions: allowedOrderActions(order, items, g.permissions),
      items,
      shipments,
      payments: filter('payments', (p) => p.orderId === order.id),
      refunds: filter('refunds', (r) => r.orderId === order.id),
      returns: filter('returns', (r) => r.orderId === order.id),
      events: filter('orderEvents', (e) => e.orderId === order.id).sort((a, b) => b.at.localeCompare(a.at)),
      notes: filter('orderNotes', (n) => n.orderId === order.id).sort((a, b) => b.at.localeCompare(a.at)),
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            status: customer.status,
            ordersCount: customer.ordersCount,
            gmvPaise: customer.gmvPaise,
            rtoPct: customer.rtoPct,
            returnPct: customer.returnPct,
            riskScore: customer.riskScore,
            walletBalancePaise: customer.walletBalancePaise,
          }
        : null,
    });
  }),

  /** Cancel one or more items, with the refund that follows. */
  mswHttp.post(`${BASE}/orders/:id/cancel-items`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.item.cancel');
    if (g.response) return g.response;

    const order = findById('orders', params.id);
    if (!order) return notFound('That order no longer exists.');
    const body = await request.json();

    if (!body?.itemIds?.length) return validationFailed({ itemIds: 'Pick at least one item.' });
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Choose a reason.' });

    const items = body.itemIds.map((iid) => findById('orderItems', iid)).filter(Boolean);
    if (items.length !== body.itemIds.length) return notFound('One of those items no longer exists.');
    if (items.some((i) => i.orderId !== order.id)) {
      return conflict('Those items are not all on this order.', 'ITEM_ORDER_MISMATCH');
    }

    const blocked = items.filter((i) => !CANCELLABLE.includes(i.status));
    if (blocked.length) {
      return illegalTransition(blocked[0].status, 'cancel');
    }

    const amount = refundableAmount(order, items);
    const actorType = body.actor ?? 'CUSTOMER';

    const apply = () => {
      for (const item of items) {
        update('orderItems', item.id, {
          status: 'CANCELLED',
          cancelledBy: actorType,
          cancelReason: body.reason,
        });
        recordEvent({
          orderId: order.id,
          itemId: item.id,
          status: 'CANCELLED',
          actorType: 'ADMIN',
          actorName: g.user.name,
          note: `${body.reason}${body.note ? ` — ${body.note}` : ''}`,
        });
      }
      refreshOrder(order.id);

      if (amount > 0 && order.paymentStatus === 'CAPTURED') {
        createRefund({
          order, items, type: 'CANCELLATION', amountPaise: amount,
          mode: body.refundMode, actor: g.user, reason: body.reason,
        });
      }

      writeAudit({
        actor: g.user,
        action: 'orders.item.cancel',
        entityType: 'order',
        entityId: order.id,
        entityLabel: `${order.id} — ${items.length} item${items.length === 1 ? '' : 's'}`,
        reason: body.reason,
        metadata: { itemIds: items.map((i) => i.id), refundPaise: amount, actor: actorType },
        severity: 'warning',
      });
    };

    // A refund above the agent's limit becomes an approval, but the
    // cancellation itself still goes through — the customer should not wait
    // on an internal threshold.
    if (amount > 0 && requiresApproval('refund.issue', { actor: g.user, amountPaise: amount })) {
      apply();
      const approval = createApproval({
        actionKey: 'refund.issue',
        actor: g.user,
        entityType: 'order',
        entityId: order.id,
        entityLabel: order.id,
        reason: body.reason,
        summary: `Refund ${items.length} cancelled item(s) on ${order.id}`,
        amountPaise: amount,
        execute: () => {
          const refund = db.refunds.find((r) => r.orderId === order.id && r.status === 'PENDING_APPROVAL');
          if (refund) update('refunds', refund.id, { status: 'INITIATED' });
        },
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    apply();
    scheduleSave();
    return ok(orderRow(findById('orders', order.id)), { refundedPaise: amount });
  }),

  mswHttp.post(`${BASE}/orders/:id/hold`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.order.hold');
    if (g.response) return g.response;

    const order = findById('orders', params.id);
    if (!order) return notFound('That order no longer exists.');
    if (order.onHold) return conflict('This order is already on hold.', 'ALREADY_ON_HOLD');

    const body = await request.json();
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });

    update('orders', order.id, { onHold: true, holdReason: body.reason });
    for (const item of filter('orderItems', (i) => i.orderId === order.id && i.status === 'PLACED')) {
      update('orderItems', item.id, { status: 'ON_HOLD' });
    }
    refreshOrder(order.id);
    recordEvent({ orderId: order.id, status: 'ON_HOLD', actorName: g.user.name, note: body.reason });
    writeAudit({
      actor: g.user, action: 'orders.order.hold', entityType: 'order',
      entityId: order.id, entityLabel: order.id, reason: body.reason, severity: 'warning',
    });
    scheduleSave();
    return ok(orderRow(findById('orders', order.id)));
  }),

  mswHttp.post(`${BASE}/orders/:id/release`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.order.release');
    if (g.response) return g.response;

    const order = findById('orders', params.id);
    if (!order) return notFound('That order no longer exists.');
    if (!order.onHold) return conflict('This order is not on hold.', 'NOT_ON_HOLD');

    update('orders', order.id, { onHold: false, holdReason: null });
    for (const item of filter('orderItems', (i) => i.orderId === order.id && i.status === 'ON_HOLD')) {
      update('orderItems', item.id, { status: 'PLACED' });
    }
    refreshOrder(order.id);
    recordEvent({ orderId: order.id, status: 'PLACED', actorName: g.user.name, note: 'Hold released' });
    writeAudit({
      actor: g.user, action: 'orders.order.release', entityType: 'order',
      entityId: order.id, entityLabel: order.id,
    });
    scheduleSave();
    return ok(orderRow(findById('orders', order.id)));
  }),

  mswHttp.post(`${BASE}/orders/:id/address`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.order.edit_address');
    if (g.response) return g.response;

    const order = findById('orders', params.id);
    if (!order) return notFound('That order no longer exists.');
    const items = filter('orderItems', (i) => i.orderId === order.id);
    if (!items.every((i) => CANCELLABLE.includes(i.status) || i.status === 'CANCELLED')) {
      return conflict(
        'This order has already been handed to a courier, so the address can no longer change.',
        'ALREADY_SHIPPED',
      );
    }

    const body = await request.json();
    const fieldErrors = {};
    for (const field of ['name', 'line', 'cityLine', 'phone', 'pincode']) {
      if (!String(body?.[field] ?? '').trim()) fieldErrors[field] = 'Required.';
    }
    if (body?.pincode && !/^\d{6}$/.test(body.pincode)) fieldErrors.pincode = 'A pincode is 6 digits.';
    // A pincode nobody delivers to would silently strand the order.
    if (body?.pincode && db.blocklistEntries.some((b) => b.kind === 'PINCODE_COD' && b.value === body.pincode)
        && order.paymentMethod === 'COD') {
      fieldErrors.pincode = 'COD is not available at this pincode.';
    }
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const before = { ...order.address };
    update('orders', order.id, {
      address: { ...order.address, ...body },
    });
    recordEvent({
      orderId: order.id, status: order.status, actorName: g.user.name,
      note: `Delivery address changed to ${body.cityLine}`,
    });
    writeAudit({
      actor: g.user, action: 'orders.order.edit_address', entityType: 'order',
      entityId: order.id, entityLabel: order.id,
      changes: [{ field: 'address', from: before.cityLine, to: body.cityLine }],
      reason: body.reason ?? null,
    });
    scheduleSave();
    return ok(orderRow(findById('orders', order.id)));
  }),

  mswHttp.post(`${BASE}/orders/:id/notes`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.order.note');
    if (g.response) return g.response;

    const order = findById('orders', params.id);
    if (!order) return notFound('That order no longer exists.');
    const body = await request.json();
    if (!String(body?.text ?? '').trim()) return validationFailed({ text: 'Write something first.' });

    const note = insert('orderNotes', {
      id: id('ONT', 6),
      orderId: order.id,
      text: body.text.trim(),
      authorId: g.user.id,
      authorName: g.user.name,
      at: mockNowIso(),
    });
    scheduleSave();
    return ok(note);
  }),

  mswHttp.post(`${BASE}/orders/exceptions/:id/resolve`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.exception.resolve');
    if (g.response) return g.response;

    const row = findById('orderExceptions', params.id);
    if (!row) return notFound('That exception no longer exists.');
    if (row.status === 'RESOLVED') return conflict('Already resolved.', 'ALREADY_DECIDED');

    const body = await request.json();
    if (!body?.resolutionCode) return validationFailed({ resolutionCode: 'Pick how it was resolved.' });

    update('orderExceptions', row.id, {
      status: 'RESOLVED',
      resolutionCode: body.resolutionCode,
      resolvedByName: g.user.name,
      resolvedAt: mockNowIso(),
    });
    writeAudit({
      actor: g.user, action: 'orders.exception.resolve', entityType: 'orderException',
      entityId: row.id, entityLabel: row.typeLabel, reason: body.note ?? null,
    });
    scheduleSave();
    return ok(findById('orderExceptions', row.id));
  }),

  mswHttp.post(`${BASE}/orders/exceptions/:id/assign`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'orders.exception.assign');
    if (g.response) return g.response;
    const row = findById('orderExceptions', params.id);
    if (!row) return notFound('That exception no longer exists.');

    update('orderExceptions', row.id, {
      ownerId: g.user.id,
      ownerName: g.user.name,
      status: row.status === 'OPEN' ? 'IN_PROGRESS' : row.status,
    });
    scheduleSave();
    return ok(findById('orderExceptions', row.id));
  }),
];
