/**
 * Per-user, per-table column preferences (visibility, order, density).
 *
 * Stored in localStorage because it is pure per-viewer convenience: if it
 * comes back empty the table simply shows its defaults. Saved *views* —
 * filter sets people share with their team — are server state instead.
 */

const KEY = (tableId) => `arise.table.${tableId}`;

export function loadPrefs(tableId) {
  try {
    const raw = localStorage.getItem(KEY(tableId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePrefs(tableId, prefs) {
  try {
    localStorage.setItem(KEY(tableId), JSON.stringify(prefs));
  } catch {
    /* blocked storage: preferences just don't persist */
  }
}

export function clearPrefs(tableId) {
  try {
    localStorage.removeItem(KEY(tableId));
  } catch {
    /* ignore */
  }
}

/**
 * Resolves the column set to render: applies saved order and visibility, drops
 * columns the viewer's breakpoint hides, and always keeps pinned columns.
 */
export function resolveColumns({ columns, prefs, priorityCutoff }) {
  const byKey = new Map(columns.map((c) => [c.key ?? c.dataIndex, c]));
  const savedOrder = prefs?.order ?? [];
  const ordered = [
    ...savedOrder.map((k) => byKey.get(k)).filter(Boolean),
    ...columns.filter((c) => !savedOrder.includes(c.key ?? c.dataIndex)),
  ];

  return ordered.filter((col) => {
    const key = col.key ?? col.dataIndex;
    if (col.alwaysVisible) return true;
    if (prefs?.hidden?.includes(key)) return false;
    // `priority` 1 = essential, 3 = nice to have. Narrow screens drop 3 then 2.
    const priority = col.priority ?? 1;
    if (priority > priorityCutoff) return false;
    return prefs?.hidden ? true : col.defaultHidden !== true;
  });
}
