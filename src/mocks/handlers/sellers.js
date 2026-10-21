import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { diffOf, writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
  versionConflict,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** The seller lifecycle from MODULE_SPECS §M4, enforced server-side. */
const TRANSITIONS = {
  APPLIED: ['DOCUMENTS_PENDING', 'UNDER_REVIEW', 'REJECTED'],
  DOCUMENTS_PENDING: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['NEEDS_INFO', 'APPROVED', 'REJECTED'],
  NEEDS_INFO: ['UNDER_REVIEW', 'REJECTED'],
  APPROVED: ['ONBOARDING'],
  ONBOARDING: ['ACTIVE'],
  ACTIVE: ['ON_HOLD', 'SUSPENDED', 'DEACTIVATED', 'BLACKLISTED'],
  ON_HOLD: ['ACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED', 'BLACKLISTED'],
  DEACTIVATED: ['ACTIVE'],
  REJECTED: [],
  BLACKLISTED: [],
};

const PRE_ACTIVE = ['APPLIED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'NEEDS_INFO'];

function can(status, next) {
  return (TRANSITIONS[status] ?? []).includes(next);
}

/** Restricts a list to the account manager's assigned sellers, when scoped. */
function applyScope(rows, user) {
  const allowed = user.scope?.sellers;
  if (!allowed?.length) return rows;
  return rows.filter((s) => allowed.includes(s.id));
}

function inScope(seller, user) {
  const allowed = user.scope?.sellers;
  return !allowed?.length || allowed.includes(seller.id);
}

/** Everything the onboarding workbench needs in one payload. */
function reviewBundle(seller) {
  const documents = filter('kycDocuments', (d) => d.sellerId === seller.id);
  const expiringSoon = documents.filter(
    (d) => d.expiresAt && new Date(d.expiresAt).getTime() - mockNow() < 30 * 86400_000,
  );
  return {
    documents,
    expiringDocuments: expiringSoon,
    addresses: filter('pickupAddresses', (a) => a.sellerId === seller.id),
    bank: filter('bankAccounts', (b) => b.sellerId === seller.id)[0] ?? null,
    brandRequests: filter('brandRequests', (r) => r.sellerId === seller.id),
    categories: (seller.requestedCategories ?? []).map((cid) => {
      const c = findById('categories', cid);
      return c ? { id: c.id, name: c.name, gated: c.gated } : null;
    }).filter(Boolean),
    // A match on PAN, GSTIN, bank account or phone is the strongest signal
    // that a blacklisted seller is trying to come back under a new name.
    duplicates: findDuplicates(seller),
  };
}

function findDuplicates(seller) {
  const bank = filter('bankAccounts', (b) => b.sellerId === seller.id)[0];
  const hits = [];
  for (const other of db.sellers) {
    if (other.id === seller.id) continue;
    const reasons = [];
    if (other.pan === seller.pan) reasons.push('PAN');
    if (other.gstin === seller.gstin) reasons.push('GSTIN');
    if (bank) {
      const otherBank = filter('bankAccounts', (b) => b.sellerId === other.id)[0];
      if (otherBank && otherBank.accountNumber === bank.accountNumber) reasons.push('bank account');
    }
    if (reasons.length) {
      hits.push({
        sellerId: other.id,
        storeName: other.storeName,
        status: other.status,
        reasons,
        blocking: other.status === 'BLACKLISTED',
      });
    }
  }
  return hits;
}

/** Blockers that must clear before an application can be approved. */
function approvalBlockers(seller) {
  const bundle = reviewBundle(seller);
  const blockers = [];
  const required = ['GST_CERTIFICATE', 'PAN_CARD', 'CANCELLED_CHEQUE', 'ADDRESS_PROOF'];

  for (const type of required) {
    const doc = bundle.documents.find((d) => d.type === type);
    if (!doc) blockers.push(`${type.replace(/_/g, ' ').toLowerCase()} has not been uploaded`);
    else if (doc.status !== 'APPROVED') blockers.push(`${doc.label} is not approved yet`);
  }
  if (seller.gstinVerification?.status !== 'ACTIVE') blockers.push('GSTIN is not active');
  if (seller.panVerification?.status !== 'VALID') blockers.push('PAN could not be verified');
  if (!bundle.bank?.verified) blockers.push('Bank account has not passed the penny drop');
  if (!bundle.addresses.length) blockers.push('No pickup address on file');
  if (bundle.duplicates.some((d) => d.blocking)) {
    blockers.push('Matches a blacklisted seller — approval is blocked');
  }
  return blockers;
}

function allowedActionsFor(seller, permissions) {
  const has = (k) => permissions.includes('*') || permissions.includes(k);
  const actions = [];
  if (PRE_ACTIVE.includes(seller.status)) {
    if (has('sellers.application.approve') && !approvalBlockers(seller).length) actions.push('APPROVE');
    if (has('sellers.application.request_info')) actions.push('REQUEST_INFO');
    if (has('sellers.application.reject')) actions.push('REJECT');
  }
  if (seller.status === 'APPROVED' && has('sellers.application.approve')) actions.push('START_ONBOARDING');
  if (seller.status === 'ONBOARDING' && has('sellers.application.approve')) actions.push('ACTIVATE');
  if (seller.status === 'ACTIVE') {
    if (has('sellers.seller.hold')) actions.push('HOLD');
    if (has('sellers.seller.suspend')) actions.push('SUSPEND');
    if (has('sellers.seller.deactivate')) actions.push('DEACTIVATE');
  }
  if (seller.status === 'ON_HOLD' && has('sellers.seller.hold')) actions.push('RELEASE_HOLD');
  if (seller.status === 'SUSPENDED' && has('sellers.seller.reactivate')) actions.push('REACTIVATE');
  if (['ACTIVE', 'SUSPENDED'].includes(seller.status) && has('sellers.seller.blacklist')) {
    actions.push('BLACKLIST');
  }
  if (has('sellers.seller.edit')) actions.push('EDIT');
  if (has('sellers.seller.note')) actions.push('NOTE');
  return actions;
}

export const sellerHandlers = [
  mswHttp.get(`${BASE}/sellers`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.seller.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-gmv30dPaise' });
    const scoped = applyScope(db.sellers, g.user);

    const { items, meta } = listResult(scoped, query, {
      searchFields: ['storeName', 'legalName', 'id', 'gstin', 'pan', 'city'],
      filterSpec: {
        status: 'status',
        tier: 'tier',
        state: 'state',
        city: 'city',
        payoutOnHold: { path: 'payoutOnHold', kind: 'boolean' },
        accountManagerId: 'accountManagerId',
        fulfillmentType: { path: 'fulfillmentTypes', kind: 'arrayContains' },
        rating: { path: 'rating' },
        cancellationPct: { path: 'cancellationPct' },
        joinedAt: { path: 'joinedAt', kind: 'date' },
        appliedAt: { path: 'appliedAt', kind: 'date' },
      },
      sortable: [
        'storeName', 'status', 'tier', 'rating', 'liveListings',
        'gmv30dPaise', 'orders30d', 'cancellationPct', 'lateDispatchPct', 'joinedAt', 'appliedAt',
      ],
      facetFields: ['status', 'tier'],
    });
    return okList(items, meta);
  }),

  /** The onboarding queue: sellers that have not been approved yet. */
  mswHttp.get(`${BASE}/sellers/applications`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.application.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'appliedAt' });
    const rows = db.sellers
      .filter((s) => [...PRE_ACTIVE, 'APPROVED', 'ONBOARDING', 'REJECTED'].includes(s.status))
      .map((s) => {
        const bundle = reviewBundle(s);
        return {
          ...s,
          documentsApproved: bundle.documents.filter((d) => d.status === 'APPROVED').length,
          documentsTotal: 4,
          gstinOk: s.gstinVerification?.status === 'ACTIVE',
          panOk: s.panVerification?.status === 'VALID',
          bankOk: Boolean(bundle.bank?.verified),
          // Onboarding SLA is 48 hours from application.
          slaDueAt: new Date(new Date(s.appliedAt).getTime() + 48 * 3600_000).toISOString(),
          blockerCount: approvalBlockers(s).length,
        };
      });

    const { items, meta } = listResult(rows, query, {
      searchFields: ['storeName', 'legalName', 'id', 'gstin', 'city'],
      filterSpec: {
        status: 'status',
        state: 'state',
        assignedToId: 'assignedToId',
        appliedAt: { path: 'appliedAt', kind: 'date' },
        slaBreached: (row, v) =>
          String(v) === 'true' ? new Date(row.slaDueAt).getTime() < mockNow() : true,
      },
      sortable: ['storeName', 'appliedAt', 'status', 'slaDueAt', 'documentsApproved'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/sellers/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.seller.view');
    if (g.response) return g.response;

    const seller = findById('sellers', params.id);
    if (!seller) return notFound('That seller no longer exists.');
    if (!inScope(seller, g.user)) {
      return conflict('This seller is outside the portfolio assigned to you.', 'OUT_OF_SCOPE');
    }

    const offers = filter('offers', (o) => o.sellerId === seller.id);
    const productIds = new Set(offers.map((o) => o.productId));

    return ok(
      {
        ...seller,
        accountManagerName: seller.accountManagerId
          ? findById('adminUsers', seller.accountManagerId)?.name
          : null,
      },
      {
        allowedActions: allowedActionsFor(seller, g.permissions),
        blockers: approvalBlockers(seller),
        ...reviewBundle(seller),
        penalties: filter('penalties', (p) => p.sellerId === seller.id),
        claims: filter('sellerClaims', (c) => c.sellerId === seller.id),
        notes: filter('sellerNotes', (n) => n.sellerId === seller.id).sort((a, b) => b.at.localeCompare(a.at)),
        counts: {
          products: productIds.size,
          offers: offers.length,
          liveOffers: offers.filter((o) => o.status === 'LIVE').length,
          openPenalties: filter('penalties', (p) => p.sellerId === seller.id && p.status === 'APPLIED').length,
          openClaims: filter('sellerClaims', (c) => c.sellerId === seller.id && !['APPROVED', 'REJECTED'].includes(c.status)).length,
        },
      },
    );
  }),

  /** Approve or reject one KYC document inside the workbench. */
  mswHttp.post(`${BASE}/sellers/:id/documents/:docId/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.kyc.verify');
    if (g.response) return g.response;

    const seller = findById('sellers', params.id);
    const doc = findById('kycDocuments', params.docId);
    if (!seller || !doc || doc.sellerId !== seller.id) return notFound('That document no longer exists.');

    const body = await request.json();
    const approve = Boolean(body?.approve);
    if (!approve && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Say what is wrong with the document.' });
    }

    update('kycDocuments', doc.id, {
      status: approve ? 'APPROVED' : 'REJECTED',
      rejectionReason: approve ? null : body.reason,
    });
    writeAudit({
      actor: g.user,
      action: approve ? 'sellers.kyc.approve_document' : 'sellers.kyc.reject_document',
      entityType: 'seller',
      entityId: seller.id,
      entityLabel: `${seller.storeName} — ${doc.label}`,
      reason: approve ? null : body.reason,
    });
    scheduleSave();
    return ok(findById('kycDocuments', doc.id), { blockers: approvalBlockers(seller) });
  }),

  /** Application decisions: approve, request info, reject. */
  mswHttp.post(`${BASE}/sellers/:id/application/:decision`, async ({ request, params }) => {
    const permission =
      params.decision === 'approve'
        ? 'sellers.application.approve'
        : params.decision === 'reject'
          ? 'sellers.application.reject'
          : 'sellers.application.request_info';

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    const seller = findById('sellers', params.id);
    if (!seller) return notFound('That seller no longer exists.');
    const body = await request.json().catch(() => ({}));

    if (params.decision === 'approve') {
      // Blockers are checked before the transition: "these four things are
      // outstanding" tells a reviewer what to do next, where "illegal
      // transition" only tells them the button should not have been there.
      const blockers = approvalBlockers(seller);
      if (blockers.length) {
        return conflict('This application still has unresolved blockers.', 'APPROVAL_BLOCKED', {
          details: { blockers },
        });
      }
      if (!can(seller.status, 'APPROVED')) return illegalTransition(seller.status, 'approve');
      const before = { ...seller };
      update('sellers', seller.id, {
        status: 'APPROVED',
        approvedAt: mockNowIso(),
        commissionPlan: body.commissionPlan ?? 'STANDARD',
        tier: body.tier ?? 'BRONZE',
      });
      writeAudit({
        actor: g.user,
        action: 'sellers.application.approve',
        entityType: 'seller',
        entityId: seller.id,
        entityLabel: seller.storeName,
        changes: diffOf(before, findById('sellers', seller.id)),
      });
      scheduleSave();
      return ok(findById('sellers', seller.id));
    }

    if (params.decision === 'reject') {
      if (!can(seller.status, 'REJECTED')) return illegalTransition(seller.status, 'reject');
      if (!String(body?.reason ?? '').trim()) {
        return validationFailed({ reason: 'Give a reason the applicant can act on.' });
      }
      update('sellers', seller.id, { status: 'REJECTED', rejectionReason: body.reason });
      writeAudit({
        actor: g.user,
        action: 'sellers.application.reject',
        entityType: 'seller',
        entityId: seller.id,
        entityLabel: seller.storeName,
        reason: body.reason,
        severity: 'warning',
      });
      scheduleSave();
      return ok(findById('sellers', seller.id));
    }

    // request-info
    if (!can(seller.status, 'NEEDS_INFO')) return illegalTransition(seller.status, 'request info');
    if (!body?.items?.length) {
      return validationFailed({ items: 'Pick at least one thing the seller needs to fix.' });
    }
    update('sellers', seller.id, { status: 'NEEDS_INFO', infoRequested: body.items });
    writeAudit({
      actor: g.user,
      action: 'sellers.application.request_info',
      entityType: 'seller',
      entityId: seller.id,
      entityLabel: seller.storeName,
      metadata: { items: body.items },
    });
    scheduleSave();
    return ok(findById('sellers', seller.id));
  }),

  /** Lifecycle verbs on a live seller. Suspension and blacklisting are four-eyed. */
  mswHttp.post(`${BASE}/sellers/:id/lifecycle/:action`, async ({ request, params }) => {
    const map = {
      'start-onboarding': ['ONBOARDING', 'sellers.application.approve', false],
      activate: ['ACTIVE', 'sellers.application.approve', false],
      hold: ['ON_HOLD', 'sellers.seller.hold', false],
      'release-hold': ['ACTIVE', 'sellers.seller.hold', false],
      suspend: ['SUSPENDED', 'sellers.seller.suspend', true],
      reactivate: ['ACTIVE', 'sellers.seller.reactivate', true],
      deactivate: ['DEACTIVATED', 'sellers.seller.deactivate', false],
      blacklist: ['BLACKLISTED', 'sellers.seller.blacklist', true],
    };
    const entry = map[params.action];
    if (!entry) return notFound('Unknown action.');
    const [nextStatus, permission, needsApproval] = entry;

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    const seller = findById('sellers', params.id);
    if (!seller) return notFound('That seller no longer exists.');
    if (!can(seller.status, nextStatus)) return illegalTransition(seller.status, params.action);

    const body = await request.json().catch(() => ({}));
    if (needsApproval || ['hold', 'deactivate'].includes(params.action)) {
      if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });
    }

    const apply = () => {
      const hideListings = body.hideListings !== false;
      const holdPayouts = body.holdPayouts !== false;
      const before = { ...seller };

      update('sellers', seller.id, {
        status: nextStatus,
        payoutOnHold: ['SUSPENDED', 'ON_HOLD', 'BLACKLISTED'].includes(nextStatus) ? holdPayouts : false,
        suspensionReason: nextStatus === 'SUSPENDED' ? body.reason : null,
      });

      // Suspension hides the shopfront; the listings themselves are untouched
      // so reinstating a seller restores exactly what they had.
      if (['SUSPENDED', 'BLACKLISTED'].includes(nextStatus) && hideListings) {
        for (const offer of filter('offers', (o) => o.sellerId === seller.id && o.status === 'LIVE')) {
          update('offers', offer.id, { status: 'INACTIVE', hiddenBySellerStatus: true });
        }
      }
      if (nextStatus === 'ACTIVE') {
        for (const offer of filter('offers', (o) => o.sellerId === seller.id && o.hiddenBySellerStatus)) {
          update('offers', offer.id, { status: 'LIVE', hiddenBySellerStatus: false });
        }
      }

      writeAudit({
        actor: g.user,
        action: `sellers.seller.${params.action.replace(/-/g, '_')}`,
        entityType: 'seller',
        entityId: seller.id,
        entityLabel: seller.storeName,
        reason: body.reason ?? null,
        changes: diffOf(before, findById('sellers', seller.id)),
        severity: needsApproval ? 'warning' : 'info',
      });
    };

    if (needsApproval) {
      const liveOffers = filter('offers', (o) => o.sellerId === seller.id && o.status === 'LIVE').length;
      const approval = createApproval({
        actionKey: params.action === 'blacklist' ? 'seller.blacklist' : 'seller.suspend',
        actor: g.user,
        entityType: 'seller',
        entityId: seller.id,
        entityLabel: seller.storeName,
        reason: body.reason,
        summary: `${params.action} ${seller.storeName} — hides ${liveOffers} live listings${body.holdPayouts !== false ? ' and holds payouts' : ''}`,
        diff: [{ field: 'status', from: seller.status, to: nextStatus }],
        execute: apply,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    apply();
    scheduleSave();
    return ok(findById('sellers', seller.id), {
      allowedActions: allowedActionsFor(findById('sellers', seller.id), g.permissions),
    });
  }),

  mswHttp.patch(`${BASE}/sellers/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.seller.edit');
    if (g.response) return g.response;

    const seller = findById('sellers', params.id);
    if (!seller) return notFound('That seller no longer exists.');
    const body = await request.json();
    if (body.version !== undefined && body.version !== seller.version) return versionConflict(seller);

    const before = { ...seller };
    const patch = {};
    for (const key of ['storeName', 'legalName', 'tier', 'accountManagerId', 'commissionPlan', 'payoutCycle']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('sellers', seller.id, patch);
    writeAudit({
      actor: g.user,
      action: 'sellers.seller.edit',
      entityType: 'seller',
      entityId: seller.id,
      entityLabel: seller.storeName,
      changes: diffOf(before, findById('sellers', seller.id)),
    });
    scheduleSave();
    return ok(findById('sellers', seller.id));
  }),

  mswHttp.post(`${BASE}/sellers/:id/notes`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.seller.note');
    if (g.response) return g.response;

    const seller = findById('sellers', params.id);
    if (!seller) return notFound('That seller no longer exists.');
    const body = await request.json();
    if (!String(body?.text ?? '').trim()) return validationFailed({ text: 'Write something first.' });

    const note = insert('sellerNotes', {
      id: id('SNT', 6),
      sellerId: seller.id,
      text: body.text.trim(),
      authorId: g.user.id,
      authorName: g.user.name,
      at: mockNowIso(),
    });
    scheduleSave();
    return ok(note);
  }),

  mswHttp.post(`${BASE}/sellers/:id/assign`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.application.assign');
    if (g.response) return g.response;
    const seller = findById('sellers', params.id);
    if (!seller) return notFound('That seller no longer exists.');

    const body = await request.json().catch(() => ({}));
    update('sellers', seller.id, { assignedToId: body.assignedToId ?? g.user.id });
    writeAudit({
      actor: g.user,
      action: 'sellers.application.assign',
      entityType: 'seller',
      entityId: seller.id,
      entityLabel: seller.storeName,
    });
    scheduleSave();
    return ok(findById('sellers', seller.id));
  }),
];
