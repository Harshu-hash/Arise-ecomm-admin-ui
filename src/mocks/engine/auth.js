import { db, findById, id, insert, update } from '../db/store';
import { mockNow, mockNowIso } from './settings';

/**
 * Session issuing and resolution for the mock backend.
 *
 * Tokens are opaque strings that index into `adminSessions`; nothing is signed,
 * because the point is to exercise the UI's refresh/expiry/revocation paths,
 * not to model JWT crypto.
 */

const ACCESS_TTL_MS = 15 * 60 * 1000;
const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;

function token(prefix, sessionId) {
  return `${prefix}_${sessionId}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createSession(user, { device, ip, city, trusted = false } = {}) {
  const sessionId = id('SES', 6);
  const now = mockNow();
  const session = {
    id: sessionId,
    userId: user.id,
    accessToken: token('mockat', sessionId),
    refreshToken: token('mockrt', sessionId),
    accessExpiresAt: new Date(now + ACCESS_TTL_MS).toISOString(),
    absoluteExpiresAt: new Date(now + ABSOLUTE_TTL_MS).toISOString(),
    createdAt: mockNowIso(),
    lastActiveAt: mockNowIso(),
    revokedAt: null,
    trustedDevice: trusted,
    device: device ?? 'Chrome on Windows',
    ip: ip ?? '103.21.58.14',
    city: city ?? 'Ahmedabad, GJ',
  };
  insert('adminSessions', session);
  return session;
}

export function rotateAccessToken(session) {
  return update('adminSessions', session.id, {
    accessToken: token('mockat', session.id),
    accessExpiresAt: new Date(mockNow() + ACCESS_TTL_MS).toISOString(),
    refreshToken: token('mockrt', session.id),
    lastActiveAt: mockNowIso(),
  });
}

export function revokeSession(sessionId) {
  return update('adminSessions', sessionId, { revokedAt: mockNowIso() });
}

export function revokeAllSessionsFor(userId, exceptSessionId = null) {
  let n = 0;
  for (const s of db.adminSessions) {
    if (s.userId !== userId || s.revokedAt || s.id === exceptSessionId) continue;
    s.revokedAt = mockNowIso();
    n += 1;
  }
  return n;
}

function sessionIsLive(session) {
  if (!session || session.revokedAt) return false;
  return new Date(session.absoluteExpiresAt).getTime() > mockNow();
}

export function findSessionByRefresh(refreshToken) {
  const s = db.adminSessions.find((x) => x.refreshToken === refreshToken);
  return sessionIsLive(s) ? s : null;
}

/**
 * Resolves the caller from the Authorization header.
 * Returns `{ user, session }`, or `{ error }` describing why not.
 */
export function resolveCaller(request) {
  const header = request.headers.get('Authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!bearer) return { error: 'missing' };

  const session = db.adminSessions.find((s) => s.accessToken === bearer);
  if (!sessionIsLive(session)) return { error: 'invalid' };
  if (new Date(session.accessExpiresAt).getTime() <= mockNow()) return { error: 'expired' };

  const user = findById('adminUsers', session.userId);
  if (!user) return { error: 'invalid' };
  if (user.status !== 'ACTIVE') return { error: 'inactive' };

  session.lastActiveAt = mockNowIso();
  return { user, session };
}

/** Effective permission keys for a user, unioned across their roles. */
export function permissionsFor(user) {
  const set = new Set();
  for (const roleId of user.roleIds ?? []) {
    const role = findById('roles', roleId);
    for (const key of role?.permissions ?? []) set.add(key);
  }
  return Array.from(set);
}

export function hasPermission(user, key) {
  const perms = permissionsFor(user);
  return perms.includes('*') || perms.includes(key);
}

/** The session-shaped user object the UI stores (plan §11). */
export function publicUser(user) {
  const roles = (user.roleIds ?? []).map((rid) => findById('roles', rid)).filter(Boolean);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarColor: user.avatarColor,
    status: user.status,
    roleIds: user.roleIds,
    roleNames: roles.map((r) => r.name),
    permissions: permissionsFor(user),
    scope: user.scope ?? null,
    twoFactorEnrolled: user.twoFactorEnrolled,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt ?? null,
    defaultLanding: user.defaultLanding ?? '/',
  };
}

export function sessionPayload(user, session) {
  return {
    user: publicUser(user),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.accessExpiresAt,
  };
}
