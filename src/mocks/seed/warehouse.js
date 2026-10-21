import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Fulfilled-by-Arise stock: inbound consignments and their GRNs, the inventory
 * that results, its movement ledger, adjustments and removal orders.
 *
 * Inventory is held per SKU × warehouse and split into buckets — sellable,
 * reserved, damaged — because "how many do we have" and "how many can we sell"
 * are different numbers.
 */

export const BUCKETS = ['sellable', 'reserved', 'inboundInTransit', 'returnsPendingQc', 'unsellable'];

function ledger({ inventoryId, variantId, warehouseId, type, qty, balance, reference, note }) {
  return insert('inventoryLedger', {
    id: id('ILG', 8),
    inventoryId,
    variantId,
    warehouseId,
    type,
    qty,
    balanceAfter: balance,
    reference: reference ?? null,
    note: note ?? null,
    at: mockNowIso(),
  });
}

/** Stock for the offers that are fulfilled by Arise. */
export function seedInventory() {
  const fbaOffers = filter('offers', (o) => o.fulfillmentType === 'ARISE');
  const warehouses = db.warehouses.filter((w) => w.type === 'FULFILMENT');
  const rows = [];

  fbaOffers.forEach((offer, i) => {
    const warehouse = warehouses[i % warehouses.length];
    const variant = db.variants.find((v) => v.id === offer.variantId);
    const product = db.products.find((p) => p.id === offer.productId);
    if (!variant || !product || !warehouse) return;

    const sellable = offer.stock;
    const reserved = Math.min(sellable, faker.number.int({ min: 0, max: 6 }));
    // A long tail of aged stock is what makes long-term storage fees bite.
    const ageDays = i % 9 === 0
      ? faker.number.int({ min: 200, max: 420 })
      : faker.number.int({ min: 2, max: 120 });

    const row = insert('inventory', {
      id: id('INV', 7),
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      productTitle: product.title,
      variantLabel: variant.label,
      image: product.images?.[0] ?? null,
      sellerId: offer.sellerId,
      sellerName: offer.sellerName,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      categoryId: product.categoryId,
      sellable,
      reserved,
      inboundInTransit: i % 5 === 0 ? faker.number.int({ min: 10, max: 80 }) : 0,
      returnsPendingQc: i % 7 === 0 ? faker.number.int({ min: 1, max: 6 }) : 0,
      unsellable: i % 11 === 0 ? faker.number.int({ min: 1, max: 9 }) : 0,
      // Velocity over the last 30 days, used for days-of-cover.
      dailyVelocity: Number((Math.max(1, offer.stock) / faker.number.int({ min: 20, max: 90 })).toFixed(2)),
      oldestUnitDays: ageDays,
      lowStockThreshold: 20,
      version: 1,
    });

    ledger({
      inventoryId: row.id,
      variantId: variant.id,
      warehouseId: warehouse.id,
      type: 'OPENING',
      qty: sellable,
      balance: sellable,
      note: 'Opening balance',
    });
    rows.push(row);
  });

  return rows;
}

/** Days of cover: the number operations actually plans against. */
export function daysOfCover(row) {
  const available = row.sellable - row.reserved;
  if (!row.dailyVelocity) return null;
  return Math.floor(available / row.dailyVelocity);
}

export function seedInboundConsignments() {
  const fbaSellers = db.sellers.filter(
    (s) => s.status === 'ACTIVE' && s.fulfillmentTypes.includes('ARISE'),
  );
  const warehouses = db.warehouses.filter((w) => w.type === 'FULFILMENT');
  const rows = [];

  const STATES = [
    'DRAFT', 'SUBMITTED', 'SUBMITTED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_BOOKED',
    'ARRIVED', 'RECEIVING', 'RECEIVED', 'RECEIVED', 'CLOSED', 'MISSED', 'CANCELLED',
  ];

  fbaSellers.slice(0, 28).forEach((seller, i) => {
    const warehouse = warehouses[i % warehouses.length];
    const status = STATES[i % STATES.length];
    const settled = ['RECEIVED', 'CLOSED'].includes(status);
    const createdAt = mockNow() - faker.number.int({ min: 2, max: 45 }) * 86400_000;

    const consignment = insert('inboundConsignments', {
      id: id('INB', 5),
      sellerId: seller.id,
      sellerName: seller.storeName,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      status,
      createdAt: new Date(createdAt).toISOString(),
      appointmentAt: ['DRAFT', 'SUBMITTED'].includes(status)
        ? null
        : new Date(createdAt + 2 * 86400_000).toISOString(),
      appointmentSlot: ['DRAFT', 'SUBMITTED'].includes(status) ? null : '11:00–13:00',
      vehicleNo: ['ARRIVED', 'RECEIVING', 'RECEIVED', 'CLOSED'].includes(status)
        ? `MH${faker.string.numeric(2)}CD${faker.string.numeric(4)}`
        : null,
      invoiceNo: `INV/${seller.id.slice(-4)}/${1000 + i}`,
      ewayBillNo: faker.string.numeric(12),
      boxCount: faker.number.int({ min: 2, max: 20 }),
      receivedAt: settled ? new Date(createdAt + 3 * 86400_000).toISOString() : null,
      receivedByName: settled ? 'Pooja Nair' : null,
      hasDiscrepancy: false,
      version: 1,
    });

    // Lines: what the seller declared, and what the warehouse actually found.
    const theirInventory = filter('inventory', (inv) => inv.sellerId === seller.id).slice(0, 3);
    const pool = theirInventory.length
      ? theirInventory
      : filter('inventory', () => true).slice(i, i + 2);

    let discrepancy = false;
    for (const inv of pool) {
      const declared = faker.number.int({ min: 20, max: 200 });
      // One consignment in three comes up short or damaged — which is the
      // whole reason a GRN exists.
      const short = settled && i % 3 === 0;
      const damaged = settled && i % 5 === 0 ? faker.number.int({ min: 1, max: 4 }) : 0;
      const missing = short ? faker.number.int({ min: 1, max: 8 }) : 0;
      const receivedSellable = settled ? declared - missing - damaged : 0;
      if (missing || damaged) discrepancy = true;

      insert('inboundLines', {
        id: id('IBL', 6),
        consignmentId: consignment.id,
        variantId: inv.variantId,
        sku: inv.sku,
        productTitle: inv.productTitle,
        variantLabel: inv.variantLabel,
        declaredQty: declared,
        receivedSellable,
        receivedDamaged: damaged,
        receivedMissing: missing,
        note: damaged ? 'Outer carton crushed in transit' : null,
        version: 1,
      });
    }
    consignment.hasDiscrepancy = discrepancy;
    rows.push(consignment);
  });

  return rows;
}

const ADJUSTMENT_REASONS = [
  ['CYCLE_COUNT', 'Cycle count variance'],
  ['DAMAGED_IN_WAREHOUSE', 'Damaged in the warehouse'],
  ['FOUND', 'Found during a count'],
  ['EXPIRED', 'Past its expiry date'],
  ['MISPICK', 'Picked against the wrong order'],
];

export function seedStockAdjustments() {
  const pool = filter('inventory', () => true).slice(0, 30);

  return pool
    .filter((_r, i) => i % 3 === 0)
    .map((inv, i) => {
      const [code, label] = ADJUSTMENT_REASONS[i % ADJUSTMENT_REASONS.length];
      const qty = faker.number.int({ min: 1, max: 12 });
      const toUnsellable = ['DAMAGED_IN_WAREHOUSE', 'EXPIRED'].includes(code);

      return insert('stockAdjustments', {
        id: id('ADJ', 6),
        inventoryId: inv.id,
        variantId: inv.variantId,
        sku: inv.sku,
        productTitle: inv.productTitle,
        sellerId: inv.sellerId,
        sellerName: inv.sellerName,
        warehouseId: inv.warehouseId,
        warehouseCode: inv.warehouseCode,
        fromBucket: code === 'FOUND' ? null : 'sellable',
        toBucket: code === 'FOUND' ? 'sellable' : toUnsellable ? 'unsellable' : null,
        qty,
        reasonCode: code,
        reasonLabel: label,
        evidence: toUnsellable ? 'Photographs attached' : null,
        status: i % 4 === 0 ? 'PENDING_APPROVAL' : 'APPLIED',
        // Losses in our care are reimbursed to the seller.
        claimRaised: toUnsellable,
        createdByName: 'Pooja Nair',
        createdAt: new Date(mockNow() - faker.number.int({ min: 1, max: 40 }) * 86400_000).toISOString(),
        version: 1,
      });
    });
}

export function seedRemovalOrders() {
  const aged = filter('inventory', (inv) => inv.oldestUnitDays > 180).slice(0, 12);
  const STATES = ['REQUESTED', 'APPROVED', 'PICKING', 'SHIPPED', 'DELIVERED_TO_SELLER', 'DISPOSED', 'CLOSED'];

  return aged.map((inv, i) => {
    const type = i % 3 === 0 ? 'DISPOSE' : 'RETURN_TO_SELLER';
    const qty = Math.max(1, Math.floor(inv.sellable / 2));

    return insert('removalOrders', {
      id: id('RMV', 5),
      inventoryId: inv.id,
      variantId: inv.variantId,
      sku: inv.sku,
      productTitle: inv.productTitle,
      sellerId: inv.sellerId,
      sellerName: inv.sellerName,
      warehouseId: inv.warehouseId,
      warehouseCode: inv.warehouseCode,
      type,
      qty,
      // Removal is charged per unit, which is what makes aged stock expensive
      // to leave sitting.
      feePaise: qty * 1500,
      status: STATES[i % STATES.length],
      reason: inv.oldestUnitDays > 365 ? 'Long-term storage — over 365 days' : 'Aged stock',
      awb: i % 2 === 0 ? `AWB${faker.string.numeric(10)}` : null,
      requestedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 30 }) * 86400_000).toISOString(),
      version: 1,
    });
  });
}
