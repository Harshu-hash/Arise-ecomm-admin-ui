import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { conflict, created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Live chat (M14.2). The "typing indicator" and "new message" effects the
 * spec asks for come from the UI's own polling of these endpoints — there is
 * no websocket in a mock, so a short poll interval is the honest substitute.
 */

function sessionRow(s) {
  const messages = filter('chatMessages', (m) => m.sessionId === s.id);
  return {
    ...s,
    messageCount: messages.length,
    waitingMs: s.status === 'WAITING' ? mockNow() - new Date(s.waitStartedAt).getTime() : null,
  };
}

export const chatHandlers = [
  mswHttp.get(`${BASE}/chat/sessions`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.handle');
    if (g.response) return g.response;

    const rows = db.chatSessions.map(sessionRow);
    const waiting = rows.filter((s) => s.status === 'WAITING');
    // "Average wait time" is the number the app itself tells customers —
    // computed here from how long the queue has actually been moving.
    const ended = rows.filter((s) => s.startedAt && s.waitStartedAt);
    const avgWaitMs = ended.length
      ? Math.round(ended.reduce((n, s) => n + (new Date(s.startedAt).getTime() - new Date(s.waitStartedAt).getTime()), 0) / ended.length)
      : 0;

    return okList(rows, {
      total: rows.length, page: 1, pageSize: rows.length, totalPages: 1,
      summary: {
        waitingCount: waiting.length,
        activeCount: rows.filter((s) => s.status === 'ACTIVE').length,
        avgWaitMs,
      },
    });
  }),

  mswHttp.get(`${BASE}/chat/sessions/:sessionId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.handle');
    if (g.response) return g.response;
    const session = findById('chatSessions', params.sessionId);
    if (!session) return notFound('That chat session no longer exists.');
    return ok({
      ...sessionRow(session),
      messages: filter('chatMessages', (m) => m.sessionId === session.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    });
  }),

  /** Take an incoming chat off the waiting queue. */
  mswHttp.post(`${BASE}/chat/sessions/:sessionId/claim`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.handle');
    if (g.response) return g.response;
    const session = findById('chatSessions', params.sessionId);
    if (!session) return notFound('That chat session no longer exists.');
    if (session.status !== 'WAITING') return conflict('This chat has already been picked up.', 'ILLEGAL_TRANSITION');

    update('chatSessions', session.id, {
      status: 'ACTIVE', agentId: g.user.id, agentName: g.user.name, startedAt: mockNowIso(),
    });
    scheduleSave();
    return ok(sessionRow(findById('chatSessions', session.id)));
  }),

  mswHttp.post(`${BASE}/chat/sessions/:sessionId/messages`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.handle');
    if (g.response) return g.response;
    const session = findById('chatSessions', params.sessionId);
    if (!session) return notFound('That chat session no longer exists.');
    if (session.status !== 'ACTIVE') return conflict('This chat is not active.', 'ILLEGAL_TRANSITION');

    const body = await request.json();
    if (!body.text?.trim()) return validationFailed({ text: 'Write a message.' });

    const message = insert('chatMessages', {
      id: id('CHM', 6), sessionId: session.id, authorType: 'ADMIN', authorName: g.user.name,
      body: body.text, createdAt: mockNowIso(),
    });
    scheduleSave();
    return created(message);
  }),

  /** Hand off to another agent or queue, mid-chat. */
  mswHttp.post(`${BASE}/chat/sessions/:sessionId/transfer`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.supervise');
    if (g.response) return g.response;
    const session = findById('chatSessions', params.sessionId);
    if (!session) return notFound('That chat session no longer exists.');
    const body = await request.json();
    const agent = findById('adminUsers', body.agentId);
    if (!agent) return validationFailed({ agentId: 'Choose an agent to transfer to.' });

    update('chatSessions', session.id, { agentId: agent.id, agentName: agent.name });
    insert('chatMessages', {
      id: id('CHM', 6), sessionId: session.id, authorType: 'SYSTEM', authorName: 'System',
      body: `Transferred to ${agent.name}`, createdAt: mockNowIso(),
    });
    writeAudit({ actor: g.user, action: 'chat.transfer', entityType: 'chatSession', entityId: session.id, entityLabel: session.customerName, metadata: { to: agent.id } });
    scheduleSave();
    return ok(sessionRow(findById('chatSessions', session.id)));
  }),

  /** Convert a chat into a ticket, e.g. when the customer needs follow-up beyond the session. */
  mswHttp.post(`${BASE}/chat/sessions/:sessionId/convert`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.handle');
    if (g.response) return g.response;
    const session = findById('chatSessions', params.sessionId);
    if (!session) return notFound('That chat session no longer exists.');
    if (session.convertedTicketId) return conflict('This chat has already been converted.', 'ILLEGAL_TRANSITION');

    const now = mockNowIso();
    const ticket = insert('tickets', {
      id: id('TKT', 6), subject: 'Account Issue', category: 'Account Issue', priority: 'MEDIUM',
      status: 'OPEN', channel: 'LIVE_CHAT', customerId: session.customerId, customerName: session.customerName,
      requesterType: 'CUSTOMER', orderId: null, queueId: db.supportQueues.find((q) => q.key === 'account')?.id ?? db.supportQueues[0].id,
      assigneeId: g.user.id, assigneeName: g.user.name, tags: ['from-chat'],
      firstResponseDueAt: new Date(mockNow() + 60 * 60_000).toISOString(),
      resolutionDueAt: new Date(mockNow() + 24 * 3600_000).toISOString(),
      firstRespondedAt: now, resolutionCode: null, csatScore: null, csatComment: null,
      dispositionCode: null, mergedIntoId: null, createdAt: now, resolvedAt: null, version: 1,
    });
    for (const m of filter('chatMessages', (x) => x.sessionId === session.id)) {
      insert('ticketEvents', {
        id: id('TKE', 7), ticketId: ticket.id,
        type: m.authorType === 'CUSTOMER' ? 'MESSAGE_CUSTOMER' : m.authorType === 'ADMIN' ? 'MESSAGE_AGENT' : 'SYSTEM',
        authorType: m.authorType, authorName: m.authorName, body: m.body,
        attachments: [], visibility: 'PUBLIC', createdAt: m.createdAt,
      });
    }
    update('chatSessions', session.id, { status: 'CONVERTED_TO_TICKET', convertedTicketId: ticket.id, endedAt: now });
    writeAudit({ actor: g.user, action: 'chat.convert', entityType: 'chatSession', entityId: session.id, entityLabel: session.customerName, metadata: { ticketId: ticket.id } });
    scheduleSave();
    return created({ ticketId: ticket.id });
  }),

  mswHttp.post(`${BASE}/chat/sessions/:sessionId/end`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'support.chat.handle');
    if (g.response) return g.response;
    const session = findById('chatSessions', params.sessionId);
    if (!session) return notFound('That chat session no longer exists.');
    const body = await request.json();
    if (!body.dispositionCode) return validationFailed({ dispositionCode: 'Choose a disposition code to end the chat.' });

    update('chatSessions', session.id, { status: 'ENDED', endedAt: mockNowIso(), dispositionCode: body.dispositionCode });
    scheduleSave();
    return ok(sessionRow(findById('chatSessions', session.id)));
  }),
];
