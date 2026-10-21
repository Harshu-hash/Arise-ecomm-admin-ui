import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessionStore } from '@core/auth/sessionStore';
import { useCan } from '@core/rbac/useCan';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import NoAccess from '@shared/components/NoAccess';

/** Blocks the app shell until the session is known, then routes by status. */
export function RequireAuth() {
  const status = useSessionStore((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Checking your session…" />;

  if (status === 'anonymous' || status === 'pending_2fa') {
    // Preserve where they were headed so login can return them there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === 'pending_password_change' && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

/** Keeps signed-in users out of the login screens. */
export function RequireAnonymous() {
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);

  if (status === 'loading') return <FullPageSpinner label="Loading…" />;
  if (status === 'authenticated') return <Navigate to={user?.defaultLanding ?? '/'} replace />;
  return <Outlet />;
}

/**
 * Route-level permission gate. Renders the 403 page in place of the route so
 * the user keeps the shell, the sidebar and a way out — a bare redirect leaves
 * people guessing why a link they were sent does not work.
 */
export function RequirePermission({ perm, mode = 'any', children }) {
  const can = useCan();
  if (!perm || can(perm, mode)) return children ?? <Outlet />;
  return <NoAccess required={Array.isArray(perm) ? perm : [perm]} />;
}
