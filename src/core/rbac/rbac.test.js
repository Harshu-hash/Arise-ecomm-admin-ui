import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSION_KEYS,
  dependentsOf,
  expandImplied,
  getPermission,
} from './catalog';
import { ROLE_TEMPLATES, SEEDED_ROLES, resolvePatterns } from './roleTemplates';
import { checkPermission } from './useCan';
import { inScope, withinLimit } from './scopes';

describe('permission catalog', () => {
  it('produces unique, well-formed keys', () => {
    expect(PERMISSION_KEYS.length).toBeGreaterThan(200);
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) {
      // Digits are allowed: `admin.user.reset_2fa`.
      expect(key).toMatch(/^[a-z_]+\.[a-z0-9_]+\.[a-z0-9_]+$/);
    }
  });

  it('makes every non-view permission imply view on the same resource', () => {
    for (const p of ALL_PERMISSIONS) {
      if (p.action === 'view') {
        expect(p.implies).toEqual([]);
        continue;
      }
      const viewKey = `${p.moduleKey}.${p.resourceKey}.view`;
      // Some resources are action-only (e.g. wallet.adjust.create) and have no
      // view of their own; those correctly imply nothing.
      if (PERMISSION_KEYS.includes(viewKey)) expect(p.implies).toContain(viewKey);
    }
  });
});

describe('expandImplied', () => {
  it('adds the implied view permission', () => {
    const result = expandImplied(['orders.order.export']);
    expect(result).toContain('orders.order.view');
  });

  it('is idempotent', () => {
    const once = expandImplied(['catalog.product.approve']);
    expect(expandImplied(once).sort()).toEqual(once.sort());
  });
});

describe('dependentsOf', () => {
  it('lists the permissions that would be orphaned', () => {
    const deps = dependentsOf('orders.order.view');
    expect(deps).toContain('orders.order.export');
    expect(deps).not.toContain('orders.order.view');
  });
});

describe('resolvePatterns', () => {
  it('expands a module wildcard', () => {
    const keys = resolvePatterns(['orders.*']);
    expect(keys).toContain('orders.order.view');
    expect(keys).toContain('orders.return.approve');
    expect(keys.every((k) => k.startsWith('orders.'))).toBe(true);
  });

  it('subtracts with a leading minus, after earlier patterns added', () => {
    const keys = resolvePatterns(['finance.*', '-finance.payout.approve']);
    expect(keys).toContain('finance.payout.view');
    expect(keys).not.toContain('finance.payout.approve');
  });

  it('matches a single action across every module', () => {
    const keys = resolvePatterns(['*.*.view']);
    expect(keys.every((k) => k.endsWith('.view'))).toBe(true);
    expect(keys.length).toBeGreaterThan(40);
  });
});

describe('seeded roles', () => {
  it('gives Super Admin the wildcard and everyone else explicit keys', () => {
    const superAdmin = SEEDED_ROLES.find((r) => r.key === 'super_admin');
    expect(superAdmin.permissions).toContain('*');
    for (const role of SEEDED_ROLES.filter((r) => r.key !== 'super_admin')) {
      expect(role.permissions).not.toContain('*');
      expect(role.permissions.length).toBeGreaterThan(0);
    }
  });

  it('only references permissions that exist', () => {
    for (const role of SEEDED_ROLES) {
      for (const key of role.permissions) {
        if (key === '*') continue;
        expect(getPermission(key), `${role.key} references unknown ${key}`).toBeTruthy();
      }
    }
  });

  it('separates the maker from the checker in finance', () => {
    const maker = SEEDED_ROLES.find((r) => r.key === 'finance_executive');
    const checker = SEEDED_ROLES.find((r) => r.key === 'finance_approver');
    // The executive prepares payouts; only the approver may release them.
    expect(maker.permissions).toContain('finance.payout.view');
    expect(maker.permissions).not.toContain('finance.payout.approve');
    expect(maker.permissions).not.toContain('finance.payout.release');
    expect(checker.permissions).toContain('finance.payout.release');
  });

  it('keeps the auditor read-only and away from personal data', () => {
    const auditor = SEEDED_ROLES.find((r) => r.key === 'auditor');
    expect(auditor.permissions).not.toContain('customers.pii.view');
    expect(auditor.permissions).not.toContain('sellers.bank.view_full');
    const writeActions = auditor.permissions.filter(
      (k) => !k.endsWith('.view') && !k.endsWith('.export'),
    );
    expect(writeActions).toEqual([]);
  });

  it('declares the scope dimensions each scoped role expects', () => {
    const scoped = ROLE_TEMPLATES.filter((t) => t.scopedBy?.length);
    expect(scoped.map((t) => t.key)).toContain('category_manager');
    expect(scoped.map((t) => t.key)).toContain('warehouse_manager');
  });
});

describe('checkPermission', () => {
  const perms = new Set(['orders.order.view', 'orders.item.cancel']);

  it('matches a held key', () => {
    expect(checkPermission(perms, 'orders.order.view')).toBe(true);
  });

  it('rejects a key that is not held', () => {
    expect(checkPermission(perms, 'finance.refund.issue')).toBe(false);
  });

  it('treats the wildcard as everything', () => {
    expect(checkPermission(new Set(['*']), 'anything.at.all')).toBe(true);
  });

  it('honours any vs all', () => {
    const keys = ['orders.order.view', 'finance.refund.issue'];
    expect(checkPermission(perms, keys, 'any')).toBe(true);
    expect(checkPermission(perms, keys, 'all')).toBe(false);
  });

  it('denies when no permissions are loaded', () => {
    expect(checkPermission(new Set(), 'orders.order.view')).toBe(false);
  });
});

describe('data scoping', () => {
  it('treats null and empty as unrestricted', () => {
    expect(inScope({ categories: null }, 'categories', 'CAT-0001')).toBe(true);
    expect(inScope({ categories: [] }, 'categories', 'CAT-0001')).toBe(true);
  });

  it('restricts to the listed ids', () => {
    const scope = { categories: ['CAT-0001'] };
    expect(inScope(scope, 'categories', 'CAT-0001')).toBe(true);
    expect(inScope(scope, 'categories', 'CAT-0002')).toBe(false);
  });

  it('caps money at the configured limit', () => {
    const scope = { refundLimit: 500000 };
    expect(withinLimit(scope, 'refundLimit', 500000)).toBe(true);
    expect(withinLimit(scope, 'refundLimit', 500001)).toBe(false);
    expect(withinLimit({ refundLimit: null }, 'refundLimit', 10_00_00_000)).toBe(true);
  });
});
