import { beforeEach, describe, expect, it } from 'vitest';
import { insert, resetDb } from '../db/store';
import {
  canTransitionTicket,
  derivePriority,
  nextAssignee,
  policyFor,
  renderMacro,
  routeTicket,
  slaDeadlines,
} from './tickets';

beforeEach(() => resetDb());

describe('canTransitionTicket', () => {
  it('allows the documented transitions only', () => {
    expect(canTransitionTicket('NEW', 'OPEN')).toBe(true);
    expect(canTransitionTicket('OPEN', 'PENDING_CUSTOMER')).toBe(true);
    expect(canTransitionTicket('OPEN', 'RESOLVED')).toBe(true);
    expect(canTransitionTicket('RESOLVED', 'OPEN')).toBe(true);
    expect(canTransitionTicket('CLOSED', 'OPEN')).toBe(false);
    expect(canTransitionTicket('NEW', 'RESOLVED')).toBe(false);
  });
});

describe('derivePriority', () => {
  it('escalates a high-value order', () => {
    expect(derivePriority({ orderValuePaise: 1500000, recentTicketCount: 0 })).toBe('HIGH');
  });
  it('escalates a repeat complainer even on a cheap order', () => {
    expect(derivePriority({ orderValuePaise: 10000, recentTicketCount: 3 })).toBe('HIGH');
  });
  it('defaults to low for a routine single contact', () => {
    expect(derivePriority({ orderValuePaise: 20000, recentTicketCount: 0 })).toBe('LOW');
  });
});

describe('slaDeadlines', () => {
  it('computes both deadlines off the policy minutes', () => {
    const d = slaDeadlines({
      createdAt: '2026-01-01T00:00:00.000Z',
      policy: { firstResponseMins: 30, resolutionMins: 1440 },
    });
    expect(d.firstResponseDueAt).toBe('2026-01-01T00:30:00.000Z');
    expect(d.resolutionDueAt).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('policyFor', () => {
  it('prefers a queue-specific policy over the default', () => {
    insert('slaPolicies', { id: 'P1', priority: 'HIGH', queueId: null, firstResponseMins: 60, resolutionMins: 1440 });
    insert('slaPolicies', { id: 'P2', priority: 'HIGH', queueId: 'QUE-1', firstResponseMins: 15, resolutionMins: 240 });
    expect(policyFor('HIGH', 'QUE-1').id).toBe('P2');
    expect(policyFor('HIGH', 'QUE-2').id).toBe('P1');
  });
});

describe('routeTicket', () => {
  it('routes by the first matching rule', () => {
    insert('routingRules', { id: 'R1', active: true, conditions: { subject: 'refund' }, queueId: 'QUE-PAY' });
    insert('routingRules', { id: 'R2', active: true, conditions: {}, queueId: 'QUE-DEFAULT' });
    expect(routeTicket({ subject: 'refund', priority: 'LOW' })).toBe('QUE-PAY');
    expect(routeTicket({ subject: 'delivery', priority: 'LOW' })).toBe('QUE-DEFAULT');
  });

  it('skips an inactive rule', () => {
    insert('routingRules', { id: 'R1', active: false, conditions: { subject: 'refund' }, queueId: 'QUE-PAY' });
    insert('supportQueues', { id: 'QUE-FALLBACK' });
    expect(routeTicket({ subject: 'refund', priority: 'LOW' })).toBe('QUE-FALLBACK');
  });
});

describe('nextAssignee', () => {
  it('picks the scoped agent with the fewest open tickets', () => {
    insert('adminUsers', { id: 'A', status: 'ACTIVE', scope: { queues: ['Q1'] } });
    insert('adminUsers', { id: 'B', status: 'ACTIVE', scope: { queues: ['Q1'] } });
    insert('tickets', { id: 'T1', assigneeId: 'A', status: 'OPEN' });
    insert('tickets', { id: 'T2', assigneeId: 'A', status: 'OPEN' });
    insert('tickets', { id: 'T3', assigneeId: 'B', status: 'RESOLVED' });

    expect(nextAssignee('Q1').id).toBe('B');
  });

  it('ignores an agent outside the queue scope', () => {
    insert('adminUsers', { id: 'A', status: 'ACTIVE', scope: { queues: ['Q2'] } });
    expect(nextAssignee('Q1')).toBeNull();
  });
});

describe('renderMacro', () => {
  it('substitutes nested variables', () => {
    const out = renderMacro('Hi {{customer.name}}, your order {{order.id}} ships soon.', {
      customer: { name: 'Riya' },
      order: { id: 'ORD-1' },
    });
    expect(out).toBe('Hi Riya, your order ORD-1 ships soon.');
  });

  it('renders a missing variable as empty rather than leaving the token', () => {
    expect(renderMacro('Hello {{customer.name}}', {})).toBe('Hello ');
  });
});
