import { http as mswHttp } from 'msw';
import { REVEAL_PERMISSION } from '@core/utils/mask';
import { writePiiReveal } from '../engine/audit';
import { guard } from '../engine/guard';
import { badRequest, ok } from '../engine/respond';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Reveals are recorded server-side. The endpoint exists so that looking at
 * someone's phone number always leaves a trail, even though the value itself
 * was already on the client.
 */
export const piiHandlers = [
  mswHttp.post(`${BASE}/pii/reveal`, async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const permission = REVEAL_PERMISSION[body?.kind];
    if (!permission) return badRequest(`Unknown personal-data kind "${body?.kind}".`);

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    writePiiReveal({
      actor: g.user,
      kind: body.kind,
      entityType: body.entityType,
      entityId: body.entityId,
      entityLabel: body.entityLabel,
    });
    scheduleSave();
    return ok({ ok: true });
  }),
];
