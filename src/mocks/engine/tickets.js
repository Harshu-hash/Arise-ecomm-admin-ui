import { db } from '../db/store';

/**
 * Ticket state machine and SLA maths (MODULE_SPECS §M14).
 *
 *   NEW ─assign─▶ OPEN ─reply & wait─▶ PENDING_CUSTOMER ─customer replies─▶ OPEN
 *   OPEN ─escalate─▶ PENDING_INTERNAL ─▶ OPEN
 *   OPEN ─resolve─▶ RESOLVED ─(no reply 72h)─▶ CLOSED
 *   RESOLVED ─reopen─▶ OPEN
 *
 * Kept pure and separate from the handler for the same reason the order
 * state machine is: the rules have exactly one home, and a resolution code
 * requirement or an SLA deadline can be tested without an HTTP round trip.
 */
export const TICKET_TRANSITIONS = {
  NEW: ['OPEN', 'CLOSED'],
  OPEN: ['PENDING_CUSTOMER', 'PENDING_INTERNAL', 'RESOLVED', 'CLOSED'],
  PENDING_CUSTOMER: ['OPEN', 'CLOSED'],
  PENDING_INTERNAL: ['OPEN', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};

export function canTransitionTicket(from, to) {
  return (TICKET_TRANSITIONS[from] ?? []).includes(to);
}

/** Auto-close window: a resolved ticket with no customer reply in 72h closes itself. */
export const AUTO_CLOSE_HOURS = 72;

/**
 * Priority from the rules the spec calls out: a high order value or a
 * customer who has raised several tickets recently both escalate it, so a
 * VIP complaint and a repeat complainer never sit silently at Normal.
 */
export function derivePriority({ orderValuePaise = 0, recentTicketCount = 0 }) {
  if (orderValuePaise > 1000000 || recentTicketCount >= 3) return 'HIGH';
  if (orderValuePaise > 300000 || recentTicketCount >= 1) return 'MEDIUM';
  return 'LOW';
}

/** First-response and resolution deadlines, business-hours-naive (IST, 24×7 in this mock). */
export function slaDeadlines({ createdAt, policy }) {
  const createdMs = new Date(createdAt).getTime();
  return {
    firstResponseDueAt: new Date(createdMs + policy.firstResponseMins * 60_000).toISOString(),
    resolutionDueAt: new Date(createdMs + policy.resolutionMins * 60_000).toISOString(),
  };
}

/** Finds the policy for a priority/queue pair, falling back to the queue-less default. */
export function policyFor(priority, queueId) {
  return (
    db.slaPolicies.find((p) => p.priority === priority && p.queueId === queueId)
    ?? db.slaPolicies.find((p) => p.priority === priority && !p.queueId)
  );
}

/**
 * Routes a new ticket to a queue (and therefore a policy), using the first
 * matching rule — same "first match wins" contract as everywhere else rules
 * are evaluated in this mock (coupons, search boosts).
 */
export function routeTicket({ subject, priority }) {
  const rule = db.routingRules.find(
    (r) => r.active && (!r.conditions.subject || r.conditions.subject === subject)
      && (!r.conditions.priority || r.conditions.priority === priority),
  );
  return rule?.queueId ?? db.supportQueues[0]?.id ?? null;
}

/** Round-robin assignment within a queue, among its scoped, active agents. */
export function nextAssignee(queueId) {
  const agents = db.adminUsers.filter(
    (u) => u.status === 'ACTIVE' && (u.scope?.queues ?? []).includes(queueId),
  );
  if (!agents.length) return null;
  const counts = agents.map((a) => ({
    agent: a,
    open: db.tickets.filter((t) => t.assigneeId === a.id && !['RESOLVED', 'CLOSED'].includes(t.status)).length,
  }));
  counts.sort((a, b) => a.open - b.open);
  return counts[0].agent;
}

/** Renders a macro body, substituting `{{path.to.field}}` tokens. */
export function renderMacro(body, context) {
  return body.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path) => {
    const value = path.split('.').reduce((acc, key) => acc?.[key], context);
    return value === undefined || value === null ? '' : String(value);
  });
}
