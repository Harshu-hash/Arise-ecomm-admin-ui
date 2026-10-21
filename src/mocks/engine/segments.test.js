import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, insert } from '../db/store';
import { matchSegment, resolveAudience } from './segments';

function customer(overrides) {
  return insert('customers', {
    id: overrides.id, status: 'ACTIVE', city: 'Mumbai', state: 'Maharashtra',
    platform: 'Android', ordersCount: 0, gmvPaise: 0, lastOrderAt: null,
    walletBalancePaise: 0, riskScore: 10, joinedAt: new Date().toISOString(),
    ...overrides,
  });
}

beforeEach(() => resetDb());

describe('matchSegment', () => {
  it('matches a single condition', () => {
    customer({ id: 'A', city: 'Mumbai' });
    customer({ id: 'B', city: 'Delhi' });
    const rule = { field: 'city', op: 'eq', value: 'Mumbai' };
    expect(matchSegment(rule).map((c) => c.id)).toEqual(['A']);
  });

  it('ANDs a group by default', () => {
    customer({ id: 'A', city: 'Mumbai', ordersCount: 25 });
    customer({ id: 'B', city: 'Mumbai', ordersCount: 2 });
    const rule = {
      match: 'ALL',
      conditions: [
        { field: 'city', op: 'eq', value: 'Mumbai' },
        { field: 'ordersCount', op: 'gte', value: 20 },
      ],
    };
    expect(matchSegment(rule).map((c) => c.id)).toEqual(['A']);
  });

  it('ORs a group when asked', () => {
    customer({ id: 'A', city: 'Mumbai', ordersCount: 0 });
    customer({ id: 'B', city: 'Delhi', ordersCount: 0 });
    customer({ id: 'C', city: 'Pune', ordersCount: 0 });
    const rule = {
      match: 'ANY',
      conditions: [
        { field: 'city', op: 'eq', value: 'Mumbai' },
        { field: 'city', op: 'eq', value: 'Delhi' },
      ],
    };
    expect(matchSegment(rule).map((c) => c.id).sort()).toEqual(['A', 'B']);
  });

  it('nests groups', () => {
    customer({ id: 'A', city: 'Mumbai', ordersCount: 30, riskScore: 5 });
    customer({ id: 'B', city: 'Mumbai', ordersCount: 0, riskScore: 5 });
    const rule = {
      match: 'ALL',
      conditions: [
        { field: 'riskScore', op: 'lte', value: 50 },
        { match: 'ANY', conditions: [
          { field: 'ordersCount', op: 'gte', value: 20 },
          { field: 'city', op: 'eq', value: 'Delhi' },
        ] },
      ],
    };
    expect(matchSegment(rule).map((c) => c.id)).toEqual(['A']);
  });

  it('reads a date field as "days ago", not a calendar date', () => {
    const recent = new Date(Date.now() - 2 * 86400_000).toISOString();
    const stale = new Date(Date.now() - 90 * 86400_000).toISOString();
    customer({ id: 'A', lastOrderAt: recent });
    customer({ id: 'B', lastOrderAt: stale });
    customer({ id: 'C', lastOrderAt: null });

    const active = matchSegment({ field: 'lastOrderAt', op: 'within_days', value: 7 });
    expect(active.map((c) => c.id)).toEqual(['A']);

    const dormant = matchSegment({ field: 'lastOrderAt', op: 'before_days', value: 30 });
    expect(dormant.map((c) => c.id).sort()).toEqual(['B', 'C']);
  });

  it('excludes a blocked customer unless explicitly included', () => {
    customer({ id: 'A', status: 'BLOCKED', city: 'Mumbai' });
    const rule = { field: 'city', op: 'eq', value: 'Mumbai' };
    expect(matchSegment(rule)).toHaveLength(0);
    expect(matchSegment(rule, { includeBlocked: true })).toHaveLength(1);
  });

  it('an empty rule matches everyone active', () => {
    customer({ id: 'A' });
    customer({ id: 'B', status: 'BLOCKED' });
    expect(matchSegment(null)).toHaveLength(1);
  });
});

describe('resolveAudience', () => {
  it('ALL excludes blocked customers', () => {
    customer({ id: 'A' });
    customer({ id: 'B', status: 'BLOCKED' });
    expect(resolveAudience({ type: 'ALL' })).toEqual(['A']);
  });

  it('NEW is only customers with zero orders', () => {
    customer({ id: 'A', ordersCount: 0 });
    customer({ id: 'B', ordersCount: 5 });
    expect(resolveAudience({ type: 'NEW' })).toEqual(['A']);
  });

  it('SEGMENT defers to the stored rule', () => {
    customer({ id: 'A', city: 'Mumbai' });
    insert('segments', { id: 'SEG-1', rule: { field: 'city', op: 'eq', value: 'Mumbai' } });
    expect(resolveAudience({ type: 'SEGMENT', segmentId: 'SEG-1' })).toEqual(['A']);
  });

  it('CUSTOM is the explicit list, unresolved against customers at all', () => {
    expect(resolveAudience({ type: 'CUSTOM', customerIds: ['X', 'Y'] })).toEqual(['X', 'Y']);
  });
});
