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
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

const INBOUND_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPOINTMENT_BOOKED', 'CANCELLED'],
  APPOINTMENT_BOOKED: ['ARRIVED', 'MISSED', 'CANCELLED'],
  MISSED: ['APPOINTMENT_BOOKED', 'CANCELLED'],
  ARRIVED: ['RECEIVING'],
  RECEIVING: ['RECEIVED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

/** Warehouse scope: a manager only sees the sites they run. */
function warehouseAllowed(warehouseId, user) {
  const scope = user.scope?.warehouses;
  return !scope?.length || scope.includes(warehouseId);
}

function inventoryRow(row) {
  const available = row.sellable - row.reserved;
  return {
    ...row,
    available,
    // Days of cover is the number replenishment is actually planned against.
    daysOfCover: row.dailyVelocity ? Math.floor(available / row.dailyVelocity) : null,
    stockStatus: available <= 0 ? 'OUT' : available < row.lowStockThreshold ? 'LOW' : 'OK',
    ageBucket:
      row.oldestUnitDays > 365 ? 'OVER_365'
        : row.oldestUnitDays > 180 ? 'D181_365'
          : row.oldestUnitDays > 90 ? 'D91_180' : 'D0_90',
  };
}

function writeLedger({ inventory, type, qty, reference, note }) {
  return insert('inventoryLedger', {
    id: id('ILG', 8),
    inventoryId: inventory.id,
    variantId: inventory.variantId,
    warehouseId: inventory.warehouseId,
    type,
    qty,
    balanceAfter: inventory.sellable,
    reference: reference ?? null,
    note: note ?? null,
    at: mockNowIso(),
  });
}

export const warehouseHandlers = [
  /* --------------------------------------------------------- warehouses */
  mswHttp.get(`${BASE}/warehouses`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.warehouse.view');
    if (g.response) return g.response;

    const rows = db.warehouses
      .filter((w) => warehouseAllowed(w.id, g.user))
      .map((w) => {
        const inv = filter('inventory', (i) => i.warehouseId === w.id);
        return {
          ...w,
          skuCount: inv.length,
          unitCount: inv.reduce((n, i) => n + i.sellable, 0),
          lowStockSkus: inv.filter((i) => i.sellable - i.reserved < i.lowStockThreshold).length,
          inboundPending: filter(
            'inboundConsignments',
            (c) => c.warehouseId === w.id && !['CLOSED', 'CANCELLED'].includes(c.status),
          ).length,
        };
      });
    return ok(rows);
  }),

  mswHttp.post(`${BASE}/warehouses/:id/pause`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.warehouse.pause');
    if (g.response) return g.response;

    const warehouse = findById('warehouses', params.id);
    if (!warehouse) return notFound('That warehouse no longer exists.');
    const body = await request.json();
    if (!['inbound', 'outbound'].includes(body?.flow)) {
      return validationFailed({ flow: 'Pause inbound or outbound.' });
    }
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });

    const field = body.flow === 'inbound' ? 'inboundPaused' : 'outboundPaused';
    const next = !warehouse[field];
    update('warehouses', warehouse.id, { [field]: next });

    // Pausing outbound re-routes orders to other sites holding the same SKUs.
    const affected = body.flow === 'outbound' && next
      ? filter('inventory', (i) => i.warehouseId === warehouse.id && i.reserved > 0).length
      : 0;

    writeAudit({
      actor: g.user,
      action: `warehouse.warehouse.${body.flow}_${next ? 'pause' : 'resume'}`,
      entityType: 'warehouse',
      entityId: warehouse.id,
      entityLabel: warehouse.name,
      reason: body.reason,
      metadata: { affectedReservations: affected },
      severity: 'warning',
    });
    scheduleSave();
    return ok(findById('warehouses', warehouse.id), { affectedReservations: affected });
  }),

  /* ------------------------------------------------------------ inbound */
  mswHttp.get(`${BASE}/inbound`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.inbound.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const rows = db.inboundConsignments
      .filter((c) => warehouseAllowed(c.warehouseId, g.user))
      .map((c) => {
        const lines = filter('inboundLines', (l) => l.consignmentId === c.id);
        return {
          ...c,
          lineCount: lines.length,
          declaredUnits: lines.reduce((n, l) => n + l.declaredQty, 0),
          receivedUnits: lines.reduce((n, l) => n + l.receivedSellable, 0),
          discrepancyUnits: lines.reduce((n, l) => n + l.receivedMissing + l.receivedDamaged, 0),
        };
      });

    const { items, meta } = listResult(rows, query, {
      searchFields: ['id', 'sellerName', 'invoiceNo', 'warehouseCode'],
      filterSpec: {
        status: 'status',
        warehouseId: 'warehouseId',
        sellerId: 'sellerId',
        hasDiscrepancy: { path: 'hasDiscrepancy', kind: 'boolean' },
        createdAt: { path: 'createdAt', kind: 'date' },
      },
      sortable: ['createdAt', 'appointmentAt', 'declaredUnits', 'status', 'sellerName'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/inbound/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.inbound.view');
    if (g.response) return g.response;

    const row = findById('inboundConsignments', params.id);
    if (!row) return notFound('That consignment no longer exists.');
    if (!warehouseAllowed(row.warehouseId, g.user)) {
      return conflict('That warehouse is not one of yours.', 'OUT_OF_SCOPE');
    }

    const next = INBOUND_TRANSITIONS[row.status] ?? [];
    return ok(row, {
      lines: filter('inboundLines', (l) => l.consignmentId === row.id),
      allowedActions: next,
      canReceive: ['ARRIVED', 'RECEIVING'].includes(row.status),
    });
  }),

  mswHttp.post(`${BASE}/inbound/:id/transition`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.inbound.edit');
    if (g.response) return g.response;

    const row = findById('inboundConsignments', params.id);
    if (!row) return notFound('That consignment no longer exists.');
    const body = await request.json();
    const target = body?.status;

    if (!(INBOUND_TRANSITIONS[row.status] ?? []).includes(target)) {
      return illegalTransition(row.status, `move to ${target}`);
    }
    if (target === 'APPOINTMENT_BOOKED' && !body?.appointmentAt) {
      return validationFailed({ appointmentAt: 'Pick a dock slot.' });
    }
    const warehouse = findById('warehouses', row.warehouseId);
    if (target === 'APPOINTMENT_BOOKED' && warehouse?.inboundPaused) {
      return conflict(
        `${warehouse.name} is not accepting inbound at the moment.`,
        'WAREHOUSE_INBOUND_PAUSED',
      );
    }

    update('inboundConsignments', row.id, {
      status: target,
      ...(body.appointmentAt ? { appointmentAt: body.appointmentAt, appointmentSlot: body.slot ?? null } : {}),
      ...(body.vehicleNo ? { vehicleNo: body.vehicleNo } : {}),
    });
    writeAudit({
      actor: g.user, action: 'warehouse.inbound.transition', entityType: 'inboundConsignment',
      entityId: row.id, entityLabel: `${row.id} — ${row.sellerName}`,
      changes: [{ field: 'status', from: row.status, to: target }],
    });
    scheduleSave();
    return ok(findById('inboundConsignments', row.id));
  }),

  /** Posting the GRN is what turns a delivery into sellable stock. */
  mswHttp.post(`${BASE}/inbound/:id/receive`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.inbound.receive');
    if (g.response) return g.response;

    const row = findById('inboundConsignments', params.id);
    if (!row) return notFound('That consignment no longer exists.');
    if (!['ARRIVED', 'RECEIVING'].includes(row.status)) {
      return illegalTransition(row.status, 'post a GRN');
    }

    const body = await request.json();
    const lines = body?.lines ?? [];
    if (!lines.length) return validationFailed({ lines: 'Record what was received.' });

    const fieldErrors = {};
    for (const line of lines) {
      const existing = findById('inboundLines', line.id);
      if (!existing) {
        fieldErrors[line.id] = 'That line no longer exists.';
        continue;
      }
      const total = Number(line.sellable ?? 0) + Number(line.damaged ?? 0) + Number(line.missing ?? 0);
      // Receiving more than was declared means the paperwork is wrong; it has
      // to be corrected rather than silently absorbed.
      if (total > existing.declaredQty) {
        fieldErrors[line.id] = `Counted ${total} against ${existing.declaredQty} declared.`;
      }
    }
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    let discrepancy = false;
    for (const line of lines) {
      const existing = findById('inboundLines', line.id);
      const sellable = Number(line.sellable ?? 0);
      const damaged = Number(line.damaged ?? 0);
      const missing = Number(line.missing ?? 0);
      if (damaged || missing) discrepancy = true;

      update('inboundLines', existing.id, {
        receivedSellable: sellable,
        receivedDamaged: damaged,
        receivedMissing: missing,
        note: line.note ?? null,
      });

      // Move the units into stock.
      let inventory = db.inventory.find(
        (i) => i.variantId === existing.variantId && i.warehouseId === row.warehouseId,
      );
      if (!inventory) {
        const variant = findById('variants', existing.variantId);
        const product = variant ? findById('products', variant.productId) : null;
        inventory = insert('inventory', {
          id: id('INV', 7),
          variantId: existing.variantId,
          productId: product?.id ?? null,
          sku: existing.sku,
          productTitle: existing.productTitle,
          variantLabel: existing.variantLabel,
          image: product?.images?.[0] ?? null,
          sellerId: row.sellerId,
          sellerName: row.sellerName,
          warehouseId: row.warehouseId,
          warehouseCode: row.warehouseCode,
          categoryId: product?.categoryId ?? null,
          sellable: 0, reserved: 0, inboundInTransit: 0, returnsPendingQc: 0, unsellable: 0,
          dailyVelocity: 0, oldestUnitDays: 0, lowStockThreshold: 20,
          version: 1,
        });
      }

      update('inventory', inventory.id, {
        sellable: inventory.sellable + sellable,
        unsellable: inventory.unsellable + damaged,
        inboundInTransit: Math.max(0, inventory.inboundInTransit - existing.declaredQty),
      });
      writeLedger({
        inventory: findById('inventory', inventory.id),
        type: 'GRN',
        qty: sellable,
        reference: row.id,
        note: damaged || missing ? `${damaged} damaged, ${missing} missing` : null,
      });

      // Stock on hand makes the seller's offer buyable again.
      const offer = db.offers.find(
        (o) => o.variantId === existing.variantId && o.sellerId === row.sellerId,
      );
      if (offer && sellable > 0) {
        const fresh = findById('inventory', inventory.id);
        update('offers', offer.id, {
          stock: fresh.sellable - fresh.reserved,
          status: offer.status === 'OUT_OF_STOCK' ? 'LIVE' : offer.status,
        });
      }
    }

    update('inboundConsignments', row.id, {
      status: 'RECEIVED',
      hasDiscrepancy: discrepancy,
      receivedAt: mockNowIso(),
      receivedByName: g.user.name,
    });

    writeAudit({
      actor: g.user, action: 'warehouse.inbound.receive', entityType: 'inboundConsignment',
      entityId: row.id, entityLabel: `${row.id} — ${row.sellerName}`,
      metadata: { discrepancy, lines: lines.length },
      severity: discrepancy ? 'warning' : 'info',
    });
    scheduleSave();
    return ok(findById('inboundConsignments', row.id), {
      discrepancy,
      note: discrepancy ? 'A discrepancy report has been sent to the seller.' : null,
    });
  }),

  /* ---------------------------------------------------------- inventory */
  mswHttp.get(`${BASE}/inventory`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.inventory.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'daysOfCover' });
    const rows = db.inventory
      .filter((i) => warehouseAllowed(i.warehouseId, g.user))
      .map(inventoryRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['sku', 'productTitle', 'sellerName'],
      filterSpec: {
        warehouseId: 'warehouseId',
        sellerId: 'sellerId',
        categoryId: 'categoryId',
        stockStatus: 'stockStatus',
        ageBucket: 'ageBucket',
      },
      sortable: ['sku', 'sellable', 'reserved', 'available', 'daysOfCover', 'oldestUnitDays'],
      facetFields: ['stockStatus', 'ageBucket'],
    });

    return okList(items, {
      ...meta,
      totals: {
        skus: rows.length,
        units: rows.reduce((n, r) => n + r.sellable, 0),
        lowStock: rows.filter((r) => r.stockStatus === 'LOW').length,
        outOfStock: rows.filter((r) => r.stockStatus === 'OUT').length,
        agedOver180: rows.filter((r) => r.oldestUnitDays > 180).length,
      },
    });
  }),

  mswHttp.get(`${BASE}/inventory/:id/ledger`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.inventory.view');
    if (g.response) return g.response;

    const row = findById('inventory', params.id);
    if (!row) return notFound('That stock record no longer exists.');
    const entries = filter('inventoryLedger', (l) => l.inventoryId === row.id)
      .sort((a, b) => b.at.localeCompare(a.at));
    return ok(inventoryRow(row), { entries });
  }),

  /* -------------------------------------------------------- adjustments */
  mswHttp.get(`${BASE}/stock-adjustments`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.adjustment.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const rows = db.stockAdjustments.filter((a) => warehouseAllowed(a.warehouseId, g.user));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['sku', 'productTitle', 'sellerName', 'id'],
      filterSpec: {
        reasonCode: 'reasonCode',
        warehouseId: 'warehouseId',
        status: 'status',
        createdAt: { path: 'createdAt', kind: 'date' },
      },
      sortable: ['createdAt', 'qty', 'reasonCode', 'status'],
      facetFields: ['reasonCode', 'status'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/stock-adjustments`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.adjustment.create');
    if (g.response) return g.response;

    const body = await request.json();
    const inventory = findById('inventory', body?.inventoryId);
    const fieldErrors = {};
    if (!inventory) fieldErrors.inventoryId = 'Choose a stock record.';
    if (!body?.reasonCode) fieldErrors.reasonCode = 'Choose a reason.';
    if (!body?.qty || body.qty <= 0) fieldErrors.qty = 'Enter how many units.';
    if (!String(body?.evidence ?? '').trim()) fieldErrors.evidence = 'Record the evidence.';
    if (inventory && body?.fromBucket === 'sellable' && body.qty > inventory.sellable) {
      fieldErrors.qty = `Only ${inventory.sellable} sellable units are on hand.`;
    }
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const qty = Number(body.qty);
    const apply = () => {
      const fresh = findById('inventory', inventory.id);
      const patch = {};
      if (body.fromBucket) patch[body.fromBucket] = Math.max(0, fresh[body.fromBucket] - qty);
      if (body.toBucket) patch[body.toBucket] = (fresh[body.toBucket] ?? 0) + qty;
      update('inventory', inventory.id, patch);

      writeLedger({
        inventory: findById('inventory', inventory.id),
        type: 'ADJUSTMENT',
        qty: body.toBucket === 'sellable' ? qty : -qty,
        note: body.reasonCode,
      });

      const row = insert('stockAdjustments', {
        id: id('ADJ', 6),
        inventoryId: inventory.id,
        variantId: inventory.variantId,
        sku: inventory.sku,
        productTitle: inventory.productTitle,
        sellerId: inventory.sellerId,
        sellerName: inventory.sellerName,
        warehouseId: inventory.warehouseId,
        warehouseCode: inventory.warehouseCode,
        fromBucket: body.fromBucket ?? null,
        toBucket: body.toBucket ?? null,
        qty,
        reasonCode: body.reasonCode,
        reasonLabel: body.reasonLabel ?? body.reasonCode,
        evidence: body.evidence,
        status: 'APPLIED',
        // Stock lost in our care is the seller's money, so a claim follows.
        claimRaised: ['DAMAGED_IN_WAREHOUSE', 'CYCLE_COUNT'].includes(body.reasonCode),
        createdByName: g.user.name,
        createdAt: mockNowIso(),
        version: 1,
      });

      if (row.claimRaised) {
        insert('sellerClaims', {
          id: id('CLM', 6),
          sellerId: inventory.sellerId,
          sellerName: inventory.sellerName,
          type: 'LOST_IN_WAREHOUSE',
          typeLabel: 'Lost or damaged in an Arise warehouse',
          orderId: null,
          amountClaimedPaise: 0,
          amountApprovedPaise: null,
          status: 'SUBMITTED',
          submittedAt: mockNowIso(),
          evidence: [body.evidence],
          decisionReason: null,
          version: 1,
        });
      }

      writeAudit({
        actor: g.user, action: 'warehouse.adjustment.create', entityType: 'stockAdjustment',
        entityId: row.id, entityLabel: `${inventory.sku} — ${row.reasonLabel}`,
        reason: body.evidence, metadata: { qty }, severity: 'warning',
      });
      return row;
    };

    // Large write-offs move real money, so they are four-eyed.
    if (requiresApproval('seller.suspend', { actor: g.user }) && qty > 25) {
      const approval = createApproval({
        actionKey: 'seller.suspend',
        actor: g.user,
        entityType: 'inventory',
        entityId: inventory.id,
        entityLabel: `${inventory.sku} at ${inventory.warehouseCode}`,
        reason: body.evidence,
        summary: `Write off ${qty} units of ${inventory.sku} (${body.reasonCode})`,
        execute: apply,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    const row = apply();
    scheduleSave();
    return created(row);
  }),

  /* ------------------------------------------------------------ removals */
  mswHttp.get(`${BASE}/removal-orders`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.removal.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-requestedAt' });
    const rows = db.removalOrders.filter((r) => warehouseAllowed(r.warehouseId, g.user));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['sku', 'productTitle', 'sellerName', 'id'],
      filterSpec: { status: 'status', type: 'type', warehouseId: 'warehouseId', sellerId: 'sellerId' },
      sortable: ['requestedAt', 'qty', 'feePaise', 'status'],
      facetFields: ['status', 'type'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/removal-orders/:id/approve`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'warehouse.removal.approve');
    if (g.response) return g.response;

    const row = findById('removalOrders', params.id);
    if (!row) return notFound('That removal order no longer exists.');
    if (row.status !== 'REQUESTED') return illegalTransition(row.status, 'approve');

    update('removalOrders', row.id, { status: 'APPROVED', approvedByName: g.user.name });
    writeAudit({
      actor: g.user, action: 'warehouse.removal.approve', entityType: 'removalOrder',
      entityId: row.id, entityLabel: `${row.sku} × ${row.qty}`,
    });
    scheduleSave();
    return ok(findById('removalOrders', row.id));
  }),
];
