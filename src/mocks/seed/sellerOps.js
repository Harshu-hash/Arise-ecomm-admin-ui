import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, id, insert } from '../db/store';
import { mockNow } from '../engine/settings';

/**
 * Brand authorisation requests, penalties and seller protection claims — the
 * three queues a seller-ops team lives in once sellers are live.
 */

const VIOLATIONS = [
  ['SELLER_CANCELLATION', 'Seller cancelled a confirmed order', 20000],
  ['LATE_DISPATCH', 'Dispatched after the promised date', 10000],
  ['WRONG_PRODUCT', 'Wrong product delivered', 50000],
  ['COUNTERFEIT', 'Counterfeit product complaint', 500000],
  ['FAKE_TRACKING', 'Tracking number never scanned', 30000],
];

export function seedPenalties() {
  const active = db.sellers.filter((s) => s.status === 'ACTIVE');
  const rows = [];

  active.forEach((seller, i) => {
    // Most sellers are clean; a minority carry violations, which is what makes
    // the performance screens worth looking at.
    if (i % 4 !== 0) return;
    const count = (i % 12 === 0) ? 3 : 1;

    for (let n = 0; n < count; n += 1) {
      const [code, label, amount] = VIOLATIONS[(i + n) % VIOLATIONS.length];
      const status = faker.helpers.arrayElement(['APPLIED', 'APPLIED', 'DISPUTED', 'WAIVED', 'RECOVERED']);
      rows.push(
        insert('penalties', {
          id: id('PEN', 6),
          sellerId: seller.id,
          sellerName: seller.storeName,
          violationCode: code,
          violationLabel: label,
          orderId: `ORD-${faker.string.numeric(5)}`,
          amountPaise: amount,
          status,
          appliedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 60 }) * 86400_000).toISOString(),
          evidence: 'Courier scan log and customer complaint ticket attached.',
          disputeReason: status === 'DISPUTED' ? 'Order was cancelled by the customer, not by us.' : null,
          waivedByName: status === 'WAIVED' ? 'Ananya Deshpande' : null,
          waivedReason: status === 'WAIVED' ? 'Cancellation was attributable to the courier.' : null,
          version: 1,
        }),
      );
    }
  });
  return rows;
}

const CLAIM_TYPES = [
  ['RETURN_DAMAGED', 'Return received damaged or used'],
  ['WRONG_ITEM_RETURNED', 'Customer returned a different item'],
  ['LOST_IN_TRANSIT', 'Shipment lost by the courier'],
  ['LOST_IN_WAREHOUSE', 'Lost or damaged in an Arise warehouse'],
  ['WEIGHT_DISPUTE', 'Courier charged for a higher weight'],
];

export function seedClaims() {
  const active = db.sellers.filter((s) => s.status === 'ACTIVE');
  const rows = [];

  active.forEach((seller, i) => {
    if (i % 6 !== 0) return;
    const [type, label] = CLAIM_TYPES[i % CLAIM_TYPES.length];
    const status = faker.helpers.arrayElement([
      'SUBMITTED',
      'SUBMITTED',
      'UNDER_REVIEW',
      'INFO_REQUESTED',
      'APPROVED',
      'PARTIALLY_APPROVED',
      'REJECTED',
    ]);
    const claimed = faker.number.int({ min: 400, max: 12000 }) * 100;

    rows.push(
      insert('sellerClaims', {
        id: id('CLM', 6),
        sellerId: seller.id,
        sellerName: seller.storeName,
        type,
        typeLabel: label,
        orderId: `ORD-${faker.string.numeric(5)}`,
        amountClaimedPaise: claimed,
        amountApprovedPaise:
          status === 'APPROVED' ? claimed : status === 'PARTIALLY_APPROVED' ? Math.round(claimed * 0.6) : null,
        status,
        submittedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 45 }) * 86400_000).toISOString(),
        evidence: ['Return QC photographs', 'Original listing images'],
        decisionReason:
          status === 'REJECTED' ? 'QC photographs show the item matches what was shipped.' : null,
        version: 1,
      }),
    );
  });
  return rows;
}

const REQUEST_TYPES = ['BRAND_OWNER', 'RESELLER_AUTHORISED', 'NEW_BRAND'];

export function seedBrandRequests() {
  const sellers = db.sellers.filter((s) => ['ACTIVE', 'ONBOARDING', 'UNDER_REVIEW'].includes(s.status));
  const rows = [];

  sellers.slice(0, 26).forEach((seller, i) => {
    const brand = db.brands[i % db.brands.length];
    const status = i < 12 ? 'PENDING' : faker.helpers.arrayElement(['APPROVED', 'REJECTED', 'INFO_REQUESTED']);

    rows.push(
      insert('brandRequests', {
        id: id('BRQ', 6),
        sellerId: seller.id,
        sellerName: seller.storeName,
        brandId: brand.id,
        brandName: brand.name,
        requestType: REQUEST_TYPES[i % REQUEST_TYPES.length],
        documents: [
          { label: 'Authorisation letter', fileName: `auth-${seller.id}.pdf` },
          { label: 'Purchase invoices (6 months)', fileName: `invoices-${seller.id}.pdf` },
        ],
        submittedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 30 }) * 86400_000).toISOString(),
        status,
        validTill:
          status === 'APPROVED'
            ? new Date(mockNow() + faker.number.int({ min: 40, max: 500 }) * 86400_000).toISOString()
            : null,
        decisionReason: status === 'REJECTED' ? 'Authorisation letter is not on brand letterhead.' : null,
        version: 1,
      }),
    );
  });
  return rows;
}
