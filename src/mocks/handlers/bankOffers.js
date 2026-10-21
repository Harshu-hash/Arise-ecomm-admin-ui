import { http as mswHttp } from 'msw';
import { db, findById, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Bank offer display (M10.8).
 *
 * The offers themselves are read-only — they come from the payment
 * gateway's own offer engine. Admin only controls whether, where and in
 * what order they are shown, which is exactly the three fields the PATCH
 * endpoint below will touch.
 */
function offerRow(o) {
  return { ...o, expired: new Date(o.validTo).getTime() < mockNow() };
}

/** All offers carry the same sync timestamp, so it is read off any one of them
 *  rather than kept in module state that a persisted snapshot would lose. */
function lastSyncedAt() {
  return db.bankOffers[0]?.syncedAt ?? null;
}

export const bankOfferHandlers = [
  mswHttp.get(`${BASE}/bank-offers`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.bankoffer.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: 'displayOrder' });
    const result = listResult(db.bankOffers.map(offerRow), query, {
      searchFields: ['bank'],
      filterSpec: { cardType: 'cardType', adminVisible: { path: 'adminVisible', kind: 'boolean' } },
      sortable: ['displayOrder', 'discountPct', 'validTo'],
      facetFields: ['cardType', 'bank'],
    });
    return okList(result.items, { ...result.meta, lastSyncedAt: lastSyncedAt() });
  }),

  mswHttp.patch(`${BASE}/bank-offers/:offerId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.bankoffer.display');
    if (g.response) return g.response;

    const body = await request.json();
    const offer = findById('bankOffers', params.offerId);
    if (!offer) return notFound('That bank offer no longer exists.');
    if (body.titleOverride !== undefined && body.titleOverride?.length > 80) {
      return validationFailed({ titleOverride: 'Keep the display copy under 80 characters.' });
    }

    const patch = {};
    for (const key of ['adminVisible', 'placements', 'displayOrder', 'titleOverride']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('bankOffers', offer.id, patch);
    writeAudit({
      actor: g.user, action: 'bankoffer.display', entityType: 'bankOffer',
      entityId: offer.id, entityLabel: offer.bank, metadata: patch,
    });
    scheduleSave();
    return ok(offerRow(findById('bankOffers', offer.id)));
  }),

  /** Re-pulls from the gateway. Mocked: refreshes validity on what already exists. */
  mswHttp.post(`${BASE}/bank-offers/sync`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.bankoffer.display');
    if (g.response) return g.response;

    const syncedAt = mockNowIso();
    for (const offer of db.bankOffers) {
      const patch = { syncedAt };
      if (new Date(offer.validTo).getTime() < mockNow()) {
        patch.validTo = new Date(mockNow() + 30 * 86400_000).toISOString();
      }
      update('bankOffers', offer.id, patch);
    }
    writeAudit({ actor: g.user, action: 'bankoffer.sync', entityType: 'bankOffer', entityId: 'all', entityLabel: 'Bank offers' });
    scheduleSave();
    return ok({ lastSyncedAt: syncedAt, count: db.bankOffers.length });
  }),
];
