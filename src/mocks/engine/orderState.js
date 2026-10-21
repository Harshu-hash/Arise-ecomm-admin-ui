import { db, filter, id, insert, update } from '../db/store';
import { mockNowIso } from './settings';

/**
 * Order item state machine (MODULE_SPECS §M2) and the derivations that hang
 * off it. Kept out of the handlers so the rules have one home.
 */

export const ITEM_TRANSITIONS = {
  PAYMENT_PENDING: ['PLACED', 'PAYMENT_FAILED'],
  PAYMENT_FAILED: [],
  PLACED: ['ON_HOLD', 'ACCEPTED', 'CANCELLED'],
  ON_HOLD: ['PLACED', 'CANCELLED'],
  ACCEPTED: ['PACKED', 'CANCELLED'],
  PACKED: ['MANIFESTED', 'CANCELLED'],
  MANIFESTED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'LOST_IN_TRANSIT', 'RTO_INITIATED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'LOST_IN_TRANSIT', 'RTO_INITIATED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'UNDELIVERED'],
  UNDELIVERED: ['OUT_FOR_DELIVERY', 'RTO_INITIATED'],
  DELIVERED: [],
  CANCELLED: [],
  RTO_INITIATED: ['RTO_IN_TRANSIT'],
  RTO_IN_TRANSIT: ['RTO_DELIVERED'],
  RTO_DELIVERED: [],
  LOST_IN_TRANSIT: [],
};

/** Cancellable right up to pickup; after that it becomes an RTO request. */
export const CANCELLABLE = ['PLACED', 'ON_HOLD', 'ACCEPTED', 'PACKED', 'MANIFESTED'];
export const TERMINAL = ['DELIVERED', 'CANCELLED', 'RTO_DELIVERED', 'PAYMENT_FAILED', 'LOST_IN_TRANSIT'];

const PROGRESSION = [
  'PAYMENT_PENDING', 'ON_HOLD', 'PLACED', 'ACCEPTED', 'PACKED', 'MANIFESTED',
  'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'UNDELIVERED',
  'RTO_INITIATED', 'RTO_IN_TRANSIT', 'LOST_IN_TRANSIT',
];

export function canTransition(from, to) {
  return (ITEM_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * The order's status is always derived from its items, so a partially
 * cancelled order can never show a status that contradicts what is in it.
 */
export function deriveOrderStatus(items) {
  if (!items.length) return 'PLACED';
  const states = items.map((i) => i.status);
  if (states.every((s) => s === 'CANCELLED')) return 'CANCELLED';
  if (states.every((s) => s === 'PAYMENT_FAILED')) return 'PAYMENT_FAILED';
  if (states.every((s) => TERMINAL.includes(s))) {
    return states.includes('DELIVERED') ? 'DELIVERED' : 'CANCELLED';
  }
  const open = states.filter((s) => !TERMINAL.includes(s));
  return PROGRESSION.find((s) => open.includes(s)) ?? open[0] ?? 'DELIVERED';
}

export function refreshOrder(orderId) {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return null;
  const items = filter('orderItems', (i) => i.orderId === orderId);
  order.status = deriveOrderStatus(items);
  order.itemCount = items.length;
  return order;
}

export function recordEvent({ orderId, itemId, status, actorType, actorName, note }) {
  return insert('orderEvents', {
    id: id('OEV', 8),
    orderId,
    itemId: itemId ?? null,
    status,
    at: mockNowIso(),
    actorType: actorType ?? 'ADMIN',
    actorName: actorName ?? 'System',
    note: note ?? null,
  });
}

/**
 * Pro-rates an order-level discount across the items being refunded, so the
 * customer is refunded what they actually paid for those items rather than
 * list price.
 */
export function refundableAmount(order, items) {
  const allItems = filter('orderItems', (i) => i.orderId === order.id);
  const chargeable = allItems.filter((i) => !['CANCELLED', 'PAYMENT_FAILED'].includes(i.status));
  const base = chargeable.reduce((n, i) => n + i.linePaise, 0);
  const discount = order.priceDetails?.discountPaise ?? 0;

  let total = 0;
  for (const item of items) {
    const share = base > 0 ? Math.round((item.linePaise / base) * discount) : 0;
    total += item.linePaise - share;
  }

  // The last item out also carries the delivery and platform fees back.
  const remaining = chargeable.filter((i) => !items.some((x) => x.id === i.id));
  if (remaining.length === 0) {
    total += (order.priceDetails?.deliveryFeePaise ?? 0) + (order.priceDetails?.platformFeePaise ?? 0);
  }
  return Math.max(0, total);
}

/** Creates the refund record for a cancellation or a return. */
export function createRefund({ order, items, type, amountPaise, mode, actor, reason }) {
  // COD orders have nothing to send back to a card, so they need bank details
  // instead; the refund is created but parked until those arrive.
  const codUnpaid = order.paymentMethod === 'COD' && order.paymentStatus !== 'CAPTURED';

  return insert('refunds', {
    id: id('RFD', 7),
    orderId: order.id,
    itemIds: items.map((i) => i.id),
    customerId: order.customerId,
    type,
    amountPaise,
    mode: mode ?? (order.paymentMethod === 'COD' ? 'BANK' : 'ORIGINAL'),
    status: codUnpaid ? 'PENDING_DETAILS' : 'INITIATED',
    arn: null,
    failureReason: null,
    initiatedByName: actor?.name ?? 'System',
    initiatedAt: mockNowIso(),
    completedAt: null,
    reason: reason ?? null,
    version: 1,
  });
}

/** Return eligibility, honouring the category's own window. */
export function returnEligibility(item) {
  if (item.status !== 'DELIVERED') {
    return { eligible: false, reason: 'Only delivered items can be returned.' };
  }
  if (!item.returnWindowDays) {
    return { eligible: false, reason: 'This category does not accept returns.' };
  }
  if (item.returnWindowEndsAt && new Date(item.returnWindowEndsAt).getTime() < Date.now()) {
    return { eligible: false, reason: 'The return window has closed.' };
  }
  const existing = db.returns.find(
    (r) => r.orderItemId === item.id && !['RETURN_REJECTED', 'RETURN_CANCELLED'].includes(r.status),
  );
  if (existing) return { eligible: false, reason: 'A return is already open for this item.' };
  return { eligible: true, reason: null };
}

export function RETURN_TRANSITIONS() {
  return {
    RETURN_REQUESTED: ['RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_CANCELLED'],
    RETURN_APPROVED: ['PICKUP_SCHEDULED', 'RETURN_CANCELLED'],
    PICKUP_SCHEDULED: ['PICKED_UP', 'PICKUP_CANCELLED_QC_FAIL', 'RETURN_CANCELLED'],
    PICKED_UP: ['IN_TRANSIT_TO_ORIGIN'],
    IN_TRANSIT_TO_ORIGIN: ['RECEIVED'],
    RECEIVED: ['QC_PASSED', 'QC_FAILED'],
    QC_PASSED: ['CLOSED'],
    QC_FAILED: ['CLOSED'],
    PICKUP_CANCELLED_QC_FAIL: ['CLOSED'],
    CLOSED: [],
    RETURN_REJECTED: [],
    RETURN_CANCELLED: [],
  };
}

export { update };
