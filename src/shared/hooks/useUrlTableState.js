import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const RESERVED = ['page', 'pageSize', 'sort', 'q', 'tab', 'view'];

/**
 * Table state lives in the URL, not in component state.
 *
 * That is what makes a filtered list shareable: an agent can paste "orders
 * breaching SLA in Maharashtra" into a ticket and the recipient sees exactly
 * the same rows. It also means the back button steps through filter changes
 * the way users expect.
 */
export default function useUrlTableState({ defaultSort = '-createdAt', defaultPageSize = 25, defaultTab } = {}) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const filters = {};
    for (const [key, value] of params.entries()) {
      if (RESERVED.includes(key)) continue;
      // Repeated keys and comma lists both mean multi-select.
      const existing = filters[key];
      if (existing !== undefined) {
        filters[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        filters[key] = value.includes(',') ? value.split(',') : value;
      }
    }
    return {
      page: Math.max(1, Number(params.get('page') ?? 1)),
      pageSize: Math.max(1, Number(params.get('pageSize') ?? defaultPageSize)),
      sort: params.get('sort') ?? defaultSort,
      q: params.get('q') ?? '',
      tab: params.get('tab') ?? defaultTab ?? null,
      filters,
    };
  }, [params, defaultSort, defaultPageSize, defaultTab]);

  const write = useCallback(
    (next, { replace = false } = {}) => {
      const sp = new URLSearchParams();
      const merged = { ...state, ...next };

      if (merged.page > 1) sp.set('page', String(merged.page));
      if (merged.pageSize !== defaultPageSize) sp.set('pageSize', String(merged.pageSize));
      if (merged.sort && merged.sort !== defaultSort) sp.set('sort', merged.sort);
      if (merged.q) sp.set('q', merged.q);
      if (merged.tab && merged.tab !== defaultTab) sp.set('tab', merged.tab);

      for (const [key, value] of Object.entries(merged.filters ?? {})) {
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value)) {
          if (!value.length) continue;
          sp.set(key, value.join(','));
        } else if (typeof value === 'object') {
          // Range operators: `placedAt[gte]`.
          for (const [op, v] of Object.entries(value)) {
            if (v !== null && v !== undefined && v !== '') sp.set(`${key}[${op}]`, String(v));
          }
        } else {
          sp.set(key, String(value));
        }
      }

      setParams(sp, { replace });
    },
    [state, setParams, defaultSort, defaultPageSize, defaultTab],
  );

  /** Filter and search changes reset to page 1; paging obviously must not. */
  const setFilters = useCallback((filters) => write({ filters, page: 1 }), [write]);
  const patchFilters = useCallback(
    (patch) => write({ filters: { ...state.filters, ...patch }, page: 1 }),
    [write, state.filters],
  );
  const setSearch = useCallback((q) => write({ q, page: 1 }, { replace: true }), [write]);
  const setTab = useCallback((tab) => write({ tab, page: 1 }), [write]);
  const setPage = useCallback((page, pageSize) => write({ page, pageSize }), [write]);
  const setSort = useCallback((sort) => write({ sort, page: 1 }), [write]);
  const clearFilters = useCallback(() => write({ filters: {}, q: '', page: 1 }), [write]);

  /** Flattened params for the API call. */
  const queryParams = useMemo(() => {
    const out = { page: state.page, pageSize: state.pageSize, sort: state.sort };
    if (state.q) out.q = state.q;
    for (const [key, value] of Object.entries(state.filters)) {
      if (Array.isArray(value)) out[key] = value.join(',');
      else if (value && typeof value === 'object') {
        for (const [op, v] of Object.entries(value)) out[`${key}[${op}]`] = v;
      } else out[key] = value;
    }
    return out;
  }, [state]);

  const activeFilterCount = useMemo(
    () => Object.values(state.filters).filter((v) => v !== null && v !== undefined && v !== '').length,
    [state.filters],
  );

  return {
    ...state,
    queryParams,
    activeFilterCount,
    hasFilters: activeFilterCount > 0 || Boolean(state.q),
    setFilters,
    patchFilters,
    setSearch,
    setTab,
    setPage,
    setSort,
    clearFilters,
    write,
  };
}
