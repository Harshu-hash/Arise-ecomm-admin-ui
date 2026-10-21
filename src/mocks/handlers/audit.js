import { http as mswHttp } from 'msw';
import { db } from '../db/store';
import { createJob } from '../engine/jobs';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { ok, okList } from '../engine/respond';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

export const auditHandlers = [
  mswHttp.get(`${BASE}/audit-events`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.audit.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-at' });
    const { items, meta } = listResult(db.auditEvents, query, {
      searchFields: ['actorName', 'actorEmail', 'action', 'entityId', 'entityLabel', 'reason'],
      filterSpec: {
        actorId: 'actorId',
        module: 'module',
        action: 'action',
        entityType: 'entityType',
        entityId: 'entityId',
        severity: 'severity',
        at: { path: 'at', kind: 'date' },
        ip: { path: 'ip', kind: 'contains' },
        hasChanges: (row, v) => (String(v) === 'true' ? row.changes.length > 0 : row.changes.length === 0),
      },
      sortable: ['at', 'actorName', 'action', 'module', 'severity'],
      facetFields: ['module', 'severity'],
    });

    return okList(items, {
      ...meta,
      // Populates the actor and action filter dropdowns without a second call.
      filterOptions: {
        actors: Array.from(new Set(db.auditEvents.map((e) => e.actorId))).map((actorId) => {
          const e = db.auditEvents.find((x) => x.actorId === actorId);
          return { value: actorId, label: e.actorName };
        }),
        actions: Array.from(new Set(db.auditEvents.map((e) => e.action))).sort(),
        modules: Array.from(new Set(db.auditEvents.map((e) => e.module))).sort(),
      },
    });
  }),

  /** The per-entity "History" drawer used on every detail page. */
  mswHttp.get(`${BASE}/audit-events/entity/:entityType/:entityId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.audit.view');
    if (g.response) return g.response;

    const rows = db.auditEvents
      .filter((e) => e.entityType === params.entityType && e.entityId === params.entityId)
      .sort((a, b) => b.at.localeCompare(a.at));
    return ok(rows);
  }),

  mswHttp.post(`${BASE}/audit-events/export`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.audit.export');
    if (g.response) return g.response;

    const body = await request.json().catch(() => ({}));
    const job = createJob({
      type: 'EXPORT',
      label: 'Audit log export',
      actor: g.user,
      totalRows: db.auditEvents.length,
      durationMs: 4000,
      resultUrl: 'mock://exports/audit-log.csv',
      metadata: { filters: body?.filters ?? null, entity: 'auditEvents' },
    });
    scheduleSave();
    return ok(job);
  }),
];
