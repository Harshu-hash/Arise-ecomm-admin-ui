import { beforeEach, describe, expect, it } from 'vitest';
import { insert, resetDb } from '../db/store';
import { autoModerationResult, classifyReview, reviewsByAuthor } from './reviews';

beforeEach(() => resetDb());

describe('classifyReview', () => {
  it('flags incentivised reviews', () => {
    expect(classifyReview('They sent me this to review in exchange for a discount.')).toBe('INCENTIVISED');
  });
  it('flags spam', () => {
    expect(classifyReview('Great product! Visit my channel www.example.com')).toBe('SPAM');
  });
  it('flags PII', () => {
    expect(classifyReview('Call me on 9876543210 if you have questions')).toBe('PII');
  });
  it('flags profanity', () => {
    expect(classifyReview('This is a damn terrible seller')).toBe('PROFANITY');
  });
  it('flags a too-short review as off-topic', () => {
    expect(classifyReview('ok')).toBe('OFF_TOPIC');
  });
  it('passes a normal review clean', () => {
    expect(classifyReview('Good quality fabric, fits true to size, arrived on time.')).toBe('CLEAN');
  });
});

describe('autoModerationResult', () => {
  it('auto-publishes a clean review from a certified buyer with no media', () => {
    const r = autoModerationResult({ text: 'Great fit and quality, exactly as described.', certifiedBuyer: true, mediaCount: 0 });
    expect(r.autoPublishable).toBe(true);
  });
  it('holds a media review for manual review even if clean', () => {
    const r = autoModerationResult({ text: 'Great fit and quality, exactly as described.', certifiedBuyer: true, mediaCount: 2 });
    expect(r.autoPublishable).toBe(false);
  });
  it('holds a review from a non-certified buyer', () => {
    const r = autoModerationResult({ text: 'Great fit and quality, exactly as described.', certifiedBuyer: false, mediaCount: 0 });
    expect(r.autoPublishable).toBe(false);
  });
  it('never auto-publishes flagged content', () => {
    const r = autoModerationResult({ text: 'Visit my channel www.example.com', certifiedBuyer: true, mediaCount: 0 });
    expect(r.classification).toBe('SPAM');
    expect(r.autoPublishable).toBe(false);
  });
});

describe('reviewsByAuthor', () => {
  it('finds other reviews by the same customer, excluding the one in hand', () => {
    insert('reviews', { id: 'R1', customerId: 'CUS-1' });
    insert('reviews', { id: 'R2', customerId: 'CUS-1' });
    insert('reviews', { id: 'R3', customerId: 'CUS-2' });
    const others = reviewsByAuthor('CUS-1', 'R1');
    expect(others.map((r) => r.id)).toEqual(['R2']);
  });
});
