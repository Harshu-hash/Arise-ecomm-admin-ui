import { SCOPE_DIMENSIONS, SCOPE_LIMITS } from '@core/rbac/scopes';

/** Rupee inputs → paise, for submitting a scope object. */
export function scopeToPayload(scope) {
  if (!scope) return null;
  const out = { ...scope };
  for (const l of SCOPE_LIMITS) {
    const v = out[l.key];
    out[l.key] = v === null || v === undefined || v === '' ? null : Math.round(Number(v) * 100);
  }
  for (const d of SCOPE_DIMENSIONS) {
    if (!out[d.key]?.length) out[d.key] = null;
  }
  return out;
}

/** Paise → rupee inputs, for loading a scope object into a form. */
export function scopeToForm(scope) {
  if (!scope) return undefined;
  const out = { ...scope };
  for (const l of SCOPE_LIMITS) {
    out[l.key] = out[l.key] === null || out[l.key] === undefined ? undefined : out[l.key] / 100;
  }
  return out;
}
