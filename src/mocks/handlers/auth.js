import { http as mswHttp } from 'msw';
import { db, find, findById, id, insert, update } from '../db/store';
import {
  createSession,
  findSessionByRefresh,
  publicUser,
  resolveCaller,
  revokeAllSessionsFor,
  revokeSession,
  rotateAccessToken,
  sessionPayload,
} from '../engine/auth';
import { writeAudit } from '../engine/audit';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  simulateNetwork,
  unauthorized,
  validationFailed,
} from '../engine/respond';

const BASE = '/api/admin/v1';
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** Mock TOTP: a stable 6-digit code per challenge, surfaced as a dev hint. */
function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createChallenge(user, stage) {
  return insert('authChallenges', {
    id: id('CHL', 6),
    userId: user.id,
    stage,
    code: makeCode(),
    expiresAt: new Date(mockNow() + CHALLENGE_TTL_MS).toISOString(),
    attempts: 0,
    consumedAt: null,
  });
}

function liveChallenge(challengeId) {
  const c = findById('authChallenges', challengeId);
  if (!c || c.consumedAt) return null;
  return new Date(c.expiresAt).getTime() > mockNow() ? c : null;
}

function passwordPolicyErrors(password) {
  const errors = [];
  if (!password || password.length < 12) errors.push('at least 12 characters');
  if (!/[A-Z]/.test(password ?? '')) errors.push('an uppercase letter');
  if (!/[a-z]/.test(password ?? '')) errors.push('a lowercase letter');
  if (!/[0-9]/.test(password ?? '')) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(password ?? '')) errors.push('a symbol');
  return errors;
}

function issue(user, body, extra = {}) {
  const session = createSession(user, {
    trusted: Boolean(body?.trustDevice),
    device: body?.device,
  });
  update('adminUsers', user.id, { lastLoginAt: mockNowIso(), failedLoginCount: 0, lockedUntil: null });
  writeAudit({ actor: user, action: 'auth.login', entityType: 'adminUser', entityId: user.id, entityLabel: user.name });
  scheduleSave();
  return ok({ ...sessionPayload(findById('adminUsers', user.id), session), ...extra });
}

export const authHandlers = [
  /* ----------------------------------------------------------------- login */
  mswHttp.post(`${BASE}/auth/login`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/login');
    if (injected) return injected;

    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();

    // If the demo database is empty there are no credentials that can work,
    // and "email or password is incorrect" would send someone hunting for a
    // typo that does not exist. Name the real problem instead.
    if (db.adminUsers.length === 0) {
      return conflict(
        'The demo data is missing or was saved by an older build. Reset it to sign in.',
        'MOCK_DATA_EMPTY',
      );
    }

    const user = find('adminUsers', (u) => u.email.toLowerCase() === email);

    // One generic message for unknown email and wrong password, so the login
    // form cannot be used to enumerate which admin accounts exist.
    const generic = () => unauthorized('Email or password is incorrect.');

    if (!user) return generic();

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > mockNow()) {
      const mins = Math.ceil((new Date(user.lockedUntil).getTime() - mockNow()) / 60000);
      return forbidden(
        `Too many failed attempts. This account is locked for another ${mins} minute${mins === 1 ? '' : 's'}.`,
        { details: { code: 'ACCOUNT_LOCKED', lockedUntil: user.lockedUntil } },
      );
    }

    if (user.status === 'INVITED') {
      return forbidden('This invitation has not been accepted yet. Use the link in your invite email.', {
        details: { code: 'INVITE_PENDING' },
      });
    }
    if (user.status === 'DEACTIVATED') {
      return forbidden('This admin account has been deactivated.', { details: { code: 'DEACTIVATED' } });
    }

    if (user.password !== body?.password) {
      const failed = (user.failedLoginCount ?? 0) + 1;
      const locked = failed >= MAX_FAILED;
      update('adminUsers', user.id, {
        failedLoginCount: failed,
        status: locked ? 'LOCKED' : user.status,
        lockedUntil: locked ? new Date(mockNow() + LOCK_MINUTES * 60000).toISOString() : null,
      });
      writeAudit({
        actor: null,
        action: 'auth.login_failed',
        entityType: 'adminUser',
        entityId: user.id,
        entityLabel: user.email,
        metadata: { attempt: failed, locked },
        severity: 'warning',
      });
      scheduleSave();
      if (locked) {
        return forbidden(
          `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`,
          { details: { code: 'ACCOUNT_LOCKED' } },
        );
      }
      return generic();
    }

    if (user.status === 'LOCKED') update('adminUsers', user.id, { status: 'ACTIVE', lockedUntil: null });

    // Second factor is mandatory for every admin (plan §11).
    const stage = user.twoFactorEnrolled ? 'verify_2fa' : 'enrol_2fa';
    const challenge = createChallenge(user, stage);
    scheduleSave();

    return ok({
      stage,
      challengeId: challenge.id,
      maskedEmail: user.email.replace(/^(.{2}).*(@.*)$/, '$1•••••$2'),
      ...(stage === 'enrol_2fa'
        ? {
            secret: user.twoFactorSecret,
            otpauthUrl: `otpauth://totp/Arise%20Admin:${encodeURIComponent(user.email)}?secret=${user.twoFactorSecret}&issuer=Arise%20Admin`,
          }
        : {}),
      // Mock-only affordance: the UI shows this as a dev hint on the 2FA screen.
      devHint: { code: challenge.code },
    });
  }),

  /* ------------------------------------------------------------ 2FA verify */
  mswHttp.post(`${BASE}/auth/2fa/verify`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/2fa/verify');
    if (injected) return injected;

    const body = await request.json();
    const challenge = liveChallenge(body?.challengeId);
    if (!challenge) return unauthorized('This sign-in attempt expired. Please sign in again.');

    const user = findById('adminUsers', challenge.userId);
    if (!user) return unauthorized('This sign-in attempt expired. Please sign in again.');

    const code = String(body?.code ?? '').trim();
    const backup = (user.backupCodes ?? []).find((b) => !b.usedAt && b.code === code.toUpperCase());

    if (code !== challenge.code && !backup) {
      update('authChallenges', challenge.id, { attempts: challenge.attempts + 1 });
      if (challenge.attempts + 1 >= 5) {
        update('authChallenges', challenge.id, { consumedAt: mockNowIso() });
        return unauthorized('Too many incorrect codes. Please sign in again.');
      }
      return validationFailed({ code: 'That code is not correct.' }, 'That code is not correct.');
    }

    if (backup) {
      backup.usedAt = mockNowIso();
      writeAudit({
        actor: user,
        action: 'auth.backup_code_used',
        entityType: 'adminUser',
        entityId: user.id,
        entityLabel: user.name,
        severity: 'warning',
      });
    }

    update('authChallenges', challenge.id, { consumedAt: mockNowIso() });
    return issue(user, body, { usedBackupCode: Boolean(backup) });
  }),

  /* ------------------------------------------------------------- 2FA enrol */
  mswHttp.post(`${BASE}/auth/2fa/enrol`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/2fa/enrol');
    if (injected) return injected;

    const body = await request.json();
    const challenge = liveChallenge(body?.challengeId);
    if (!challenge) return unauthorized('This sign-in attempt expired. Please sign in again.');
    const user = findById('adminUsers', challenge.userId);
    if (!user) return unauthorized('This sign-in attempt expired. Please sign in again.');

    if (String(body?.code ?? '').trim() !== challenge.code) {
      return validationFailed({ code: 'That code is not correct.' }, 'That code is not correct.');
    }

    update('adminUsers', user.id, { twoFactorEnrolled: true });
    update('authChallenges', challenge.id, { consumedAt: mockNowIso() });
    writeAudit({
      actor: user,
      action: 'auth.2fa_enrolled',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
    });

    return issue(user, body, {
      backupCodes: (user.backupCodes ?? []).filter((b) => !b.usedAt).map((b) => b.code),
    });
  }),

  /* --------------------------------------------------------------- refresh */
  mswHttp.post(`${BASE}/auth/refresh`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/refresh');
    if (injected) return injected;

    const body = await request.json().catch(() => ({}));
    const session = findSessionByRefresh(body?.refreshToken);
    if (!session) return unauthorized('Your session expired. Please sign in again.');

    const user = findById('adminUsers', session.userId);
    if (!user || user.status !== 'ACTIVE') return unauthorized('Your session is no longer valid.');

    const rotated = rotateAccessToken(session);
    scheduleSave();
    return ok(sessionPayload(user, rotated));
  }),

  /* ---------------------------------------------------------------- logout */
  mswHttp.post(`${BASE}/auth/logout`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/logout');
    if (injected) return injected;

    const { user, session } = resolveCaller(request);
    if (session) revokeSession(session.id);
    if (user) {
      writeAudit({ actor: user, action: 'auth.logout', entityType: 'adminUser', entityId: user.id, entityLabel: user.name });
    }
    scheduleSave();
    return ok({ ok: true });
  }),

  /* ------------------------------------------------------- forgot / reset */
  mswHttp.post(`${BASE}/auth/forgot-password`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/forgot-password');
    if (injected) return injected;

    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const user = find('adminUsers', (u) => u.email.toLowerCase() === email);

    // Always report success, so the form cannot confirm whether an email exists.
    let devHint = null;
    if (user && user.status !== 'DEACTIVATED') {
      const token = `reset_${Math.random().toString(36).slice(2, 12)}`;
      insert('passwordResets', {
        id: id('PRS', 6),
        userId: user.id,
        token,
        expiresAt: new Date(mockNow() + 30 * 60000).toISOString(),
        usedAt: null,
      });
      devHint = { resetUrl: `/reset-password?token=${token}` };
      scheduleSave();
    }
    return ok({ sent: true, ...(devHint ? { devHint } : {}) });
  }),

  mswHttp.post(`${BASE}/auth/reset-password`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/reset-password');
    if (injected) return injected;

    const body = await request.json();
    const row = find('passwordResets', (r) => r.token === body?.token && !r.usedAt);
    if (!row || new Date(row.expiresAt).getTime() <= mockNow()) {
      return badRequest('This reset link has expired. Please request a new one.', 'RESET_TOKEN_INVALID');
    }
    const errors = passwordPolicyErrors(body?.password);
    if (errors.length) return validationFailed({ password: `Password needs ${errors.join(', ')}.` });

    const user = findById('adminUsers', row.userId);
    update('adminUsers', user.id, {
      password: body.password,
      mustChangePassword: false,
      status: user.status === 'LOCKED' ? 'ACTIVE' : user.status,
      lockedUntil: null,
      failedLoginCount: 0,
    });
    update('passwordResets', row.id, { usedAt: mockNowIso() });
    // A password reset invalidates every existing session, as it should.
    const revoked = revokeAllSessionsFor(user.id);
    writeAudit({
      actor: user,
      action: 'auth.password_reset',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
      metadata: { sessionsRevoked: revoked },
      severity: 'warning',
    });
    scheduleSave();
    return ok({ ok: true });
  }),

  /* --------------------------------------------------------------- invites */
  mswHttp.get(`${BASE}/auth/invite/:token`, async ({ params }) => {
    const injected = await simulateNetwork('/auth/invite');
    if (injected) return injected;

    const user = find('adminUsers', (u) => u.inviteToken === params.token && u.status === 'INVITED');
    if (!user) return notFound('This invitation is no longer valid.');
    const roleNames = (user.roleIds ?? []).map((r) => findById('roles', r)?.name).filter(Boolean);
    return ok({ name: user.name, email: user.email, roleNames });
  }),

  mswHttp.post(`${BASE}/auth/invite/accept`, async ({ request }) => {
    const injected = await simulateNetwork('/auth/invite/accept');
    if (injected) return injected;

    const body = await request.json();
    const user = find('adminUsers', (u) => u.inviteToken === body?.token && u.status === 'INVITED');
    if (!user) return badRequest('This invitation is no longer valid.', 'INVITE_INVALID');

    const errors = passwordPolicyErrors(body?.password);
    if (errors.length) return validationFailed({ password: `Password needs ${errors.join(', ')}.` });

    update('adminUsers', user.id, {
      name: body?.name?.trim() || user.name,
      password: body.password,
      status: 'ACTIVE',
      inviteToken: null,
      mustChangePassword: false,
    });
    writeAudit({ actor: user, action: 'auth.invite_accepted', entityType: 'adminUser', entityId: user.id, entityLabel: user.name });

    // Invited users have no authenticator yet, so they land in enrolment.
    const challenge = createChallenge(findById('adminUsers', user.id), 'enrol_2fa');
    scheduleSave();
    return ok({
      stage: 'enrol_2fa',
      challengeId: challenge.id,
      secret: user.twoFactorSecret,
      otpauthUrl: `otpauth://totp/Arise%20Admin:${encodeURIComponent(user.email)}?secret=${user.twoFactorSecret}&issuer=Arise%20Admin`,
      devHint: { code: challenge.code },
    });
  }),

  /* ------------------------------------------------------------------- me */
  mswHttp.get(`${BASE}/me`, async ({ request }) => {
    const injected = await simulateNetwork('/me');
    if (injected) return injected;
    const { user, error } = resolveCaller(request);
    if (error) return unauthorized('Not signed in.');
    return ok(publicUser(user));
  }),

  mswHttp.post(`${BASE}/me/password`, async ({ request }) => {
    const injected = await simulateNetwork('/me/password');
    if (injected) return injected;
    const { user, session, error } = resolveCaller(request);
    if (error) return unauthorized('Not signed in.');

    const body = await request.json();
    if (user.password !== body?.currentPassword) {
      return validationFailed({ currentPassword: 'That password is not correct.' });
    }
    const errors = passwordPolicyErrors(body?.newPassword);
    if (errors.length) return validationFailed({ newPassword: `Password needs ${errors.join(', ')}.` });
    if (body.newPassword === user.password) {
      return validationFailed({ newPassword: 'Choose a password you have not used before.' });
    }

    update('adminUsers', user.id, { password: body.newPassword, mustChangePassword: false });
    const revoked = revokeAllSessionsFor(user.id, session.id);
    writeAudit({
      actor: user,
      action: 'auth.password_changed',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
      metadata: { otherSessionsRevoked: revoked },
      severity: 'warning',
    });
    scheduleSave();
    return ok({ ...publicUser(findById('adminUsers', user.id)), otherSessionsRevoked: revoked });
  }),

  mswHttp.get(`${BASE}/me/sessions`, async ({ request }) => {
    const injected = await simulateNetwork('/me/sessions');
    if (injected) return injected;
    const { user, session, error } = resolveCaller(request);
    if (error) return unauthorized('Not signed in.');

    const rows = db.adminSessions
      .filter((s) => s.userId === user.id && !s.revokedAt)
      .map((s) => ({
        id: s.id,
        device: s.device,
        ip: s.ip,
        city: s.city,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        trustedDevice: s.trustedDevice,
        current: s.id === session.id,
      }))
      .sort((a, b) => (a.current ? -1 : b.current ? 1 : b.lastActiveAt.localeCompare(a.lastActiveAt)));
    return ok(rows);
  }),

  mswHttp.delete(`${BASE}/me/sessions/:id`, async ({ request, params }) => {
    const injected = await simulateNetwork('/me/sessions');
    if (injected) return injected;
    const { user, session, error } = resolveCaller(request);
    if (error) return unauthorized('Not signed in.');
    if (params.id === session.id) return badRequest('Use sign out to end the session you are using.');

    const target = findById('adminSessions', params.id);
    if (!target || target.userId !== user.id) return notFound('That session no longer exists.');
    revokeSession(target.id);
    writeAudit({ actor: user, action: 'auth.session_revoked', entityType: 'adminSession', entityId: target.id, entityLabel: target.device });
    scheduleSave();
    return ok({ ok: true });
  }),

  mswHttp.patch(`${BASE}/me/preferences`, async ({ request }) => {
    const injected = await simulateNetwork('/me/preferences');
    if (injected) return injected;
    const { user, error } = resolveCaller(request);
    if (error) return unauthorized('Not signed in.');

    const body = await request.json();
    const patch = {};
    if ('notifyInPanel' in body) patch.notifyInPanel = Boolean(body.notifyInPanel);
    if ('notifyEmail' in body) patch.notifyEmail = Boolean(body.notifyEmail);
    if ('defaultLanding' in body) patch.defaultLanding = body.defaultLanding;
    update('adminUsers', user.id, patch);
    scheduleSave();
    return ok(publicUser(findById('adminUsers', user.id)));
  }),

  /* ------------------------------------------- regenerate my backup codes */
  mswHttp.post(`${BASE}/me/2fa/backup-codes`, async ({ request }) => {
    const injected = await simulateNetwork('/me/2fa/backup-codes');
    if (injected) return injected;
    const { user, error } = resolveCaller(request);
    if (error) return unauthorized('Not signed in.');

    const codes = Array.from({ length: 10 }, () => ({
      code: `${Math.random().toString(36).slice(2, 5).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
      usedAt: null,
    }));
    update('adminUsers', user.id, { backupCodes: codes });
    writeAudit({
      actor: user,
      action: 'auth.backup_codes_regenerated',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
      severity: 'warning',
    });
    scheduleSave();
    return ok({ codes: codes.map((c) => c.code) });
  }),
];
