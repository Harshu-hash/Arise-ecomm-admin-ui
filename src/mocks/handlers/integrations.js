import { http as mswHttp } from 'msw';
import { db, filter, findById, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { approvalRequired, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Integrations (M17.7): connection health per provider, and its webhook log. */
export const integrationsHandlers = [
  mswHttp.get(`${BASE}/admin/integrations`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.integration.view');
    if (g.response) return g.response;
    return ok(db.integrations);
  }),

  /** Low-risk status change (pause/resume a courier's integration, say): saved directly. */
  mswHttp.patch(`${BASE}/admin/integrations/:key`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.integration.view');
    if (g.response) return g.response;
    const integration = db.integrations.find((i) => i.key === params.key);
    if (!integration) return notFound('That integration does not exist.');
    const body = await request.json();
    const patch = {};
    if (body.status !== undefined) patch.status = body.status;
    update('integrations', integration.id, patch);
    scheduleSave();
    return ok(findById('integrations', integration.id));
  }),

  /** Credentials are write-only and never echoed back; changing them is guarded. */
  mswHttp.post(`${BASE}/admin/integrations/:key/credentials`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.integration.edit');
    if (g.response) return g.response;
    const integration = db.integrations.find((i) => i.key === params.key);
    if (!integration) return notFound('That integration does not exist.');
    const body = await request.json();
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why these credentials are changing.' });
    if (!body.credentials || Object.keys(body.credentials).length === 0) {
      return validationFailed({ credentials: 'Enter at least one credential field.' });
    }

    const approval = createApproval({
      actionKey: 'integration.edit', actor: g.user,
      entityType: 'integration', entityId: integration.id, entityLabel: integration.label,
      reason: body.reason, summary: `Change ${integration.label} credentials`,
      // The credential values themselves are never stored on the approval
      // payload or the audit trail — only that they changed and when.
      execute: () => {
        update('integrations', integration.id, {
          status: 'CONNECTED',
          credentialsSetAt: mockNowIso(),
          credentialsSetByName: g.user.name,
        });
        writeAudit({
          actor: g.user, action: 'integration.credentials_edit', entityType: 'integration',
          entityId: integration.id, entityLabel: integration.label, reason: body.reason,
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  mswHttp.get(`${BASE}/admin/integrations/:key/webhooks`, async ({ request, params }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'admin.integration.view');
    if (g.response) return g.response;
    if (!db.integrations.some((i) => i.key === params.key)) return notFound('That integration does not exist.');

    const query = parseListQuery(url, { defaultSort: '-at' });
    const result = listResult(filter('webhookEvents', (e) => e.integrationKey === params.key), query, {
      searchFields: ['event'],
      filterSpec: { status: 'status' },
      sortable: ['at'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),
];
