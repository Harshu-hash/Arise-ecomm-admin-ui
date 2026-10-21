import { http as mswHttp } from 'msw';
import { db, findById } from '../db/store';
import {
  canDecideApproval,
  decideApproval,
  expireStaleApprovals,
  pendingForApprover,
} from '../engine/approvals';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, forbidden, notFound, ok, okList, validationFailed } from '../engine/respond';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

const canDecide = canDecideApproval;

export const approvalHandlers = [
  mswHttp.get(`${BASE}/approvals`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.approval.view');
    if (g.response) return g.response;
    expireStaleApprovals();

    const url = new URL(request.url);
    const view = url.searchParams.get('view') ?? 'pending_mine';
    const query = parseListQuery(url, { defaultSort: '-requestedAt' });

    let rows = db.approvalRequests;
    if (view === 'pending_mine') rows = pendingForApprover(g.user, g.permissions);
    else if (view === 'raised_by_me') rows = rows.filter((a) => a.requestedById === g.user.id);

    const { items, meta } = listResult(
      rows.map((a) => ({ ...a, canDecide: canDecide(a, g.user, g.permissions) })),
      query,
      {
        searchFields: ['actionLabel', 'entityLabel', 'entityId', 'requestedByName', 'summary'],
        filterSpec: {
          status: 'status',
          actionKey: 'actionKey',
          requestedById: 'requestedById',
          requestedAt: { path: 'requestedAt', kind: 'date' },
        },
        sortable: ['requestedAt', 'expiresAt', 'amountPaise', 'status', 'actionLabel'],
        facetFields: ['status', 'actionKey'],
      },
    );

    return okList(items, {
      ...meta,
      counts: {
        pendingMine: pendingForApprover(g.user, g.permissions).length,
        raisedByMe: db.approvalRequests.filter((a) => a.requestedById === g.user.id && a.status === 'PENDING').length,
      },
    });
  }),

  mswHttp.get(`${BASE}/approvals/counts`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.approval.view');
    if (g.response) return g.response;
    expireStaleApprovals();
    return ok({
      pendingMine: pendingForApprover(g.user, g.permissions).length,
      raisedByMe: db.approvalRequests.filter((a) => a.requestedById === g.user.id && a.status === 'PENDING').length,
    });
  }),

  mswHttp.get(`${BASE}/approvals/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.approval.view');
    if (g.response) return g.response;

    const approval = findById('approvalRequests', params.id);
    if (!approval) return notFound('That approval request no longer exists.');

    const decidable = canDecide(approval, g.user, g.permissions);
    return ok(
      { ...approval, canDecide: decidable },
      {
        allowedActions: approval.status === 'PENDING' && decidable ? ['APPROVE', 'REJECT'] : [],
        // Spelling out why the buttons are missing beats a silent empty toolbar.
        blockedReason:
          approval.status !== 'PENDING'
            ? `This request was already ${approval.status.toLowerCase()}.`
            : approval.requestedById === g.user.id
              ? 'You raised this request, so you cannot approve it yourself.'
              : !decidable
                ? 'You do not hold the permission required to approve this action.'
                : null,
      },
    );
  }),

  mswHttp.post(`${BASE}/approvals/:id/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.approval.decide');
    if (g.response) return g.response;

    const body = await request.json();
    const approve = Boolean(body?.approve);
    if (!approve && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Give a reason for rejecting this request.' });
    }

    const approval = findById('approvalRequests', params.id);
    if (!approval) return notFound('That approval request no longer exists.');
    if (!canDecide(approval, g.user, g.permissions)) {
      return forbidden(
        approval.requestedById === g.user.id
          ? 'You raised this request, so you cannot approve it yourself.'
          : 'You do not hold the permission required to approve this action.',
      );
    }

    const result = decideApproval({
      approvalId: params.id,
      approver: g.user,
      approve,
      reason: body?.reason,
    });

    if (result.error === 'already_decided') {
      return conflict(`This request was already ${result.approval.status.toLowerCase()}.`, 'ALREADY_DECIDED');
    }
    if (result.error === 'self_approval') {
      return forbidden('You raised this request, so you cannot approve it yourself.');
    }
    if (result.error === 'expired') return conflict('This request has expired.', 'APPROVAL_EXPIRED');
    if (result.error === 'not_found') return notFound('That approval request no longer exists.');

    scheduleSave();
    return ok(result.approval, {
      // A snapshot restore loses the queued executor; say so rather than
      // reporting a success that did not happen.
      effectWarning:
        result.effectError === 'pending_restart'
          ? 'Approved, but the original change could not be replayed because the mock server restarted. Ask the requester to raise it again.'
          : (result.effectError ?? null),
    });
  }),

  mswHttp.post(`${BASE}/approvals/:id/cancel`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.approval.view');
    if (g.response) return g.response;

    const approval = findById('approvalRequests', params.id);
    if (!approval) return notFound('That approval request no longer exists.');
    if (approval.requestedById !== g.user.id) {
      return forbidden('Only the person who raised a request can cancel it.');
    }
    if (approval.status !== 'PENDING') {
      return conflict(`This request was already ${approval.status.toLowerCase()}.`, 'ALREADY_DECIDED');
    }

    approval.status = 'CANCELLED';
    scheduleSave();
    return ok(approval);
  }),
];
