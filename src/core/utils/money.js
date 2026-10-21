/**
 * Money is integer **paise** everywhere in state and over the wire; it is only
 * formatted at render. This avoids the float drift that shows up the moment you
 * start splitting discounts and commissions across order items.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_WHOLE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const NUM_IN = new Intl.NumberFormat('en-IN');

/** 130400 → "₹1,304.00" (or "₹1,304" when `compactPaise` and paise are zero). */
export function formatINR(paise, { compactPaise = true, signed = false } = {}) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  const abs = Math.abs(paise);
  const rupees = abs / 100;
  const whole = compactPaise && abs % 100 === 0;
  const body = whole ? INR_WHOLE.format(rupees) : INR.format(rupees);
  const sign = paise < 0 ? '−' : signed ? '+' : '';
  return `${sign}${body}`;
}

/** Indian-grouped plain number: 1234567 → "12,34,567". */
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return NUM_IN.format(value);
}

/** 1250000 → "₹12.5L"; for KPI tiles where full digits would wrap. */
export function formatINRCompact(paise) {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  const sign = paise < 0 ? '−' : '';
  const r = Math.abs(paise) / 100;
  if (r >= 1e7) return `${sign}₹${trim(r / 1e7)}Cr`;
  if (r >= 1e5) return `${sign}₹${trim(r / 1e5)}L`;
  if (r >= 1e3) return `${sign}₹${trim(r / 1e3)}K`;
  return `${sign}₹${trim(r)}`;
}

function trim(n) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, '');
}

/** Rupees (what a user types) → paise. Accepts "1,304.50", "₹1304". */
export function rupeesToPaise(input) {
  if (input === null || input === undefined || input === '') return null;
  const cleaned = String(input).replace(/[₹,\s]/g, '');
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function paiseToRupees(paise) {
  if (paise === null || paise === undefined) return null;
  return paise / 100;
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Discount % off MRP, as the app's product cards show it. */
export function discountPct(sellingPaise, mrpPaise) {
  if (!mrpPaise || mrpPaise <= 0 || sellingPaise === null) return null;
  return Math.round(((mrpPaise - sellingPaise) / mrpPaise) * 100);
}
