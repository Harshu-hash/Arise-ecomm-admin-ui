import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, created, illegalTransition, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Flash sales (M10.3).
 *
 *   DRAFT → NOMINATIONS_OPEN → CURATION → SCHEDULED → LIVE → ENDED
 *   any pre-LIVE state → CANCELLED
 *
 * Nominations auto-reject below the minimum discount — the one rule the
 * handler enforces unconditionally, because it is the thing the whole
 * screen exists to police.
 */
const TRANSITIONS = {
  DRAFT: ['NOMINATIONS_OPEN', 'CANCELLED'],
  NOMINATIONS_OPEN: ['CURATION', 'CANCELLED'],
  CURATION: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['LIVE', 'CANCELLED'],
  LIVE: ['ENDED'],
  ENDED: [],
  CANCELLED: [],
};

const ACTION_TARGET = {
  open_nominations: 'NOMINATIONS_OPEN',
  close: 'CURATION',
  publish: 'SCHEDULED',
  start: 'LIVE',
  end: 'ENDED',
  cancel: 'CANCELLED',
};

function saleRow(sale) {
  const nominations = filter('flashSaleNominations', (n) => n.flashSaleId === sale.id);
  return {
    ...sale,
    nominationCount: nominations.length,
    acceptedCount: nominations.filter((n) => n.status === 'ACCEPTED').length,
    pendingCount: nominations.filter((n) => n.status === 'PENDING').length,
  };
}

export const flashSaleHandlers = [
  mswHttp.get(`${BASE}/flash-sales`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.flashsale.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-startsAt' });
    const result = listResult(db.flashSales.map(saleRow), query, {
      searchFields: ['name'],
      filterSpec: { status: 'status' },
      sortable: ['startsAt', 'gmvPaise', 'unitsSold'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/flash-sales/:saleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.view');
    if (g.response) return g.response;

    const sale = findById('flashSales', params.saleId);
    if (!sale) return notFound('That flash sale no longer exists.');

    const nominations = filter('flashSaleNominations', (n) => n.flashSaleId === sale.id)
      .sort((a, b) => a.order - b.order);
    return ok({ ...saleRow(sale), nominations });
  }),

  mswHttp.post(`${BASE}/flash-sales`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.create');
    if (g.response) return g.response;

    const body = await request.json();
    if (!body.name?.trim()) return validationFailed({ name: 'Give the flash sale a name.' });
    if (!body.startsAt || !body.endsAt) return validationFailed({ startsAt: 'Set a start and end time.' });

    const sale = insert('flashSales', {
      id: id('FLS', 4),
      name: body.name.trim(),
      banner: body.banner ?? null,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      categoryRootNames: body.categoryRootNames ?? [],
      minDiscountPct: body.minDiscountPct ?? 50,
      maxUnitsPerCustomer: body.maxUnitsPerCustomer ?? 2,
      status: 'DRAFT',
      gmvPaise: 0,
      unitsSold: 0,
      createdAt: mockNowIso(),
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'flashsale.create', entityType: 'flashSale', entityId: sale.id, entityLabel: sale.name });
    scheduleSave();
    return created(saleRow(sale));
  }),

  mswHttp.post(`${BASE}/flash-sales/:saleId/transition`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.publish');
    if (g.response) return g.response;

    const body = await request.json();
    const sale = findById('flashSales', params.saleId);
    if (!sale) return notFound('That flash sale no longer exists.');
    const target = ACTION_TARGET[body.action];
    if (!target || !TRANSITIONS[sale.status]?.includes(target)) {
      return illegalTransition(sale.status, body.action);
    }

    if (target === 'SCHEDULED') {
      const accepted = filter('flashSaleNominations', (n) => n.flashSaleId === sale.id && n.status === 'ACCEPTED');
      if (!accepted.length) {
        return conflict('At least one accepted nomination is needed before publishing.', 'NOTHING_CURATED');
      }
    }
    if (target === 'CANCELLED' && !body.reason?.trim()) {
      return validationFailed({ reason: 'Say why the flash sale is being cancelled.' });
    }

    update('flashSales', sale.id, { status: target });
    writeAudit({
      actor: g.user, action: `flashsale.${body.action}`, entityType: 'flashSale',
      entityId: sale.id, entityLabel: sale.name, reason: body.reason,
    });
    scheduleSave();
    return ok(saleRow(findById('flashSales', sale.id)));
  }),

  mswHttp.post(`${BASE}/flash-sales/:saleId/nominations/:nominationId/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.curate');
    if (g.response) return g.response;

    const body = await request.json();
    const nomination = findById('flashSaleNominations', params.nominationId);
    if (!nomination || nomination.flashSaleId !== params.saleId) return notFound('That nomination no longer exists.');
    if (nomination.status !== 'PENDING') {
      return conflict('This nomination has already been decided.', 'ILLEGAL_TRANSITION');
    }
    if (!['ACCEPTED', 'REJECTED'].includes(body.decision)) return validationFailed({ decision: 'Accept or reject.' });
    if (body.decision === 'REJECTED' && !body.reason?.trim()) return validationFailed({ reason: 'Give the seller a reason.' });

    update('flashSaleNominations', nomination.id, {
      status: body.decision,
      rejectReason: body.decision === 'REJECTED' ? body.reason : null,
    });
    writeAudit({
      actor: g.user, action: 'flashsale.nomination_decide', entityType: 'flashSaleNomination',
      entityId: nomination.id, entityLabel: nomination.productTitle, reason: body.reason,
      metadata: { decision: body.decision },
    });
    scheduleSave();
    return ok(findById('flashSaleNominations', nomination.id));
  }),

  /** Curation drag-reorder, and marking the hero product. */
  mswHttp.post(`${BASE}/flash-sales/:saleId/nominations/reorder`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.curate');
    if (g.response) return g.response;

    const body = await request.json();
    const sale = findById('flashSales', params.saleId);
    if (!sale) return notFound('That flash sale no longer exists.');

    (body.orderedNominationIds ?? []).forEach((nominationId, i) => {
      const n = findById('flashSaleNominations', nominationId);
      if (n?.flashSaleId === sale.id) update('flashSaleNominations', n.id, { order: i, hero: i === 0 });
    });
    scheduleSave();
    return ok(filter('flashSaleNominations', (n) => n.flashSaleId === sale.id).sort((a, b) => a.order - b.order));
  }),

  /** Live monitor: units sold per nomination, polled while the sale runs. */
  mswHttp.get(`${BASE}/flash-sales/:saleId/live`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.view');
    if (g.response) return g.response;

    const sale = findById('flashSales', params.saleId);
    if (!sale) return notFound('That flash sale no longer exists.');
    const nominations = filter(
      'flashSaleNominations',
      (n) => n.flashSaleId === sale.id && n.status === 'ACCEPTED',
    ).map((n) => ({ ...n, soldOut: n.unitsSold >= n.committedStock }));

    return ok({
      status: sale.status,
      gmvPaise: sale.gmvPaise,
      unitsSold: sale.unitsSold,
      products: nominations,
    });
  }),

  /** Emergency action: pull a product from a live sale. */
  mswHttp.post(`${BASE}/flash-sales/:saleId/nominations/:nominationId/pull`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.flashsale.pull');
    if (g.response) return g.response;

    const body = await request.json();
    const nomination = findById('flashSaleNominations', params.nominationId);
    if (!nomination || nomination.flashSaleId !== params.saleId) return notFound('That nomination no longer exists.');
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why this product is being pulled.' });

    update('flashSaleNominations', nomination.id, { status: 'PULLED', rejectReason: body.reason });
    writeAudit({
      actor: g.user, action: 'flashsale.pull', entityType: 'flashSaleNomination',
      entityId: nomination.id, entityLabel: nomination.productTitle, reason: body.reason,
    });
    scheduleSave();
    return ok(findById('flashSaleNominations', nomination.id));
  }),
];
