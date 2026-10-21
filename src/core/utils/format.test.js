import { describe, expect, it } from 'vitest';
import { discountPct, formatINR, formatINRCompact, formatNumber, rupeesToPaise } from './money';
import { maskAccount, maskEmail, maskPhone } from './mask';
import { formatDate, slaCountdown } from './date';

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    // 12,34,567 rather than 1,234,567 — the lakh/crore grouping.
    expect(formatINR(123456700)).toBe('₹12,34,567');
  });

  it('shows paise only when they are non-zero', () => {
    expect(formatINR(130400)).toBe('₹1,304');
    expect(formatINR(130450)).toBe('₹1,304.50');
  });

  it('renders a negative amount with a true minus sign', () => {
    expect(formatINR(-25000)).toBe('−₹250');
  });

  it('renders nothing as an em dash rather than ₹0', () => {
    expect(formatINR(null)).toBe('—');
    expect(formatINR(undefined)).toBe('—');
  });
});

describe('formatINRCompact', () => {
  it('abbreviates in lakh and crore', () => {
    // 1,520,000,000 paise = ₹1,52,00,000 = ₹1.52 crore.
    expect(formatINRCompact(1_52_00_00_000)).toBe('₹1.52Cr');
    expect(formatINRCompact(482134000)).toBe('₹48.2L');
    expect(formatINRCompact(2500000)).toBe('₹25K');
    expect(formatINRCompact(130400)).toBe('₹1.3K');
    expect(formatINRCompact(-482134000)).toBe('−₹48.2L');
  });
});

describe('rupeesToPaise', () => {
  it('accepts formatted input', () => {
    expect(rupeesToPaise('1,304.50')).toBe(130450);
    expect(rupeesToPaise('₹1304')).toBe(130400);
    expect(rupeesToPaise(1304)).toBe(130400);
  });

  it('rounds rather than truncating, so a paise is never lost', () => {
    expect(rupeesToPaise('0.015')).toBe(2);
  });

  it('returns null for junk', () => {
    expect(rupeesToPaise('abc')).toBeNull();
    expect(rupeesToPaise('')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('groups in the Indian style', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
  });
});

describe('discountPct', () => {
  it('computes the percentage off MRP', () => {
    expect(discountPct(129900, 249000)).toBe(48);
  });

  it('guards against a missing or zero MRP', () => {
    expect(discountPct(100, 0)).toBeNull();
    expect(discountPct(100, null)).toBeNull();
  });
});

describe('masking', () => {
  it('keeps only the last digits of a phone number', () => {
    const masked = maskPhone('+91 98765 43210');
    expect(masked).toContain('210');
    expect(masked).not.toContain('98765');
  });

  it('keeps the email domain so an agent can still recognise it', () => {
    const masked = maskEmail('harshvardhan@example.com');
    expect(masked).toMatch(/^ha•+@example\.com$/);
  });

  it('shows only the last four digits of a bank account', () => {
    expect(maskAccount('50100248172834')).toBe('••••••••••2834');
  });

  it('renders nothing as an em dash', () => {
    expect(maskPhone(null)).toBe('—');
    expect(maskEmail(undefined)).toBe('—');
  });
});

describe('slaCountdown', () => {
  const now = new Date('2026-10-12T10:00:00Z').getTime();

  it('reports time left before the due time', () => {
    const r = slaCountdown(new Date('2026-10-12T12:30:00Z').toISOString(), now);
    expect(r.overdue).toBe(false);
    expect(r.label).toBe('2h 30m left');
  });

  it('reports a breach as late, not as negative time', () => {
    const r = slaCountdown(new Date('2026-10-12T08:00:00Z').toISOString(), now);
    expect(r.overdue).toBe(true);
    expect(r.label).toBe('2h 0m late');
  });

  it('switches to days for longer windows', () => {
    const r = slaCountdown(new Date('2026-10-15T10:00:00Z').toISOString(), now);
    expect(r.label).toBe('3d 0h left');
  });

  it('handles a missing due date', () => {
    expect(slaCountdown(null).label).toBe('—');
  });
});

describe('formatDate', () => {
  it('renders in IST, not UTC', () => {
    // 19:00 UTC is already the next day in India (00:30 IST).
    expect(formatDate('2026-10-12T19:00:00Z')).toBe('13 Oct 2026');
  });
});
