import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Sale events (M10.4): the calendar tying coupons, flash sales, deals and banners together. */

function readinessChecklist(event) {
  return {
    bannersScheduled: event.bannersScheduled,
    dealsCurated: event.linkedDealIds.length > 0,
    sellerParticipationOk: event.sellerParticipationPct >= event.minSellerDiscountPct ? true : event.sellerParticipationPct >= 60,
    inventoryCoverageOk: event.inventoryCoveragePct >= 70,
  };
}

function eventRow(event) {
  const checklist = readinessChecklist(event);
  return {
    ...event,
    checklist,
    ready: Object.values(checklist).every(Boolean),
  };
}

export const saleEventHandlers = [
  mswHttp.get(`${BASE}/sale-events`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.event.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-startsAt' });
    const result = listResult(db.saleEvents.map(eventRow), query, {
      searchFields: ['name'],
      filterSpec: { status: 'status' },
      sortable: ['startsAt', 'endsAt'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/sale-events/:eventId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.event.view');
    if (g.response) return g.response;

    const event = findById('saleEvents', params.eventId);
    if (!event) return notFound('That sale event no longer exists.');
    return ok({
      ...eventRow(event),
      coupons: filter('coupons', (c) => event.linkedCouponIds.includes(c.id)),
      flashSales: filter('flashSales', (f) => event.linkedFlashSaleIds.includes(f.id)),
      deals: filter('deals', (d) => event.linkedDealIds.includes(d.id)),
    });
  }),

  mswHttp.post(`${BASE}/sale-events`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.event.create');
    if (g.response) return g.response;

    const body = await request.json();
    if (!body.name?.trim()) return validationFailed({ name: 'Give the event a name.' });
    if (!body.startsAt || !body.endsAt) return validationFailed({ startsAt: 'Set the event dates.' });

    const event = insert('saleEvents', {
      id: id('EVT', 4),
      name: body.name.trim(),
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      status: new Date(body.startsAt).getTime() > mockNow() ? 'SCHEDULED' : 'LIVE',
      earlyAccessHours: body.earlyAccessHours ?? 0,
      participatingCategoryRootNames: body.participatingCategoryRootNames ?? [],
      minSellerDiscountPct: body.minSellerDiscountPct ?? 20,
      linkedCouponIds: body.linkedCouponIds ?? [],
      linkedFlashSaleIds: body.linkedFlashSaleIds ?? [],
      linkedDealIds: body.linkedDealIds ?? [],
      sellerParticipationPct: 0,
      inventoryCoveragePct: 0,
      bannersScheduled: false,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'event.create', entityType: 'saleEvent', entityId: event.id, entityLabel: event.name });
    scheduleSave();
    return created(eventRow(event));
  }),

  mswHttp.patch(`${BASE}/sale-events/:eventId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.event.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const event = findById('saleEvents', params.eventId);
    if (!event) return notFound('That sale event no longer exists.');

    const patch = {};
    for (const key of [
      'name', 'startsAt', 'endsAt', 'earlyAccessHours', 'minSellerDiscountPct',
      'linkedCouponIds', 'linkedFlashSaleIds', 'linkedDealIds', 'bannersScheduled',
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('saleEvents', event.id, patch);
    writeAudit({ actor: g.user, action: 'event.edit', entityType: 'saleEvent', entityId: event.id, entityLabel: event.name });
    scheduleSave();
    return ok(eventRow(findById('saleEvents', event.id)));
  }),

  mswHttp.delete(`${BASE}/sale-events/:eventId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.event.delete');
    if (g.response) return g.response;

    const event = findById('saleEvents', params.eventId);
    if (!event) return notFound('That sale event no longer exists.');
    remove('saleEvents', event.id);
    writeAudit({ actor: g.user, action: 'event.delete', entityType: 'saleEvent', entityId: event.id, entityLabel: event.name });
    scheduleSave();
    return ok({ id: event.id });
  }),
];
