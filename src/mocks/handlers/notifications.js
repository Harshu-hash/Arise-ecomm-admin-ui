import { http as mswHttp } from 'msw';
import { db, findById, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Notification templates and delivery logs (M16). */

export const notificationHandlers = [
  mswHttp.get(`${BASE}/notification-templates`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'notifications.template.view');
    if (g.response) return g.response;
    return ok(db.notificationTemplates);
  }),

  mswHttp.get(`${BASE}/notification-templates/:templateId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'notifications.template.view');
    if (g.response) return g.response;
    const template = findById('notificationTemplates', params.templateId);
    if (!template) return notFound('That template no longer exists.');
    return ok(template);
  }),

  mswHttp.patch(`${BASE}/notification-templates/:templateId/:channel`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'notifications.template.edit');
    if (g.response) return g.response;
    const template = findById('notificationTemplates', params.templateId);
    if (!template) return notFound('That template no longer exists.');
    const channelConfig = template.channels[params.channel];
    if (!channelConfig) return notFound('That channel is not configured for this event.');

    const body = await request.json();
    if (body.content?.body !== undefined && !body.content.body.trim()) {
      return validationFailed({ content: 'The message cannot be empty.' });
    }
    if (params.channel === 'SMS' && body.dltTemplateId !== undefined && !body.dltTemplateId?.trim()) {
      return validationFailed({ dltTemplateId: 'A DLT template ID is required for SMS, per TRAI rules.' });
    }

    const history = [
      ...channelConfig.history,
      { content: channelConfig.content, editedByName: g.user.name, editedAt: mockNowIso() },
    ];
    const nextChannel = {
      ...channelConfig,
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.dltTemplateId !== undefined ? { dltTemplateId: body.dltTemplateId } : {}),
      version: channelConfig.version + 1,
      history,
    };
    update('notificationTemplates', template.id, {
      channels: { ...template.channels, [params.channel]: nextChannel },
      updatedByName: g.user.name,
      updatedAt: mockNowIso(),
    });
    writeAudit({
      actor: g.user, action: 'notification.template_edit', entityType: 'notificationTemplate',
      entityId: template.id, entityLabel: `${template.eventLabel} · ${params.channel}`,
    });
    scheduleSave();
    return ok(findById('notificationTemplates', template.id));
  }),

  mswHttp.post(`${BASE}/notification-templates/:templateId/:channel/test`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'notifications.template.test_send');
    if (g.response) return g.response;
    const template = findById('notificationTemplates', params.templateId);
    if (!template) return notFound('That template no longer exists.');
    if (!template.channels[params.channel]?.enabled) {
      return validationFailed({ channel: 'This channel is disabled for this event.' });
    }
    return ok({ sentTo: g.user.email, eventKey: template.eventKey, channel: params.channel });
  }),

  /* ------------------------------------------------------------------ logs */
  mswHttp.get(`${BASE}/notification-logs`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'notifications.log.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-sentAt' });
    const result = listResult(db.notificationLogs, query, {
      searchFields: ['eventLabel', 'recipientMasked'],
      filterSpec: { channel: 'channel', status: 'status', eventKey: 'eventKey' },
      sortable: ['sentAt'],
      facetFields: ['channel', 'status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/notification-logs/:logId/resend`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'notifications.log.resend');
    if (g.response) return g.response;
    const log = findById('notificationLogs', params.logId);
    if (!log) return notFound('That log entry no longer exists.');
    if (!['FAILED', 'BOUNCED'].includes(log.status)) {
      return validationFailed({ status: 'Only a failed or bounced notification can be resent.' });
    }

    update('notificationLogs', log.id, { status: 'SENT', failureReason: null, sentAt: mockNowIso() });
    writeAudit({
      actor: g.user, action: 'notification.resend', entityType: 'notificationLog',
      entityId: log.id, entityLabel: log.eventLabel,
    });
    scheduleSave();
    return ok(findById('notificationLogs', log.id));
  }),
];
