/** Small helpers shared across modules. */

/** Triggers a browser download for a Blob or an object URL. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    return false;
  }
}

/** Initials for an avatar: "Harshvardhan Panchal" → "HP". */
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Deterministic colour for an avatar, from the Arise-adjacent hue set. */
const AVATAR_HUES = ['#2874F0', '#26A541', '#FFA41C', '#CC0C39', '#7C4DFF', '#0097A7', '#C2185B'];
export function avatarColor(seed) {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 997;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function truncate(text, max = 60) {
  if (!text) return '';
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Stable sort helper for client-side-only tables (saved views, settings). */
export function byKey(key, dir = 'asc') {
  return (a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    const res = av > bv ? 1 : -1;
    return dir === 'asc' ? res : -res;
  };
}

/** Removes empty strings, nulls and empty arrays — used before sending filters. */
export function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
