import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  conflict,
  created,
  forbidden,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import {
  canTransitionTicket,
  derivePriority,
  nextAssignee,
  policyFor,
  routeTicket,
  slaDeadlines,
} from '../engine/tickets';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Tickets (M14.1): the queue inbox and the three-pane agent workspace.
 *
 * A queue-scoped agent only sees tickets in their own queues — the same
 * data-scoping contract the rest of the panel uses (a Category Manager
 * cannot see out-of-scope listings; a support agent cannot see another
 * queue's tickets).
 */
function queueAllowed(queueId, user) {
  const scope = user.scope?.queues;
  return !scope?.length || scope.includes(queueId);
}

function ticketRow(t) {
  const events = filter('ticketEvents', (e) => e.ticketId === t.id);
  return {
    ...t,
    messageCount: events.filter((e) => e.type.startsWith('MESSAGE')).length,
    breachingFirstResponse: !t.firstRespondedAt && new Date(t.firstResponseDueAt).getTime() < mockNow(),
    breachingResolution: !['RESOLVED', 'CLOSED'].includes(t.status)
      && new Date(t.resolutionDueAt).getTime() < mockNow(),
  };
}

export const ticketHandlers = [
  mswHttp.get(`${BASE}/tickets`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'support.ticket.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    let rows = db.tickets.filter((t) => queueAllowed(t.queueId, g.user)).map(ticketRow);

    // Named views, in addition to the generic filters below.
    const view = url.searchParams.get('view');
    if (view === 'mine') rows = rows.filter((t) => t.assigneeId === g.user.id);
    if (view === 'unassigned') rows = rows.filter((t) => !t.assigneeId && t.status !== 'CLOSED');
    if (view === 'breaching') rows = rows.filter((t) => t.breachingResolution || t.breachingFirstResponse);

    const result = listResult(rows, query, {
      searchFields: ['id', 'subject', 'customerName', 'orderId'],
      filterSpec: {
        status: 'status', priority: 'priority', queueId: 'queueId',
        assigneeId: 'assigneeId', channel: 'channel',
        createdAt: { path: 'createdAt', kind: 'date' },
      },
      sortable: ['createdAt', 'priority', 'resolutionDueAt'],
      facetFields: ['status', 'priority', 'queueId'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/tickets/:ticketId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.view');
    if (g.response) return g.response;

    const ticket = findById('tickets', params.ticketId);
    if (!ticket) return notFound('That ticket no longer exists.');
    if (!queueAllowed(ticket.queueId, g.user)) return notFound('That ticket no longer exists.');

    const customer = findById('customers', ticket.customerId);
    const customerOrders = filter('orders', (o) => o.customerId === ticket.customerId)
      .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt)).slice(0, 5);
    const openReturns = filter('returns', (r) => r.customerId === ticket.customerId
      && !['CLOSED', 'RETURN_REJECTED', 'RETURN_CANCELLED'].includes(r.status));
    const wallet = db.walletAccounts.find((w) => w.customerId === ticket.customerId);
    const priorTickets = filter('tickets', (t) => t.customerId === ticket.customerId && t.id !== ticket.id);

    return ok({
      ...ticketRow(ticket),
      events: filter('ticketEvents', (e) => e.ticketId === ticket.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      customer360: customer ? {
        name: customer.name, phone: customer.phone, city: customer.city,
        riskScore: customer.riskScore, walletBalancePaise: wallet?.balancePaise ?? 0,
        recentOrders: customerOrders.map((o) => ({ id: o.id, status: o.status, placedAt: o.placedAt, grandTotalPaise: o.grandTotalPaise })),
        openReturns: openReturns.map((r) => ({ id: r.id, status: r.status, amountPaise: r.amountPaise })),
        priorTicketCount: priorTickets.length,
      } : null,
    });
  }),

  mswHttp.post(`${BASE}/tickets`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.create');
    if (g.response) return g.response;

    const body = await request.json();
    const customer = findById('customers', body.customerId);
    if (!customer) return validationFailed({ customerId: 'Choose a customer.' });
    if (!body.subject) return validationFailed({ subject: 'Choose a subject.' });
    if (!body.text?.trim()) return validationFailed({ text: "Describe the customer's issue." });

    const order = body.orderId ? findById('orders', body.orderId) : null;
    const recentTicketCount = filter('tickets', (t) => t.customerId === customer.id
      && new Date(t.createdAt).getTime() > mockNow() - 30 * 86400_000).length;
    const priority = derivePriority({ orderValuePaise: order?.grandTotalPaise ?? 0, recentTicketCount });
    const queueId = routeTicket({ subject: body.subject, priority });
    const policy = policyFor(priority, queueId);
    const createdAt = mockNowIso();
    const deadlines = slaDeadlines({ createdAt, policy });
    const assignee = nextAssignee(queueId);

    const ticket = insert('tickets', {
      id: id('TKT', 6),
      subject: body.subject,
      category: body.subject,
      priority,
      status: assignee ? 'OPEN' : 'NEW',
      channel: body.channel ?? 'APP',
      customerId: customer.id,
      customerName: customer.name,
      requesterType: 'CUSTOMER',
      orderId: order?.id ?? null,
      queueId,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      tags: [],
      ...deadlines,
      firstRespondedAt: null,
      resolutionCode: null,
      csatScore: null,
      csatComment: null,
      dispositionCode: null,
      mergedIntoId: null,
      createdAt,
      resolvedAt: null,
      version: 1,
    });
    insert('ticketEvents', {
      id: id('TKE', 7), ticketId: ticket.id, type: 'MESSAGE_CUSTOMER',
      authorType: 'CUSTOMER', authorName: customer.name, body: body.text,
      attachments: body.attachments ?? [], visibility: 'PUBLIC', createdAt,
    });
    writeAudit({ actor: g.user, action: 'ticket.create', entityType: 'ticket', entityId: ticket.id, entityLabel: ticket.subject });
    scheduleSave();
    return created(ticketRow(ticket));
  }),

  /** Reply (public) or internal note, with an optional macro and status-on-send. */
  mswHttp.post(`${BASE}/tickets/:ticketId/messages`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), ['support.ticket.reply', 'support.ticket.note']);
    if (g.response) return g.response;

    const ticket = findById('tickets', params.ticketId);
    if (!ticket) return notFound('That ticket no longer exists.');
    if (ticket.status === 'CLOSED') return conflict('This ticket is closed.', 'ILLEGAL_TRANSITION');

    const body = await request.json();
    if (!body.text?.trim()) return validationFailed({ text: 'Write a message.' });
    const isNote = body.visibility === 'INTERNAL';
    if (isNote && !g.permissions.includes('*') && !g.permissions.includes('support.ticket.note')) {
      return forbidden('You do not have permission to add an internal note.');
    }
    if (!isNote && !g.permissions.includes('*') && !g.permissions.includes('support.ticket.reply')) {
      return forbidden('You do not have permission to reply to tickets.');
    }

    const now = mockNowIso();
    const event = insert('ticketEvents', {
      id: id('TKE', 7), ticketId: ticket.id,
      type: isNote ? 'NOTE' : 'MESSAGE_AGENT',
      authorType: 'ADMIN', authorName: g.user.name, body: body.text,
      macroId: body.macroId ?? null,
      attachments: body.attachments ?? [], visibility: isNote ? 'INTERNAL' : 'PUBLIC', createdAt: now,
    });

    const patch = {};
    if (!ticket.firstRespondedAt && !isNote) patch.firstRespondedAt = now;
    if (body.macroId) {
      const macro = findById('macros', body.macroId);
      if (macro) update('macros', macro.id, { usageCount: macro.usageCount + 1 });
    }
    // status-on-send: a reply can move the ticket in the same action.
    if (body.setStatus && body.setStatus !== ticket.status) {
      if (!canTransitionTicket(ticket.status, body.setStatus)) return illegalTransition(ticket.status, body.setStatus);
      if (body.setStatus === 'RESOLVED' && !body.resolutionCode) {
        return validationFailed({ resolutionCode: 'A resolution code is required to resolve a ticket.' });
      }
      patch.status = body.setStatus;
      if (body.setStatus === 'RESOLVED') { patch.resolutionCode = body.resolutionCode; patch.resolvedAt = now; }
      insert('ticketEvents', {
        id: id('TKE', 7), ticketId: ticket.id, type: 'STATUS_CHANGE',
        authorType: 'ADMIN', authorName: g.user.name,
        body: `${ticket.status} → ${body.setStatus}`, attachments: [], visibility: 'INTERNAL', createdAt: now,
      });
    }
    if (Object.keys(patch).length) update('tickets', ticket.id, patch);

    writeAudit({ actor: g.user, action: isNote ? 'ticket.note' : 'ticket.reply', entityType: 'ticket', entityId: ticket.id, entityLabel: ticket.subject });
    scheduleSave();
    return created(event);
  }),

  mswHttp.post(`${BASE}/tickets/:ticketId/transition`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.close');
    if (g.response) return g.response;

    const ticket = findById('tickets', params.ticketId);
    if (!ticket) return notFound('That ticket no longer exists.');
    const body = await request.json();
    if (!canTransitionTicket(ticket.status, body.status)) return illegalTransition(ticket.status, body.status);
    if (body.status === 'RESOLVED' && !body.resolutionCode) {
      return validationFailed({ resolutionCode: 'A resolution code is required to resolve a ticket.' });
    }

    const now = mockNowIso();
    update('tickets', ticket.id, {
      status: body.status,
      resolutionCode: body.status === 'RESOLVED' ? body.resolutionCode : ticket.resolutionCode,
      resolvedAt: body.status === 'RESOLVED' ? now : ticket.resolvedAt,
    });
    insert('ticketEvents', {
      id: id('TKE', 7), ticketId: ticket.id, type: 'STATUS_CHANGE',
      authorType: 'ADMIN', authorName: g.user.name,
      body: `${ticket.status} → ${body.status}${body.resolutionCode ? ` (${body.resolutionCode})` : ''}`,
      attachments: [], visibility: 'INTERNAL', createdAt: now,
    });
    writeAudit({ actor: g.user, action: 'ticket.transition', entityType: 'ticket', entityId: ticket.id, entityLabel: ticket.subject, metadata: { to: body.status } });
    scheduleSave();
    return ok(ticketRow(findById('tickets', ticket.id)));
  }),

  mswHttp.post(`${BASE}/tickets/:ticketId/assign`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.assign');
    if (g.response) return g.response;

    const ticket = findById('tickets', params.ticketId);
    if (!ticket) return notFound('That ticket no longer exists.');
    const body = await request.json();
    const agent = findById('adminUsers', body.assigneeId);
    if (!agent) return validationFailed({ assigneeId: 'Choose an agent.' });

    update('tickets', ticket.id, {
      assigneeId: agent.id, assigneeName: agent.name,
      status: ticket.status === 'NEW' ? 'OPEN' : ticket.status,
    });
    insert('ticketEvents', {
      id: id('TKE', 7), ticketId: ticket.id, type: 'SYSTEM', authorType: 'SYSTEM', authorName: 'System',
      body: `Assigned to ${agent.name}`, attachments: [], visibility: 'INTERNAL', createdAt: mockNowIso(),
    });
    writeAudit({ actor: g.user, action: 'ticket.assign', entityType: 'ticket', entityId: ticket.id, entityLabel: ticket.subject, metadata: { assigneeId: agent.id } });
    scheduleSave();
    return ok(ticketRow(findById('tickets', ticket.id)));
  }),

  mswHttp.post(`${BASE}/tickets/:ticketId/escalate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.escalate');
    if (g.response) return g.response;

    const ticket = findById('tickets', params.ticketId);
    if (!ticket) return notFound('That ticket no longer exists.');
    const body = await request.json();
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why this is being escalated.' });

    update('tickets', ticket.id, { status: 'PENDING_INTERNAL', tags: [...new Set([...ticket.tags, 'escalated'])] });
    insert('ticketEvents', {
      id: id('TKE', 7), ticketId: ticket.id, type: 'NOTE', authorType: 'ADMIN', authorName: g.user.name,
      body: `Escalated to ${body.team ?? 'seller-ops'}: ${body.reason}`, attachments: [], visibility: 'INTERNAL', createdAt: mockNowIso(),
    });
    writeAudit({ actor: g.user, action: 'ticket.escalate', entityType: 'ticket', entityId: ticket.id, entityLabel: ticket.subject, reason: body.reason });
    scheduleSave();
    return ok(ticketRow(findById('tickets', ticket.id)));
  }),

  mswHttp.post(`${BASE}/tickets/:ticketId/merge`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.ticket.merge');
    if (g.response) return g.response;

    const source = findById('tickets', params.ticketId);
    if (!source) return notFound('That ticket no longer exists.');
    const body = await request.json();
    const target = findById('tickets', body.targetTicketId);
    if (!target || target.id === source.id) return validationFailed({ targetTicketId: 'Choose a different ticket to merge into.' });
    if (source.mergedIntoId) return conflict('This ticket is already merged.', 'ILLEGAL_TRANSITION');

    update('tickets', source.id, { status: 'CLOSED', mergedIntoId: target.id });
    insert('ticketEvents', {
      id: id('TKE', 7), ticketId: target.id, type: 'SYSTEM', authorType: 'SYSTEM', authorName: 'System',
      body: `Merged ${source.id} into this ticket`, attachments: [], visibility: 'INTERNAL', createdAt: mockNowIso(),
    });
    writeAudit({ actor: g.user, action: 'ticket.merge', entityType: 'ticket', entityId: source.id, entityLabel: source.subject, metadata: { into: target.id } });
    scheduleSave();
    return ok(ticketRow(findById('tickets', source.id)));
  }),

  /**
   * CSAT is submitted by the customer from the app after a resolve, not by
   * an admin — there is no separate customer-facing mock API in this
   * project, so this one endpoint is deliberately unauthenticated rather
   * than borrowing an admin session for a submission admins do not make.
   */
  mswHttp.post(`${BASE}/tickets/:ticketId/csat`, async ({ request, params }) => {
    const ticket = findById('tickets', params.ticketId);
    if (!ticket) return notFound('That ticket no longer exists.');
    if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      return conflict('CSAT can only be recorded on a resolved ticket.', 'ILLEGAL_TRANSITION');
    }
    const body = await request.json();
    if (!(body.score >= 1 && body.score <= 5)) return validationFailed({ score: 'Score must be 1–5.' });

    update('tickets', ticket.id, { csatScore: body.score, csatComment: body.comment ?? null });
    scheduleSave();
    return ok(findById('tickets', ticket.id));
  }),
];
