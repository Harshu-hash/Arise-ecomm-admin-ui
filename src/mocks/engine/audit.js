import { id, insert } from '../db/store';
import { mockNowIso } from './settings';

/**
 * Audit writer. Every mutation and every PII reveal goes through here
 * (plan §12.5). Entries are append-only; there is no update or delete.
 */

/** Field-level diff, shallow, ignoring bookkeeping fields. */
export function diffOf(before, after, ignore = ['version', 'updatedAt']) {
  const changes = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (ignore.includes(key)) continue;
    const from = before?.[key];
    const to = after?.[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes.push({ field: key, from: from ?? null, to: to ?? null });
  }
  return changes;
}

/**
 * @param {object} args
 * @param {object|null} args.actor        the admin user performing the action
 * @param {string} args.action            e.g. 'seller.approve'
 * @param {string} args.entityType        e.g. 'seller'
 * @param {string} args.entityId
 * @param {string} [args.entityLabel]     human-readable name for the log list
 * @param {Array}  [args.changes]         from diffOf()
 * @param {string} [args.reason]
 * @param {object} [args.metadata]
 */
export function writeAudit({
  actor,
  action,
  entityType,
  entityId,
  entityLabel,
  changes = [],
  reason = null,
  metadata = null,
  severity = 'info',
}) {
  return insert('auditEvents', {
    id: id('AUD', 8),
    at: mockNowIso(),
    actorId: actor?.id ?? 'system',
    actorName: actor?.name ?? 'System',
    actorEmail: actor?.email ?? null,
    action,
    module: action.split('.')[0],
    entityType,
    entityId,
    entityLabel: entityLabel ?? entityId,
    changes,
    reason,
    metadata,
    severity,
    ip: '103.21.58.14',
  });
}

/** Convenience wrapper for the PII-reveal trail. */
export function writePiiReveal({ actor, kind, entityType, entityId, entityLabel }) {
  return writeAudit({
    actor,
    action: 'pii.reveal',
    entityType,
    entityId,
    entityLabel,
    metadata: { kind },
    severity: 'warning',
  });
}
