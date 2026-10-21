import { http as mswHttp } from 'msw';
import { db, filter, findById, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Referral program (M10.5): config, the referral list, and fraud review. */

export const referralHandlers = [
  mswHttp.get(`${BASE}/referral/config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.referral.view');
    if (g.response) return g.response;
    return ok(findById('referralConfig', 'referral'));
  }),

  mswHttp.patch(`${BASE}/referral/config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.referral.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const config = findById('referralConfig', 'referral');
    if (!config) return notFound('Referral configuration is missing.');

    const patch = {};
    for (const key of [
      'referrerRewardPaise', 'refereeRewardType', 'refereeRewardPaise',
      'maxReferralsPerMonth', 'validityDays', 'terms',
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('referralConfig', 'referral', patch);
    writeAudit({ actor: g.user, action: 'referral.config_edit', entityType: 'referralConfig', entityId: 'referral', entityLabel: 'Referral program' });
    scheduleSave();
    return ok(findById('referralConfig', 'referral'));
  }),

  mswHttp.get(`${BASE}/referrals`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.referral.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(db.referrals, query, {
      searchFields: ['code', 'referrerName', 'refereeName'],
      filterSpec: { status: 'status' },
      sortable: ['createdAt', 'rewardedAt'],
      facetFields: ['status'],
    });
    return okList(result.items, {
      ...result.meta,
      summary: {
        rewardedPaise: filter('referrals', (r) => r.status === 'REWARDED').reduce((n, r) => n + (r.rewardPaise ?? 0), 0),
        flaggedCount: filter('referrals', (r) => r.status === 'REJECTED_FRAUD').length,
      },
    });
  }),

  /** Approve/reject a referral auto-held for a fraud signal (same device/address/instrument). */
  mswHttp.post(`${BASE}/referrals/:referralId/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.referral.decide');
    if (g.response) return g.response;

    const body = await request.json();
    const referral = findById('referrals', params.referralId);
    if (!referral) return notFound('That referral no longer exists.');
    if (!['QUALIFIED', 'FRAUD_REVIEW'].includes(referral.status)) {
      return conflict('This referral is not awaiting a decision.', 'ILLEGAL_TRANSITION');
    }
    if (!['REWARDED', 'REJECTED_FRAUD'].includes(body.decision)) return validationFailed({ decision: 'Approve or reject.' });
    if (body.decision === 'REJECTED_FRAUD' && !body.reason?.trim()) return validationFailed({ reason: 'Say why this looks fraudulent.' });

    const config = findById('referralConfig', 'referral');
    update('referrals', referral.id, {
      status: body.decision,
      rewardPaise: body.decision === 'REWARDED' ? config.referrerRewardPaise : null,
      fraudReason: body.decision === 'REJECTED_FRAUD' ? body.reason : referral.fraudReason,
      rewardedAt: body.decision === 'REWARDED' ? mockNowIso() : null,
    });
    writeAudit({
      actor: g.user, action: 'referral.decide', entityType: 'referral',
      entityId: referral.id, entityLabel: referral.code, reason: body.reason,
      metadata: { decision: body.decision },
    });
    scheduleSave();
    return ok(findById('referrals', referral.id));
  }),
];
