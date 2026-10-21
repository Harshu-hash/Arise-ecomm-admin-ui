/**
 * Feature flag resolution (M17.6): whether a flag is "on" for a given
 * context is a pure function of the flag's rollout rule and that context —
 * never a stored yes/no — so the app config screen's own preview can never
 * disagree with what the app would actually do.
 *
 * Kept pure and separate from the handler for the same reason every other
 * rule engine in this panel is.
 */

/** `"1.4.2"` → `[1, 4, 2]`, compared element by element. */
function parseVersion(v) {
  return String(v ?? '0').split('.').map((n) => Number(n) || 0);
}

/** `-1 / 0 / 1`, the same contract as `Array.prototype.sort`'s comparator. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** A stable 0–99 bucket for `key`, so the same user always lands on the same side of a rollout %. */
function bucket(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

/**
 * Resolves whether `flag` is enabled for `context`
 * (`{ platform, appVersion, deviceId, segmentIds }`). Every rule the flag
 * declares must pass — platform, minimum app version, segment, and rollout
 * percentage are all ANDed together, not alternatives.
 */
export function resolveFlag(flag, context = {}) {
  if (!flag.enabled) return false;
  if (flag.platform && flag.platform !== 'ALL' && context.platform && flag.platform !== context.platform) return false;
  if (flag.minAppVersion && context.appVersion && compareVersions(context.appVersion, flag.minAppVersion) < 0) return false;
  if (flag.segmentId && !(context.segmentIds ?? []).includes(flag.segmentId)) return false;
  if (flag.rolloutPct !== undefined && flag.rolloutPct !== null && flag.rolloutPct < 100) {
    const key = context.deviceId ?? context.userId ?? '';
    if (bucket(`${flag.key}:${key}`) >= flag.rolloutPct) return false;
  }
  return true;
}
