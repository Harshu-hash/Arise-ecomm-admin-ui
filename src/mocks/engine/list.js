/**
 * Server-side list semantics, simulated: search, filtering, sorting,
 * pagination and status facets. Lists go through this so the UI never
 * filters or sorts client-side — the same contract the real backend must meet.
 */

/** Reads `?page&pageSize&sort&q&...` off a URL. */
export function parseListQuery(url, { defaultSort = '-createdAt', defaultPageSize = 25 } = {}) {
  const p = url.searchParams;
  const page = Math.max(1, Number(p.get('page') ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(p.get('pageSize') ?? defaultPageSize)));
  const sort = p.get('sort') || defaultSort;
  const q = (p.get('q') || '').trim();

  const filters = {};
  for (const [key, value] of p.entries()) {
    if (['page', 'pageSize', 'sort', 'q'].includes(key)) continue;
    if (value === '') continue;
    // `placedAt[gte]` style range operators.
    const m = key.match(/^(.+)\[(gte|lte|gt|lt)\]$/);
    if (m) {
      filters[m[1]] = { ...(filters[m[1]] ?? {}), [m[2]]: value };
    } else if (value.includes(',')) {
      filters[key] = value.split(',');
    } else {
      filters[key] = value;
    }
  }
  return { page, pageSize, sort, q, filters };
}

function valueAt(row, path) {
  return path.split('.').reduce((acc, k) => (acc === null || acc === undefined ? acc : acc[k]), row);
}

/** Case-insensitive substring match across the given fields. */
export function applySearch(rows, q, fields) {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((row) =>
    fields.some((f) => {
      const v = valueAt(row, f);
      return v !== null && v !== undefined && String(v).toLowerCase().includes(needle);
    }),
  );
}

/**
 * Applies filters declaratively.
 * `spec` maps a query param to either a row field path, or a predicate
 * `(row, value) => boolean` for anything computed.
 */
export function applyFilters(rows, filters, spec) {
  let out = rows;
  for (const [key, value] of Object.entries(filters)) {
    const rule = spec[key];
    if (!rule) continue;

    if (typeof rule === 'function') {
      out = out.filter((row) => rule(row, value));
      continue;
    }

    const path = typeof rule === 'string' ? rule : rule.path;
    const kind = typeof rule === 'string' ? 'equals' : (rule.kind ?? 'equals');

    out = out.filter((row) => {
      const v = valueAt(row, path);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const t = kind === 'date' ? new Date(v ?? 0).getTime() : Number(v);
        const bound = (b) => (kind === 'date' ? new Date(b).getTime() : Number(b));
        if (value.gte !== undefined && !(t >= bound(value.gte))) return false;
        if (value.lte !== undefined && !(t <= bound(value.lte))) return false;
        if (value.gt !== undefined && !(t > bound(value.gt))) return false;
        if (value.lt !== undefined && !(t < bound(value.lt))) return false;
        return true;
      }
      if (Array.isArray(value)) return value.map(String).includes(String(v));
      if (kind === 'boolean') return String(Boolean(v)) === String(value);
      if (kind === 'contains') {
        return String(v ?? '').toLowerCase().includes(String(value).toLowerCase());
      }
      if (kind === 'arrayContains') return Array.isArray(v) && v.map(String).includes(String(value));
      return String(v) === String(value);
    });
  }
  return out;
}

/** `sort` is `field` or `-field`. Unknown fields are ignored. */
export function applySort(rows, sort, allowed) {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (allowed && !allowed.includes(field)) return rows;

  return [...rows].sort((a, b) => {
    const av = valueAt(a, field);
    const bv = valueAt(b, field);
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const res =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'en', { numeric: true });
    return desc ? -res : res;
  });
}

/** Counts per status value across the *unpaginated* set, for tab badges. */
export function buildFacets(rows, facetFields) {
  const facets = {};
  for (const field of facetFields ?? []) {
    const counts = {};
    for (const row of rows) {
      const v = valueAt(row, field);
      if (v === null || v === undefined) continue;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    facets[field] = counts;
  }
  return facets;
}

/**
 * One call that does the whole pipeline and returns `{ items, meta }` ready
 * for `okList`.
 */
export function listResult(rows, query, config = {}) {
  const { searchFields = [], filterSpec = {}, sortable, facetFields, map } = config;
  let out = applySearch(rows, query.q, searchFields);
  out = applyFilters(out, query.filters, filterSpec);
  const facets = buildFacets(out, facetFields);
  out = applySort(out, query.sort, sortable);

  const total = out.length;
  const start = (query.page - 1) * query.pageSize;
  const pageRows = out.slice(start, start + query.pageSize);

  return {
    items: map ? pageRows.map(map) : pageRows,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      ...(facetFields ? { facets } : {}),
    },
  };
}
