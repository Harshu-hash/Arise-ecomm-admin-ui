import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Serviceability, rate cards, allocation rules and the courier-side records:
 * manifests, NDRs and weight disputes.
 */

/** Zones drive both the rate card and the delivery promise. */
export const ZONES = ['LOCAL', 'ZONAL', 'METRO', 'REST_OF_INDIA', 'SPECIAL'];

const PINCODE_SEEDS = [
  ['400', 'Mumbai', 'Maharashtra', 'METRO'],
  ['411', 'Pune', 'Maharashtra', 'ZONAL'],
  ['380', 'Ahmedabad', 'Gujarat', 'ZONAL'],
  ['395', 'Surat', 'Gujarat', 'ZONAL'],
  ['560', 'Bengaluru', 'Karnataka', 'METRO'],
  ['110', 'Delhi', 'Delhi', 'METRO'],
  ['122', 'Gurugram', 'Haryana', 'METRO'],
  ['500', 'Hyderabad', 'Telangana', 'METRO'],
  ['600', 'Chennai', 'Tamil Nadu', 'METRO'],
  ['700', 'Kolkata', 'West Bengal', 'METRO'],
  ['302', 'Jaipur', 'Rajasthan', 'REST_OF_INDIA'],
  ['226', 'Lucknow', 'Uttar Pradesh', 'REST_OF_INDIA'],
  ['452', 'Indore', 'Madhya Pradesh', 'REST_OF_INDIA'],
  ['781', 'Guwahati', 'Assam', 'SPECIAL'],
  ['190', 'Srinagar', 'Jammu & Kashmir', 'SPECIAL'],
  ['845', 'Motihari', 'Bihar', 'REST_OF_INDIA'],
  ['855', 'Katihar', 'Bihar', 'REST_OF_INDIA'],
  ['733', 'Raiganj', 'West Bengal', 'REST_OF_INDIA'],
];

export function seedPincodes() {
  const rows = [];
  const couriers = db.couriers;

  for (const [prefix, city, state, zone] of PINCODE_SEEDS) {
    for (let n = 1; n <= 40; n += 1) {
      const pincode = `${prefix}${String(n).padStart(3, '0')}`;
      // The far-flung and north-eastern pincodes are where RTO actually bites.
      const remote = zone === 'SPECIAL';
      const rtoPct = remote
        ? faker.number.int({ min: 18, max: 45 })
        : faker.number.int({ min: 1, max: 14 });
      const highRto = rtoPct > 30;

      rows.push(
        insert('pincodes', {
          id: id('PIN', 6),
          pincode,
          city,
          state,
          zone,
          serviceableCourierIds: couriers
            .filter((c) => c.status === 'ACTIVE' && (!remote || c.modes.includes('SURFACE')))
            .map((c) => c.id),
          codAvailable: !highRto,
          reverseAvailable: !remote,
          // Out-of-delivery-area pincodes cost more and take longer.
          oda: remote,
          tatDays: zone === 'METRO' ? 2 : zone === 'ZONAL' ? 3 : zone === 'SPECIAL' ? 7 : 5,
          rtoPct,
          override: highRto ? 'COD_DISABLED' : null,
          overrideReason: highRto ? `RTO rate ${rtoPct}% — COD switched off` : null,
          version: 1,
        }),
      );
    }
  }
  return rows;
}

/** Weight slab × zone pricing, versioned by effective date. */
export function seedRateCards() {
  const rows = [];
  for (const courier of db.couriers) {
    const base = 3000 + db.couriers.indexOf(courier) * 400;
    rows.push(
      insert('rateCards', {
        id: id('RTC', 4),
        courierId: courier.id,
        courierName: courier.name,
        effectiveFrom: '2026-04-01T00:00:00.000Z',
        slabs: [500, 1000, 2000, 5000].map((grams, i) => ({
          uptoGrams: grams,
          pricePaise: Object.fromEntries(
            ZONES.map((z, zi) => [z, base + i * 1800 + zi * 1200]),
          ),
        })),
        additionalPer500gPaise: 1500,
        codChargePaise: 3500,
        codChargePct: 1.5,
        rtoChargePct: 80,
        version: 1,
      }),
    );
  }
  return rows;
}

/** Which courier gets a shipment, and in what share. */
export function seedAllocationRules() {
  const active = db.couriers.filter((c) => c.status === 'ACTIVE');
  const rules = [
    ['Metro prepaid, light', { zone: 'METRO', paymentMode: 'PREPAID', maxWeightG: 1000 }, 1],
    ['COD anywhere', { paymentMode: 'COD' }, 2],
    ['Heavy parcels', { minWeightG: 2000 }, 3],
    ['North-east and J&K', { zone: 'SPECIAL' }, 4],
    ['Everything else', {}, 99],
  ];

  return rules.map(([name, conditions, priority], i) =>
    insert('allocationRules', {
      id: id('ALR', 3),
      name,
      conditions,
      priority,
      // A split keeps a single courier outage from stopping dispatch.
      courierSplit: active.slice(0, 2).map((c, n) => ({
        courierId: c.id,
        courierName: c.name,
        sharePct: n === 0 ? 70 : 30,
      })),
      enabled: true,
      createdAt: mockNowIso(),
      version: 1 + i * 0,
    }),
  );
}

/** What the customer pays for delivery — the app's `deliveryFee` line. */
export function seedShippingFeeRules() {
  return [
    insert('shippingFeeRules', {
      id: id('SFR', 3),
      name: 'Standard delivery',
      freeAbovePaise: 50000,
      feePaise: 4000,
      appliesTo: 'ALL',
      enabled: true,
      version: 1,
    }),
    insert('shippingFeeRules', {
      id: id('SFR', 3),
      name: 'Heavy and bulky categories',
      freeAbovePaise: 200000,
      feePaise: 12000,
      appliesTo: 'HEAVY',
      enabled: true,
      version: 1,
    }),
  ];
}

/** A manifest is one courier's pickup from one origin on one day. */
export function seedManifests() {
  const rows = [];
  const shipped = filter('shipments', (s) => s.awb);
  const groups = new Map();

  for (const shipment of shipped) {
    const day = shipment.lastScanAt?.slice(0, 10) ?? mockNowIso().slice(0, 10);
    const key = `${shipment.sellerId}|${shipment.courierId}|${day}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shipment);
  }

  let n = 0;
  for (const [key, shipments] of groups) {
    n += 1;
    if (n > 120) break;
    const [sellerId, courierId, day] = key.split('|');
    const seller = db.sellers.find((s) => s.id === sellerId);
    const courier = db.couriers.find((c) => c.id === courierId);
    const missed = n % 11 === 0;
    const partial = !missed && n % 7 === 0;

    const manifest = insert('manifests', {
      id: id('MFT', 5),
      originType: 'SELLER',
      originId: sellerId,
      originName: seller?.storeName ?? '—',
      originCity: seller?.city ?? '—',
      courierId,
      courierName: courier?.name ?? '—',
      date: day,
      slot: faker.helpers.arrayElement(['10:00–13:00', '13:00–16:00', '16:00–19:00']),
      shipmentCount: shipments.length,
      pickedUpCount: missed ? 0 : partial ? Math.ceil(shipments.length / 2) : shipments.length,
      status: missed ? 'MISSED' : partial ? 'PARTIALLY_PICKED' : 'PICKED_UP',
      attempts: missed ? 2 : 1,
      vehicleNo: missed ? null : `MH${faker.string.numeric(2)}AB${faker.string.numeric(4)}`,
      version: 1,
    });
    for (const s of shipments) s.manifestId = manifest.id;
    rows.push(manifest);
  }
  return rows;
}

const NDR_REASONS = [
  'Customer unavailable',
  'Address incomplete',
  'Customer refused',
  'COD amount not ready',
  'Rescheduled by customer',
  'Phone unreachable',
  'Out of delivery area',
];

/** One NDR row per failed delivery attempt — the daily action queue. */
export function seedNdr() {
  const undelivered = filter('shipments', (s) => s.status === 'UNDELIVERED');

  return undelivered.map((shipment, i) => {
    const order = db.orders.find((o) => o.id === shipment.orderId);
    const openedAt = mockNow() - faker.number.int({ min: 2, max: 70 }) * 3600_000;

    return insert('ndrRecords', {
      id: id('NDR', 6),
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      awb: shipment.awb,
      courierId: shipment.courierId,
      courierName: shipment.courierName,
      customerName: order?.customerName,
      customerPhone: order?.customerPhone,
      city: order?.address?.city,
      pincode: order?.address?.pincode,
      reason: shipment.ndrReason ?? NDR_REASONS[i % NDR_REASONS.length],
      attempt: shipment.attempts || 1,
      codAmountPaise: order?.paymentMethod === 'COD' ? order.grandTotalPaise : 0,
      customerResponse: i % 4 === 0 ? 'Asked to deliver after 6pm' : null,
      openedAt: new Date(openedAt).toISOString(),
      // Couriers hold a parcel for 24h before the next action is needed.
      actionDueAt: new Date(openedAt + 24 * 3600_000).toISOString(),
      status: 'OPEN',
      resolution: null,
      version: 1,
    });
  });
}

/** Courier says the parcel weighed more than the seller declared. */
export function seedWeightDisputes() {
  const shipped = filter('shipments', (s) => s.awb).slice(0, 40);

  return shipped
    .filter((_s, i) => i % 2 === 0)
    .map((shipment, i) => {
      const items = filter('orderItems', (it) => it.shipmentId === shipment.id);
      const variant = items[0] ? db.variants.find((v) => v.id === items[0].variantId) : null;
      const declared = variant?.weightG ?? 500;
      const charged = declared + faker.number.int({ min: 150, max: 900 });
      const status = ['RAISED_BY_COURIER', 'SELLER_NOTIFIED', 'DISPUTED_BY_SELLER', 'ACCEPTED', 'REJECTED', 'AUTO_ACCEPTED'][i % 6];

      return insert('weightDisputes', {
        id: id('WDS', 5),
        shipmentId: shipment.id,
        awb: shipment.awb,
        orderId: shipment.orderId,
        sellerId: shipment.sellerId,
        sellerName: shipment.sellerName,
        courierId: shipment.courierId,
        courierName: shipment.courierName,
        sku: items[0] ? db.variants.find((v) => v.id === items[0].variantId)?.sku : null,
        declaredWeightG: declared,
        chargedWeightG: charged,
        differenceG: charged - declared,
        // Couriers bill on the difference, so this is the money at stake.
        extraChargePaise: Math.ceil((charged - declared) / 500) * 1500,
        courierImages: ['scale-photo.jpg', 'dimensions-photo.jpg'],
        sellerEvidence: status === 'DISPUTED_BY_SELLER' ? ['our-scale.jpg'] : [],
        status,
        raisedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 30 }) * 86400_000).toISOString(),
        respondByAt: new Date(mockNow() + 5 * 86400_000).toISOString(),
        decisionReason: null,
        version: 1,
      });
    });
}
