import { http as mswHttp } from 'msw';
import { db, findById, id, insert, remove, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { resolveFlag } from '../engine/featureFlags';
import { guard } from '../engine/guard';
import { approvalRequired, notFound, ok, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

const PLATFORMS = ['ANDROID', 'IOS', 'WEB'];

/** App config (M17.6): maintenance mode, app versions, languages, and feature flags. */
export const appConfigHandlers = [
  mswHttp.get(`${BASE}/admin/app-config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.view');
    if (g.response) return g.response;
    return ok(findById('settings', 'appConfig'));
  }),

  /** Platform versions and languages are low-risk display/gating config: saved directly. */
  mswHttp.patch(`${BASE}/admin/app-config`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.edit');
    if (g.response) return g.response;
    const config = findById('settings', 'appConfig');
    const body = await request.json();
    const patch = {};
    if (body.platforms) patch.platforms = { ...config.platforms, ...body.platforms };
    if (body.languages) patch.languages = { ...config.languages, ...body.languages };
    update('settings', 'appConfig', { ...patch, version: config.version + 1, updatedAt: mockNowIso(), updatedByName: g.user.name });
    scheduleSave();
    return ok(findById('settings', 'appConfig'));
  }),

  /** Maintenance mode takes every customer out of the app the moment it lands: guarded. */
  mswHttp.post(`${BASE}/admin/app-config/maintenance/:platform`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.maintenance');
    if (g.response) return g.response;
    if (!PLATFORMS.includes(params.platform)) return notFound('Unknown platform.');
    const body = await request.json();
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why maintenance mode is changing.' });

    const config = findById('settings', 'appConfig');
    const nextMaintenance = {
      ...config.maintenance,
      [params.platform]: { enabled: body.enabled, message: body.message ?? '', eta: body.eta ?? null, allowlistUserIds: body.allowlistUserIds ?? [] },
    };

    const approval = createApproval({
      actionKey: 'appconfig.maintenance', actor: g.user,
      entityType: 'appConfig', entityId: 'appConfig', entityLabel: `${params.platform} maintenance mode`,
      reason: body.reason, summary: `${body.enabled ? 'Enable' : 'Disable'} maintenance mode on ${params.platform}`,
      payload: { platform: params.platform, maintenance: nextMaintenance },
      execute: () => {
        update('settings', 'appConfig', { maintenance: nextMaintenance, version: config.version + 1, updatedAt: mockNowIso(), updatedByName: g.user.name });
        writeAudit({
          actor: g.user, action: 'appconfig.maintenance', entityType: 'appConfig', entityId: 'appConfig',
          entityLabel: `${params.platform} maintenance mode`, reason: body.reason, metadata: { platform: params.platform, enabled: body.enabled },
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  /* ------------------------------------------------------------ feature flags */
  mswHttp.get(`${BASE}/admin/feature-flags`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.view');
    if (g.response) return g.response;
    return ok(db.featureFlags);
  }),

  mswHttp.post(`${BASE}/admin/feature-flags`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.edit');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.key?.trim()) return validationFailed({ key: 'Give the flag a key.' });
    if (db.featureFlags.some((f) => f.key === body.key)) return validationFailed({ key: 'That key is already in use.' });

    const flag = insert('featureFlags', {
      id: id('FLG', 3),
      key: body.key.trim(),
      label: body.label ?? body.key,
      description: body.description ?? '',
      enabled: body.enabled ?? false,
      rolloutPct: body.rolloutPct ?? 100,
      segmentId: body.segmentId ?? null,
      platform: body.platform ?? 'ALL',
      minAppVersion: body.minAppVersion ?? null,
      updatedAt: mockNowIso(),
      updatedByName: g.user.name,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'appconfig.flag_create', entityType: 'featureFlag', entityId: flag.id, entityLabel: flag.label });
    scheduleSave();
    return ok(flag);
  }),

  mswHttp.patch(`${BASE}/admin/feature-flags/:flagId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.edit');
    if (g.response) return g.response;
    const flag = findById('featureFlags', params.flagId);
    if (!flag) return notFound('That feature flag no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['label', 'description', 'enabled', 'rolloutPct', 'segmentId', 'platform', 'minAppVersion']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('featureFlags', flag.id, { ...patch, updatedAt: mockNowIso(), updatedByName: g.user.name });
    writeAudit({ actor: g.user, action: 'appconfig.flag_edit', entityType: 'featureFlag', entityId: flag.id, entityLabel: flag.label, metadata: patch });
    scheduleSave();
    return ok(findById('featureFlags', flag.id));
  }),

  mswHttp.delete(`${BASE}/admin/feature-flags/:flagId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.edit');
    if (g.response) return g.response;
    const flag = findById('featureFlags', params.flagId);
    if (!flag) return notFound('That feature flag no longer exists.');
    remove('featureFlags', flag.id);
    writeAudit({ actor: g.user, action: 'appconfig.flag_delete', entityType: 'featureFlag', entityId: flag.id, entityLabel: flag.label });
    scheduleSave();
    return ok({ id: flag.id });
  }),

  /** Lets the editor preview who a flag currently reaches, using the exact resolver the app would call. */
  mswHttp.post(`${BASE}/admin/feature-flags/:flagId/preview`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.appconfig.view');
    if (g.response) return g.response;
    const flag = findById('featureFlags', params.flagId);
    if (!flag) return notFound('That feature flag no longer exists.');
    const body = await request.json();
    return ok({ enabled: resolveFlag(flag, body.context ?? {}) });
  }),
];
