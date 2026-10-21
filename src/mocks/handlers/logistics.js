import { http as mswHttp } from 'msw';
import { db, filter, findById, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { recordEvent, refreshOrder } from '../engine/orderState';
import {
  approvalRequired,
  conflict,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Shipment statuses a courier can still act on. */
const IN_FLIGHT = ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'UNDELIVERED'];

function shipmentRow(s) {
  const order = findById('orders', s.orderId);
  const items = filter('orderItems', (i) => i.shipmentId === s.id);
  const variant = items[0] ? findById('variants', items[0].variantId) : null;
  const declaredWeight = items.reduce((n, i) => {
    const v = findById('variants', i.variantId);
    return n + (v?.weightG ?? 0) * i.qty;
  }, 0);

  return {
    ...s,
    customerName: order?.customerName,
    destinationCity: order?.address?.city,
    destinationPincode: order?.address?.pincode,
    paymentMethod: order?.paymentMethod,
    codAmountPaise: order?.paymentMethod === 'COD' ? order.grandTotalPaise : 0,
    itemCount: items.length,
    firstItemName: items[0]?.name ?? null,
    declaredWeightG: declaredWeight || (variant?.weightG ?? 0),
    // No scan for five days is the usual definition of "stuck".
    daysSinceScan: s.lastScanAt
      ? Math.floor((mockNow() - new Date(s.lastScanAt).getTime()) / 86400_000)
      : null,
    promisedBreached: s.promisedDate ? new Date(s.promisedDate).getTime() < mockNow()
      && !['DELIVERED', 'RTO_DELIVERED'].includes(s.status) : false,
  };
}

export const logisticsHandlers = [
  /* ------------------------------------------------------------ couriers */
  mswHttp.get(`${BASE}/couriers`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.courier.view');
    if (g.response) return g.response;

    const rows = db.couriers.map((c) => {
      const theirs = filter('shipments', (s) => s.courierId === c.id);
      return {
        ...c,
        activeShipments: theirs.filter((s) => IN_FLIGHT.includes(s.status)).length,
        rateCard: db.rateCards.find((r) => r.courierId === c.id) ?? null,
      };
    });
    return ok(rows);
  }),

  mswHttp.post(`${BASE}/couriers/:id/pause`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'logistics.courier.pause');
    if (g.response) return g.response;

    const courier = findById('couriers', params.id);
    if (!courier) return notFound('That courier no longer exists.');
    const body = await request.json().catch(() => ({}));
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });

    const next = courier.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    update('couriers', courier.id, { status: next, pauseReason: next === 'PAUSED' ? body.reason : null });

    // Pausing stops new allocations; parcels already with them keep moving.
    const inFlight = filter('shipments', (s) => s.courierId === courier.id && IN_FLIGHT.includes(s.status)).length;
    writeAudit({
      actor: g.user,
      action: `logistics.courier.${next === 'PAUSED' ? 'pause' : 'resume'}`,
      entityType: 'courier',
      entityId: courier.id,
      entityLabel: courier.name,
      reason: body.reason,
      metadata: { inFlightUnaffected: inFlight },
      severity: 'warning',
    });
    scheduleSave();
    return ok(findById('couriers', courier.id), { inFlightUnaffected: inFlight });
  }),

  /* ----------------------------------------------------------- pincodes */
  mswHttp.get(`${BASE}/pincodes`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.pincode.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'pincode', defaultPageSize: 50 });
    const rows = db.pincodes.map((p) => ({
      ...p,
      courierCount: p.serviceableCourierIds.length,
    }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['pincode', 'city', 'state'],
      filterSpec: {
        zone: 'zone',
        state: 'state',
        codAvailable: { path: 'codAvailable', kind: 'boolean' },
        oda: { path: 'oda', kind: 'boolean' },
        override: 'override',
        rtoPct: { path: 'rtoPct' },
      },
      sortable: ['pincode', 'city', 'rtoPct', 'tatDays', 'courierCount'],
      facetFields: ['zone'],
    });
    return okList(items, meta);
  }),

  /** The same check the app runs to show a delivery date on a product page. */
  mswHttp.get(`${BASE}/pincodes/check`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.pincode.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const destination = url.searchParams.get('pincode');
    const weightG = Number(url.searchParams.get('weightG') ?? 500);
    const paymentMode = url.searchParams.get('paymentMode') ?? 'PREPAID';

    const row = db.pincodes.find((p) => p.pincode === destination);
    if (!row) {
      return ok({ serviceable: false, reason: 'We do not deliver to this pincode.', options: [] });
    }
    if (paymentMode === 'COD' && !row.codAvailable) {
      return ok({
        serviceable: true,
        codAvailable: false,
        reason: row.overrideReason ?? 'Cash on delivery is not available here.',
        options: [],
      });
    }

    const options = row.serviceableCourierIds
      .map((cid) => {
        const courier = findById('couriers', cid);
        const card = db.rateCards.find((r) => r.courierId === cid);
        if (!courier || courier.status !== 'ACTIVE' || !card) return null;
        const slab = card.slabs.find((s) => weightG <= s.uptoGrams) ?? card.slabs.at(-1);
        const extra = Math.max(0, Math.ceil((weightG - slab.uptoGrams) / 500)) * card.additionalPer500gPaise;
        const cod = paymentMode === 'COD' ? card.codChargePaise : 0;
        return {
          courierId: cid,
          courierName: courier.name,
          pricePaise: slab.pricePaise[row.zone] + extra + cod,
          tatDays: row.tatDays + (row.oda ? 2 : 0),
          onTimePct: courier.onTimePct,
        };
      })
      .filter(Boolean)
      // Cheapest first, which is how the allocation rules break a tie.
      .sort((a, b) => a.pricePaise - b.pricePaise);

    return ok({
      serviceable: options.length > 0,
      codAvailable: row.codAvailable,
      zone: row.zone,
      oda: row.oda,
      rtoPct: row.rtoPct,
      options,
    });
  }),

  mswHttp.post(`${BASE}/pincodes/:id/override`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'logistics.pincode.override');
    if (g.response) return g.response;

    const row = findById('pincodes', params.id);
    if (!row) return notFound('That pincode no longer exists.');
    const body = await request.json();
    if (!['BLOCKED', 'COD_DISABLED', null].includes(body?.override ?? null)) {
      return validationFailed({ override: 'Choose block, disable COD, or clear.' });
    }
    if (body?.override && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Give a reason.' });
    }

    update('pincodes', row.id, {
      override: body.override ?? null,
      overrideReason: body.override ? body.reason : null,
      codAvailable: body.override === 'COD_DISABLED' ? false : body.override === null ? true : row.codAvailable,
    });
    writeAudit({
      actor: g.user,
      action: 'logistics.pincode.override',
      entityType: 'pincode',
      entityId: row.id,
      entityLabel: `${row.pincode} ${row.city}`,
      reason: body.reason ?? null,
      severity: 'warning',
    });
    scheduleSave();
    return ok(findById('pincodes', row.id));
  }),

  /* ---------------------------------------------------------- shipments */
  mswHttp.get(`${BASE}/shipments`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.shipment.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-promisedDate' });
    const rows = db.shipments.map(shipmentRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['id', 'awb', 'orderId', 'customerName', 'sellerName'],
      filterSpec: {
        status: 'status',
        courierId: 'courierId',
        sellerId: 'sellerId',
        fulfillmentType: 'fulfillmentType',
        destinationPincode: 'destinationPincode',
        paymentMethod: 'paymentMethod',
        promisedBreached: { path: 'promisedBreached', kind: 'boolean' },
        stuck: (row, v) => (String(v) === 'true' ? (row.daysSinceScan ?? 0) >= 5 && IN_FLIGHT.includes(row.status) : true),
      },
      sortable: ['promisedDate', 'lastScanAt', 'status', 'courierName', 'daysSinceScan'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/shipments/:id/:action`, async ({ request, params }) => {
    const map = {
      reallocate: 'logistics.shipment.reallocate',
      cancel: 'logistics.shipment.cancel',
      'mark-lost': 'logistics.shipment.mark_lost',
    };
    const permission = map[params.action];
    if (!permission) return notFound('Unknown action.');

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    const shipment = findById('shipments', params.id);
    if (!shipment) return notFound('That shipment no longer exists.');
    const body = await request.json().catch(() => ({}));

    if (params.action === 'reallocate') {
      // Once a courier has the parcel, reallocating it is meaningless.
      if (shipment.status !== 'MANIFESTED' && shipment.lastScanAt) {
        return conflict('This parcel is already with the courier.', 'ALREADY_PICKED_UP');
      }
      const courier = findById('couriers', body?.courierId);
      if (!courier) return validationFailed({ courierId: 'Choose a courier.' });
      update('shipments', shipment.id, { courierId: courier.id, courierName: courier.name });
      writeAudit({
        actor: g.user, action: 'logistics.shipment.reallocate', entityType: 'shipment',
        entityId: shipment.id, entityLabel: shipment.awb ?? shipment.id,
        changes: [{ field: 'courier', from: shipment.courierName, to: courier.name }],
      });
      scheduleSave();
      return ok(shipmentRow(findById('shipments', shipment.id)));
    }

    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });

    if (params.action === 'mark-lost') {
      update('shipments', shipment.id, { status: 'LOST_IN_TRANSIT' });
      for (const item of filter('orderItems', (i) => i.shipmentId === shipment.id)) {
        update('orderItems', item.id, { status: 'LOST_IN_TRANSIT' });
        recordEvent({
          orderId: shipment.orderId, itemId: item.id, status: 'LOST_IN_TRANSIT',
          actorName: g.user.name, note: body.reason,
        });
      }
      refreshOrder(shipment.orderId);
      writeAudit({
        actor: g.user, action: 'logistics.shipment.mark_lost', entityType: 'shipment',
        entityId: shipment.id, entityLabel: shipment.awb ?? shipment.id,
        reason: body.reason, severity: 'warning',
      });
      scheduleSave();
      return ok(shipmentRow(findById('shipments', shipment.id)), {
        note: 'A courier claim and a seller reimbursement claim should now be raised.',
      });
    }

    // cancel
    if (shipment.lastScanAt) return conflict('This parcel has already been picked up.', 'ALREADY_PICKED_UP');
    update('shipments', shipment.id, { status: 'CANCELLED', awb: null });
    writeAudit({
      actor: g.user, action: 'logistics.shipment.cancel', entityType: 'shipment',
      entityId: shipment.id, entityLabel: shipment.id, reason: body.reason,
    });
    scheduleSave();
    return ok(shipmentRow(findById('shipments', shipment.id)));
  }),

  /* --------------------------------------------------- pickups/manifests */
  mswHttp.get(`${BASE}/manifests`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.pickup.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-date' });
    const { items, meta } = listResult(db.manifests, query, {
      searchFields: ['id', 'originName', 'courierName'],
      filterSpec: { status: 'status', courierId: 'courierId', date: { path: 'date', kind: 'date' } },
      sortable: ['date', 'shipmentCount', 'status', 'originName'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/manifests/:id/reschedule`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'logistics.pickup.reschedule');
    if (g.response) return g.response;

    const row = findById('manifests', params.id);
    if (!row) return notFound('That manifest no longer exists.');
    if (row.status === 'PICKED_UP') return conflict('This pickup already happened.', 'ALREADY_PICKED_UP');

    const body = await request.json();
    if (!body?.date) return validationFailed({ date: 'Pick a new date.' });

    update('manifests', row.id, {
      date: body.date,
      slot: body.slot ?? row.slot,
      status: 'SCHEDULED',
      attempts: row.attempts + 1,
    });
    writeAudit({
      actor: g.user, action: 'logistics.pickup.reschedule', entityType: 'manifest',
      entityId: row.id, entityLabel: `${row.originName} — ${row.courierName}`,
      metadata: { attempt: row.attempts + 1 },
    });
    scheduleSave();
    return ok(findById('manifests', row.id));
  }),

  /* --------------------------------------------------------------- NDR */
  mswHttp.get(`${BASE}/ndr`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.ndr.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'actionDueAt' });
    const rows = db.ndrRecords.map((r) => ({
      ...r,
      overdue: new Date(r.actionDueAt).getTime() < mockNow() && r.status === 'OPEN',
      ageHours: Math.floor((mockNow() - new Date(r.openedAt).getTime()) / 3600_000),
    }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['awb', 'orderId', 'customerName', 'pincode'],
      filterSpec: {
        status: 'status',
        reason: 'reason',
        courierId: 'courierId',
        attempt: 'attempt',
        overdue: { path: 'overdue', kind: 'boolean' },
      },
      sortable: ['actionDueAt', 'openedAt', 'attempt', 'codAmountPaise', 'ageHours'],
      facetFields: ['status', 'reason'],
    });

    const byReason = db.ndrRecords.reduce(
      (acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {},
    );
    return okList(items, { ...meta, byReason });
  }),

  /** Reattempt or give up and send it back. Bulk because volume is the point. */
  mswHttp.post(`${BASE}/ndr/action`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.ndr.action');
    if (g.response) return g.response;

    const body = await request.json();
    const ids = body?.ids ?? [];
    if (!ids.length) return validationFailed({ ids: 'Pick at least one NDR.' });
    if (!['REATTEMPT', 'RTO'].includes(body?.action)) {
      return validationFailed({ action: 'Choose reattempt or return to origin.' });
    }
    if (body.action === 'RTO' && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Say why it is going back.' });
    }

    const results = [];
    for (const ndrId of ids) {
      const row = findById('ndrRecords', ndrId);
      if (!row) {
        results.push({ id: ndrId, ok: false, error: 'No longer exists' });
        continue;
      }
      if (row.status !== 'OPEN') {
        results.push({ id: ndrId, ok: false, error: 'Already actioned' });
        continue;
      }

      const shipment = findById('shipments', row.shipmentId);
      if (body.action === 'REATTEMPT') {
        // Three failed attempts is where couriers stop trying.
        if (row.attempt >= 3) {
          results.push({ id: ndrId, ok: false, error: 'Three attempts already made — send it back instead' });
          continue;
        }
        update('ndrRecords', row.id, {
          status: 'REATTEMPT_SCHEDULED',
          resolution: 'REATTEMPT',
          reattemptDate: body.reattemptDate ?? null,
        });
        if (shipment) {
          update('shipments', shipment.id, { status: 'OUT_FOR_DELIVERY', attempts: row.attempt + 1 });
          for (const item of filter('orderItems', (i) => i.shipmentId === shipment.id)) {
            update('orderItems', item.id, { status: 'OUT_FOR_DELIVERY' });
          }
          refreshOrder(shipment.orderId);
        }
      } else {
        update('ndrRecords', row.id, { status: 'RTO', resolution: 'RTO', rtoReason: body.reason });
        if (shipment) {
          update('shipments', shipment.id, { status: 'RTO_INITIATED' });
          for (const item of filter('orderItems', (i) => i.shipmentId === shipment.id)) {
            update('orderItems', item.id, { status: 'RTO_INITIATED' });
            recordEvent({
              orderId: shipment.orderId, itemId: item.id, status: 'RTO_INITIATED',
              actorName: g.user.name, note: body.reason,
            });
          }
          refreshOrder(shipment.orderId);
        }
      }
      results.push({ id: ndrId, ok: true });
    }

    writeAudit({
      actor: g.user, action: `logistics.ndr.${body.action.toLowerCase()}`, entityType: 'ndr',
      entityId: ids.join(','), entityLabel: `${ids.length} NDR(s)`,
      reason: body.reason ?? null,
      metadata: { succeeded: results.filter((r) => r.ok).length },
    });
    scheduleSave();
    return ok({ results, succeeded: results.filter((r) => r.ok).length });
  }),

  /* --------------------------------------------------------------- RTO */
  mswHttp.get(`${BASE}/rto`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.rto.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-promisedDate' });
    const rows = filter('shipments', (s) => s.status.startsWith('RTO')).map(shipmentRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['awb', 'orderId', 'customerName', 'sellerName'],
      filterSpec: { status: 'status', courierId: 'courierId', sellerId: 'sellerId' },
      sortable: ['promisedDate', 'lastScanAt', 'status'],
      facetFields: ['status'],
    });

    // Where RTO actually comes from, which is what the fix targets.
    const byPincode = {};
    for (const row of rows) {
      if (!row.destinationPincode) continue;
      byPincode[row.destinationPincode] = (byPincode[row.destinationPincode] ?? 0) + 1;
    }
    const topPincodes = Object.entries(byPincode)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([pincode, count]) => {
        const p = db.pincodes.find((x) => x.pincode === pincode);
        return { pincode, count, city: p?.city, rtoPct: p?.rtoPct, codAvailable: p?.codAvailable };
      });

    return okList(items, { ...meta, topPincodes });
  }),

  /* ---------------------------------------------------- weight disputes */
  mswHttp.get(`${BASE}/weight-disputes`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.weight.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-raisedAt' });
    const { items, meta } = listResult(db.weightDisputes, query, {
      searchFields: ['awb', 'orderId', 'sellerName', 'courierName', 'sku'],
      filterSpec: { status: 'status', courierId: 'courierId', sellerId: 'sellerId' },
      sortable: ['raisedAt', 'differenceG', 'extraChargePaise', 'status'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/weight-disputes/:id/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'logistics.weight.decide');
    if (g.response) return g.response;

    const row = findById('weightDisputes', params.id);
    if (!row) return notFound('That dispute no longer exists.');
    if (['ACCEPTED', 'REJECTED', 'AUTO_ACCEPTED'].includes(row.status)) {
      return conflict('This dispute has already been decided.', 'ALREADY_DECIDED');
    }

    const body = await request.json();
    if (!['ACCEPTED', 'REJECTED'].includes(body?.decision)) {
      return validationFailed({ decision: 'Accept the courier’s weight, or reject it.' });
    }
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Record why.' });

    update('weightDisputes', row.id, {
      status: body.decision,
      decisionReason: body.reason,
      decidedAt: mockNowIso(),
      decidedByName: g.user.name,
    });

    // Accepting means the SKU's recorded weight was wrong; fixing the master
    // stops the same dispute recurring on every future shipment.
    if (body.decision === 'ACCEPTED' && body.updateSkuWeight) {
      const variant = db.variants.find((v) => v.sku === row.sku);
      if (variant) update('variants', variant.id, { weightG: row.chargedWeightG });
    }

    writeAudit({
      actor: g.user, action: 'logistics.weight.decide', entityType: 'weightDispute',
      entityId: row.id, entityLabel: `${row.awb} — ${row.sellerName}`,
      reason: body.reason,
      metadata: { decision: body.decision, extraChargePaise: row.extraChargePaise },
    });
    scheduleSave();
    return ok(findById('weightDisputes', row.id));
  }),

  /* ------------------------------------------------------------- rules */
  mswHttp.get(`${BASE}/shipping-rules`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.rules.view');
    if (g.response) return g.response;
    return ok({
      allocation: db.allocationRules.sort((a, b) => a.priority - b.priority),
      customerFees: db.shippingFeeRules,
      rateCards: db.rateCards,
    });
  }),

  /** Which rule would win, and therefore which courier gets the parcel. */
  mswHttp.post(`${BASE}/shipping-rules/simulate`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'logistics.rules.view');
    if (g.response) return g.response;

    const body = await request.json();
    const pincode = db.pincodes.find((p) => p.pincode === body?.pincode);
    if (!pincode) return validationFailed({ pincode: 'We have no record of that pincode.' });

    const weightG = Number(body?.weightG ?? 500);
    const paymentMode = body?.paymentMode ?? 'PREPAID';

    const matched = db.allocationRules
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .find((r) => {
        const c = r.conditions ?? {};
        if (c.zone && c.zone !== pincode.zone) return false;
        if (c.paymentMode && c.paymentMode !== paymentMode) return false;
        if (c.maxWeightG && weightG > c.maxWeightG) return false;
        if (c.minWeightG && weightG < c.minWeightG) return false;
        return true;
      });

    return ok({
      zone: pincode.zone,
      matchedRule: matched ?? null,
      courierSplit: matched?.courierSplit ?? [],
      tatDays: pincode.tatDays + (pincode.oda ? 2 : 0),
      codAvailable: pincode.codAvailable,
    });
  }),

  mswHttp.patch(`${BASE}/shipping-rules/fees/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'logistics.rules.edit');
    if (g.response) return g.response;

    const row = findById('shippingFeeRules', params.id);
    if (!row) return notFound('That rule no longer exists.');
    const body = await request.json();

    // Customer-facing fees change what everyone pays, so they are four-eyed.
    const approval = createApproval({
      actionKey: 'commission.edit',
      actor: g.user,
      entityType: 'shippingFeeRule',
      entityId: row.id,
      entityLabel: row.name,
      reason: body.reason ?? null,
      summary: `Change "${row.name}" — free above ₹${(body.freeAbovePaise ?? row.freeAbovePaise) / 100}, otherwise ₹${(body.feePaise ?? row.feePaise) / 100}`,
      diff: [
        { field: 'freeAbovePaise', from: row.freeAbovePaise, to: body.freeAbovePaise ?? row.freeAbovePaise },
        { field: 'feePaise', from: row.feePaise, to: body.feePaise ?? row.feePaise },
      ],
      execute: () => {
        update('shippingFeeRules', row.id, {
          freeAbovePaise: body.freeAbovePaise ?? row.freeAbovePaise,
          feePaise: body.feePaise ?? row.feePaise,
        });
        writeAudit({
          actor: g.user, action: 'logistics.rules.edit', entityType: 'shippingFeeRule',
          entityId: row.id, entityLabel: row.name, reason: body.reason ?? null,
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),
];
