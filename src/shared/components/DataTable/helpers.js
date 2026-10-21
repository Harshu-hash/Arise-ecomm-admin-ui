export { formatNumber } from '@core/utils/money';

/**
 * Every column needs a `width` so the sticky header (which rc-table renders
 * as its own `table-layout: fixed` table, independent of the scrollable body)
 * lines up with the body's columns. Left unset, the header's columns default
 * to near-zero width and its `white-space: nowrap` title spills into the
 * next header cell instead of wrapping. Most columns in this codebase don't
 * bother setting `width` explicitly, so DataTable estimates one from the
 * title text (plus room for a sort arrow) rather than requiring every column
 * definition to specify it by hand.
 */
export function estimateColumnWidth(col) {
  if (col.width) return col.width;

  const key = col.key ?? col.dataIndex;
  const title = typeof col.title === 'string' ? col.title : '';
  const isAction = !title && (key === 'actions' || col.align === 'right');

  if (!title) return isAction ? 140 : 90;

  const textWidth = Math.ceil(title.length * 7.2) + 24;
  const sorterWidth = col.sorter ? 28 : 0;
  return Math.max(textWidth + sorterWidth, 70);
}

export function pluralizeSafe(count, singular, plural) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Ant Design sorter state → our `-field` sort string. */
export function sorterToSort(sorter, fallback) {
  if (!sorter || !sorter.order) return fallback;
  const field = Array.isArray(sorter.field) ? sorter.field.join('.') : (sorter.columnKey ?? sorter.field);
  return `${sorter.order === 'descend' ? '-' : ''}${field}`;
}

/** Our sort string → the `sortOrder` a column needs to show its arrow. */
export function sortOrderFor(sort, key) {
  if (!sort) return null;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return field === key ? (desc ? 'descend' : 'ascend') : null;
}

/** Builds the status tab items from the facet counts the API returns. */
export function tabsFromFacets({ tabs, facets, facetField }) {
  const counts = facets?.[facetField] ?? {};
  return tabs.map((t) => {
    if (t.key === 'all') {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { ...t, count: total };
    }
    const codes = t.codes ?? [t.key];
    return { ...t, count: codes.reduce((n, c) => n + (counts[c] ?? 0), 0) };
  });
}
