import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { conflict, created, notFound, ok, validationFailed } from '../engine/respond';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Reason masters (M12.7).
 *
 * One place for every reason list the app and admin use. The order and
 * active flag here are exactly what a customer sees in the app's own
 * cancel/return/ticket pickers — reordering a list in this screen reorders
 * it there too, which is why `order` is returned and editable rather than
 * left implicit in array position.
 */

export const reasonHandlers = [
  mswHttp.get(`${BASE}/reason-lists`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'cms.reasons.view');
    if (g.response) return g.response;

    const listKey = url.searchParams.get('listKey');
    const rows = listKey ? filter('reasonLists', (r) => r.listKey === listKey) : db.reasonLists;
    return ok([...rows].sort((a, b) => (a.listKey === b.listKey ? a.order - b.order : a.listKey.localeCompare(b.listKey))));
  }),

  mswHttp.post(`${BASE}/reason-lists`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.reasons.create');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.listKey) return validationFailed({ listKey: 'Choose which list this belongs to.' });
    if (!body.label?.trim()) return validationFailed({ label: 'Enter the reason text.' });
    if (body.listKey === 'RETURN' && !body.faultAttribution) {
      return validationFailed({ faultAttribution: 'A return reason needs a fault attribution — it decides who pays the reverse shipping fee.' });
    }

    const siblings = filter('reasonLists', (r) => r.listKey === body.listKey);
    const reason = insert('reasonLists', {
      id: id('RSN', 4),
      listKey: body.listKey,
      label: body.label.trim(),
      code: body.label.trim().toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, ''),
      faultAttribution: body.listKey === 'RETURN' ? body.faultAttribution : null,
      requiresNote: Boolean(body.requiresNote),
      order: siblings.length,
      active: true,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'reason.create', entityType: 'reasonList', entityId: reason.id, entityLabel: `${reason.listKey}: ${reason.label}` });
    scheduleSave();
    return created(reason);
  }),

  mswHttp.patch(`${BASE}/reason-lists/:reasonId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.reasons.edit');
    if (g.response) return g.response;
    const reason = findById('reasonLists', params.reasonId);
    if (!reason) return notFound('That reason no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['label', 'faultAttribution', 'requiresNote', 'active', 'order']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('reasonLists', reason.id, patch);
    writeAudit({ actor: g.user, action: 'reason.edit', entityType: 'reasonList', entityId: reason.id, entityLabel: `${reason.listKey}: ${reason.label}` });
    scheduleSave();
    return ok(findById('reasonLists', reason.id));
  }),

  mswHttp.delete(`${BASE}/reason-lists/:reasonId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.reasons.delete');
    if (g.response) return g.response;
    const reason = findById('reasonLists', params.reasonId);
    if (!reason) return notFound('That reason no longer exists.');
    if (reason.code === 'OTHER') {
      return conflict('Every list keeps its free-text "Other" option; it cannot be removed.', 'PROTECTED');
    }
    remove('reasonLists', reason.id);
    writeAudit({ actor: g.user, action: 'reason.delete', entityType: 'reasonList', entityId: reason.id, entityLabel: `${reason.listKey}: ${reason.label}` });
    scheduleSave();
    return ok({ id: reason.id });
  }),
];
