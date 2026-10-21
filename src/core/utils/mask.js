/**
 * PII masking. Revealing a masked value requires `customers.pii.view` (or
 * `sellers.bank.view_full` for bank accounts) and is written to the audit log
 * by the component that performs the reveal.
 */

export function maskPhone(phone) {
  if (!phone) return '—';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  const last = digits.slice(-3);
  const first = digits.length > 10 ? digits.slice(0, digits.length - 10) : '';
  return `${first ? `+${first} ` : ''}${digits.slice(-10, -8) || '••'}•••••${last}`;
}

export function maskEmail(email) {
  if (!email) return '—';
  const [name, domain] = String(email).split('@');
  if (!domain) return '•••';
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}${'•'.repeat(Math.max(3, name.length - 2))}@${domain}`;
}

export function maskAccount(accountNo) {
  if (!accountNo) return '—';
  const s = String(accountNo);
  return `${'•'.repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}

/** GSTIN is business data, not PII, so only the PAN segment is softened. */
export function maskGstin(gstin) {
  if (!gstin) return '—';
  const s = String(gstin);
  return s.length === 15 ? `${s.slice(0, 2)}••••••${s.slice(8)}` : s;
}

export function maskPan(pan) {
  if (!pan) return '—';
  const s = String(pan);
  return s.length === 10 ? `${s.slice(0, 3)}•••••${s.slice(-2)}` : s;
}

export function maskAddress(line) {
  if (!line) return '—';
  const s = String(line);
  return s.length <= 8 ? '•••' : `${s.slice(0, 8)}${'•'.repeat(8)}`;
}

export const MASKERS = {
  phone: maskPhone,
  email: maskEmail,
  account: maskAccount,
  gstin: maskGstin,
  pan: maskPan,
  address: maskAddress,
};

/** Permission needed to reveal each kind. */
export const REVEAL_PERMISSION = {
  phone: 'customers.pii.view',
  email: 'customers.pii.view',
  address: 'customers.pii.view',
  account: 'sellers.bank.view_full',
  gstin: 'sellers.seller.view',
  pan: 'sellers.seller.view',
};
