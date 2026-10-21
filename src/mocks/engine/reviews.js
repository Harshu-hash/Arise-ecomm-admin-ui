import { db } from '../db/store';

/**
 * Review auto-moderation (M13.1).
 *
 * A pure classifier over the review text plus two purchase facts, so the
 * same function can seed realistic moderation results and later decide
 * whether a freshly submitted review is auto-published or queued.
 */

const PROFANITY = ['damn', 'crap', 'terrible seller', 'scam'];
const PII_PATTERN = /\b\d{10}\b|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const INCENTIVE_PATTERN = /free (product|gift)|in exchange for|sent me this to review/i;
const SPAM_PATTERN = /(visit|check out) (my|our) (channel|page|store)|www\.|http/i;

export function classifyReview(text) {
  const lower = text.toLowerCase();
  if (INCENTIVE_PATTERN.test(text)) return 'INCENTIVISED';
  if (SPAM_PATTERN.test(text)) return 'SPAM';
  if (PII_PATTERN.test(text)) return 'PII';
  if (PROFANITY.some((w) => lower.includes(w))) return 'PROFANITY';
  if (text.trim().length < 12) return 'OFF_TOPIC';
  return 'CLEAN';
}

/**
 * Whether a review can publish itself without a human — clean text from a
 * certified buyer, and no media (media reviews are configurably manual,
 * since a photo can show something the text does not).
 */
export function autoModerationResult({ text, certifiedBuyer, mediaCount }) {
  const classification = classifyReview(text);
  const autoPublishable = classification === 'CLEAN' && certifiedBuyer && mediaCount === 0;
  return { classification, autoPublishable };
}

/** Other reviews by the same author, to surface review-ring patterns. */
export function reviewsByAuthor(authorCustomerId, excludeId) {
  return db.reviews.filter((r) => r.customerId === authorCustomerId && r.id !== excludeId);
}
