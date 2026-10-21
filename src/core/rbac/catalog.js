import { PERMISSION_MODULES } from './permissions.data';

/** Flattened catalog entry: one per permission key. */
function flatten() {
  const out = [];
  for (const mod of PERMISSION_MODULES) {
    for (const res of mod.resources) {
      for (const act of res.actions) {
        const key = `${mod.key}.${res.key}.${act.action}`;
        const viewKey = `${mod.key}.${res.key}.view`;
        out.push({
          key,
          moduleKey: mod.key,
          moduleLabel: mod.label,
          resourceKey: res.key,
          resourceLabel: res.label,
          action: act.action,
          actionLabel: act.label,
          sensitive: Boolean(act.sensitive),
          mc: Boolean(act.mc),
          // Anything other than `view` needs `view` on the same resource to be
          // usable, so the role editor can select it automatically.
          implies: act.action === 'view' || !out.some((p) => p.key === viewKey) ? [] : [viewKey],
        });
      }
    }
  }
  return out;
}

export const ALL_PERMISSIONS = flatten();

export const PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

const BY_KEY = new Map(ALL_PERMISSIONS.map((p) => [p.key, p]));

export function getPermission(key) {
  return BY_KEY.get(key);
}

export function isValidPermission(key) {
  return BY_KEY.has(key);
}

/** All distinct action columns within a module, in catalog order. */
export function moduleActionColumns(moduleKey) {
  const seen = [];
  for (const p of ALL_PERMISSIONS) {
    if (p.moduleKey !== moduleKey) continue;
    if (!seen.some((s) => s.action === p.action)) seen.push({ action: p.action, label: p.actionLabel });
  }
  return seen;
}

/** Expands a selection to include everything the selected keys imply. */
export function expandImplied(keys) {
  const set = new Set(keys);
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of Array.from(set)) {
      for (const implied of getPermission(key)?.implies ?? []) {
        if (!set.has(implied)) {
          set.add(implied);
          grew = true;
        }
      }
    }
  }
  return Array.from(set);
}

/** Keys that would become orphaned if `key` were removed (i.e. depend on it). */
export function dependentsOf(key) {
  return ALL_PERMISSIONS.filter((p) => p.implies.includes(key)).map((p) => p.key);
}

export function sensitiveKeysIn(keys) {
  return keys.filter((k) => getPermission(k)?.sensitive);
}

export { PERMISSION_MODULES };
