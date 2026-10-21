import { http as mswHttp } from 'msw';
import { db, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, created, illegalTransition, notFound, ok, okList, validationFailed } from '../engine/respond';
import { resolveAudience } from '../engine/segments';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Campaigns (M10.6): push / SMS / email / in-app / WhatsApp broadcasts. */

const QUIET_HOURS = { startHour: 22, endHour: 8 };

function inQuietHours(iso) {
  const hour = new Date(iso).getHours();
  return hour >= QUIET_HOURS.startHour || hour < QUIET_HOURS.endHour;
}

export const campaignHandlers = [
  mswHttp.get(`${BASE}/campaigns`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'marketing.campaign.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(db.campaigns, query, {
      searchFields: ['name'],
      filterSpec: { status: 'status' },
      sortable: ['createdAt'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/campaigns/:campaignId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.campaign.view');
    if (g.response) return g.response;
    const campaign = findById('campaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    return ok(campaign);
  }),

  /** Audience reach estimate, used live while building a campaign. */
  mswHttp.post(`${BASE}/campaigns/reach`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.campaign.view');
    if (g.response) return g.response;
    const body = await request.json();
    return ok({ reach: resolveAudience(body.audience).length });
  }),

  mswHttp.post(`${BASE}/campaigns`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'marketing.campaign.create');
    if (g.response) return g.response;

    const body = await request.json();
    const errors = {};
    if (!body.name?.trim()) errors.name = 'Give the campaign a name.';
    if (!body.channels?.length) errors.channels = 'Choose at least one channel.';
    if (!body.audience) errors.audience = 'Choose an audience.';
    if (Object.keys(errors).length) return validationFailed(errors);

    const reach = resolveAudience(body.audience).length;
    const campaign = insert('campaigns', {
      id: id('CAM', 5),
      name: body.name.trim(),
      audience: body.audience,
      estimatedReach: reach,
      channels: body.channels,
      content: body.content ?? {},
      schedule: body.schedule ?? { mode: 'ONCE', sendAt: mockNowIso() },
      quietHoursRespected: true,
      status: body.schedule?.mode === 'ONCE' && body.sendNow ? 'SENDING' : 'DRAFT',
      stats: null,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'campaign.create', entityType: 'campaign', entityId: campaign.id, entityLabel: campaign.name });
    scheduleSave();
    return created(campaign);
  }),

  /** Test send to the caller, before the real audience gets it. */
  mswHttp.post(`${BASE}/campaigns/:campaignId/test-send`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.campaign.create');
    if (g.response) return g.response;
    const campaign = findById('campaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    return ok({ sentTo: g.user.email, channels: campaign.channels });
  }),

  mswHttp.post(`${BASE}/campaigns/:campaignId/send`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.campaign.send');
    if (g.response) return g.response;

    const body = await request.json();
    const campaign = findById('campaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!['DRAFT'].includes(campaign.status)) return illegalTransition(campaign.status, 'send');

    const sendAt = body.sendAt ?? mockNowIso();
    if (campaign.channels.includes('PUSH') && inQuietHours(sendAt) && !body.overrideQuietHours) {
      return conflict(
        'This would send during quiet hours (10 PM–8 AM). Reschedule, or confirm the override.',
        'QUIET_HOURS',
      );
    }

    const scheduled = new Date(sendAt).getTime() > Date.now();
    const reach = campaign.estimatedReach;
    update('campaigns', campaign.id, {
      status: scheduled ? 'SCHEDULED' : 'SENT',
      schedule: { ...campaign.schedule, sendAt },
      stats: scheduled ? null : {
        sent: reach,
        delivered: Math.round(reach * 0.94),
        opened: Math.round(reach * 0.31),
        clicked: Math.round(reach * 0.09),
        conversions: Math.round(reach * 0.02),
        gmvPaise: Math.round(reach * 0.02) * 150000,
        unsubscribed: Math.round(reach * 0.004),
      },
    });
    writeAudit({ actor: g.user, action: 'campaign.send', entityType: 'campaign', entityId: campaign.id, entityLabel: campaign.name });
    scheduleSave();
    return ok(findById('campaigns', campaign.id));
  }),

  mswHttp.post(`${BASE}/campaigns/:campaignId/cancel`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'marketing.campaign.cancel');
    if (g.response) return g.response;

    const campaign = findById('campaigns', params.campaignId);
    if (!campaign) return notFound('That campaign no longer exists.');
    if (!['SCHEDULED', 'SENDING', 'DRAFT'].includes(campaign.status)) {
      return illegalTransition(campaign.status, 'cancel');
    }
    update('campaigns', campaign.id, { status: 'CANCELLED' });
    writeAudit({ actor: g.user, action: 'campaign.cancel', entityType: 'campaign', entityId: campaign.id, entityLabel: campaign.name });
    scheduleSave();
    return ok(findById('campaigns', campaign.id));
  }),
];
