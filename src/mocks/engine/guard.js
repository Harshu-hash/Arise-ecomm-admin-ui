import { hasPermission, permissionsFor, resolveCaller } from './auth';
import { forbidden, simulateNetwork, unauthorized } from './respond';

/**
 * The preamble every authenticated handler runs: network simulation, session
 * resolution and a permission check. The mock enforces permissions for real so
 * the UI's 403 paths are exercised, and so a role misconfiguration shows up
 * here rather than in production.
 *
 * Returns `{ response }` to short-circuit, or `{ user, session, permissions }`.
 */
export async function guard(request, url, permission, mode = 'any') {
  const injected = await simulateNetwork(url.pathname);
  if (injected) return { response: injected };

  const { user, session, error } = resolveCaller(request);
  if (error === 'missing' || error === 'invalid') {
    return { response: unauthorized('Not signed in.') };
  }
  if (error === 'expired') {
    return { response: unauthorized('Your access token expired.') };
  }
  if (error === 'inactive') {
    return { response: forbidden('This admin account is no longer active.') };
  }

  const permissions = permissionsFor(user);

  if (permission) {
    const keys = Array.isArray(permission) ? permission : [permission];
    const held =
      permissions.includes('*') ||
      (mode === 'all' ? keys.every((k) => permissions.includes(k)) : keys.some((k) => permissions.includes(k)));
    if (!held) {
      return {
        response: forbidden('You do not have permission to do this.', {
          details: { required: keys, mode },
        }),
      };
    }
  }

  return { user, session, permissions };
}

export { hasPermission };
