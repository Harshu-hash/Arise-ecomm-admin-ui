import { create } from 'zustand';
import { IS_MOCK } from '@core/config/env';

/**
 * Session state machine:
 *   loading → anonymous | pending_2fa | pending_password_change | authenticated
 *
 * The access token is kept in memory only. In live mode the refresh token is an
 * httpOnly cookie the browser sends automatically. In mock mode there is no
 * cookie jar we can set httpOnly, so the refresh token is persisted in
 * localStorage purely so a page reload keeps you signed in during development.
 */

const REFRESH_KEY = 'arise.refresh';

function loadRefresh() {
  if (!IS_MOCK) return null;
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function saveRefresh(token) {
  if (!IS_MOCK) return;
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* blocked storage: session simply won't survive a reload */
  }
}

export const useSessionStore = create((set, get) => ({
  status: 'loading',
  user: null,
  permissions: new Set(),
  scope: null,
  accessToken: null,
  refreshToken: loadRefresh(),
  /** Set while a 2FA challenge is outstanding. */
  challenge: null,
  lastActivityAt: Date.now(),

  setAuthenticated: ({ user, accessToken, refreshToken }) => {
    saveRefresh(refreshToken ?? get().refreshToken);
    set({
      status: user.mustChangePassword ? 'pending_password_change' : 'authenticated',
      user,
      permissions: new Set(user.permissions ?? []),
      scope: user.scope ?? null,
      accessToken,
      refreshToken: refreshToken ?? get().refreshToken,
      challenge: null,
      lastActivityAt: Date.now(),
    });
  },

  setChallenge: (challenge) => set({ status: 'pending_2fa', challenge }),

  setAnonymous: () => {
    saveRefresh(null);
    set({
      status: 'anonymous',
      user: null,
      permissions: new Set(),
      scope: null,
      accessToken: null,
      refreshToken: null,
      challenge: null,
    });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  /** Applies a fresh copy of the current user (after profile or role changes). */
  patchUser: (patch) =>
    set((s) => {
      const user = { ...s.user, ...patch };
      return {
        user,
        permissions: new Set(user.permissions ?? []),
        scope: user.scope ?? null,
        status: user.mustChangePassword ? 'pending_password_change' : 'authenticated',
      };
    }),

  touch: () => set({ lastActivityAt: Date.now() }),
}));

/** Non-reactive read, for use inside axios interceptors. */
export const sessionSnapshot = () => useSessionStore.getState();
