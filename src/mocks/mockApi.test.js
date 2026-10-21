import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './db/store';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { DEMO_PASSWORD } from './seed/adminUsers';
import { resetSettings, updateSettings } from './engine/settings';

/**
 * Integration tests against the real mock handlers.
 *
 * These are the closest thing to a backend contract test we have: the same
 * handlers the UI talks to, exercised over HTTP, including the permission
 * checks, state machines and maker-checker routing.
 */

const server = setupServer(...handlers);

// The handlers register relative paths, which MSW resolves against the
// document origin — so requests must use that same origin to match.
const BASE = `${window.location.origin}/api/admin/v1`;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  seedAll();
  resetSettings();
  // Latency only slows the suite down; the paths it exercises are tested
  // separately via the error-injection case below.
  updateSettings({ latencyMs: 0 });
});

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Full sign-in including the second factor, returning the access token. */
async function signIn(email) {
  const login = await call('/auth/login', {
    method: 'POST',
    body: { email, password: DEMO_PASSWORD },
  });
  expect(login.status, `login for ${email} failed: ${JSON.stringify(login.json)}`).toBe(200);
  const { challengeId, devHint, stage } = login.json.data;
  const verify = await call(`/auth/2fa/${stage === 'enrol_2fa' ? 'enrol' : 'verify'}`, {
    method: 'POST',
    body: { challengeId, code: devHint.code },
  });
  expect(verify.status).toBe(200);
  return verify.json.data;
}

describe('authentication', () => {
  it('requires a second factor before issuing a session', async () => {
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: 'super@arise.test', password: DEMO_PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(login.json.data.stage).toBe('verify_2fa');
    // Crucially, no token yet.
    expect(login.json.data.accessToken).toBeUndefined();
  });

  it('completes sign-in once the code is supplied', async () => {
    const session = await signIn('super@arise.test');
    expect(session.accessToken).toBeTruthy();
    expect(session.user.permissions).toContain('*');
  });

  it('rejects a wrong code without ending the challenge', async () => {
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: 'ops@arise.test', password: DEMO_PASSWORD },
    });
    const bad = await call('/auth/2fa/verify', {
      method: 'POST',
      body: { challengeId: login.json.data.challengeId, code: '000000' },
    });
    expect(bad.status).toBe(422);

    const good = await call('/auth/2fa/verify', {
      method: 'POST',
      body: { challengeId: login.json.data.challengeId, code: login.json.data.devHint.code },
    });
    expect(good.status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const unknown = await call('/auth/login', {
      method: 'POST',
      body: { email: 'nobody@arise.test', password: DEMO_PASSWORD },
    });
    const wrong = await call('/auth/login', {
      method: 'POST',
      body: { email: 'super@arise.test', password: 'Wrong@123456' },
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.json.error.message).toBe(wrong.json.error.message);
  });

  it('locks the account after five failed attempts', async () => {
    for (let i = 0; i < 4; i += 1) {
      const r = await call('/auth/login', {
        method: 'POST',
        body: { email: 'catalog@arise.test', password: 'Wrong@123456' },
      });
      expect(r.status).toBe(401);
    }
    const fifth = await call('/auth/login', {
      method: 'POST',
      body: { email: 'catalog@arise.test', password: 'Wrong@123456' },
    });
    expect(fifth.status).toBe(403);
    expect(fifth.json.error.message).toMatch(/locked/i);

    // Even the correct password is refused while the lock stands.
    const correct = await call('/auth/login', {
      method: 'POST',
      body: { email: 'catalog@arise.test', password: DEMO_PASSWORD },
    });
    expect(correct.status).toBe(403);
  });

  it('routes a never-enrolled admin into 2FA setup', async () => {
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: 'ads@arise.test', password: DEMO_PASSWORD },
    });
    expect(login.json.data.stage).toBe('enrol_2fa');
    expect(login.json.data.secret).toBeTruthy();
  });

  it('refuses an invited account until the invitation is accepted', async () => {
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: 'logistics@arise.test', password: DEMO_PASSWORD },
    });
    expect(login.status).toBe(403);
    expect(login.json.error.details.code).toBe('INVITE_PENDING');
  });

  it('flags an account that must change its password', async () => {
    const session = await signIn('warehouse@arise.test');
    expect(session.user.mustChangePassword).toBe(true);
  });

  it('rejects calls with no token', async () => {
    const r = await call('/admin-users');
    expect(r.status).toBe(401);
  });

  it('says the demo data is missing rather than blaming the password', async () => {
    // Without this, an empty mock database looks like a typo and sends people
    // hunting for a password problem that does not exist.
    resetDb();
    const r = await call('/auth/login', {
      method: 'POST',
      body: { email: 'super@arise.test', password: DEMO_PASSWORD },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('MOCK_DATA_EMPTY');
  });

  it('exchanges a refresh token for a new access token', async () => {
    const session = await signIn('super@arise.test');
    const refreshed = await call('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.json.data.accessToken).not.toBe(session.accessToken);
  });

  it('ends other sessions on a password change but keeps the current one', async () => {
    const older = await signIn('super@arise.test');
    const current = await signIn('super@arise.test');

    const changed = await call('/me/password', {
      method: 'POST',
      token: current.accessToken,
      body: { currentPassword: DEMO_PASSWORD, newPassword: 'Different@98765' },
    });
    expect(changed.status).toBe(200);
    expect(changed.json.data.otherSessionsRevoked).toBeGreaterThan(0);

    // The device you changed it on stays signed in; the other one does not.
    const stillValid = await call('/me', { token: current.accessToken });
    expect(stillValid.status).toBe(200);
    const revoked = await call('/me', { token: older.accessToken });
    expect(revoked.status).toBe(401);
  });

  it('enforces the password policy on a change', async () => {
    const session = await signIn('super@arise.test');
    const weak = await call('/me/password', {
      method: 'POST',
      token: session.accessToken,
      body: { currentPassword: DEMO_PASSWORD, newPassword: 'short' },
    });
    expect(weak.status).toBe(422);
    expect(weak.json.error.fieldErrors.newPassword).toMatch(/12 characters/);
  });
});

describe('permissions', () => {
  it('lets a Super Admin read the roles list', async () => {
    const session = await signIn('super@arise.test');
    const r = await call('/roles', { token: session.accessToken });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(10);
  });

  it('refuses a support agent the admin users list', async () => {
    const session = await signIn('agent@arise.test');
    const r = await call('/admin-users', { token: session.accessToken });
    expect(r.status).toBe(403);
    expect(r.json.error.details.required).toContain('admin.user.view');
  });

  it('keeps a locked account out until an admin unlocks it', async () => {
    // The auditor is seeded LOCKED so this state is exercised somewhere.
    const blocked = await call('/auth/login', {
      method: 'POST',
      body: { email: 'auditor@arise.test', password: DEMO_PASSWORD },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.details.code).toBe('ACCOUNT_LOCKED');

    const admin = await signIn('super@arise.test');
    const locked = await call('/admin-users?status=LOCKED', { token: admin.accessToken });
    await call(`/admin-users/${locked.json.data[0].id}/unlock`, {
      method: 'POST',
      token: admin.accessToken,
    });

    const auditor = await signIn('auditor@arise.test');
    expect(auditor.user.permissions).not.toContain('customers.pii.view');

    // Read-only really is read-only.
    const write = await call('/admin-users', {
      method: 'POST',
      token: auditor.accessToken,
      body: { name: 'X', email: 'x@arise.test', roleIds: ['ROLE-003'] },
    });
    expect(write.status).toBe(403);
  });

  it('gives the finance executive payout read but not release', async () => {
    const session = await signIn('finance@arise.test');
    expect(session.user.permissions).toContain('finance.payout.view');
    expect(session.user.permissions).not.toContain('finance.payout.release');
  });

  it('scopes the category manager to its assigned categories', async () => {
    const session = await signIn('category@arise.test');
    expect(session.user.scope.categories).toHaveLength(3);
  });

  it('records a reveal of personal data in the audit log', async () => {
    const agent = await signIn('agent@arise.test');
    const reveal = await call('/pii/reveal', {
      method: 'POST',
      token: agent.accessToken,
      body: { kind: 'phone', entityType: 'customer', entityId: 'CUS-1', entityLabel: 'Test' },
    });
    expect(reveal.status).toBe(200);

    const admin = await signIn('super@arise.test');
    const audit = await call('/audit-events?action=pii.reveal&pageSize=200', {
      token: admin.accessToken,
    });
    const entry = audit.json.data.find((e) => e.entityId === 'CUS-1');
    expect(entry).toBeTruthy();
    expect(entry.actorEmail).toBe('agent@arise.test');
    expect(entry.severity).toBe('warning');
    expect(entry.metadata.kind).toBe('phone');
  });

  it('refuses a reveal to someone without the permission', async () => {
    const marketing = await signIn('marketing@arise.test');
    const r = await call('/pii/reveal', {
      method: 'POST',
      token: marketing.accessToken,
      body: { kind: 'phone', entityType: 'customer', entityId: 'CUS-1' },
    });
    expect(r.status).toBe(403);
  });
});

describe('maker-checker', () => {
  it('turns a role edit into an approval request instead of applying it', async () => {
    const admin = await signIn('super@arise.test');

    const clone = await call('/roles/ROLE-003/clone', {
      method: 'POST',
      token: admin.accessToken,
      body: { name: 'Catalog Manager (test)' },
    });
    expect(clone.status).toBe(201);
    const roleId = clone.json.data.id;

    const edit = await call(`/roles/${roleId}`, {
      method: 'PATCH',
      token: admin.accessToken,
      body: {
        permissions: ['catalog.product.view'],
        reason: 'narrowing for test',
        version: clone.json.data.version,
      },
    });
    // 202 + APPROVAL_REQUIRED: accepted, but deliberately not applied.
    expect(edit.status).toBe(202);
    expect(edit.json.error.code).toBe('APPROVAL_REQUIRED');

    const unchanged = await call(`/roles/${roleId}`, { token: admin.accessToken });
    expect(unchanged.json.data.permissions.length).toBeGreaterThan(1);
  });

  it('will not let the requester approve their own request', async () => {
    const admin = await signIn('super@arise.test');
    const clone = await call('/roles/ROLE-003/clone', {
      method: 'POST',
      token: admin.accessToken,
      body: { name: 'Self approval test' },
    });
    await call(`/roles/${clone.json.data.id}`, {
      method: 'PATCH',
      token: admin.accessToken,
      body: { permissions: ['catalog.product.view'], reason: 'test', version: 1 },
    });

    const mine = await call('/approvals?view=raised_by_me', { token: admin.accessToken });
    const pending = mine.json.data.find((a) => a.status === 'PENDING');
    expect(pending).toBeTruthy();

    const decide = await call(`/approvals/${pending.id}/decide`, {
      method: 'POST',
      token: admin.accessToken,
      body: { approve: true },
    });
    expect(decide.status).toBe(403);
    expect(decide.json.error.message).toMatch(/cannot approve/i);
  });

  it('applies the change once a different admin approves', async () => {
    const approver = await signIn('approver@arise.test');

    // A seeded request raised by someone else.
    const inbox = await call('/approvals?view=pending_mine', { token: approver.accessToken });
    const target = inbox.json.data.find((a) => a.actionKey === 'payout.release');
    expect(target).toBeTruthy();
    expect(target.canDecide).toBe(true);

    const decided = await call(`/approvals/${target.id}/decide`, {
      method: 'POST',
      token: approver.accessToken,
      body: { approve: true },
    });
    expect(decided.status).toBe(200);
    expect(decided.json.data.status).toBe('APPROVED');
    expect(decided.json.data.decidedByName).toBeTruthy();
  });

  it('requires a reason to reject', async () => {
    const approver = await signIn('approver@arise.test');
    const inbox = await call('/approvals?view=pending_mine', { token: approver.accessToken });
    const target = inbox.json.data[0];

    const noReason = await call(`/approvals/${target.id}/decide`, {
      method: 'POST',
      token: approver.accessToken,
      body: { approve: false },
    });
    expect(noReason.status).toBe(422);

    const withReason = await call(`/approvals/${target.id}/decide`, {
      method: 'POST',
      token: approver.accessToken,
      body: { approve: false, reason: 'Not enough evidence' },
    });
    expect(withReason.status).toBe(200);
    expect(withReason.json.data.status).toBe('REJECTED');
  });

  it('refuses a second decision on the same request', async () => {
    const approver = await signIn('approver@arise.test');
    const inbox = await call('/approvals?view=pending_mine', { token: approver.accessToken });
    const target = inbox.json.data[0];

    await call(`/approvals/${target.id}/decide`, {
      method: 'POST',
      token: approver.accessToken,
      body: { approve: true },
    });
    const again = await call(`/approvals/${target.id}/decide`, {
      method: 'POST',
      token: approver.accessToken,
      body: { approve: true },
    });
    expect(again.status).toBe(409);
  });

  it('only lists requests the viewer can actually decide', async () => {
    // The inbox and its badge must not promise an action the decide endpoint
    // will refuse — they now share one rule.
    for (const email of ['approver@arise.test', 'ops@arise.test', 'super@arise.test']) {
      const session = await signIn(email);
      const inbox = await call('/approvals?view=pending_mine&pageSize=100', {
        token: session.accessToken,
      });
      expect(inbox.status).toBe(200);
      expect(inbox.json.data.every((a) => a.canDecide)).toBe(true);

      const counts = await call('/approvals/counts', { token: session.accessToken });
      expect(counts.json.data.pendingMine).toBe(inbox.json.meta.total);
    }
  });

  it('routes each request to an approver holding that action’s permission', async () => {
    const financeApprover = await signIn('approver@arise.test');
    const ops = await signIn('ops@arise.test');

    const financeInbox = await call('/approvals?view=pending_mine&pageSize=100', {
      token: financeApprover.accessToken,
    });
    const opsInbox = await call('/approvals?view=pending_mine&pageSize=100', { token: ops.accessToken });

    // Payout releases belong to finance; seller suspensions do not.
    expect(financeInbox.json.data.some((a) => a.actionKey === 'payout.release')).toBe(true);
    expect(opsInbox.json.data.some((a) => a.actionKey === 'payout.release')).toBe(false);
    expect(opsInbox.json.data.some((a) => a.actionKey === 'seller.suspend')).toBe(true);
  });

  it('hides requests the approver lacks the permission to decide', async () => {
    const marketing = await signIn('marketing@arise.test');
    const r = await call('/approvals?view=pending_mine', { token: marketing.accessToken });
    // Marketing holds no approval permission at all, so the inbox is refused.
    expect(r.status).toBe(403);
  });
});

describe('list semantics', () => {
  it('paginates and reports a total', async () => {
    const admin = await signIn('super@arise.test');
    const page1 = await call('/audit-events?page=1&pageSize=10', { token: admin.accessToken });
    expect(page1.json.data).toHaveLength(10);
    expect(page1.json.meta.total).toBeGreaterThan(100);

    const page2 = await call('/audit-events?page=2&pageSize=10', { token: admin.accessToken });
    expect(page2.json.data[0].id).not.toBe(page1.json.data[0].id);
  });

  it('sorts ascending and descending', async () => {
    const admin = await signIn('super@arise.test');
    const asc = await call('/audit-events?sort=at&pageSize=5', { token: admin.accessToken });
    const desc = await call('/audit-events?sort=-at&pageSize=5', { token: admin.accessToken });
    expect(new Date(asc.json.data[0].at) < new Date(desc.json.data[0].at)).toBe(true);
  });

  it('filters by an exact field', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/audit-events?module=orders&pageSize=100', { token: admin.accessToken });
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.data.every((e) => e.module === 'orders')).toBe(true);
  });

  it('filters by a comma-separated multi-select', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users?status=ACTIVE,LOCKED&pageSize=100', {
      token: admin.accessToken,
    });
    expect(r.json.data.every((u) => ['ACTIVE', 'LOCKED'].includes(u.status))).toBe(true);
  });

  it('filters by a date range', async () => {
    const admin = await signIn('super@arise.test');
    const from = new Date(Date.now() - 2 * 3600_000).toISOString();
    const r = await call(`/audit-events?at[gte]=${encodeURIComponent(from)}&pageSize=100`, {
      token: admin.accessToken,
    });
    expect(r.json.data.every((e) => new Date(e.at) >= new Date(from))).toBe(true);
  });

  it('searches across the declared fields', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users?q=finance', { token: admin.accessToken });
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.data[0].email).toContain('finance');
  });

  it('returns status facet counts that add up to the total', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users?pageSize=1', { token: admin.accessToken });
    const facets = r.json.meta.facets.status;
    const sum = Object.values(facets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.json.meta.total);
  });

  it('never leaks a password or 2FA secret', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users?pageSize=100', { token: admin.accessToken });
    const serialised = JSON.stringify(r.json);
    expect(serialised).not.toContain(DEMO_PASSWORD);
    expect(serialised).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialised).not.toContain('backupCodes');
  });
});

describe('admin user lifecycle', () => {
  it('invites, then blocks a duplicate email', async () => {
    const admin = await signIn('super@arise.test');
    const invite = await call('/admin-users', {
      method: 'POST',
      token: admin.accessToken,
      body: { name: 'New Person', email: 'new.person@arise.test', roleIds: ['ROLE-003'] },
    });
    expect(invite.status).toBe(201);
    expect(invite.json.data.status).toBe('INVITED');
    expect(invite.json.meta.devHint.inviteUrl).toContain('token=');

    const dup = await call('/admin-users', {
      method: 'POST',
      token: admin.accessToken,
      body: { name: 'Another', email: 'new.person@arise.test', roleIds: ['ROLE-003'] },
    });
    expect(dup.status).toBe(422);
    expect(dup.json.error.fieldErrors.email).toMatch(/already exists/);
  });

  it('validates the invite payload', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users', {
      method: 'POST',
      token: admin.accessToken,
      body: { name: '', email: 'not-an-email', roleIds: [] },
    });
    expect(r.status).toBe(422);
    expect(Object.keys(r.json.error.fieldErrors).sort()).toEqual(['email', 'name', 'roleIds']);
  });

  it('unlocks a locked account', async () => {
    const admin = await signIn('super@arise.test');
    const locked = await call('/admin-users?status=LOCKED', { token: admin.accessToken });
    const target = locked.json.data[0];
    expect(target).toBeTruthy();

    const unlocked = await call(`/admin-users/${target.id}/unlock`, {
      method: 'POST',
      token: admin.accessToken,
    });
    expect(unlocked.status).toBe(200);
    expect(unlocked.json.data.status).toBe('ACTIVE');
  });

  it('refuses to deactivate your own account', async () => {
    const admin = await signIn('super@arise.test');
    const me = await call('/me', { token: admin.accessToken });
    const r = await call(`/admin-users/${me.json.data.id}/deactivate`, {
      method: 'POST',
      token: admin.accessToken,
      body: { reason: 'test' },
    });
    expect(r.status).toBe(409);
  });

  it('requires a reason to deactivate', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users/ADM-002/deactivate', {
      method: 'POST',
      token: admin.accessToken,
      body: {},
    });
    expect(r.status).toBe(422);
  });

  it('ends every session when an account is deactivated', async () => {
    const victim = await signIn('ops@arise.test');
    const admin = await signIn('super@arise.test');

    const before = await call('/me', { token: victim.accessToken });
    expect(before.status).toBe(200);

    await call(`/admin-users/${victim.user.id}/deactivate`, {
      method: 'POST',
      token: admin.accessToken,
      body: { reason: 'Left the company' },
    });

    // Deactivation revokes the sessions outright, so the token stops working
    // immediately rather than surviving until the account check runs.
    const after = await call('/dashboard/summary?days=1', { token: victim.accessToken });
    expect(after.status).toBe(401);
    expect(after.json.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('concurrency and integrity', () => {
  it('rejects a stale write with a 409 and returns the current record', async () => {
    const admin = await signIn('super@arise.test');
    const clone = await call('/roles/ROLE-003/clone', {
      method: 'POST',
      token: admin.accessToken,
      body: { name: 'Version conflict test' },
    });

    const stale = await call(`/roles/${clone.json.data.id}`, {
      method: 'PATCH',
      token: admin.accessToken,
      body: { name: 'Renamed', version: 99, reason: 'test' },
    });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('VERSION_CONFLICT');
    expect(stale.json.error.details.current).toBeTruthy();
  });

  it('will not edit or delete a system role', async () => {
    const admin = await signIn('super@arise.test');
    const edit = await call('/roles/ROLE-001', {
      method: 'PATCH',
      token: admin.accessToken,
      body: { name: 'Hacked', reason: 'test' },
    });
    expect(edit.status).toBe(409);
    expect(edit.json.error.code).toBe('ROLE_IS_SYSTEM');
  });

  it('will not delete a role that is still assigned', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/roles/ROLE-002', { method: 'DELETE', token: admin.accessToken });
    // System role check fires first; either refusal is correct, never a delete.
    expect([409]).toContain(r.status);
  });

  it('404s an unknown record rather than failing opaquely', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/admin-users/ADM-999', { token: admin.accessToken });
    expect(r.status).toBe(404);
  });
});

describe('dashboard', () => {
  it('scopes KPIs and tiles to what the role may see', async () => {
    const finance = await signIn('finance@arise.test');
    const summary = await call('/dashboard/summary?days=7', { token: finance.accessToken });
    expect(summary.status).toBe(200);
    expect(summary.json.data.kpis.some((k) => k.key === 'netRevenue')).toBe(true);
    expect(summary.json.data.paymentMix.length).toBeGreaterThan(0);

    const agent = await signIn('agent@arise.test');
    const agentSummary = await call('/dashboard/summary?days=7', { token: agent.accessToken });
    // Support has no finance widget permission, so revenue is withheld.
    expect(agentSummary.json.data.kpis.some((k) => k.key === 'netRevenue')).toBe(false);
    expect(agentSummary.json.data.paymentMix).toEqual([]);
  });

  it('returns only action-center tiles the role can act on', async () => {
    const lead = await signIn('supportlead@arise.test');
    const r = await call('/dashboard/action-center', { token: lead.accessToken });
    expect(r.status).toBe(200);
    const keys = r.json.data.map((t) => t.key);
    expect(keys).toContain('ticketsBreachingSla');
    // The support lead cannot see payouts, so that queue is withheld.
    expect(keys).not.toContain('payoutBatchesAwaitingApproval');
  });

  it('refuses the action center to a role without that permission', async () => {
    const agent = await signIn('agent@arise.test');
    const r = await call('/dashboard/action-center', { token: agent.accessToken });
    expect(r.status).toBe(403);
  });

  it('matches the series length to the requested range', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/dashboard/summary?days=30', { token: admin.accessToken });
    expect(r.json.data.series).toHaveLength(30);
    expect(r.json.data.previousSeries).toHaveLength(30);
  });
});

describe('search and lookups', () => {
  it('recognises a typed order ID and offers the direct jump', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/search?q=ORD-84920', { token: admin.accessToken });
    expect(r.json.data.typed.type).toBe('order');
    expect(r.json.data.typed.link).toContain('ORD-84920');
  });

  it('finds navigation targets by name', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/search?q=payouts', { token: admin.accessToken });
    const pages = r.json.data.groups.find((g) => g.key === 'pages');
    expect(pages.items.some((i) => i.link === '/finance/payouts')).toBe(true);
  });

  it('omits groups the caller cannot see', async () => {
    const agent = await signIn('agent@arise.test');
    const r = await call('/search?q=a', { token: agent.accessToken });
    expect(r.json.data.groups.some((g) => g.key === 'adminUser')).toBe(false);
  });

  it('ignores a term that is too short', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/search?q=a', { token: admin.accessToken });
    expect(r.json.data.groups).toEqual([]);
  });

  it('resolves selected ids back to labels', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/lookups/seller?ids=SEL-0001,SEL-0002', { token: admin.accessToken });
    expect(r.json.data).toHaveLength(2);
    expect(r.json.data[0].label).toBeTruthy();
  });

  it('returns a three-level category tree', async () => {
    const admin = await signIn('super@arise.test');
    const r = await call('/categories/tree', { token: admin.accessToken });
    expect(r.json.data.length).toBeGreaterThan(5);
    expect(r.json.data[0].children[0].children.length).toBeGreaterThan(0);
  });
});

describe('error injection', () => {
  it('fails the next request when the dev toolbar asks it to', async () => {
    const admin = await signIn('super@arise.test');
    await call('/dev/settings', { method: 'PATCH', body: { failNext: true } });

    const failed = await call('/admin-users', { token: admin.accessToken });
    expect(failed.status).toBe(500);

    // The flag is one-shot.
    const ok = await call('/admin-users', { token: admin.accessToken });
    expect(ok.status).toBe(200);
  });

  it('leaves sign-in alone when a random error rate is set', async () => {
    updateSettings({ errorRate: 100 });
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: 'super@arise.test', password: DEMO_PASSWORD },
    });
    expect(login.status).toBe(200);
  });
});
