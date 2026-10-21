import { useCallback } from 'react';
import { useSessionStore } from '@core/auth/sessionStore';
import { inScope, withinLimit } from './scopes';

/**
 * Permission checks. A user with `*` (Super Admin) passes everything.
 *
 * Accepts a single key, or an array. `mode` decides how arrays combine:
 *   'any' (default) — at least one key must be held
 *   'all'           — every key must be held
 */
export function checkPermission(permissions, keys, mode = 'any') {
  if (!permissions || permissions.size === 0) return false;
  if (permissions.has('*')) return true;
  const list = Array.isArray(keys) ? keys : [keys];
  if (list.length === 0) return true;
  return mode === 'all' ? list.every((k) => permissions.has(k)) : list.some((k) => permissions.has(k));
}

/** `can('orders.order.view')` — reactive; re-renders when the session changes. */
export function useCan() {
  const permissions = useSessionStore((s) => s.permissions);
  return useCallback((keys, mode) => checkPermission(permissions, keys, mode), [permissions]);
}

/** Convenience for a single check in a component body. */
export function useHasPermission(keys, mode) {
  const permissions = useSessionStore((s) => s.permissions);
  return checkPermission(permissions, keys, mode);
}

/** Scope helpers, reactive on the session's scope object. */
export function useScope() {
  const scope = useSessionStore((s) => s.scope);
  const isSuper = useSessionStore((s) => s.permissions.has('*'));

  return {
    scope,
    isUnrestricted: isSuper || !scope,
    allows: (dimension, id) => (isSuper ? true : inScope(scope, dimension, id)),
    within: (limitKey, amountPaise) => (isSuper ? true : withinLimit(scope, limitKey, amountPaise)),
  };
}

/** The current user, or null. */
export function useCurrentUser() {
  return useSessionStore((s) => s.user);
}
