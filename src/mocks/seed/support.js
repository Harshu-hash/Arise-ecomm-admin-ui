import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, id, insert, update } from '../db/store';
import { derivePriority, renderMacro, slaDeadlines } from '../engine/tickets';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * Support (M14): SLA policies and routing come first, since every ticket
 * seeded after them needs a policy to compute its deadlines against —
 * the same dependency order Phase 4 used for commission rules and
 * settlement lines.
 */

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

export function seedSlaPolicies() {
  const rows = [];
  // A per-queue override for the busiest queue, plus queue-less defaults —
  // `policyFor` prefers the specific one, same contract the engine test pins.
  const paymentsQueue = db.supportQueues.find((q) => q.key === 'payments');

  for (const priority of PRIORITIES) {
    const base = { LOW: [240, 2880], MEDIUM: [60, 1440], HIGH: [15, 240] }[priority];
    rows.push(insert('slaPolicies', {
      id: id('SLA', 4),
      priority,
      queueId: null,
      firstResponseMins: base[0],
      resolutionMins: base[1],
      businessHoursOnly: false,
      escalateAtPct: 80,
      version: 1,
    }));
  }
  if (paymentsQueue) {
    rows.push(insert('slaPolicies', {
      id: id('SLA', 4),
      priority: 'HIGH',
      queueId: paymentsQueue.id,
      firstResponseMins: 10,
      resolutionMins: 120,
      businessHoursOnly: false,
      escalateAtPct: 80,
      version: 1,
    }));
  }
  return rows;
}

const SUBJECTS = ['Delivery Issue', 'Payment Issue', 'Product Quality', 'Refund Query', 'Account Issue'];

export function seedRoutingRules() {
  const byKey = Object.fromEntries(db.supportQueues.map((q) => [q.key, q.id]));
  const defs = [
    ['Payment Issue', byKey.payments],
    ['Refund Query', byKey.payments],
    ['Delivery Issue', byKey.orders],
    ['Product Quality', byKey.returns],
    ['Account Issue', byKey.account],
  ];
  const rows = defs.map(([subject, queueId], i) =>
    insert('routingRules', {
      id: id('RTR', 4),
      name: `${subject} → queue`,
      active: true,
      conditions: { subject },
      queueId,
      order: i,
      version: 1,
    }),
  );
  // Catch-all so nothing is left unrouted.
  rows.push(insert('routingRules', {
    id: id('RTR', 4),
    name: 'Everything else',
    active: true,
    conditions: {},
    queueId: db.supportQueues[0]?.id,
    order: rows.length,
    version: 1,
  }));
  return rows;
}

const MACRO_DEFS = [
  ['Refund processed', 'Payments', 'Hi {{customer.name}}, your refund of {{refund.amount}} for order {{order.id}} has been processed and should reflect within {{refund.eta}}.', { setStatus: 'RESOLVED' }],
  ['Asking for order ID', 'General', 'Hi {{customer.name}}, could you share the order ID so I can look into this right away?', null],
  ['Delay apology', 'Orders', 'Hi {{customer.name}}, apologies for the delay on order {{order.id}}. I have escalated this with the courier and will update you within 24 hours.', { addTag: 'escalated' }],
  ['Return pickup scheduled', 'Returns', 'Hi {{customer.name}}, a pickup has been scheduled for your return on order {{order.id}}. Please keep the item ready with its original packaging.', null],
  ['Closing — no response', 'General', 'Hi {{customer.name}}, we have not heard back from you so we are closing this ticket. Feel free to reopen if you still need help.', { setStatus: 'RESOLVED' }],
];

export function seedMacros() {
  return MACRO_DEFS.map(([name, category, body, actions], i) =>
    insert('macros', {
      id: id('MAC', 4),
      name,
      category,
      body,
      actions: actions ?? {},
      shared: true,
      createdByName: 'Fatima Shaikh',
      usageCount: faker.number.int({ min: 5, max: 400 }) * (i % 4 === 0 ? 0 : 1),
      version: 1,
    }),
  );
}

export function seedCsatConfig() {
  return insert('csatConfig', {
    id: 'csat',
    enabled: true,
    sendOnResolve: true,
    scale: 5,
    askComment: true,
    lowScoreThreshold: 3,
    version: 1,
  });
}

const DISPOSITIONS = ['RESOLVED_SELF_SERVICE', 'ESCALATED', 'TRANSFERRED', 'ABANDONED_BY_CUSTOMER'];

/**
 * Tickets, with a real conversation timeline and SLA deadlines computed
 * from the policies above. A handful are escalated to seller-ops and
 * resolved with CSAT recorded, so Journey 6 has real seed data to run
 * against rather than needing everything built fresh in the test.
 */
export function seedTickets() {
  const customers = db.customers.filter((c) => c.status === 'ACTIVE');
  const agent = db.adminUsers.find((u) => u.email.startsWith('agent@'));
  const lead = db.adminUsers.find((u) => u.email.startsWith('supportlead@'));
  const statuses = ['NEW', 'OPEN', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'RESOLVED', 'RESOLVED', 'CLOSED'];

  const tickets = [];
  for (let i = 0; i < 90; i += 1) {
    const customer = customers[i % customers.length];
    const order = db.orders.find((o) => o.customerId === customer.id);
    const subject = SUBJECTS[i % SUBJECTS.length];
    const status = statuses[i % statuses.length];
    const createdAt = new Date(mockNow() - faker.number.int({ min: 1, max: 20 }) * 86400_000);

    const recentTicketCount = tickets.filter((t) => t.customerId === customer.id).length;
    const priority = derivePriority({
      orderValuePaise: order?.grandTotalPaise ?? 0,
      recentTicketCount,
    });

    const queueId = [db.supportQueues[0], db.supportQueues[1], db.supportQueues[2], db.supportQueues[3], db.supportQueues[4]][
      SUBJECTS.indexOf(subject)
    ]?.id ?? db.supportQueues[0].id;
    const policy = db.slaPolicies.find((p) => p.priority === priority && p.queueId === queueId)
      ?? db.slaPolicies.find((p) => p.priority === priority && !p.queueId);
    const deadlines = slaDeadlines({ createdAt: createdAt.toISOString(), policy });

    // Breaching tickets are deliberately overdue, so the "Breaching SLA"
    // view and the dashboard counter both have something real to show.
    const breaching = status === 'OPEN' && i % 5 === 0;
    const firstResponseDueAt = breaching
      ? new Date(mockNow() - 2 * 3600_000).toISOString()
      : deadlines.firstResponseDueAt;
    const resolutionDueAt = breaching
      ? new Date(mockNow() - 3600_000).toISOString()
      : deadlines.resolutionDueAt;

    const resolved = ['RESOLVED', 'CLOSED'].includes(status);
    const csatScore = resolved && i % 3 !== 0 ? faker.number.int({ min: 1, max: 5 }) : null;

    const ticket = insert('tickets', {
      id: id('TKT', 6),
      subject,
      category: subject,
      priority,
      status,
      channel: i % 7 === 0 ? 'LIVE_CHAT' : i % 11 === 0 ? 'SELLER_PANEL' : 'APP',
      customerId: customer.id,
      customerName: customer.name,
      requesterType: 'CUSTOMER',
      orderId: order?.id ?? null,
      queueId,
      assigneeId: ['NEW'].includes(status) ? null : agent?.id ?? null,
      assigneeName: ['NEW'].includes(status) ? null : agent?.name ?? null,
      tags: breaching ? ['escalated'] : [],
      firstResponseDueAt,
      resolutionDueAt,
      firstRespondedAt: status === 'NEW' ? null : new Date(createdAt.getTime() + 20 * 60_000).toISOString(),
      resolutionCode: resolved ? ['REFUNDED', 'REPLACED', 'INFO_PROVIDED', 'NO_FAULT_FOUND'][i % 4] : null,
      csatScore,
      csatComment: csatScore && csatScore <= 2 ? 'Took too long to get a straight answer.' : null,
      dispositionCode: status === 'CLOSED' ? DISPOSITIONS[i % DISPOSITIONS.length] : null,
      mergedIntoId: null,
      createdAt: createdAt.toISOString(),
      resolvedAt: resolved ? new Date(createdAt.getTime() + 2 * 86400_000).toISOString() : null,
      version: 1,
    });
    tickets.push(ticket);

    seedTicketTimeline(ticket, customer, agent, lead);
  }

  // Two merged tickets, so the merge/split screen has a real case.
  const [a, b] = tickets.filter((t) => t.status !== 'CLOSED').slice(0, 2);
  if (a && b) {
    update('tickets', b.id, { status: 'CLOSED', mergedIntoId: a.id });
  }

  return tickets;
}

function seedTicketTimeline(ticket, customer, agent, lead) {
  const createdAt = new Date(ticket.createdAt).getTime();
  insert('ticketEvents', {
    id: id('TKE', 7),
    ticketId: ticket.id,
    type: 'MESSAGE_CUSTOMER',
    authorType: 'CUSTOMER',
    authorName: customer.name,
    body: `Hi, I have an issue with my order${ticket.orderId ? ` ${ticket.orderId}` : ''} — ${ticket.subject.toLowerCase()}.`,
    attachments: [],
    visibility: 'PUBLIC',
    createdAt: new Date(createdAt).toISOString(),
  });

  if (ticket.status === 'NEW') return;

  insert('ticketEvents', {
    id: id('TKE', 7),
    ticketId: ticket.id,
    type: 'SYSTEM',
    authorType: 'SYSTEM',
    authorName: 'System',
    body: `Assigned to ${agent?.name ?? 'an agent'}`,
    attachments: [],
    visibility: 'INTERNAL',
    createdAt: new Date(createdAt + 5 * 60_000).toISOString(),
  });

  insert('ticketEvents', {
    id: id('TKE', 7),
    ticketId: ticket.id,
    type: 'MESSAGE_AGENT',
    authorType: 'ADMIN',
    authorName: agent?.name ?? 'Support',
    body: "Thanks for reaching out — I'm looking into this now and will update you shortly.",
    attachments: [],
    visibility: 'PUBLIC',
    createdAt: new Date(createdAt + 20 * 60_000).toISOString(),
  });

  if (ticket.status === 'PENDING_INTERNAL') {
    insert('ticketEvents', {
      id: id('TKE', 7),
      ticketId: ticket.id,
      type: 'NOTE',
      authorType: 'ADMIN',
      authorName: agent?.name ?? 'Support',
      body: 'Escalating to seller-ops to confirm the dispatch delay before replying further.',
      attachments: [],
      visibility: 'INTERNAL',
      createdAt: new Date(createdAt + 30 * 60_000).toISOString(),
    });
    insert('ticketEvents', {
      id: id('TKE', 7),
      ticketId: ticket.id,
      type: 'SYSTEM',
      authorType: 'SYSTEM',
      authorName: 'System',
      body: 'Escalated to seller-ops',
      attachments: [],
      visibility: 'INTERNAL',
      createdAt: new Date(createdAt + 31 * 60_000).toISOString(),
    });
  }

  if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
    const macro = db.macros[0];
    insert('ticketEvents', {
      id: id('TKE', 7),
      ticketId: ticket.id,
      type: 'MESSAGE_AGENT',
      authorType: 'ADMIN',
      authorName: agent?.name ?? 'Support',
      body: renderMacro(macro.body, {
        customer: { name: customer.name },
        order: { id: ticket.orderId ?? '—' },
        refund: { amount: '₹499', eta: '3-5 business days' },
      }),
      macroId: macro.id,
      attachments: [],
      visibility: 'PUBLIC',
      createdAt: new Date(createdAt + 2 * 3600_000).toISOString(),
    });
    insert('ticketEvents', {
      id: id('TKE', 7),
      ticketId: ticket.id,
      type: 'STATUS_CHANGE',
      authorType: 'ADMIN',
      authorName: agent?.name ?? 'Support',
      body: `Resolved — ${ticket.resolutionCode}`,
      attachments: [],
      visibility: 'INTERNAL',
      createdAt: new Date(createdAt + 2 * 3600_000 + 60_000).toISOString(),
    });
  }

  // QA sampling: a lead scores a handful of resolved tickets against a rubric.
  if (ticket.status === 'RESOLVED' && lead && ticket.id.endsWith('0')) {
    insert('qaReviews', {
      id: id('QAR', 4),
      ticketId: ticket.id,
      reviewerName: lead.name,
      scores: { greeting: 5, accuracy: 4, tone: 5, resolution: 4 },
      overallScore: 4.5,
      notes: 'Good tone throughout; could have confirmed the resolution before closing.',
      reviewedAt: mockNowIso(),
    });
  }
}

/** A handful of live chat sessions, one still waiting, one active, most ended. */
export function seedChatSessions() {
  const customers = db.customers.filter((c) => c.status === 'ACTIVE');
  const agent = db.adminUsers.find((u) => u.email.startsWith('agent@'));
  const statuses = ['WAITING', 'ACTIVE', 'ENDED', 'ENDED', 'ENDED', 'CONVERTED_TO_TICKET'];

  return statuses.map((status, i) => {
    const customer = customers[(i + 7) % customers.length];
    const startedAt = new Date(mockNow() - (statuses.length - i) * 3600_000);
    const session = insert('chatSessions', {
      id: id('CHT', 5),
      customerId: customer.id,
      customerName: customer.name,
      agentId: status === 'WAITING' ? null : agent?.id ?? null,
      agentName: status === 'WAITING' ? null : agent?.name ?? null,
      status,
      waitStartedAt: startedAt.toISOString(),
      startedAt: status === 'WAITING' ? null : startedAt.toISOString(),
      endedAt: ['ENDED', 'CONVERTED_TO_TICKET'].includes(status)
        ? new Date(startedAt.getTime() + 12 * 60_000).toISOString() : null,
      dispositionCode: status === 'ENDED' ? DISPOSITIONS[i % DISPOSITIONS.length] : null,
      convertedTicketId: null,
      version: 1,
    });

    if (status !== 'WAITING') {
      insert('chatMessages', {
        id: id('CHM', 6),
        sessionId: session.id,
        authorType: 'BOT',
        authorName: 'Arise Bot',
        body: 'Hi! I can help with order tracking, returns and refunds. Would you like to talk to a human agent?',
        createdAt: startedAt.toISOString(),
      });
      insert('chatMessages', {
        id: id('CHM', 6),
        sessionId: session.id,
        authorType: 'CUSTOMER',
        authorName: customer.name,
        body: 'Yes, I need help with a refund that has not come through.',
        createdAt: new Date(startedAt.getTime() + 60_000).toISOString(),
      });
      insert('chatMessages', {
        id: id('CHM', 6),
        sessionId: session.id,
        authorType: 'ADMIN',
        authorName: agent?.name ?? 'Support',
        body: 'Hi, I can see your refund request — let me check the status for you.',
        createdAt: new Date(startedAt.getTime() + 90_000).toISOString(),
      });
    }

    return session;
  });
}
