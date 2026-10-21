import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a deliberate server answer; only transient failures.
        if (error instanceof ApiError) {
          if (error.isNetwork) return failureCount < 2;
          if (error.status && error.status >= 500) return failureCount < 2;
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: false },
  },
});

/**
 * Query-key factory. Keys are arrays so related caches can be invalidated by
 * prefix: `invalidate(qk.orders.all)` clears every order list and detail.
 */
export const qk = {
  session: ['session'],
  me: ['me'],
  mySessions: ['me', 'sessions'],
  globalSearch: (term) => ['search', term],
  adminUsers: {
    all: ['adminUsers'],
    list: (params) => ['adminUsers', 'list', params],
    detail: (id) => ['adminUsers', 'detail', id],
  },
  roles: {
    all: ['roles'],
    list: (params) => ['roles', 'list', params],
    detail: (id) => ['roles', 'detail', id],
  },
  approvals: {
    all: ['approvals'],
    list: (params) => ['approvals', 'list', params],
    detail: (id) => ['approvals', 'detail', id],
    counts: ['approvals', 'counts'],
  },
  audit: {
    all: ['audit'],
    list: (params) => ['audit', 'list', params],
    forEntity: (type, id) => ['audit', 'entity', type, id],
  },
  dashboard: {
    all: ['dashboard'],
    summary: (params) => ['dashboard', 'summary', params],
    actionCenter: ['dashboard', 'actionCenter'],
    alerts: ['dashboard', 'alerts'],
  },
  lookups: {
    entity: (entity, term) => ['lookups', entity, term],
  },
  jobs: {
    all: ['jobs'],
    detail: (id) => ['jobs', id],
  },
};

export function invalidate(key) {
  return queryClient.invalidateQueries({ queryKey: key });
}
