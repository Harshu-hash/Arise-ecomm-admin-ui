import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  notFound,
  ok,
  okList,
  validationFailed,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

export const sellerOpsHandlers = [
  /* ------------------------------------------------------ brand approvals */
  mswHttp.get(`${BASE}/brand-requests`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.brandapproval.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'submittedAt' });
    const { items, meta } = listResult(db.brandRequests, query, {
      searchFields: ['sellerName', 'brandName', 'id'],
      filterSpec: {
        status: 'status',
        requestType: 'requestType',
        brandId: 'brandId',
        submittedAt: { path: 'submittedAt', kind: 'date' },
      },
      sortable: ['submittedAt', 'sellerName', 'brandName', 'status'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/brand-requests/:id/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), [
      'sellers.brandapproval.approve',
      'sellers.brandapproval.reject',
    ]);
    if (g.response) return g.response;

    const row = findById('brandRequests', params.id);
    if (!row) return notFound('That request no longer exists.');
    if (row.status !== 'PENDING' && row.status !== 'INFO_REQUESTED') {
      return conflict(`This request was already ${row.status.toLowerCase()}.`, 'ALREADY_DECIDED');
    }

    const body = await request.json();
    const decision = body?.decision;
    if (!['APPROVED', 'REJECTED', 'INFO_REQUESTED'].includes(decision)) {
      return validationFailed({ decision: 'Choose approve, reject or request more documents.' });
    }
    if (decision !== 'APPROVED' && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Tell the seller what is missing.' });
    }
    if (decision === 'APPROVED' && !body?.validTill) {
      // An authorisation without an end date silently becomes permanent.
      return validationFailed({ validTill: 'Set the date this authorisation expires.' });
    }

    update('brandRequests', row.id, {
      status: decision,
      validTill: decision === 'APPROVED' ? body.validTill : null,
      decisionReason: decision === 'APPROVED' ? null : body.reason,
      decidedAt: mockNowIso(),
      decidedByName: g.user.name,
    });
    writeAudit({
      actor: g.user,
      action: `sellers.brandapproval.${decision.toLowerCase()}`,
      entityType: 'brandRequest',
      entityId: row.id,
      entityLabel: `${row.sellerName} → ${row.brandName}`,
      reason: body.reason ?? null,
    });
    scheduleSave();
    return ok(findById('brandRequests', row.id));
  }),

  /* ------------------------------------------------------------ penalties */
  mswHttp.get(`${BASE}/penalties`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.penalty.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-appliedAt' });
    const { items, meta } = listResult(db.penalties, query, {
      searchFields: ['sellerName', 'orderId', 'violationLabel', 'id'],
      filterSpec: {
        status: 'status',
        violationCode: 'violationCode',
        sellerId: 'sellerId',
        appliedAt: { path: 'appliedAt', kind: 'date' },
        amountPaise: { path: 'amountPaise' },
      },
      sortable: ['appliedAt', 'amountPaise', 'sellerName', 'status'],
      facetFields: ['status', 'violationCode'],
    });
    return okList(items, {
      ...meta,
      totals: {
        appliedPaise: db.penalties
          .filter((p) => p.status === 'APPLIED')
          .reduce((n, p) => n + p.amountPaise, 0),
        disputed: db.penalties.filter((p) => p.status === 'DISPUTED').length,
      },
    });
  }),

  mswHttp.post(`${BASE}/penalties`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.penalty.create');
    if (g.response) return g.response;

    const body = await request.json();
    const fieldErrors = {};
    const seller = findById('sellers', body?.sellerId);
    if (!seller) fieldErrors.sellerId = 'Choose a seller.';
    if (!body?.violationCode) fieldErrors.violationCode = 'Choose the violation.';
    if (!body?.amountPaise || body.amountPaise <= 0) fieldErrors.amountPaise = 'Enter an amount.';
    if (!String(body?.evidence ?? '').trim()) fieldErrors.evidence = 'Record the evidence.';
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const row = insert('penalties', {
      id: id('PEN', 6),
      sellerId: seller.id,
      sellerName: seller.storeName,
      violationCode: body.violationCode,
      violationLabel: body.violationLabel ?? body.violationCode,
      orderId: body.orderId ?? null,
      amountPaise: body.amountPaise,
      status: 'APPLIED',
      appliedAt: mockNowIso(),
      evidence: body.evidence,
      disputeReason: null,
      waivedByName: null,
      waivedReason: null,
      version: 1,
    });
    writeAudit({
      actor: g.user,
      action: 'sellers.penalty.create',
      entityType: 'penalty',
      entityId: row.id,
      entityLabel: `${seller.storeName} — ${row.violationLabel}`,
      metadata: { amountPaise: row.amountPaise },
      severity: 'warning',
    });
    scheduleSave();
    return ok(row);
  }),

  /** Waiving a penalty returns money, so it goes through maker-checker. */
  mswHttp.post(`${BASE}/penalties/:id/waive`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.penalty.waive');
    if (g.response) return g.response;

    const row = findById('penalties', params.id);
    if (!row) return notFound('That penalty no longer exists.');
    if (['WAIVED', 'RECOVERED'].includes(row.status)) {
      return conflict(`This penalty was already ${row.status.toLowerCase()}.`, 'ALREADY_DECIDED');
    }
    const body = await request.json();
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });

    const approval = createApproval({
      actionKey: 'seller.suspend',
      actor: g.user,
      entityType: 'penalty',
      entityId: row.id,
      entityLabel: `${row.sellerName} — ${row.violationLabel}`,
      reason: body.reason,
      summary: `Waive a penalty on ${row.sellerName}`,
      amountPaise: row.amountPaise,
      diff: [{ field: 'status', from: row.status, to: 'WAIVED' }],
      execute: () => {
        update('penalties', row.id, {
          status: 'WAIVED',
          waivedByName: g.user.name,
          waivedReason: body.reason,
        });
        writeAudit({
          actor: g.user,
          action: 'sellers.penalty.waive',
          entityType: 'penalty',
          entityId: row.id,
          entityLabel: row.sellerName,
          reason: body.reason,
          severity: 'warning',
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  /* --------------------------------------------------------------- claims */
  mswHttp.get(`${BASE}/seller-claims`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.claim.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'submittedAt' });
    const rows = db.sellerClaims.map((c) => ({
      ...c,
      ageDays: Math.floor((mockNow() - new Date(c.submittedAt).getTime()) / 86400_000),
    }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['sellerName', 'orderId', 'typeLabel', 'id'],
      filterSpec: {
        status: 'status',
        type: 'type',
        sellerId: 'sellerId',
        submittedAt: { path: 'submittedAt', kind: 'date' },
      },
      sortable: ['submittedAt', 'amountClaimedPaise', 'sellerName', 'status', 'ageDays'],
      facetFields: ['status', 'type'],
    });
    return okList(items, meta);
  }),

  mswHttp.post(`${BASE}/seller-claims/:id/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'sellers.claim.decide');
    if (g.response) return g.response;

    const row = findById('sellerClaims', params.id);
    if (!row) return notFound('That claim no longer exists.');
    if (['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'REIMBURSED'].includes(row.status)) {
      return conflict('This claim has already been decided.', 'ALREADY_DECIDED');
    }

    const body = await request.json();
    const decision = body?.decision;
    if (!['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'INFO_REQUESTED'].includes(decision)) {
      return validationFailed({ decision: 'Choose a decision.' });
    }
    if (decision !== 'APPROVED' && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Explain the decision to the seller.' });
    }

    let approved = null;
    if (decision === 'APPROVED') approved = row.amountClaimedPaise;
    if (decision === 'PARTIALLY_APPROVED') {
      approved = Number(body?.amountApprovedPaise ?? 0);
      if (!approved || approved <= 0) {
        return validationFailed({ amountApprovedPaise: 'Enter the amount you are approving.' });
      }
      // Reimbursing more than the claim would be a silent overpayment.
      if (approved >= row.amountClaimedPaise) {
        return validationFailed({
          amountApprovedPaise: 'A partial approval must be less than the amount claimed.',
        });
      }
    }

    update('sellerClaims', row.id, {
      status: decision,
      amountApprovedPaise: approved,
      decisionReason: decision === 'APPROVED' ? null : body.reason,
      decidedAt: mockNowIso(),
      decidedByName: g.user.name,
    });
    writeAudit({
      actor: g.user,
      action: 'sellers.claim.decide',
      entityType: 'sellerClaim',
      entityId: row.id,
      entityLabel: `${row.sellerName} — ${row.typeLabel}`,
      reason: body.reason ?? null,
      metadata: { decision, amountApprovedPaise: approved },
    });
    scheduleSave();
    return ok(findById('sellerClaims', row.id));
  }),

  /* --------------------------------------------------- performance & SLA */
  mswHttp.get(`${BASE}/sellers/performance`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'sellers.seller.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-cancellationPct' });
    const allowed = g.user.scope?.sellers;

    const rows = db.sellers
      .filter((s) => s.status === 'ACTIVE')
      .filter((s) => !allowed?.length || allowed.includes(s.id))
      .map((s) => {
        // Order defect rate: the single number marketplaces manage sellers on.
        const odr = Number((s.cancellationPct * 0.5 + s.returnPct * 0.3 + s.lateDispatchPct * 0.2).toFixed(2));
        const breaches = [];
        if (s.cancellationPct > 2) breaches.push('Cancellations above 2%');
        if (s.lateDispatchPct > 4) breaches.push('Late dispatch above 4%');
        if (s.returnPct > 8) breaches.push('Returns above 8%');
        if ((s.rating ?? 5) < 3.8) breaches.push('Rating below 3.8');
        return {
          id: s.id,
          storeName: s.storeName,
          tier: s.tier,
          rating: s.rating,
          orders30d: s.orders30d,
          gmv30dPaise: s.gmv30dPaise,
          cancellationPct: s.cancellationPct,
          lateDispatchPct: s.lateDispatchPct,
          returnPct: s.returnPct,
          odr,
          breaches,
          health: breaches.length >= 2 ? 'AT_RISK' : breaches.length === 1 ? 'WATCH' : 'HEALTHY',
          openPenalties: filter('penalties', (p) => p.sellerId === s.id && p.status === 'APPLIED').length,
        };
      });

    const { items, meta } = listResult(rows, query, {
      searchFields: ['storeName', 'id'],
      filterSpec: {
        tier: 'tier',
        health: 'health',
        odr: { path: 'odr' },
        cancellationPct: { path: 'cancellationPct' },
      },
      sortable: ['storeName', 'odr', 'cancellationPct', 'lateDispatchPct', 'returnPct', 'rating', 'gmv30dPaise'],
      facetFields: ['health', 'tier'],
    });
    return okList(items, meta);
  }),
];
