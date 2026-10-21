import { http as mswHttp } from 'msw';
import { db } from '../db/store';
import { guard } from '../engine/guard';
import { jobProgressPct, readJob } from '../engine/jobs';
import { listResult, parseListQuery } from '../engine/list';
import { notFound, ok, okList } from '../engine/respond';

const BASE = '/api/admin/v1';

export const jobHandlers = [
  /** Polled by ImportWizard and ExportCenter while a job is in flight. */
  mswHttp.get(`${BASE}/jobs/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url));
    if (g.response) return g.response;

    const job = readJob(params.id);
    if (!job) return notFound('That job no longer exists.');
    return ok({ ...job, progressPct: jobProgressPct(job) });
  }),

  mswHttp.get(`${BASE}/jobs`, async ({ request }) => {
    const g = await guard(request, new URL(request.url));
    if (g.response) return g.response;

    // Settle anything whose window has elapsed before listing.
    for (const j of db.jobs) if (j.status === 'PROCESSING') readJob(j.id);

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const mine = url.searchParams.get('mine') === 'true';
    const rows = (mine ? db.jobs.filter((j) => j.createdById === g.user.id) : db.jobs).map((j) => ({
      ...j,
      progressPct: jobProgressPct(j),
    }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['label', 'id', 'type'],
      filterSpec: { type: 'type', status: 'status', createdAt: { path: 'createdAt', kind: 'date' } },
      sortable: ['createdAt', 'status', 'type', 'totalRows'],
      facetFields: ['status', 'type'],
    });
    return okList(items, meta);
  }),
];
