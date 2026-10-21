import { db, findById, id, insert, update } from '../db/store';
import { mockNow, mockNowIso } from './settings';
import { writeAudit } from './audit';

/**
 * Maker-checker engine (plan §12.4).
 *
 * A guarded action calls `requiresApproval()`; if true it creates a request
 * and the handler answers 202 instead of performing the change. When an
 * approver approves, `applyApproval()` runs the stored executor.
 */

const EXPIRY_HOURS = 72;

/**
 * Action registry. `threshold` is read from platform settings where relevant;
 * `always: true` means the action is never performed unilaterally.
 */
export const GUARDED_ACTIONS = {
  'refund.issue': { label: 'Issue refund', limitKey: 'refundLimit', approverPerm: 'finance.refund.issue' },
  'refund.goodwill': { label: 'Issue goodwill refund', always: true, approverPerm: 'finance.refund.issue' },
  'wallet.adjust': { label: 'Manual wallet credit / debit', limitKey: 'walletAdjustLimit', approverPerm: 'wallet.adjust.create' },
  'payout.release': { label: 'Release payout batch', always: true, approverPerm: 'finance.payout.approve' },
  // A manual adjustment moves real money against a seller's payout, so
  // anything above ₹10,000 needs a second pair of eyes.
  'payout.adjust': { label: 'Manual payout adjustment', amountThreshold: 1000000, approverPerm: 'finance.payout.adjust' },
  'payout.hold': { label: 'Hold / release seller payouts', always: true, approverPerm: 'finance.payout.hold' },
  'commission.edit': { label: 'Change commission or fee rules', always: true, approverPerm: 'finance.commission.edit' },
  'seller.suspend': { label: 'Suspend seller', always: true, approverPerm: 'sellers.seller.suspend' },
  'seller.blacklist': { label: 'Blacklist seller', always: true, approverPerm: 'sellers.seller.blacklist' },
  'product.bulk_override': { label: 'Bulk price / stock override', always: true, approverPerm: 'catalog.product.bulk_edit' },
  'role.change': { label: 'Change role permissions', always: true, approverPerm: 'admin.role.edit' },
  'giftcard.generate': { label: 'Generate gift card batch', amountThreshold: 10000000, approverPerm: 'wallet.giftcard.generate' },
  'settings.edit': { label: 'Change platform settings', always: true, approverPerm: 'admin.settings.edit' },
  // Rolling back the home layout changes what every customer sees the
  // moment it lands, with no way to know in advance what broke — the only
  // guarded CMS action in Phase 5, per the permission catalog.
  'cms.home.rollback': { label: 'Roll back the home layout', always: true, approverPerm: 'cms.home.publish' },
  // A floor-price change moves what every advertiser in a category pays,
  // platform-wide — the one guarded ads action, per the permission catalog.
  'ads.placement.edit': { label: 'Change placement floor price', always: true, approverPerm: 'ads.placement.edit' },
  'appconfig.maintenance': { label: 'Toggle maintenance mode', always: true, approverPerm: 'admin.appconfig.maintenance' },
  'integration.edit': { label: 'Change integration credentials', always: true, approverPerm: 'admin.integration.edit' },
  // Changing buy-box weights or the Arise Assured thresholds moves which
  // seller wins the sale on every shared product page platform-wide.
  'catalog.rules.edit': { label: 'Change buy-box & badge rules', always: true, approverPerm: 'catalog.rules.edit' },
};

/**
 * Decides whether `actionKey` needs approval for this actor and amount.
 * Super Admins still go through `always` actions — four-eyes is the point.
 */
export function requiresApproval(actionKey, { actor, amountPaise = null }) {
  const rule = GUARDED_ACTIONS[actionKey];
  if (!rule) return false;
  if (rule.always) return true;

  if (rule.amountThreshold !== undefined && amountPaise !== null) {
    return amountPaise > rule.amountThreshold;
  }
  if (rule.limitKey && amountPaise !== null) {
    const limit = actor?.scope?.[rule.limitKey];
    if (limit === null || limit === undefined) return false;
    return amountPaise > limit;
  }
  return false;
}

/** Pending executors, keyed by approval id. Lost on reload, by design: a
 *  restored snapshot re-derives the effect from `payload` instead. */
const executors = new Map();

export function createApproval({
  actionKey,
  actor,
  entityType,
  entityId,
  entityLabel,
  reason,
  summary,
  diff = [],
  amountPaise = null,
  payload = null,
  execute = null,
}) {
  const rule = GUARDED_ACTIONS[actionKey] ?? {};
  const approval = insert('approvalRequests', {
    id: id('APR', 6),
    actionKey,
    actionLabel: rule.label ?? actionKey,
    approverPermission: rule.approverPerm ?? null,
    status: 'PENDING',
    requestedById: actor?.id ?? 'system',
    requestedByName: actor?.name ?? 'System',
    requestedAt: mockNowIso(),
    expiresAt: new Date(mockNow() + EXPIRY_HOURS * 3600 * 1000).toISOString(),
    decidedAt: null,
    decidedById: null,
    decidedByName: null,
    decisionReason: null,
    entityType,
    entityId,
    entityLabel: entityLabel ?? entityId,
    reason: reason ?? null,
    summary: summary ?? null,
    diff,
    amountPaise,
    payload,
    version: 1,
  });

  if (execute) executors.set(approval.id, execute);

  writeAudit({
    actor,
    action: 'approval.request',
    entityType: 'approvalRequest',
    entityId: approval.id,
    entityLabel: approval.actionLabel,
    reason,
    metadata: { actionKey, entityType, entityId, amountPaise },
  });

  return approval;
}

export function decideApproval({ approvalId, approver, approve, reason }) {
  const approval = findById('approvalRequests', approvalId);
  if (!approval) return { error: 'not_found' };
  if (approval.status !== 'PENDING') return { error: 'already_decided', approval };
  if (approval.requestedById === approver.id) return { error: 'self_approval', approval };
  if (new Date(approval.expiresAt).getTime() <= mockNow()) {
    update('approvalRequests', approvalId, { status: 'EXPIRED' });
    return { error: 'expired', approval };
  }

  update('approvalRequests', approvalId, {
    status: approve ? 'APPROVED' : 'REJECTED',
    decidedAt: mockNowIso(),
    decidedById: approver.id,
    decidedByName: approver.name,
    decisionReason: reason ?? null,
  });

  let effectError = null;
  if (approve) {
    const execute = executors.get(approvalId);
    if (execute) {
      try {
        execute(approval);
      } catch (e) {
        effectError = e?.message ?? 'Execution failed';
      }
      executors.delete(approvalId);
    } else {
      // Snapshot restored since the request was raised: nothing to replay.
      effectError = 'pending_restart';
    }
  }

  writeAudit({
    actor: approver,
    action: approve ? 'approval.approve' : 'approval.reject',
    entityType: 'approvalRequest',
    entityId: approvalId,
    entityLabel: approval.actionLabel,
    reason,
    metadata: { actionKey: approval.actionKey, effectError },
    severity: approve ? 'info' : 'warning',
  });

  return { approval: findById('approvalRequests', approvalId), effectError };
}

/** Expires anything past its window; called before approval list reads. */
export function expireStaleApprovals() {
  const now = mockNow();
  for (const a of db.approvalRequests) {
    if (a.status === 'PENDING' && new Date(a.expiresAt).getTime() <= now) a.status = 'EXPIRED';
  }
}

/**
 * Whether this caller may decide this request. Being a checker needs two
 * things: the general right to act as one, and the specific permission for the
 * action being approved — rubber-stamping a seller suspension should not be
 * open to anyone who merely has an approvals inbox.
 */
export function canDecideApproval(approval, user, permissions) {
  if (approval.requestedById === user.id) return false;
  if (permissions.includes('*')) return true;
  if (!permissions.includes('admin.approval.decide')) return false;
  return !approval.approverPermission || permissions.includes(approval.approverPermission);
}

/**
 * The "pending my approval" set. It uses exactly the rule above, so the inbox
 * and its badge never promise an action the decide endpoint will refuse.
 */
export function pendingForApprover(user, permissions) {
  expireStaleApprovals();
  return db.approvalRequests.filter(
    (a) => a.status === 'PENDING' && canDecideApproval(a, user, permissions),
  );
}
