import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { matchSegment } from '../engine/segments';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Customer segments (M10.7): the RuleBuilder's rule tree, and a live count. */

function segmentRow(s) {
  return { ...s, memberCount: matchSegment(s.rule).length };
}

export const segmentHandlers = [
  mswHttp.get(`${BASE}/segments`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.segment.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(db.segments.map(segmentRow), query, {
      searchFields: ['name', 'description'],
      filterSpec: { kind: 'kind' },
      sortable: ['createdAt', 'name', 'memberCount'],
      facetFields: ['kind'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/segments/:segmentId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.segment.view');
    if (g.response) return g.response;

    const segment = findById('segments', params.segmentId);
    if (!segment) return notFound('That segment no longer exists.');
    return ok(segmentRow(segment));
  }),

  /** Live count while building a rule, before it is saved. */
  mswHttp.post(`${BASE}/segments/preview`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.segment.view');
    if (g.response) return g.response;

    const body = await request.json();
    return ok({ memberCount: matchSegment(body.rule ?? null).length });
  }),

  mswHttp.post(`${BASE}/segments`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.segment.create');
    if (g.response) return g.response;

    const body = await request.json();
    if (!body.name?.trim()) return validationFailed({ name: 'Give the segment a name.' });
    if (!body.rule) return validationFailed({ rule: 'Add at least one condition.' });

    const segment = insert('segments', {
      id: id('SEG', 4),
      name: body.name.trim(),
      description: body.description ?? '',
      kind: body.kind ?? 'DYNAMIC',
      rule: body.rule,
      memberCount: matchSegment(body.rule).length,
      // A static segment freezes membership at creation; a dynamic one is
      // re-evaluated every time it is used.
      snapshotCustomerIds: body.kind === 'STATIC' ? matchSegment(body.rule).map((c) => c.id) : null,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      usedByCoupons: 0,
      usedByCampaigns: 0,
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'segment.create', entityType: 'segment',
      entityId: segment.id, entityLabel: segment.name,
    });
    scheduleSave();
    return created(segmentRow(segment));
  }),

  mswHttp.patch(`${BASE}/segments/:segmentId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.segment.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const segment = findById('segments', params.segmentId);
    if (!segment) return notFound('That segment no longer exists.');

    const patch = {};
    for (const key of ['name', 'description', 'rule']) if (body[key] !== undefined) patch[key] = body[key];
    update('segments', segment.id, patch);
    writeAudit({
      actor: g.user, action: 'segment.edit', entityType: 'segment',
      entityId: segment.id, entityLabel: segment.name,
    });
    scheduleSave();
    return ok(segmentRow(findById('segments', segment.id)));
  }),

  mswHttp.delete(`${BASE}/segments/:segmentId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.segment.delete');
    if (g.response) return g.response;

    const segment = findById('segments', params.segmentId);
    if (!segment) return notFound('That segment no longer exists.');
    const inUse = filter('coupons', (c) => c.audience?.segmentId === segment.id).length
      + filter('campaigns', (c) => c.audience?.segmentId === segment.id).length;
    if (inUse) {
      return conflict(
        `This segment is used by ${inUse} coupon(s) or campaign(s) and cannot be deleted.`,
        'IN_USE',
      );
    }

    remove('segments', segment.id);
    writeAudit({
      actor: g.user, action: 'segment.delete', entityType: 'segment',
      entityId: segment.id, entityLabel: segment.name,
    });
    scheduleSave();
    return ok({ id: segment.id });
  }),
];
