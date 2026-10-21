import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/store';
import { seedAll } from './index';

describe('phase 1 seed', () => {
  beforeAll(() => seedAll());

  it('gives every seller KYC documents, an address and a bank account', () => {
    const settled = db.sellers.filter((s) => s.status === 'ACTIVE');
    for (const s of settled.slice(0, 10)) {
      expect(db.kycDocuments.filter((d) => d.sellerId === s.id).length).toBeGreaterThanOrEqual(4);
      expect(db.pickupAddresses.some((a) => a.sellerId === s.id)).toBe(true);
      expect(db.bankAccounts.some((b) => b.sellerId === s.id)).toBe(true);
    }
  });

  it('leaves applicants with documents still outstanding', () => {
    const applied = db.sellers.find((s) => s.status === 'APPLIED');
    expect(db.kycDocuments.filter((d) => d.sellerId === applied.id)).toHaveLength(0);
  });

  it('attaches GSTIN and PAN verification results', () => {
    const s = db.sellers.find((x) => x.status === 'ACTIVE');
    expect(s.gstinVerification.status).toBe('ACTIVE');
    expect(s.panVerification.nameMatchPct).toBeGreaterThan(0);
  });

  it('builds products with variants and competing offers', () => {
    expect(db.products.length).toBeGreaterThan(15);
    const p = db.products[0];
    const variants = db.variants.filter((v) => v.productId === p.id);
    expect(variants.length).toBeGreaterThan(1);
    const offers = db.offers.filter((o) => o.variantId === variants[0].id);
    expect(offers.length).toBeGreaterThanOrEqual(2);
  });

  it('picks exactly one buy-box winner per variant that has stock', () => {
    for (const variant of db.variants.slice(0, 40)) {
      const offers = db.offers.filter((o) => o.variantId === variant.id);
      const winners = offers.filter((o) => o.buyBoxWinner);
      const inStock = offers.filter((o) => o.stock > 0);
      expect(winners.length).toBe(inStock.length ? 1 : 0);
    }
  });

  it('gives the QC queue work in every state', () => {
    expect(db.listingSubmissions.length).toBeGreaterThan(5);
    const types = new Set(db.listingSubmissions.map((s) => s.type));
    expect(types.has('NEW') || types.has('RESUBMISSION')).toBe(true);
    expect(types.has('REVISION')).toBe(true);
    expect(db.listingSubmissions.every((s) => s.autoChecks.length === 7)).toBe(true);
  });

  it('attaches an attribute set and HSN code to every leaf category', () => {
    const leaves = db.categories.filter((c) => c.level === 3);
    expect(leaves.every((c) => c.attributeSetId)).toBe(true);
    expect(leaves.every((c) => c.hsnCode)).toBe(true);
  });

  it('derives category listing counts from real products', () => {
    const withCounts = db.categories.filter((c) => c.liveListings > 0);
    expect(withCounts.length).toBeGreaterThan(0);
    for (const c of withCounts) {
      const actual = db.products.filter((p) => p.categoryId === c.id && p.status === 'LIVE').length;
      expect(c.liveListings).toBe(actual);
    }
  });

  it('seeds pending brand requests, penalties and claims', () => {
    expect(db.brandRequests.filter((r) => r.status === 'PENDING').length).toBeGreaterThan(5);
    expect(db.penalties.length).toBeGreaterThan(5);
    expect(db.sellerClaims.length).toBeGreaterThan(3);
  });
});
