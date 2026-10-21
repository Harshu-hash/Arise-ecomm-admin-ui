import { db } from '../db/store';
import { mockNow } from './settings';

/**
 * Evaluates a segment's rule tree against the customer base.
 *
 * One evaluator backs three things — the Segments screen's live count, a
 * coupon's audience check, and a campaign's reach estimate — so a segment
 * can never show one member count on its own page and a different one when
 * a coupon targets it.
 *
 * A rule tree is `{ match: 'ALL' | 'ANY', conditions: [...] }` where each
 * condition is either a leaf `{ field, op, value }` or another group. Fields
 * read straight off the customer record; there is no joined data here on
 * purpose — anything that needs an order or a wallet lookup is rolled up
 * onto the customer at seed/handler time (`ordersCount`, `gmvPaise`,
 * `lastOrderAt`, `walletBalancePaise`), the same way the rest of the panel
 * avoids N+1 joins in a list.
 */

const FIELD_TYPES = {
  city: 'string',
  state: 'string',
  platform: 'string',
  joinedAt: 'date',
  ordersCount: 'number',
  gmvPaise: 'number',
  lastOrderAt: 'date',
  walletBalancePaise: 'number',
  riskScore: 'number',
  languagePreference: 'string',
};

function daysAgo(n) {
  return mockNow() - n * 86400_000;
}

function evalLeaf(customer, { field, op, value }) {
  const type = FIELD_TYPES[field] ?? 'string';
  const raw = customer[field];

  if (op === 'is_null') return raw === null || raw === undefined;
  if (op === 'not_null') return raw !== null && raw !== undefined;

  if (type === 'date') {
    // `value` for a date field is "days ago" (e.g. "last order within 30
    // days"), not a calendar date — that is what the rule builder's inputs
    // actually collect, and what "inactive 30 days" means in the spec.
    const at = raw ? new Date(raw).getTime() : null;
    if (op === 'within_days') return at !== null && at >= daysAgo(Number(value));
    if (op === 'before_days') return at === null || at < daysAgo(Number(value));
    return false;
  }

  if (type === 'number') {
    const n = Number(raw ?? 0);
    const v = Number(value);
    if (op === 'gte') return n >= v;
    if (op === 'lte') return n <= v;
    if (op === 'eq') return n === v;
    return false;
  }

  // string
  if (op === 'eq') return String(raw ?? '').toLowerCase() === String(value).toLowerCase();
  if (op === 'in') return (Array.isArray(value) ? value : [value]).some(
    (v) => String(v).toLowerCase() === String(raw ?? '').toLowerCase(),
  );
  return false;
}

function evalNode(customer, node) {
  if (!node) return true;
  if (node.field) return evalLeaf(customer, node);

  const results = (node.conditions ?? []).map((c) => evalNode(customer, c));
  return node.match === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}

/** Every customer matching the rule tree. ACTIVE only — a blocked account is never a campaign target. */
export function matchSegment(rule, { includeBlocked = false } = {}) {
  return db.customers.filter(
    (c) => (includeBlocked || c.status !== 'BLOCKED') && evalNode(c, rule),
  );
}

export function segmentMemberCount(rule, opts) {
  return matchSegment(rule, opts).length;
}

/**
 * Resolves a coupon or campaign's audience to a concrete customer id list.
 * `ALL` is every active customer; `NEW` is nobody who has ordered before;
 * `SEGMENT` defers to the rule above; `CUSTOM` is an explicit list.
 */
export function resolveAudience(audience) {
  if (!audience) return [];
  if (audience.type === 'ALL') return db.customers.filter((c) => c.status !== 'BLOCKED').map((c) => c.id);
  if (audience.type === 'NEW') {
    return db.customers.filter((c) => c.status !== 'BLOCKED' && c.ordersCount === 0).map((c) => c.id);
  }
  if (audience.type === 'SEGMENT') {
    const segment = db.segments.find((s) => s.id === audience.segmentId);
    return segment ? matchSegment(segment.rule).map((c) => c.id) : [];
  }
  if (audience.type === 'CUSTOM') return audience.customerIds ?? [];
  return [];
}
