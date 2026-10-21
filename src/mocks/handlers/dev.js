import { http as mswHttp, delay } from 'msw';
import { db, find } from '../db/store';
import { createSession, sessionPayload } from '../engine/auth';
import { getSettings, mockNowIso, resetSettings, updateSettings } from '../engine/settings';
import { badRequest, notFound, ok } from '../engine/respond';
import { saveSnapshot, scheduleSave } from '../persistence';
import { seedAll } from '../seed';

const BASE = '/api/admin/v1';

/**
 * Endpoints that back the dev toolbar. They exist only in the mock bundle —
 * `src/mocks` is dynamically imported and never reaches the live build — so
 * there is no production surface to lock down here.
 */
export const devHandlers = [
  mswHttp.get(`${BASE}/dev/users`, async () => {
    await delay(5);
    return ok(
      db.adminUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        roleNames: (u.roleIds ?? []).map((r) => db.roles.find((x) => x.id === r)?.name).filter(Boolean),
        twoFactorEnrolled: u.twoFactorEnrolled,
      })),
    );
  }),

  /** Signs in as a seeded admin, skipping password and 2FA. */
  mswHttp.post(`${BASE}/dev/switch-user`, async ({ request }) => {
    await delay(60);
    const body = await request.json();
    const user = find('adminUsers', (u) => u.email === body?.email);
    if (!user) return notFound('No seeded admin with that email.');
    if (user.status !== 'ACTIVE') {
      return badRequest(
        `That account is ${user.status.toLowerCase()}, so it cannot sign in. Use the normal login screen to exercise that state.`,
      );
    }
    const session = createSession(user, { device: 'Dev toolbar' });
    user.lastLoginAt = mockNowIso();
    scheduleSave();
    return ok(sessionPayload(user, session));
  }),

  mswHttp.get(`${BASE}/dev/settings`, async () => {
    await delay(5);
    return ok(getSettings());
  }),

  mswHttp.patch(`${BASE}/dev/settings`, async ({ request }) => {
    const body = await request.json();
    const patch = {};
    if (body.latencyMs !== undefined) patch.latencyMs = Math.max(0, Number(body.latencyMs));
    if (body.errorRate !== undefined) patch.errorRate = Math.min(100, Math.max(0, Number(body.errorRate)));
    if (body.failNext !== undefined) patch.failNext = Boolean(body.failNext);
    if (body.clockOffsetMs !== undefined) patch.clockOffsetMs = Number(body.clockOffsetMs);
    return ok(updateSettings(patch));
  }),

  mswHttp.post(`${BASE}/dev/reset`, async () => {
    seedAll();
    resetSettings();
    await saveSnapshot();
    return ok({ ok: true, seededAt: mockNowIso() });
  }),

  /** Advances the mock clock so SLA breaches and payout cycles can be reached. */
  mswHttp.post(`${BASE}/dev/time-travel`, async ({ request }) => {
    const body = await request.json();
    const hours = Number(body?.hours ?? 0);
    const next = getSettings().clockOffsetMs + hours * 3600_000;
    updateSettings({ clockOffsetMs: hours === 0 ? 0 : next });
    scheduleSave();
    return ok(getSettings());
  }),
];
