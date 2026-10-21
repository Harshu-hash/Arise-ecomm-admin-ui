import axios from 'axios';
import { ENV } from '@core/config/env';
import { sessionSnapshot, useSessionStore } from '@core/auth/sessionStore';
import { toApiError } from './errors';

export const http = axios.create({
  baseURL: ENV.apiBaseUrl,
  timeout: 30000,
  // Live mode sends the httpOnly refresh cookie; harmless in mock mode.
  withCredentials: ENV.mode === 'live',
  headers: { Accept: 'application/json' },
});

function requestId() {
  return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

http.interceptors.request.use((config) => {
  const { accessToken } = sessionSnapshot();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  config.headers['X-Request-Id'] = requestId();
  return config;
});

/**
 * Single-flight refresh: many queries can 401 at once after a token expires,
 * but only the first triggers a refresh; the rest await the same promise and
 * then retry. Without this, a dashboard with 8 widgets would fire 8 refreshes
 * and the server would invalidate the rotating refresh token mid-flight.
 */
let refreshPromise = null;

async function refreshAccessToken() {
  const { refreshToken } = sessionSnapshot();
  const res = await axios.post(
    `${ENV.apiBaseUrl}/auth/refresh`,
    ENV.mode === 'live' ? {} : { refreshToken },
    { withCredentials: ENV.mode === 'live' },
  );
  const { accessToken, refreshToken: rotated, user } = res.data?.data ?? {};
  if (!accessToken) throw new Error('No access token in refresh response');
  const store = useSessionStore.getState();
  if (user) store.setAuthenticated({ user, accessToken, refreshToken: rotated });
  else store.setAccessToken(accessToken);
  return accessToken;
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config ?? {};
    const isAuthCall = String(config.url ?? '').includes('/auth/');

    if (status === 401 && !config.__retried && !isAuthCall && sessionSnapshot().refreshToken) {
      config.__retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        await refreshPromise;
        return http(config);
      } catch {
        useSessionStore.getState().setAnonymous();
      }
    }

    if (status === 401 && !isAuthCall) useSessionStore.getState().setAnonymous();

    return Promise.reject(toApiError(error));
  },
);

/** Unwraps the `{ data, meta }` envelope every endpoint returns. */
export async function request(config) {
  const res = await http(config);
  return res.data;
}

export const api = {
  get: (url, params, config) => request({ method: 'GET', url, params, ...config }),
  post: (url, data, config) => request({ method: 'POST', url, data, ...config }),
  put: (url, data, config) => request({ method: 'PUT', url, data, ...config }),
  patch: (url, data, config) => request({ method: 'PATCH', url, data, ...config }),
  delete: (url, config) => request({ method: 'DELETE', url, ...config }),
};

/**
 * Money-moving commands must be idempotent: a retry after a timeout must not
 * refund twice. Callers pass a key they can reproduce for the same intent.
 */
export function withIdempotency(key, config = {}) {
  return { ...config, headers: { ...(config.headers ?? {}), 'Idempotency-Key': key } };
}
