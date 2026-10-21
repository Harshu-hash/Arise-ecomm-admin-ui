import { http as mswHttp } from 'msw';
import { avatarColor } from '@core/utils/misc';
import { db, find, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { permissionsFor, revokeAllSessionsFor, revokeSession } from '../engine/auth';
import { diffOf, writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  created,
  notFound,
  ok,
  okList,
  validationFailed,
  versionConflict,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Never leak credentials, secrets or backup codes over the wire. */
function publicRow(u) {
  const roles = (u.roleIds ?? []).map((r) => findById('roles', r)).filter(Boolean);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    status: u.status,
    roleIds: u.roleIds ?? [],
    roleNames: roles.map((r) => r.name),
    scope: u.scope ?? null,
    scopedBy: Array.from(new Set(roles.flatMap((r) => r.scopedBy ?? []))),
    twoFactorEnrolled: u.twoFactorEnrolled,
    mustChangePassword: Boolean(u.mustChangePassword),
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    createdByName: u.createdByName,
    invitedAt: u.invitedAt,
    lockedUntil: u.lockedUntil,
    failedLoginCount: u.failedLoginCount,
    defaultLanding: u.defaultLanding,
    activeSessions: db.adminSessions.filter((s) => s.userId === u.id && !s.revokedAt).length,
    version: u.version,
  };
}

function allowedActionsFor(target, actorPermissions) {
  const can = (k) => actorPermissions.includes('*') || actorPermissions.includes(k);
  const actions = [];
  if (can('admin.user.edit')) actions.push('EDIT');
  if (target.status === 'INVITED' && can('admin.user.invite')) actions.push('RESEND_INVITE', 'REVOKE_INVITE');
  if (target.status === 'LOCKED' && can('admin.user.unlock')) actions.push('UNLOCK');
  if (target.status === 'ACTIVE' && can('admin.user.deactivate')) actions.push('DEACTIVATE');
  if (target.status === 'DEACTIVATED' && can('admin.user.edit')) actions.push('REACTIVATE');
  if (target.twoFactorEnrolled && can('admin.user.reset_2fa')) actions.push('RESET_2FA');
  if (can('admin.user.revoke_session')) actions.push('REVOKE_SESSIONS');
  return actions;
}

export const adminUserHandlers = [
  mswHttp.get(`${BASE}/admin-users`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'name' });
    const rows = db.adminUsers.map(publicRow);
    const { items, meta } = listResult(rows, query, {
      searchFields: ['name', 'email', 'id'],
      filterSpec: {
        status: 'status',
        roleId: { path: 'roleIds', kind: 'arrayContains' },
        twoFactorEnrolled: { path: 'twoFactorEnrolled', kind: 'boolean' },
        createdAt: { path: 'createdAt', kind: 'date' },
        lastLoginAt: { path: 'lastLoginAt', kind: 'date' },
      },
      sortable: ['name', 'email', 'status', 'lastLoginAt', 'createdAt'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/admin-users/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.view');
    if (g.response) return g.response;

    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');

    const logins = db.auditEvents
      .filter((e) => e.entityId === user.id && e.action.startsWith('auth.'))
      .slice(0, 50);
    const sessions = db.adminSessions
      .filter((s) => s.userId === user.id && !s.revokedAt)
      .map((s) => ({
        id: s.id,
        device: s.device,
        ip: s.ip,
        city: s.city,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
      }));

    return ok(
      { ...publicRow(user), effectivePermissionCount: permissionsFor(user).includes('*') ? 'ALL' : permissionsFor(user).length },
      { allowedActions: allowedActionsFor(user, g.permissions), loginHistory: logins, sessions },
    );
  }),

  /** Invite a new admin. The account exists in INVITED state until accepted. */
  mswHttp.post(`${BASE}/admin-users`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.invite');
    if (g.response) return g.response;

    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const fieldErrors = {};
    if (!String(body?.name ?? '').trim()) fieldErrors.name = 'Enter their name.';
    if (!EMAIL_RX.test(email)) fieldErrors.email = 'Enter a valid email address.';
    else if (find('adminUsers', (u) => u.email.toLowerCase() === email)) {
      fieldErrors.email = 'An admin with this email already exists.';
    }
    const roleIds = Array.isArray(body?.roleIds) ? body.roleIds : [];
    if (!roleIds.length) fieldErrors.roleIds = 'Assign at least one role.';
    else if (roleIds.some((r) => !findById('roles', r))) fieldErrors.roleIds = 'One of those roles no longer exists.';
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const token = `invite_${Math.random().toString(36).slice(2, 12)}`;
    const user = insert('adminUsers', {
      id: id('ADM', 3),
      name: String(body.name).trim(),
      email,
      password: null,
      avatarColor: avatarColor(email),
      status: 'INVITED',
      roleIds,
      scope: body?.scope ?? null,
      twoFactorEnrolled: false,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      backupCodes: Array.from({ length: 10 }, (_, n) => ({
        code: `${email.slice(0, 3).toUpperCase()}-${String(1000 + n * 41).slice(0, 4)}`,
        usedAt: null,
      })),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      invitedAt: mockNowIso(),
      inviteToken: token,
      lastLoginAt: null,
      createdAt: mockNowIso(),
      createdByName: g.user.name,
      defaultLanding: '/',
      notifyInPanel: true,
      notifyEmail: true,
      version: 1,
    });

    writeAudit({
      actor: g.user,
      action: 'admin.user.invite',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: `${user.name} <${user.email}>`,
      metadata: { roleIds },
      severity: 'warning',
    });
    scheduleSave();
    return created(publicRow(user), { devHint: { inviteUrl: `/accept-invite?token=${token}` } });
  }),

  mswHttp.patch(`${BASE}/admin-users/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.edit');
    if (g.response) return g.response;

    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');
    const body = await request.json();
    if (body.version !== undefined && body.version !== user.version) {
      return versionConflict(publicRow(user));
    }

    const next = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) return validationFailed({ name: 'Enter their name.' });
      next.name = String(body.name).trim();
    }
    if (body.scope !== undefined) next.scope = body.scope;
    if (body.defaultLanding !== undefined) next.defaultLanding = body.defaultLanding;

    const roleChange =
      body.roleIds !== undefined &&
      JSON.stringify([...body.roleIds].sort()) !== JSON.stringify([...(user.roleIds ?? [])].sort());

    if (roleChange) {
      if (!Array.isArray(body.roleIds) || !body.roleIds.length) {
        return validationFailed({ roleIds: 'Assign at least one role.' });
      }
      if (body.roleIds.some((r) => !findById('roles', r))) {
        return validationFailed({ roleIds: 'One of those roles no longer exists.' });
      }
      if (user.id === g.user.id) {
        return conflict('You cannot change your own roles.', 'SELF_ROLE_CHANGE');
      }
    }

    // Non-privilege edits apply immediately; a role change is a privilege
    // change and goes through maker-checker.
    const before = { ...user };
    if (Object.keys(next).length) {
      update('adminUsers', user.id, next);
      writeAudit({
        actor: g.user,
        action: 'admin.user.edit',
        entityType: 'adminUser',
        entityId: user.id,
        entityLabel: user.name,
        changes: diffOf(before, findById('adminUsers', user.id), ['version', 'password', 'backupCodes', 'twoFactorSecret', 'inviteToken']),
      });
    }

    if (roleChange) {
      const fromNames = (user.roleIds ?? []).map((r) => findById('roles', r)?.name);
      const toNames = body.roleIds.map((r) => findById('roles', r)?.name);
      const approval = createApproval({
        actionKey: 'role.change',
        actor: g.user,
        entityType: 'adminUser',
        entityId: user.id,
        entityLabel: user.name,
        reason: body.reason ?? null,
        summary: `Change ${user.name}'s roles: ${fromNames.join(', ')} → ${toNames.join(', ')}`,
        diff: [{ field: 'roles', from: fromNames, to: toNames }],
        execute: () => {
          update('adminUsers', user.id, { roleIds: body.roleIds });
          revokeAllSessionsFor(user.id);
          writeAudit({
            actor: g.user,
            action: 'admin.user.roles_changed',
            entityType: 'adminUser',
            entityId: user.id,
            entityLabel: user.name,
            changes: [{ field: 'roles', from: fromNames, to: toNames }],
            severity: 'warning',
          });
        },
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    scheduleSave();
    return ok(publicRow(findById('adminUsers', user.id)));
  }),

  /* ------------------------------------------------------- lifecycle verbs */
  mswHttp.post(`${BASE}/admin-users/:id/unlock`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.unlock');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');
    if (user.status !== 'LOCKED') return conflict('That account is not locked.', 'NOT_LOCKED');

    update('adminUsers', user.id, { status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0 });
    writeAudit({ actor: g.user, action: 'admin.user.unlock', entityType: 'adminUser', entityId: user.id, entityLabel: user.name });
    scheduleSave();
    return ok(publicRow(findById('adminUsers', user.id)));
  }),

  mswHttp.post(`${BASE}/admin-users/:id/deactivate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.deactivate');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');
    if (user.id === g.user.id) return conflict('You cannot deactivate your own account.', 'SELF_DEACTIVATE');

    const body = await request.json().catch(() => ({}));
    if (!body?.reason) return validationFailed({ reason: 'Give a reason.' });

    update('adminUsers', user.id, { status: 'DEACTIVATED' });
    const revoked = revokeAllSessionsFor(user.id);
    writeAudit({
      actor: g.user,
      action: 'admin.user.deactivate',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
      reason: body.reason,
      metadata: { sessionsRevoked: revoked, reassignTo: body.reassignTo ?? null },
      severity: 'warning',
    });
    scheduleSave();
    return ok(publicRow(findById('adminUsers', user.id)), { sessionsRevoked: revoked });
  }),

  mswHttp.post(`${BASE}/admin-users/:id/reactivate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.edit');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');
    if (user.status !== 'DEACTIVATED') return conflict('That account is not deactivated.', 'NOT_DEACTIVATED');

    update('adminUsers', user.id, { status: 'ACTIVE', mustChangePassword: true });
    writeAudit({ actor: g.user, action: 'admin.user.reactivate', entityType: 'adminUser', entityId: user.id, entityLabel: user.name });
    scheduleSave();
    return ok(publicRow(findById('adminUsers', user.id)));
  }),

  mswHttp.post(`${BASE}/admin-users/:id/reset-2fa`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.reset_2fa');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');

    const body = await request.json().catch(() => ({}));
    const approval = createApproval({
      actionKey: 'role.change',
      actor: g.user,
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
      reason: body?.reason ?? null,
      summary: `Reset two-factor authentication for ${user.name}`,
      diff: [{ field: 'twoFactorEnrolled', from: true, to: false }],
      execute: () => {
        update('adminUsers', user.id, { twoFactorEnrolled: false });
        revokeAllSessionsFor(user.id);
        writeAudit({
          actor: g.user,
          action: 'admin.user.reset_2fa',
          entityType: 'adminUser',
          entityId: user.id,
          entityLabel: user.name,
          severity: 'warning',
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  mswHttp.post(`${BASE}/admin-users/:id/resend-invite`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.invite');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');
    if (user.status !== 'INVITED') return conflict('That invitation has already been accepted.', 'NOT_INVITED');

    const token = `invite_${Math.random().toString(36).slice(2, 12)}`;
    update('adminUsers', user.id, { inviteToken: token, invitedAt: mockNowIso() });
    writeAudit({ actor: g.user, action: 'admin.user.resend_invite', entityType: 'adminUser', entityId: user.id, entityLabel: user.email });
    scheduleSave();
    return ok(publicRow(findById('adminUsers', user.id)), { devHint: { inviteUrl: `/accept-invite?token=${token}` } });
  }),

  mswHttp.post(`${BASE}/admin-users/:id/revoke-sessions`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.revoke_session');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');

    const body = await request.json().catch(() => ({}));
    let revoked = 0;
    if (body?.sessionId) {
      const s = findById('adminSessions', body.sessionId);
      if (!s || s.userId !== user.id) return notFound('That session no longer exists.');
      revokeSession(s.id);
      revoked = 1;
    } else {
      revoked = revokeAllSessionsFor(user.id);
    }
    writeAudit({
      actor: g.user,
      action: 'admin.user.revoke_sessions',
      entityType: 'adminUser',
      entityId: user.id,
      entityLabel: user.name,
      metadata: { revoked },
      severity: 'warning',
    });
    scheduleSave();
    return ok({ revoked });
  }),

  /** Lock-out countdown is server state; the UI shows it on the detail page. */
  mswHttp.get(`${BASE}/admin-users/:id/lock-status`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.user.view');
    if (g.response) return g.response;
    const user = findById('adminUsers', params.id);
    if (!user) return notFound('That admin user no longer exists.');
    if (!user.lockedUntil) return ok({ locked: false });
    const remainingMs = new Date(user.lockedUntil).getTime() - mockNow();
    if (remainingMs <= 0) return ok({ locked: false });
    return ok({ locked: true, lockedUntil: user.lockedUntil, remainingMs });
  }),
];
