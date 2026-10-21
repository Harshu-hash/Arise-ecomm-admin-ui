import { beforeEach, describe, expect, it } from 'vitest';
import { SNAPSHOT_VERSION, db, resetDb, snapshotDb } from './db/store';
import { snapshotIsUsable } from './persistence';
import { seedAll } from './seed';

/**
 * Covers the failure that locked a browser out of the demo: a snapshot written
 * by an older build was restored forever, so the new seed never ran and the
 * documented credentials stopped working.
 */
describe('snapshotIsUsable', () => {
  let current;

  beforeEach(() => {
    resetDb();
    seedAll();
    current = JSON.parse(JSON.stringify(snapshotDb()));
  });

  it('accepts a snapshot written by this build', () => {
    expect(snapshotIsUsable(current)).toEqual({ ok: true });
  });

  it('rejects a snapshot from an older build', () => {
    const old = { ...current, version: SNAPSHOT_VERSION - 1 };
    const result = snapshotIsUsable(old);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(`expected ${SNAPSHOT_VERSION}`);
  });

  it('rejects a snapshot with no version at all', () => {
    const { version: _dropped, ...unversioned } = current;
    expect(snapshotIsUsable(unversioned).ok).toBe(false);
  });

  it('rejects an absent snapshot', () => {
    expect(snapshotIsUsable(null)).toEqual({ ok: false, reason: 'none' });
  });

  it('rejects a snapshot with no admin users', () => {
    const empty = { ...current, collections: { ...current.collections, adminUsers: [] } };
    expect(snapshotIsUsable(empty)).toMatchObject({ ok: false, reason: 'no admin users' });
  });

  it('rejects a snapshot with no roles', () => {
    const noRoles = { ...current, collections: { ...current.collections, roles: [] } };
    expect(snapshotIsUsable(noRoles)).toMatchObject({ ok: false, reason: 'no roles' });
  });

  it('rejects accounts that have lost their credentials', () => {
    const stripped = {
      ...current,
      collections: {
        ...current.collections,
        adminUsers: current.collections.adminUsers.map((u) => ({ ...u, password: null })),
      },
    };
    expect(snapshotIsUsable(stripped)).toMatchObject({
      ok: false,
      reason: 'admin accounts have no credentials',
    });
  });

  it('still accepts a snapshot where only some accounts have no password', () => {
    // Invited admins legitimately have none until they accept.
    const mixed = JSON.parse(JSON.stringify(current));
    mixed.collections.adminUsers[1].password = null;
    expect(snapshotIsUsable(mixed).ok).toBe(true);
  });

  it('guards against a snapshot missing its collections entirely', () => {
    expect(snapshotIsUsable({ version: SNAPSHOT_VERSION }).ok).toBe(false);
  });

  it('seeds credentials that match what the sign-in screen documents', () => {
    // The regression was a mismatch between the seed and the documented
    // password, so assert them together.
    const superAdmin = db.adminUsers.find((u) => u.email === 'super@arise.test');
    expect(superAdmin).toBeTruthy();
    expect(superAdmin.password).toBe('Arise@123456');
    expect(superAdmin.status).toBe('ACTIVE');
  });
});
