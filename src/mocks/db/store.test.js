import { beforeEach, describe, expect, it } from 'vitest';
import { seedAll } from '../seed';
import { listResult, parseListQuery } from '../engine/list';
import {
  COLLECTIONS,
  SNAPSHOT_VERSION,
  db,
  findById,
  hydrateDb,
  id,
  insert,
  resetDb,
  snapshotDb,
  update,
} from './store';

describe('id generation', () => {
  beforeEach(() => resetDb());

  it('pads and increments per prefix', () => {
    expect(id('ORD', 5)).toBe('ORD-00001');
    expect(id('ORD', 5)).toBe('ORD-00002');
    expect(id('SEL', 4)).toBe('SEL-0001');
  });

  it('never reissues an id that the seed already used', () => {
    // This is the regression that let a cloned role be handed ROLE-001 and
    // silently shadow Super Admin.
    seedAll();
    for (const collection of COLLECTIONS) {
      const ids = db[collection].map((r) => r.id).filter(Boolean);
      expect(new Set(ids).size, `${collection} has duplicate ids`).toBe(ids.length);
    }

    const existing = new Set(db.roles.map((r) => r.id));
    expect(existing.has(id('ROLE', 3))).toBe(false);
    const existingAdmins = new Set(db.adminUsers.map((u) => u.id));
    expect(existingAdmins.has(id('ADM', 3))).toBe(false);
  });
});

describe('update', () => {
  beforeEach(() => resetDb());

  it('bumps the version so stale writes can be detected', () => {
    insert('roles', { id: 'R1', name: 'A', version: 1 });
    update('roles', 'R1', { name: 'B' });
    expect(findById('roles', 'R1')).toMatchObject({ name: 'B', version: 2 });
  });

  it('does not bump the version when one is passed explicitly', () => {
    insert('roles', { id: 'R2', name: 'A', version: 4 });
    update('roles', 'R2', { name: 'B', version: 9 });
    expect(findById('roles', 'R2').version).toBe(9);
  });

  it('returns null for a record that does not exist', () => {
    expect(update('roles', 'nope', { name: 'x' })).toBeNull();
  });
});

describe('parseListQuery', () => {
  const parse = (qs) => parseListQuery(new URL(`http://x/api?${qs}`));

  it('applies defaults', () => {
    const q = parse('');
    expect(q).toMatchObject({ page: 1, pageSize: 25, sort: '-createdAt', q: '' });
  });

  it('caps the page size so a client cannot ask for everything', () => {
    expect(parse('pageSize=99999').pageSize).toBe(200);
  });

  it('splits a comma list into a multi-select filter', () => {
    expect(parse('status=ACTIVE,LOCKED').filters.status).toEqual(['ACTIVE', 'LOCKED']);
  });

  it('parses range operators', () => {
    const q = parse('placedAt[gte]=2026-01-01&placedAt[lte]=2026-02-01');
    expect(q.filters.placedAt).toEqual({ gte: '2026-01-01', lte: '2026-02-01' });
  });

  it('ignores empty values so a cleared filter is not sent as a match', () => {
    expect(parse('status=').filters.status).toBeUndefined();
  });
});

describe('listResult', () => {
  const rows = [
    { id: '1', name: 'Alpha', status: 'ACTIVE', score: 10, at: '2026-01-01' },
    { id: '2', name: 'Beta', status: 'ACTIVE', score: 30, at: '2026-03-01' },
    { id: '3', name: 'Gamma', status: 'LOCKED', score: 20, at: '2026-02-01' },
  ];
  const config = {
    searchFields: ['name'],
    filterSpec: { status: 'status', at: { path: 'at', kind: 'date' } },
    sortable: ['name', 'score'],
    facetFields: ['status'],
  };
  const query = (over = {}) => ({ page: 1, pageSize: 25, sort: 'name', q: '', filters: {}, ...over });

  it('returns a total independent of the page size', () => {
    const r = listResult(rows, query({ pageSize: 2 }), config);
    expect(r.items).toHaveLength(2);
    expect(r.meta.total).toBe(3);
    expect(r.meta.totalPages).toBe(2);
  });

  it('counts facets over the filtered set, not the page', () => {
    const r = listResult(rows, query({ pageSize: 1 }), config);
    expect(r.meta.facets.status).toEqual({ ACTIVE: 2, LOCKED: 1 });
  });

  it('searches case-insensitively', () => {
    expect(listResult(rows, query({ q: 'BET' }), config).items).toHaveLength(1);
  });

  it('sorts numerically, descending', () => {
    const r = listResult(rows, query({ sort: '-score' }), config);
    expect(r.items.map((x) => x.score)).toEqual([30, 20, 10]);
  });

  it('refuses to sort by a field not declared sortable', () => {
    const r = listResult(rows, query({ sort: 'status' }), config);
    expect(r.items.map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('filters by a date range', () => {
    const r = listResult(rows, query({ filters: { at: { gte: '2026-02-01' } } }), config);
    expect(r.items.map((x) => x.id)).toEqual(['2', '3']);
  });

  it('treats an array filter as "any of"', () => {
    const r = listResult(rows, query({ filters: { status: ['LOCKED'] } }), config);
    expect(r.items).toHaveLength(1);
  });

  it('returns an empty page past the end rather than failing', () => {
    const r = listResult(rows, query({ page: 9 }), config);
    expect(r.items).toEqual([]);
    expect(r.meta.total).toBe(3);
  });
});

describe('snapshot compatibility', () => {
  it('stamps the current version onto a saved snapshot', () => {
    resetDb();
    seedAll();
    expect(snapshotDb().version).toBe(SNAPSHOT_VERSION);
  });

  it('round-trips a snapshot of the current version', () => {
    seedAll();
    const snapshot = JSON.parse(JSON.stringify(snapshotDb()));
    const before = db.adminUsers.length;
    resetDb();
    expect(db.adminUsers).toHaveLength(0);

    hydrateDb(snapshot);
    expect(db.adminUsers).toHaveLength(before);
    expect(db.adminUsers.find((u) => u.email === 'super@arise.test').password).toBeTruthy();
  });

  it('keeps the id counter past the restored rows', () => {
    // Restoring must not reset the counters, or the next created record would
    // be handed an id that already exists.
    seedAll();
    const snapshot = JSON.parse(JSON.stringify(snapshotDb()));
    resetDb();
    hydrateDb(snapshot);
    expect(db.roles.some((r) => r.id === id('ROLE', 3))).toBe(false);
  });
});

describe('seed', () => {
  it('is deterministic across runs', () => {
    seedAll();
    const first = db.sellers.map((s) => `${s.id}:${s.storeName}:${s.gmv30dPaise}`);
    seedAll();
    const second = db.sellers.map((s) => `${s.id}:${s.storeName}:${s.gmv30dPaise}`);
    expect(second).toEqual(first);
  });

  it('covers every seller lifecycle state', () => {
    seedAll();
    const states = new Set(db.sellers.map((s) => s.status));
    for (const expected of [
      'ACTIVE',
      'APPLIED',
      'UNDER_REVIEW',
      'ON_HOLD',
      'SUSPENDED',
      'BLACKLISTED',
    ]) {
      expect(states.has(expected), `missing seller state ${expected}`).toBe(true);
    }
  });

  it('builds a three-level category tree', () => {
    seedAll();
    const levels = new Set(db.categories.map((c) => c.level));
    expect(levels).toEqual(new Set([1, 2, 3]));
    const leaf = db.categories.find((c) => c.level === 3);
    const mid = db.categories.find((c) => c.id === leaf.parentId);
    expect(mid.level).toBe(2);
  });

  it('seeds pending approvals raised by someone other than the approver', () => {
    seedAll();
    const pending = db.approvalRequests.filter((a) => a.status === 'PENDING');
    expect(pending.length).toBeGreaterThan(3);
    const approver = db.adminUsers.find((u) => u.email === 'approver@arise.test');
    expect(pending.every((a) => a.requestedById !== approver.id)).toBe(true);
  });
});
