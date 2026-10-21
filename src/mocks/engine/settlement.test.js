import { describe, expect, it } from 'vitest';
import {
  TAX_RATES,
  closingFeePaise,
  collectionFeePct,
  computeSettlement,
  settlementEligibility,
  summariseSettlements,
} from './settlement';

/**
 * Settlement is the one place in this panel where an arithmetic slip means a
 * seller is actually underpaid, so it is tested on its own.
 */
describe('closingFeePaise', () => {
  it('steps up by price band', () => {
    expect(closingFeePaise(20000)).toBe(500);
    expect(closingFeePaise(30000)).toBe(500);
    expect(closingFeePaise(30001)).toBe(1500);
    expect(closingFeePaise(50000)).toBe(1500);
    expect(closingFeePaise(100000)).toBe(3000);
    expect(closingFeePaise(100001)).toBe(6500);
  });
});

describe('collectionFeePct', () => {
  it('charges more for cash, which has to be handled and banked', () => {
    expect(collectionFeePct('COD')).toBeGreaterThan(collectionFeePct('UPI'));
  });
});

describe('computeSettlement', () => {
  const base = {
    salePaise: 100000,
    commissionPct: 10,
    paymentMethod: 'UPI',
    shippingFeePaise: 4000,
    fulfilledByArise: false,
  };

  it('computes every component of a straightforward sale', () => {
    const r = computeSettlement(base);
    expect(r.commissionPaise).toBe(10000);
    expect(r.closingFeePaise).toBe(3000);
    expect(r.collectionFeePaise).toBe(1800);
    expect(r.shippingFeePaise).toBe(4000);
    expect(r.pickPackFeePaise).toBe(0);
    expect(r.feesBeforeTaxPaise).toBe(18800);
    expect(r.gstOnFeesPaise).toBe(3384);
    expect(r.tcsPaise).toBe(500);
    expect(r.tdsPaise).toBe(100);
    expect(r.netPaise).toBe(100000 - 18800 - 3384 - 500 - 100);
  });

  it('never loses or invents money', () => {
    const r = computeSettlement(base);
    const accountedFor = r.feesBeforeTaxPaise + r.gstOnFeesPaise + r.tcsPaise + r.tdsPaise + r.netPaise;
    expect(accountedFor).toBe(r.salePaise);
  });

  it('adds pick-and-pack only when we handled the parcel', () => {
    const seller = computeSettlement(base);
    const arise = computeSettlement({ ...base, fulfilledByArise: true, storageFeePaise: 1200 });
    expect(seller.pickPackFeePaise).toBe(0);
    expect(arise.pickPackFeePaise).toBe(2000);
    expect(arise.storageFeePaise).toBe(1200);
    expect(arise.netPaise).toBeLessThan(seller.netPaise);
  });

  it('charges a higher collection fee on cash orders', () => {
    const prepaid = computeSettlement(base);
    const cod = computeSettlement({ ...base, paymentMethod: 'COD' });
    expect(cod.collectionFeePaise).toBeGreaterThan(prepaid.collectionFeePaise);
    expect(cod.netPaise).toBeLessThan(prepaid.netPaise);
  });

  it('applies GST to our fees but not to the sale itself', () => {
    const r = computeSettlement(base);
    expect(r.gstOnFeesPaise).toBe(Math.round((r.feesBeforeTaxPaise * TAX_RATES.gstOnFeesPct) / 100));
  });

  it('surfaces a negative payout rather than clamping it to zero', () => {
    // A cheap item with heavy shipping genuinely can cost more than it earns,
    // and finance has to see that rather than have it hidden.
    const r = computeSettlement({
      salePaise: 10000,
      commissionPct: 15,
      paymentMethod: 'COD',
      shippingFeePaise: 12000,
    });
    expect(r.netPaise).toBeLessThan(0);
    expect(r.negative).toBe(true);
  });

  it('lets adjustments move the payout in either direction', () => {
    const penalty = computeSettlement({ ...base, adjustmentsPaise: -5000 });
    const reimbursement = computeSettlement({ ...base, adjustmentsPaise: 5000 });
    expect(reimbursement.netPaise - penalty.netPaise).toBe(10000);
  });

  it('rounds each component, so a hundred lines do not drift', () => {
    const lines = Array.from({ length: 100 }, () =>
      computeSettlement({ ...base, salePaise: 33333 }),
    );
    const total = summariseSettlements(lines);
    expect(total.netPaise).toBe(lines[0].netPaise * 100);
    expect(Number.isInteger(total.netPaise)).toBe(true);
  });
});

describe('summariseSettlements', () => {
  it('totals a batch', () => {
    const lines = [
      computeSettlement({ salePaise: 100000, commissionPct: 10, paymentMethod: 'UPI' }),
      computeSettlement({ salePaise: 50000, commissionPct: 12, paymentMethod: 'COD' }),
    ];
    const s = summariseSettlements(lines);
    expect(s.count).toBe(2);
    expect(s.grossPaise).toBe(150000);
    expect(s.netPaise).toBe(lines[0].netPaise + lines[1].netPaise);
  });

  it('returns zeroes for an empty batch rather than NaN', () => {
    const s = summariseSettlements([]);
    expect(s.netPaise).toBe(0);
    expect(s.count).toBe(0);
  });
});

describe('settlementEligibility', () => {
  const future = new Date(Date.now() + 5 * 86400_000).toISOString();
  const past = new Date(Date.now() - 86400_000).toISOString();

  it('holds money until the return window closes', () => {
    const r = settlementEligibility(
      { status: 'DELIVERED', returnWindowEndsAt: future },
      { returnOpen: false, claimOpen: false, sellerOnHold: false },
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/return window/i);
  });

  it('releases money once the window has closed', () => {
    const r = settlementEligibility(
      { status: 'DELIVERED', returnWindowEndsAt: past },
      { returnOpen: false, claimOpen: false, sellerOnHold: false },
    );
    expect(r.eligible).toBe(true);
  });

  it('holds while a return or a claim is open', () => {
    const withReturn = settlementEligibility(
      { status: 'DELIVERED', returnWindowEndsAt: past },
      { returnOpen: true, claimOpen: false, sellerOnHold: false },
    );
    const withClaim = settlementEligibility(
      { status: 'DELIVERED', returnWindowEndsAt: past },
      { returnOpen: false, claimOpen: true, sellerOnHold: false },
    );
    expect(withReturn.eligible).toBe(false);
    expect(withClaim.eligible).toBe(false);
  });

  it('holds everything for a seller whose payouts are suspended', () => {
    const r = settlementEligibility(
      { status: 'DELIVERED', returnWindowEndsAt: past },
      { returnOpen: false, claimOpen: false, sellerOnHold: true },
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/on hold/i);
  });

  it('never pays out an item that was not delivered', () => {
    for (const status of ['CANCELLED', 'SHIPPED', 'RTO_DELIVERED', 'LOST_IN_TRANSIT']) {
      const r = settlementEligibility(
        { status, returnWindowEndsAt: past },
        { returnOpen: false, claimOpen: false, sellerOnHold: false },
      );
      expect(r.eligible, status).toBe(false);
    }
  });
});
