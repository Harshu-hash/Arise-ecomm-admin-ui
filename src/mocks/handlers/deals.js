import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Deals (M10.2): the app's Offers / Top Value Deals rails. */

export const dealHandlers = [
  mswHttp.get(`${BASE}/deals`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.deal.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-startsAt' });
    const result = listResult(db.deals, query, {
      searchFields: ['title', 'label'],
      filterSpec: { placement: 'placement', tag: 'tag', status: 'status' },
      sortable: ['startsAt', 'dealPricePaise', 'slotDate'],
      facetFields: ['placement', 'tag', 'status'],
    });
    return okList(result.items, result.meta);
  }),

  /** Deal of the Day calendar: one slot per placement per day. */
  mswHttp.get(`${BASE}/deals/calendar`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.deal.view');
    if (g.response) return g.response;

    const slotted = filter('deals', (d) => d.slotDate).sort((a, b) => a.slotDate.localeCompare(b.slotDate));
    return ok(slotted);
  }),

  mswHttp.post(`${BASE}/deals`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.deal.create');
    if (g.response) return g.response;

    const body = await request.json();
    const product = findById('products', body.productId);
    if (!product) return validationFailed({ productId: 'Choose a product.' });
    // A product can carry several sellers' offers; the buy-box winner (or
    // else the cheapest live one) is the price customers would actually see.
    const offer = db.offers.find((o) => o.productId === product.id && o.status === 'LIVE' && o.buyBoxWinner)
      ?? db.offers.find((o) => o.productId === product.id && o.status === 'LIVE');
    if (!offer) return validationFailed({ productId: 'This product has no live offer to build a deal on.' });
    if (!body.title?.trim()) return validationFailed({ title: 'Give the deal a title.' });
    if (body.slotDate && filter('deals', (d) => d.slotDate === body.slotDate && d.placement === body.placement).length) {
      return conflict('That day already has a deal in this slot. Reschedule the existing one first.', 'SLOT_TAKEN');
    }

    const deal = insert('deals', {
      id: id('DEA', 5),
      title: body.title.trim(),
      label: body.label ?? '',
      tag: body.tag ?? 'TRENDING',
      image: body.image ?? null,
      productId: offer.productId,
      offerId: offer.id,
      sellerId: offer.sellerId,
      dealPricePaise: body.dealPricePaise,
      mrpPaise: offer.mrpPaise,
      placement: body.placement ?? 'OFFERS_PAGE',
      slotDate: body.slotDate ?? null,
      startsAt: body.startsAt ?? mockNowIso(),
      endsAt: body.endsAt,
      status: 'ACTIVE',
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'deal.create', entityType: 'deal', entityId: deal.id, entityLabel: deal.title });
    scheduleSave();
    return created(deal);
  }),

  /** Drag-to-reschedule on the calendar: swap two deals' slot dates. */
  mswHttp.post(`${BASE}/deals/:dealId/reschedule`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.deal.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const deal = findById('deals', params.dealId);
    if (!deal) return notFound('That deal no longer exists.');
    const clash = filter('deals', (d) => d.id !== deal.id && d.slotDate === body.slotDate && d.placement === deal.placement)[0];
    if (clash) update('deals', clash.id, { slotDate: deal.slotDate });
    update('deals', deal.id, { slotDate: body.slotDate });

    writeAudit({ actor: g.user, action: 'deal.reschedule', entityType: 'deal', entityId: deal.id, entityLabel: deal.title });
    scheduleSave();
    return ok({ moved: findById('deals', deal.id), swappedWith: clash ? findById('deals', clash.id) : null });
  }),

  mswHttp.delete(`${BASE}/deals/:dealId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.deal.delete');
    if (g.response) return g.response;

    const deal = findById('deals', params.dealId);
    if (!deal) return notFound('That deal no longer exists.');
    remove('deals', deal.id);
    writeAudit({ actor: g.user, action: 'deal.delete', entityType: 'deal', entityId: deal.id, entityLabel: deal.title });
    scheduleSave();
    return ok({ id: deal.id });
  }),
];
