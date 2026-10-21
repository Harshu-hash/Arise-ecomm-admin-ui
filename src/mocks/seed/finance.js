import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';
import { computeSettlement, settlementEligibility, summariseSettlements } from '../engine/settlement';

/**
 * Commission rules, settlement lines, payout batches, COD remittance,
 * invoices and reconciliation.
 *
 * Settlement lines are derived from delivered order items rather than
 * invented, so the payout figures reconcile against the orders that produced
 * them.
 */

/** Commission by category root and price band. */
const COMMISSION = [
  ['Fashion', 18], ['Mobiles', 6], ['Electronics', 11], ['Beauty', 17],
  ['Home', 14], ['Grocery', 9], ['Sports', 15], ['Toys & Baby', 13],
];

export function seedCommissionRules() {
  const rows = [];
  for (const [rootName, basePct] of COMMISSION) {
    for (const [label, min, max, delta] of [
      ['Under ₹500', 0, 50000, 1.5],
      ['₹500–₹2,000', 50001, 200000, 0],
      ['Over ₹2,000', 200001, null, -2],
    ]) {
      rows.push(
        insert('commissionRules', {
          id: id('CMR', 4),
          rootName,
          band: label,
          minPaise: min,
          maxPaise: max,
          // Cheap items carry a higher rate; the fixed costs of handling them
          // do not shrink with the price.
          commissionPct: Number((basePct + delta).toFixed(1)),
          effectiveFrom: '2026-04-01T00:00:00.000Z',
          version: 1,
        }),
      );
    }
  }

  insert('commissionPlans', {
    id: id('CPL', 3), key: 'STANDARD', name: 'Standard',
    description: 'The default rate card every seller starts on.',
    adjustmentPct: 0, sellerCount: db.sellers.filter((s) => s.status === 'ACTIVE').length, version: 1,
  });
  insert('commissionPlans', {
    id: id('CPL', 3), key: 'NEW_SELLER', name: 'New seller — 0% for 30 days',
    description: 'Commission waived for the first 30 days to get a seller trading.',
    adjustmentPct: -100, sellerCount: 0, version: 1,
  });
  insert('commissionPlans', {
    id: id('CPL', 3), key: 'STRATEGIC', name: 'Strategic brand',
    description: 'Negotiated rate for brands we want on the platform.',
    adjustmentPct: -3, sellerCount: 0, version: 1,
  });

  insert('feeConfig', {
    id: 'fees',
    closingFeeSlabs: [
      { uptoPaise: 30000, feePaise: 500 },
      { uptoPaise: 50000, feePaise: 1500 },
      { uptoPaise: 100000, feePaise: 3000 },
      { uptoPaise: null, feePaise: 6500 },
    ],
    collectionFeePrepaidPct: 1.8,
    collectionFeeCodPct: 2.5,
    pickPackFeePaise: 2000,
    gstOnFeesPct: 18,
    tcsPct: 0.5,
    tdsPct: 0.1,
    payoutCycle: 'WEEKLY',
    payoutDay: 'TUESDAY',
    version: 1,
  });

  return rows;
}

function commissionPctFor(product, salePaise) {
  const category = db.categories.find((c) => c.id === product?.categoryId);
  const rules = db.commissionRules.filter((r) => r.rootName === category?.rootName);
  const match = rules.find((r) => salePaise >= r.minPaise && (r.maxPaise === null || salePaise <= r.maxPaise));
  return match?.commissionPct ?? 12;
}

/** One settlement line per delivered item, eligible or not. */
export function seedSettlementLines() {
  const delivered = filter('orderItems', (i) => i.status === 'DELIVERED');
  const rows = [];

  for (const item of delivered) {
    const order = db.orders.find((o) => o.id === item.orderId);
    const product = db.products.find((p) => p.id === item.productId);
    const seller = db.sellers.find((s) => s.id === item.sellerId);
    const shipment = db.shipments.find((s) => s.id === item.shipmentId);
    if (!order || !seller) continue;

    const returnOpen = db.returns.some(
      (r) => r.orderItemId === item.id && !['CLOSED', 'RETURN_REJECTED', 'RETURN_CANCELLED'].includes(r.status),
    );
    const claimOpen = db.sellerClaims.some(
      (c) => c.sellerId === seller.id && ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(c.status),
    );
    const eligibility = settlementEligibility(item, {
      returnOpen, claimOpen, sellerOnHold: seller.payoutOnHold, now: mockNow(),
    });

    const fulfilledByArise = shipment?.fulfillmentType === 'ARISE';
    const settlement = computeSettlement({
      salePaise: item.linePaise,
      commissionPct: commissionPctFor(product, item.linePaise),
      paymentMethod: order.paymentMethod,
      shippingFeePaise: fulfilledByArise ? 5500 : 4200,
      fulfilledByArise,
      storageFeePaise: fulfilledByArise ? 400 : 0,
    });

    rows.push(
      insert('settlementLines', {
        id: id('STL', 8),
        orderId: order.id,
        orderItemId: item.id,
        sellerId: seller.id,
        sellerName: seller.storeName,
        productTitle: item.name,
        sku: item.variantLabel,
        deliveredAt: item.deliveredAt,
        paymentMethod: order.paymentMethod,
        fulfillmentType: fulfilledByArise ? 'ARISE' : 'SELLER',
        ...settlement,
        eligible: eligibility.eligible,
        holdReason: eligibility.reason,
        payoutId: null,
        batchId: null,
        version: 1,
      }),
    );
  }
  return rows;
}

const BATCH_STATES = ['PAID', 'PAID', 'PARTIALLY_FAILED', 'PROCESSING', 'PENDING_APPROVAL', 'DRAFT'];

/** Weekly payout batches, most already settled, one awaiting approval. */
export function seedPayoutBatches() {
  const batches = [];

  BATCH_STATES.forEach((status, i) => {
    const weeksAgo = BATCH_STATES.length - i;
    const periodEnd = mockNow() - weeksAgo * 7 * 86400_000;
    const periodStart = periodEnd - 6 * 86400_000;

    const batch = insert('payoutBatches', {
      id: id('PYB', 5),
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      status,
      createdAt: new Date(periodEnd + 86400_000).toISOString(),
      createdByName: 'Nikhil Joshi',
      approvedByName: ['PAID', 'PARTIALLY_FAILED', 'PROCESSING'].includes(status) ? 'Meera Krishnan' : null,
      approvedAt: ['PAID', 'PARTIALLY_FAILED', 'PROCESSING'].includes(status)
        ? new Date(periodEnd + 2 * 86400_000).toISOString() : null,
      releasedAt: ['PAID', 'PARTIALLY_FAILED'].includes(status)
        ? new Date(periodEnd + 2 * 86400_000).toISOString() : null,
      sellerCount: 0,
      grossPaise: 0,
      netPaise: 0,
      version: 1,
    });

    // Attach a slice of the eligible lines to each historic batch.
    const unassigned = filter('settlementLines', (l) => l.eligible && !l.batchId);
    const bySeller = new Map();
    for (const line of unassigned.slice(0, status === 'DRAFT' ? 0 : 90)) {
      if (!bySeller.has(line.sellerId)) bySeller.set(line.sellerId, []);
      bySeller.get(line.sellerId).push(line);
    }

    let gross = 0;
    let net = 0;
    let n = 0;
    for (const [sellerId, lines] of bySeller) {
      n += 1;
      const seller = db.sellers.find((s) => s.id === sellerId);
      const totals = summariseSettlements(lines);
      // Most payouts land; a few bounce on a stale bank account, which is the
      // case the retry flow exists for.
      const failed = status === 'PARTIALLY_FAILED' && n % 9 === 0;
      const payoutStatus = status === 'PAID'
        ? 'PAID'
        : status === 'PARTIALLY_FAILED'
          ? (failed ? 'FAILED' : 'PAID')
          : status === 'PROCESSING' ? 'INCLUDED' : 'INCLUDED';

      // Adjustments finance already marked APPLIED belong to a real batch:
      // penalties, claim payouts and ad-spend recovery all land here, and a
      // large penalty can genuinely push a payout negative.
      const adjustments = status === 'DRAFT'
        ? []
        : filter('payoutAdjustments', (a) => a.sellerId === sellerId && a.status === 'APPLIED' && !a.batchId);
      const adjustmentsPaise = adjustments.reduce((n, a) => n + a.amountPaise, 0);

      const payout = insert('sellerPayouts', {
        id: id('PYO', 6),
        batchId: batch.id,
        sellerId,
        sellerName: seller?.storeName ?? '—',
        lineCount: lines.length,
        grossPaise: totals.grossPaise,
        feesPaise: totals.feesPaise,
        gstOnFeesPaise: totals.gstOnFeesPaise,
        tcsPaise: totals.tcsPaise,
        tdsPaise: totals.tdsPaise,
        adjustmentsPaise,
        netPaise: totals.netPaise + adjustmentsPaise,
        // A negative net is carried forward against the seller's next payout
        // rather than being collected, which is what the UI has to explain.
        carriedForward: totals.netPaise + adjustmentsPaise < 0,
        status: payoutStatus,
        utr: payoutStatus === 'PAID' ? `UTR${faker.string.numeric(12)}` : null,
        failureReason: failed ? 'Bank account closed — NEFT returned by the beneficiary bank' : null,
        bankLast4: faker.string.numeric(4),
        paidAt: payoutStatus === 'PAID' ? new Date(periodEnd + 3 * 86400_000).toISOString() : null,
        version: 1,
      });

      for (const line of lines) {
        line.batchId = batch.id;
        line.payoutId = payout.id;
      }
      for (const adjustment of adjustments) adjustment.batchId = batch.id;
      gross += totals.grossPaise;
      net += payout.netPaise;
    }

    batch.sellerCount = n;
    batch.grossPaise = gross;
    batch.netPaise = net;
    batches.push(batch);
  });

  return batches;
}

/** Cash the couriers collected and owe us. */
export function seedCodRemittances() {
  const rows = [];
  for (const courier of db.couriers) {
    for (let week = 1; week <= 4; week += 1) {
      const periodEnd = mockNow() - week * 7 * 86400_000;
      const codShipments = filter(
        'shipments',
        (s) => s.courierId === courier.id && s.status === 'DELIVERED',
      ).slice(0, 40);
      const expected = codShipments.reduce((n, s) => {
        const order = db.orders.find((o) => o.id === s.orderId);
        return n + (order?.paymentMethod === 'COD' ? order.grandTotalPaise : 0);
      }, 0);
      if (!expected) continue;

      // Short payment is common and is what the reconciliation screen exists
      // to catch.
      const short = week === 2 && courier.id.endsWith('2');
      const received = short ? Math.round(expected * 0.93) : expected;

      rows.push(
        insert('codRemittances', {
          id: id('COD', 5),
          courierId: courier.id,
          courierName: courier.name,
          periodStart: new Date(periodEnd - 6 * 86400_000).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
          shipmentCount: codShipments.length,
          expectedPaise: expected,
          receivedPaise: week === 1 ? 0 : received,
          differencePaise: week === 1 ? -expected : received - expected,
          utr: week === 1 ? null : `UTR${faker.string.numeric(12)}`,
          status: week === 1 ? 'EXPECTED' : short ? 'SHORT_PAID' : 'RECONCILED',
          // Couriers contractually remit within 7 days of delivery.
          dueAt: new Date(periodEnd + 7 * 86400_000).toISOString(),
          disputeNote: short ? null : null,
          version: 1,
        }),
      );
    }
  }
  return rows;
}

/** Customer tax invoices, raised in the seller's name per shipment. */
export function seedInvoices() {
  const rows = [];
  const shipments = filter('shipments', (s) => ['DELIVERED', 'IN_TRANSIT'].includes(s.status)).slice(0, 260);

  shipments.forEach((shipment, i) => {
    const order = db.orders.find((o) => o.id === shipment.orderId);
    const seller = db.sellers.find((s) => s.id === shipment.sellerId);
    const items = filter('orderItems', (it) => it.shipmentId === shipment.id);
    if (!order || !seller || !items.length) return;

    const taxable = items.reduce((n, it) => n + it.linePaise, 0);
    const product = db.products.find((p) => p.id === items[0].productId);
    const gstRate = product?.gstRate ?? 18;
    // Tax splits CGST+SGST within a state and IGST across states.
    const interState = seller.state !== order.address?.state;
    const taxPaise = Math.round((taxable * gstRate) / (100 + gstRate));

    rows.push(
      insert('invoices', {
        id: id('INV', 6),
        invoiceNo: `ARS/${new Date(order.placedAt).getFullYear()}/${String(10000 + i)}`,
        type: 'TAX_INVOICE',
        orderId: order.id,
        shipmentId: shipment.id,
        sellerId: seller.id,
        sellerName: seller.storeName,
        sellerGstin: seller.gstin,
        customerName: order.customerName,
        placeOfSupply: order.address?.state ?? '—',
        interState,
        taxablePaise: taxable - taxPaise,
        cgstPaise: interState ? 0 : Math.round(taxPaise / 2),
        sgstPaise: interState ? 0 : Math.round(taxPaise / 2),
        igstPaise: interState ? taxPaise : 0,
        totalPaise: taxable,
        gstRate,
        issuedAt: order.placedAt,
        version: 1,
      }),
    );
  });

  // Credit notes against returns that were refunded after invoicing.
  for (const ret of filter('returns', (r) => r.status === 'CLOSED').slice(0, 30)) {
    const invoice = rows.find((inv) => inv.orderId === ret.orderId);
    if (!invoice) continue;
    insert('invoices', {
      id: id('INV', 6),
      invoiceNo: `ARS/CN/${String(5000 + rows.indexOf(invoice))}`,
      type: 'CREDIT_NOTE',
      againstInvoiceNo: invoice.invoiceNo,
      orderId: ret.orderId,
      sellerId: ret.sellerId,
      sellerName: ret.sellerName,
      sellerGstin: invoice.sellerGstin,
      customerName: ret.customerName,
      placeOfSupply: invoice.placeOfSupply,
      interState: invoice.interState,
      taxablePaise: -Math.round(ret.amountPaise * 0.85),
      cgstPaise: invoice.interState ? 0 : -Math.round(ret.amountPaise * 0.075),
      sgstPaise: invoice.interState ? 0 : -Math.round(ret.amountPaise * 0.075),
      igstPaise: invoice.interState ? -Math.round(ret.amountPaise * 0.15) : 0,
      totalPaise: -ret.amountPaise,
      gstRate: invoice.gstRate,
      issuedAt: mockNowIso(),
      version: 1,
    });
  }

  return rows;
}

/** Monthly TCS and quarterly TDS summaries per seller. */
export function seedTaxSummaries() {
  const bySeller = new Map();
  for (const line of db.settlementLines) {
    if (!bySeller.has(line.sellerId)) bySeller.set(line.sellerId, []);
    bySeller.get(line.sellerId).push(line);
  }

  const rows = [];
  for (const [sellerId, lines] of bySeller) {
    const seller = db.sellers.find((s) => s.id === sellerId);
    const totals = summariseSettlements(lines);
    rows.push(
      insert('taxSummaries', {
        id: id('TAX', 5),
        sellerId,
        sellerName: seller?.storeName ?? '—',
        gstin: seller?.gstin,
        pan: seller?.pan,
        period: '2026-09',
        taxableValuePaise: totals.grossPaise,
        tcsPaise: totals.tcsPaise,
        tdsPaise: totals.tdsPaise,
        gstr8Filed: false,
        form16aIssued: false,
        version: 1,
      }),
    );
  }
  return rows;
}

/** Gateway reconciliation runs, with the mismatch buckets finance works. */
export function seedReconciliation() {
  const runs = [];
  for (let week = 1; week <= 3; week += 1) {
    const periodEnd = mockNow() - week * 7 * 86400_000;
    const captured = filter('payments', (p) => p.status === 'CAPTURED').slice(0, 300);
    const matched = Math.floor(captured.length * 0.96);
    const amountMismatch = Math.floor(captured.length * 0.01);
    const missingInGateway = Math.floor(captured.length * 0.02);
    const missingInArise = captured.length - matched - amountMismatch - missingInGateway;

    runs.push(
      insert('reconciliationRuns', {
        id: id('REC', 5),
        source: 'GATEWAY',
        gateway: week % 2 === 0 ? 'PayU' : 'Razorpay',
        periodStart: new Date(periodEnd - 6 * 86400_000).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        totalRows: captured.length,
        matched,
        amountMismatch,
        missingInGateway,
        missingInArise: Math.max(0, missingInArise),
        duplicates: week === 2 ? 2 : 0,
        status: week === 1 ? 'NEEDS_REVIEW' : 'RECONCILED',
        runAt: new Date(periodEnd + 86400_000).toISOString(),
        version: 1,
      }),
    );
  }
  return runs;
}
