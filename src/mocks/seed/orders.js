import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow } from '../engine/settings';

/**
 * Orders, their items, shipments, payments, refunds and returns.
 *
 * An order splits into one shipment per seller — the structure that makes a
 * marketplace order different from a shop's. Item status is the source of
 * truth; the order's own status is derived from its items, so a partially
 * cancelled order can never disagree with itself.
 *
 * Volume is 1,500 rather than the 8,000 in the plan: the whole database is
 * snapshotted to IndexedDB after every mutation, and 8,000 orders made that
 * write slow enough to feel. 1,500 still exercises pagination, facets and
 * every filter.
 */
export const ORDER_COUNT = 1500;

const PAYMENT_METHODS = [
  ['UPI', 42], ['CARD', 16], ['COD', 22], ['NETBANKING', 6], ['WALLET', 8], ['EMI', 6],
];

/** Weighted pick so the status mix looks like a real 90-day window. */
const ITEM_STATUS_MIX = [
  ['DELIVERED', 58], ['IN_TRANSIT', 8], ['OUT_FOR_DELIVERY', 4], ['SHIPPED', 5],
  ['PACKED', 4], ['ACCEPTED', 4], ['PLACED', 3], ['CANCELLED', 7],
  ['UNDELIVERED', 2], ['RTO_IN_TRANSIT', 1], ['ON_HOLD', 1], ['PAYMENT_FAILED', 2],
  ['LOST_IN_TRANSIT', 1],
];

function weightedPick(table, rnd) {
  const total = table.reduce((n, [, w]) => n + w, 0);
  let t = rnd * total;
  for (const [value, weight] of table) {
    t -= weight;
    if (t <= 0) return value;
  }
  return table[0][0];
}

/** Which item states are still open versus settled. */
const TERMINAL = ['DELIVERED', 'CANCELLED', 'RTO_DELIVERED', 'PAYMENT_FAILED', 'LOST_IN_TRANSIT'];
const PRE_SHIP = ['PLACED', 'ON_HOLD', 'ACCEPTED', 'PACKED', 'MANIFESTED'];

/** Order status is derived, never stored independently of its items. */
export function deriveOrderStatus(items) {
  if (!items.length) return 'PLACED';
  const states = items.map((i) => i.status);
  if (states.every((s) => s === 'CANCELLED')) return 'CANCELLED';
  if (states.every((s) => s === 'PAYMENT_FAILED')) return 'PAYMENT_FAILED';
  if (states.every((s) => TERMINAL.includes(s))) {
    return states.includes('DELIVERED') ? 'DELIVERED' : 'CANCELLED';
  }
  // Otherwise report the least-progressed open item: that is the one holding
  // the order up and the one an agent needs to act on.
  const order = [
    'PAYMENT_PENDING', 'ON_HOLD', 'PLACED', 'ACCEPTED', 'PACKED', 'MANIFESTED',
    'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'UNDELIVERED',
    'RTO_INITIATED', 'RTO_IN_TRANSIT', 'LOST_IN_TRANSIT',
  ];
  const open = states.filter((s) => !TERMINAL.includes(s));
  return order.find((s) => open.includes(s)) ?? open[0] ?? 'DELIVERED';
}

function pushEvent(orderId, itemId, status, at, actor = 'SYSTEM', note = null) {
  insert('orderEvents', {
    id: id('OEV', 8),
    orderId,
    itemId,
    status,
    at: new Date(at).toISOString(),
    actorType: actor,
    actorName: actor === 'SYSTEM' ? 'System' : actor,
    note,
  });
}

export function seedOrders() {
  const customers = db.customers;
  const liveOffers = filter('offers', (o) => o.status === 'LIVE' || o.status === 'OUT_OF_STOCK');
  if (!liveOffers.length || !customers.length) return [];

  const orders = [];

  for (let i = 0; i < ORDER_COUNT; i += 1) {
    const customer = customers[i % customers.length];
    const address = filter('customerAddresses', (a) => a.customerId === customer.id)[0];
    const placedAt = mockNow() - faker.number.int({ min: 0, max: 90 }) * 86400_000
      - faker.number.int({ min: 0, max: 23 }) * 3600_000;

    const method = weightedPick(PAYMENT_METHODS, Math.random());
    const lineCount = Math.random() < 0.72 ? 1 : Math.random() < 0.85 ? 2 : 3;

    const order = insert('orders', {
      id: `ORD-${String(80000 + i)}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      placedAt: new Date(placedAt).toISOString(),
      channel: customer.platform === 'iOS' ? 'iOS' : faker.helpers.arrayElement(['Android', 'Android', 'Web']),
      paymentMethod: method,
      paymentStatus: 'CAPTURED',
      address: {
        label: address?.label ?? 'Home',
        name: address?.name ?? customer.name,
        line: address?.line ?? '',
        cityLine: address?.cityLine ?? '',
        phone: address?.phone ?? customer.phone,
        pincode: address?.pincode,
        city: address?.city,
        state: address?.state,
      },
      // The app shows a 4-digit code the courier asks for at the door.
      deliveryCode: String(faker.number.int({ min: 1000, max: 9999 })),
      couponCode: i % 11 === 0 ? 'EXTRA5' : null,
      riskScore: customer.riskScore,
      tags: [],
      status: 'PLACED',
      itemCount: 0,
      grandTotalPaise: 0,
      priceDetails: null,
      onHold: false,
      holdReason: null,
      version: 1,
    });

    // Items, grouped into one shipment per seller.
    const bySeller = new Map();
    let itemTotal = 0;

    for (let n = 0; n < lineCount; n += 1) {
      const offer = liveOffers[(i * 7 + n * 13) % liveOffers.length];
      const product = db.products.find((p) => p.id === offer.productId);
      const variant = db.variants.find((v) => v.id === offer.variantId);
      if (!product || !variant) continue;

      const qty = Math.random() < 0.85 ? 1 : 2;
      const status = weightedPick(ITEM_STATUS_MIX, Math.random());
      const linePaise = offer.sellingPricePaise * qty;
      itemTotal += status === 'CANCELLED' || status === 'PAYMENT_FAILED' ? 0 : linePaise;

      const category = db.categories.find((c) => c.id === product.categoryId);
      // Clamped to the past: a delivery dated in the future would make the
      // item's money immediately payable for non-returnable categories,
      // which have no return window to wait out.
      const deliveredAt = status === 'DELIVERED'
        ? Math.min(placedAt + faker.number.int({ min: 2, max: 6 }) * 86400_000, mockNow() - 3600_000)
        : null;

      const item = insert('orderItems', {
        id: id('ITM', 7),
        orderId: order.id,
        productId: product.id,
        variantId: variant.id,
        offerId: offer.id,
        sellerId: offer.sellerId,
        sellerName: offer.sellerName,
        // Carried from the offer: it decides who picks and packs, and so
        // which fulfilment fees the seller is charged at settlement.
        fulfillmentType: offer.fulfillmentType,
        name: product.title,
        variantLabel: variant.label,
        image: product.images?.[0] ?? null,
        qty,
        pricePaise: offer.sellingPricePaise,
        mrpPaise: offer.mrpPaise,
        linePaise,
        status,
        cancelledBy: status === 'CANCELLED'
          ? faker.helpers.arrayElement(['CUSTOMER', 'CUSTOMER', 'SELLER', 'SYSTEM'])
          : null,
        cancelReason: status === 'CANCELLED'
          ? faker.helpers.arrayElement([
              'Ordered by mistake', 'Found a better price elsewhere',
              'Item no longer needed', 'Delivery time is too long',
            ])
          : null,
        deliveredAt: deliveredAt ? new Date(deliveredAt).toISOString() : null,
        // Return eligibility follows the category policy, not a global rule.
        returnWindowDays: category?.returnWindowDays ?? 0,
        returnWindowEndsAt: deliveredAt && category?.returnWindowDays
          ? new Date(deliveredAt + category.returnWindowDays * 86400_000).toISOString()
          : null,
        version: 1,
      });

      pushEvent(order.id, item.id, 'PLACED', placedAt);
      if (!PRE_SHIP.includes(status) && status !== 'PAYMENT_FAILED') {
        pushEvent(order.id, item.id, 'SHIPPED', placedAt + 86400_000, 'SELLER');
      }
      if (status === 'DELIVERED') pushEvent(order.id, item.id, 'DELIVERED', deliveredAt, 'COURIER');
      if (status === 'CANCELLED') {
        pushEvent(order.id, item.id, 'CANCELLED', placedAt + 3600_000, item.cancelledBy, item.cancelReason);
      }

      if (!bySeller.has(offer.sellerId)) bySeller.set(offer.sellerId, []);
      bySeller.get(offer.sellerId).push(item);
    }

    // One shipment per seller in the order.
    for (const [sellerId, items] of bySeller) {
      const seller = db.sellers.find((s) => s.id === sellerId);
      const courier = db.couriers[(i + items.length) % db.couriers.length];
      const representative = items[0].status;
      const shipped = !PRE_SHIP.includes(representative) && representative !== 'PAYMENT_FAILED';

      const shipment = insert('shipments', {
        id: id('SHP', 7),
        orderId: order.id,
        sellerId,
        sellerName: seller?.storeName ?? '—',
        fulfillmentType: items[0].fulfillmentType ?? 'SELLER',
        courierId: shipped ? courier.id : null,
        courierName: shipped ? courier.name : null,
        awb: shipped ? `AWB${faker.string.numeric(10)}` : null,
        status: representative,
        promisedDate: new Date(placedAt + 5 * 86400_000).toISOString(),
        lastScanAt: shipped ? new Date(placedAt + 2 * 86400_000).toISOString() : null,
        lastScanLocation: shipped ? `${order.address.city} Hub` : null,
        attempts: representative === 'UNDELIVERED' ? faker.number.int({ min: 1, max: 3 }) : 0,
        ndrReason: representative === 'UNDELIVERED'
          ? faker.helpers.arrayElement(['Customer unavailable', 'Address incomplete', 'Customer refused', 'Phone unreachable'])
          : null,
        version: 1,
      });
      for (const item of items) item.shipmentId = shipment.id;
    }

    // Money. Platform fee matches what the mobile app shows (₹5).
    const deliveryFee = itemTotal >= 50000 || itemTotal === 0 ? 0 : 4000;
    const platformFee = itemTotal === 0 ? 0 : 500;
    const discount = order.couponCode ? Math.round(itemTotal * 0.05) : 0;
    const grandTotal = Math.max(0, itemTotal + deliveryFee + platformFee - discount);

    order.priceDetails = {
      itemTotalPaise: itemTotal,
      deliveryFeePaise: deliveryFee,
      platformFeePaise: platformFee,
      discountPaise: discount,
      grandTotalPaise: grandTotal,
    };
    order.grandTotalPaise = grandTotal;
    const items = filter('orderItems', (it) => it.orderId === order.id);
    order.itemCount = items.length;
    order.status = deriveOrderStatus(items);
    order.sellerCount = bySeller.size;

    const failed = items.length > 0 && items.every((it) => it.status === 'PAYMENT_FAILED');
    order.paymentStatus = failed ? 'FAILED' : method === 'COD' ? 'PENDING' : 'CAPTURED';

    insert('payments', {
      id: id('PAY', 7),
      orderId: order.id,
      gateway: method === 'COD' ? 'CASH' : faker.helpers.arrayElement(['Razorpay', 'PayU']),
      method,
      amountPaise: grandTotal,
      status: order.paymentStatus,
      txnRef: `pay_${faker.string.alphanumeric(14)}`,
      failureReason: failed ? 'Issuer declined the transaction' : null,
      createdAt: new Date(placedAt).toISOString(),
      version: 1,
    });

    orders.push(order);
  }

  seedRefundsAndReturns();
  return orders;
}

/** Refunds for cancellations, and returns against delivered items. */
function seedRefundsAndReturns() {
  const cancelled = filter('orderItems', (i) => i.status === 'CANCELLED');

  cancelled.forEach((item, n) => {
    const order = db.orders.find((o) => o.id === item.orderId);
    if (!order || order.paymentMethod === 'COD') return;
    const status = n % 23 === 0 ? 'FAILED' : n % 7 === 0 ? 'PROCESSING' : 'COMPLETED';

    insert('refunds', {
      id: id('RFD', 7),
      orderId: order.id,
      itemIds: [item.id],
      customerId: order.customerId,
      type: 'CANCELLATION',
      amountPaise: item.linePaise,
      mode: 'ORIGINAL',
      status,
      arn: status === 'COMPLETED' ? `ARN${faker.string.numeric(12)}` : null,
      failureReason: status === 'FAILED' ? 'Card account closed' : null,
      initiatedByName: 'System',
      initiatedAt: item.deliveredAt ?? order.placedAt,
      completedAt: status === 'COMPLETED' ? new Date(mockNow() - 86400_000).toISOString() : null,
      version: 1,
    });
  });

  // Returns against delivered items still inside their window.
  const delivered = filter(
    'orderItems',
    (i) => i.status === 'DELIVERED' && i.returnWindowEndsAt,
  );

  delivered.slice(0, 180).forEach((item, n) => {
    if (n % 3 !== 0) return;
    const order = db.orders.find((o) => o.id === item.orderId);
    const status = [
      'RETURN_REQUESTED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'PICKUP_SCHEDULED',
      'PICKED_UP', 'IN_TRANSIT_TO_ORIGIN', 'RECEIVED', 'QC_PASSED', 'QC_FAILED',
      'CLOSED', 'RETURN_REJECTED',
    ][n % 11];

    insert('returns', {
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
      type: n % 4 === 0 ? 'REPLACEMENT' : 'REFUND',
      reason: faker.helpers.arrayElement([
        'Item is damaged or defective', 'Wrong item delivered',
        'Item not as described', 'Size/fit issue', 'Changed my mind',
      ]),
      comments: 'Opened the box and the item did not match the listing photographs.',
      images: ['return-photo-1.jpg', 'return-photo-2.jpg'],
      status,
      // Fault attribution drives who pays the reverse shipping fee.
      faultAttribution: null,
      qcResult: ['QC_PASSED', 'CLOSED'].includes(status)
        ? 'PASS'
        : status === 'QC_FAILED'
          ? 'FAIL'
          : null,
      qcNotes: status === 'QC_FAILED' ? 'Returned item shows heavy use and is missing accessories.' : null,
      pickupAwb: ['PICKED_UP', 'IN_TRANSIT_TO_ORIGIN', 'RECEIVED', 'QC_PASSED', 'QC_FAILED', 'CLOSED'].includes(status)
        ? `AWB${faker.string.numeric(10)}`
        : null,
      requestedAt: new Date(new Date(item.deliveredAt).getTime() + 86400_000).toISOString(),
      refundId: null,
      version: 1,
    });
  });
}

const EXCEPTION_TYPES = [
  ['PAYMENT_NO_ORDER', 'Payment captured but no order created'],
  ['ORDER_PAYMENT_FAILED', 'Order placed but payment failed'],
  ['NOT_ACCEPTED_SLA', 'Seller has not accepted past SLA'],
  ['NOT_DISPATCHED_SLA', 'Not dispatched past SLA'],
  ['STUCK_IN_TRANSIT', 'No courier scan for 5 days'],
  ['LOST_IN_TRANSIT', 'Lost in transit'],
  ['DELIVERED_DISPUTED', 'Marked delivered but customer disputes it'],
  ['REFUND_FAILED', 'Refund failed at the gateway'],
  ['DUPLICATE_PAYMENT', 'Customer charged twice'],
];

/** The stuck-order work queue. */
export function seedOrderExceptions() {
  const rows = [];
  const pool = db.orders.slice(0, 60);

  pool.forEach((order, i) => {
    if (i % 2 !== 0) return;
    const [type, label] = EXCEPTION_TYPES[i % EXCEPTION_TYPES.length];
    const openedAt = mockNow() - faker.number.int({ min: 2, max: 240 }) * 3600_000;

    rows.push(
      insert('orderExceptions', {
        id: id('EXC', 5),
        type,
        typeLabel: label,
        orderId: order.id,
        customerName: order.customerName,
        amountPaise: order.grandTotalPaise,
        openedAt: new Date(openedAt).toISOString(),
        priority: ['PAYMENT_NO_ORDER', 'DUPLICATE_PAYMENT', 'REFUND_FAILED'].includes(type) ? 'HIGH' : 'NORMAL',
        status: i % 6 === 0 ? 'RESOLVED' : i % 5 === 0 ? 'IN_PROGRESS' : 'OPEN',
        ownerId: null,
        ownerName: null,
        resolutionCode: i % 6 === 0 ? 'MANUAL_CORRECTION' : null,
        version: 1,
      }),
    );
  });
  return rows;
}

/** Rolls per-customer order totals up from the orders actually created. */
export function rollUpCustomerStats() {
  for (const customer of db.customers) {
    const theirs = filter('orders', (o) => o.customerId === customer.id);
    customer.ordersCount = theirs.length;
    customer.gmvPaise = theirs.reduce((n, o) => n + o.grandTotalPaise, 0);
    customer.lastOrderAt = theirs.length
      ? theirs.map((o) => o.placedAt).sort().at(-1)
      : null;
  }
}
