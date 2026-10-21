import { useEffect, useRef } from 'react';
import { authApi } from './authApi';
import { useSessionStore } from './sessionStore';

/**
 * Restores the session on first load. A stored refresh token is exchanged for
 * a fresh access token, so a reload (or following a deep link) does not bounce
 * the user back to the login screen.
 */
export function useBootstrapSession() {
  const status = useSessionStore((s) => s.status);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const { refreshToken, setAuthenticated, setAnonymous } = useSessionStore.getState();
    if (!refreshToken) {
      setAnonymous();
      return;
    }

    authApi
      .refresh(refreshToken)
      .then(({ user, accessToken, refreshToken: rotated }) => {
        if (user) setAuthenticated({ user, accessToken, refreshToken: rotated });
        else setAnonymous();
      })
      .catch(() => setAnonymous());
  }, []);

  return status;
}
