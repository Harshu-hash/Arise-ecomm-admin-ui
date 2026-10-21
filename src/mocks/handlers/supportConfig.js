import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Queues, macros, SLA policies, routing rules and CSAT/QA (M14.1, M14.3–M14.5). */

export const supportConfigHandlers = [
  /* -------------------------------------------------------------- queues */
  mswHttp.get(`${BASE}/support/queues`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.view');
    if (g.response) return g.response;
    return ok(db.supportQueues);
  }),

  /** Agents who can be assigned a ticket in a given queue. */
  mswHttp.get(`${BASE}/support/agents`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'support.ticket.assign');
    if (g.response) return g.response;

    const queueId = url.searchParams.get('queueId');
    const agents = db.adminUsers.filter(
      (u) => u.status === 'ACTIVE' && (!queueId || !u.scope?.queues?.length || u.scope.queues.includes(queueId)),
    );
    return ok(agents.map((a) => ({
      id: a.id, name: a.name, email: a.email,
      openTicketCount: filter('tickets', (t) => t.assigneeId === a.id && !['RESOLVED', 'CLOSED'].includes(t.status)).length,
    })));
  }),

  /* -------------------------------------------------------------- macros */
  mswHttp.get(`${BASE}/macros`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'support.macro.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-usageCount' });
    const result = listResult(db.macros, query, {
      searchFields: ['name', 'body'],
      filterSpec: { category: 'category' },
      sortable: ['usageCount', 'name'],
      facetFields: ['category'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/macros`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.macro.create');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.name?.trim()) return validationFailed({ name: 'Give the macro a name.' });
    if (!body.body?.trim()) return validationFailed({ body: 'Write the macro text.' });

    const macro = insert('macros', {
      id: id('MAC', 4),
      name: body.name.trim(),
      category: body.category ?? 'General',
      body: body.body,
      actions: body.actions ?? {},
      shared: body.shared ?? true,
      createdByName: g.user.name,
      usageCount: 0,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'macro.create', entityType: 'macro', entityId: macro.id, entityLabel: macro.name });
    scheduleSave();
    return created(macro);
  }),

  mswHttp.patch(`${BASE}/macros/:macroId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.macro.edit');
    if (g.response) return g.response;
    const macro = findById('macros', params.macroId);
    if (!macro) return notFound('That macro no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['name', 'category', 'body', 'actions', 'shared']) if (body[key] !== undefined) patch[key] = body[key];
    update('macros', macro.id, patch);
    scheduleSave();
    return ok(findById('macros', macro.id));
  }),

  mswHttp.delete(`${BASE}/macros/:macroId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.macro.delete');
    if (g.response) return g.response;
    const macro = findById('macros', params.macroId);
    if (!macro) return notFound('That macro no longer exists.');
    remove('macros', macro.id);
    writeAudit({ actor: g.user, action: 'macro.delete', entityType: 'macro', entityId: macro.id, entityLabel: macro.name });
    scheduleSave();
    return ok({ id: macro.id });
  }),

  /* ---------------------------------------------------------- SLA & routing */
  mswHttp.get(`${BASE}/support/sla-policies`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.sla.view');
    if (g.response) return g.response;
    return ok(db.slaPolicies);
  }),

  mswHttp.patch(`${BASE}/support/sla-policies/:policyId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.sla.edit');
    if (g.response) return g.response;
    const policy = findById('slaPolicies', params.policyId);
    if (!policy) return notFound('That SLA policy no longer exists.');
    const body = await request.json();
    const errors = {};
    if (body.firstResponseMins !== undefined && body.firstResponseMins < 1) errors.firstResponseMins = 'Must be at least 1 minute.';
    if (body.resolutionMins !== undefined && body.resolutionMins < (body.firstResponseMins ?? policy.firstResponseMins)) {
      errors.resolutionMins = 'Resolution target must be at least the first-response target.';
    }
    if (Object.keys(errors).length) return validationFailed(errors);

    const patch = {};
    for (const key of ['firstResponseMins', 'resolutionMins', 'businessHoursOnly', 'escalateAtPct']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('slaPolicies', policy.id, patch);
    writeAudit({ actor: g.user, action: 'sla.edit', entityType: 'slaPolicy', entityId: policy.id, entityLabel: `${policy.priority}${policy.queueId ? ' · queue override' : ' · default'}` });
    scheduleSave();
    return ok(findById('slaPolicies', policy.id));
  }),

  mswHttp.get(`${BASE}/support/routing-rules`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.queue.view');
    if (g.response) return g.response;
    return ok([...db.routingRules].sort((a, b) => a.order - b.order));
  }),

  mswHttp.patch(`${BASE}/support/routing-rules/:ruleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.queue.manage');
    if (g.response) return g.response;
    const rule = findById('routingRules', params.ruleId);
    if (!rule) return notFound('That routing rule no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['name', 'active', 'conditions', 'queueId']) if (body[key] !== undefined) patch[key] = body[key];
    update('routingRules', rule.id, patch);
    scheduleSave();
    return ok(findById('routingRules', rule.id));
  }),

  mswHttp.patch(`${BASE}/support/routing-rules/reorder`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.queue.manage');
    if (g.response) return g.response;
    const body = await request.json();
    (body.orderedIds ?? []).forEach((ruleId, i) => update('routingRules', ruleId, { order: i }));
    scheduleSave();
    return ok([...db.routingRules].sort((a, b) => a.order - b.order));
  }),

  /* --------------------------------------------------------------- CSAT */
  mswHttp.get(`${BASE}/support/csat/config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.csat.view');
    if (g.response) return g.response;
    return ok(findById('csatConfig', 'csat'));
  }),

  mswHttp.patch(`${BASE}/support/csat/config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.csat.view');
    if (g.response) return g.response;
    const body = await request.json();
    const patch = {};
    for (const key of ['enabled', 'sendOnResolve', 'askComment', 'lowScoreThreshold']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('csatConfig', 'csat', patch);
    scheduleSave();
    return ok(findById('csatConfig', 'csat'));
  }),

  /** CSAT by agent/queue/category, and the low-score follow-up queue. */
  mswHttp.get(`${BASE}/support/csat/dashboard`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.csat.view');
    if (g.response) return g.response;

    const config = findById('csatConfig', 'csat');
    const scored = filter('tickets', (t) => t.csatScore !== null);
    const avg = (rows) => (rows.length ? Number((rows.reduce((n, t) => n + t.csatScore, 0) / rows.length).toFixed(2)) : null);

    const byAgent = {};
    for (const t of scored) {
      const key = t.assigneeName ?? 'Unassigned';
      (byAgent[key] ??= []).push(t);
    }
    const byQueue = {};
    for (const t of scored) {
      const queue = findById('supportQueues', t.queueId);
      const key = queue?.name ?? 'Unknown';
      (byQueue[key] ??= []).push(t);
    }

    return ok({
      overallAvg: avg(scored),
      responseRate: db.tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length
        ? Number(((scored.length / db.tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length) * 100).toFixed(1))
        : 0,
      byAgent: Object.entries(byAgent).map(([agentName, rows]) => ({ agentName, avg: avg(rows), count: rows.length })),
      byQueue: Object.entries(byQueue).map(([queueName, rows]) => ({ queueName, avg: avg(rows), count: rows.length })),
      lowScoreFollowUps: scored
        .filter((t) => t.csatScore <= config.lowScoreThreshold)
        .map((t) => ({ id: t.id, subject: t.subject, customerName: t.customerName, csatScore: t.csatScore, csatComment: t.csatComment })),
    });
  }),

  /** QA review sampling: a lead scores a resolved ticket against a rubric. */
  mswHttp.get(`${BASE}/support/qa-reviews`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'support.csat.review');
    if (g.response) return g.response;
    const query = parseListQuery(url, { defaultSort: '-reviewedAt' });
    const result = listResult(db.qaReviews, query, { searchFields: ['ticketId'], sortable: ['reviewedAt', 'overallScore'] });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/support/qa-reviews`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.csat.review');
    if (g.response) return g.response;
    const body = await request.json();
    const ticket = findById('tickets', body.ticketId);
    if (!ticket) return validationFailed({ ticketId: 'Choose a resolved ticket.' });
    if (!body.scores || Object.keys(body.scores).length === 0) return validationFailed({ scores: 'Score at least one rubric item.' });

    const values = Object.values(body.scores);
    const overallScore = Number((values.reduce((n, v) => n + v, 0) / values.length).toFixed(2));
    const review = insert('qaReviews', {
      id: id('QAR', 4),
      ticketId: ticket.id,
      reviewerName: g.user.name,
      scores: body.scores,
      overallScore,
      notes: body.notes ?? '',
      reviewedAt: mockNowIso(),
    });
    scheduleSave();
    return created(review);
  }),
];
