/**
 * Field definitions for the segment RuleBuilder.
 *
 * Kept as data, not JSX, so the same list can drive the builder UI and (if
 * ever needed) a validation pass — one definition per field the mock
 * `matchSegment` engine actually understands.
 */
export const SEGMENT_FIELDS = [
  { key: 'city', label: 'City', type: 'string' },
  { key: 'state', label: 'State', type: 'string' },
  { key: 'platform', label: 'Platform', type: 'string', options: [{ value: 'Android', label: 'Android' }, { value: 'iOS', label: 'iOS' }] },
  { key: 'ordersCount', label: 'Orders placed', type: 'number' },
  { key: 'gmvPaise', label: 'Lifetime spend (paise)', type: 'number' },
  { key: 'walletBalancePaise', label: 'Wallet balance (paise)', type: 'number' },
  { key: 'riskScore', label: 'Risk score', type: 'number' },
  { key: 'lastOrderAt', label: 'Last order', type: 'date' },
  { key: 'joinedAt', label: 'Joined', type: 'date' },
];
