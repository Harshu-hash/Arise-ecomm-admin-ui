/**
 * Every status label and colour in the panel lives here — never inline in a
 * component. `tone` carries the semantics (plan §8.1):
 *   progress = in flight · waiting = needs someone's action · good = success
 *   bad = failed/blocked · idle = draft/inactive · review = under review
 */

const T = { progress: 'blue', waiting: 'gold', good: 'green', bad: 'red', idle: 'default', review: 'purple' };

/** `[label, tone]` pairs, kept terse so the whole registry stays readable. */
const RAW = {
  adminUser: {
    INVITED: ['Invited', T.waiting],
    ACTIVE: ['Active', T.good],
    LOCKED: ['Locked', T.bad],
    DEACTIVATED: ['Deactivated', T.idle],
  },
  approval: {
    PENDING: ['Pending approval', T.waiting],
    APPROVED: ['Approved', T.good],
    REJECTED: ['Rejected', T.bad],
    EXPIRED: ['Expired', T.idle],
    CANCELLED: ['Cancelled', T.idle],
  },
  job: {
    QUEUED: ['Queued', T.idle],
    VALIDATING: ['Validating', T.progress],
    READY: ['Ready to commit', T.waiting],
    PROCESSING: ['Processing', T.progress],
    COMPLETED: ['Completed', T.good],
    COMPLETED_WITH_ERRORS: ['Completed with errors', T.waiting],
    FAILED: ['Failed', T.bad],
    EXPIRED: ['Expired', T.idle],
  },
  orderItem: {
    PAYMENT_PENDING: ['Payment pending', T.waiting],
    PAYMENT_FAILED: ['Payment failed', T.bad],
    PLACED: ['Placed', T.progress],
    ON_HOLD: ['On hold', T.waiting],
    ACCEPTED: ['Accepted', T.progress],
    PACKED: ['Packed', T.progress],
    MANIFESTED: ['Ready to ship', T.progress],
    SHIPPED: ['Shipped', T.progress],
    IN_TRANSIT: ['In transit', T.progress],
    OUT_FOR_DELIVERY: ['Out for delivery', T.progress],
    DELIVERED: ['Delivered', T.good],
    UNDELIVERED: ['Undelivered (NDR)', T.waiting],
    CANCELLED: ['Cancelled', T.bad],
    RTO_INITIATED: ['RTO initiated', T.waiting],
    RTO_IN_TRANSIT: ['RTO in transit', T.progress],
    RTO_DELIVERED: ['Returned to origin', T.idle],
    LOST_IN_TRANSIT: ['Lost in transit', T.bad],
  },
  returnRequest: {
    RETURN_REQUESTED: ['Requested', T.waiting],
    RETURN_APPROVED: ['Approved', T.progress],
    PICKUP_SCHEDULED: ['Pickup scheduled', T.progress],
    PICKED_UP: ['Picked up', T.progress],
    PICKUP_CANCELLED_QC_FAIL: ['Doorstep QC failed', T.bad],
    IN_TRANSIT_TO_ORIGIN: ['In transit', T.progress],
    RECEIVED: ['Received', T.progress],
    QC_PASSED: ['QC passed', T.good],
    QC_FAILED: ['QC failed', T.bad],
    CLOSED: ['Closed', T.idle],
    RETURN_REJECTED: ['Rejected', T.bad],
    RETURN_CANCELLED: ['Cancelled', T.idle],
  },
  refund: {
    PENDING_APPROVAL: ['Pending approval', T.waiting],
    PENDING_DETAILS: ['Awaiting bank details', T.waiting],
    INITIATED: ['Initiated', T.progress],
    PROCESSING: ['Processing', T.progress],
    COMPLETED: ['Completed', T.good],
    FAILED: ['Failed', T.bad],
  },
  payment: {
    CREATED: ['Created', T.idle],
    // COD: the customer owes the money but it has not been collected yet.
    PENDING: ['Pending', T.waiting],
    AUTHORIZED: ['Authorized', T.progress],
    CAPTURED: ['Captured', T.good],
    FAILED: ['Failed', T.bad],
    REFUNDED: ['Refunded', T.idle],
    PARTIALLY_REFUNDED: ['Partially refunded', T.waiting],
  },
  listing: {
    DRAFT: ['Draft', T.idle],
    QC_PENDING: ['QC pending', T.waiting],
    NEEDS_CHANGES: ['Needs changes', T.waiting],
    LIVE: ['Live', T.good],
    INACTIVE: ['Inactive', T.idle],
    OUT_OF_STOCK: ['Out of stock', T.waiting],
    REJECTED: ['Rejected', T.bad],
    BLOCKED: ['Blocked', T.bad],
    ARCHIVED: ['Archived', T.idle],
  },
  seller: {
    APPLIED: ['Applied', T.waiting],
    DOCUMENTS_PENDING: ['Documents pending', T.waiting],
    UNDER_REVIEW: ['Under review', T.review],
    NEEDS_INFO: ['Needs info', T.waiting],
    APPROVED: ['Approved', T.progress],
    ONBOARDING: ['Onboarding', T.progress],
    ACTIVE: ['Active', T.good],
    ON_HOLD: ['On hold', T.waiting],
    SUSPENDED: ['Suspended', T.bad],
    DEACTIVATED: ['Deactivated', T.idle],
    BLACKLISTED: ['Blacklisted', T.bad],
    REJECTED: ['Rejected', T.bad],
  },
  payoutBatch: {
    DRAFT: ['Draft', T.idle],
    PENDING_APPROVAL: ['Awaiting release', T.waiting],
    APPROVED: ['Approved', T.progress],
    PROCESSING: ['Processing', T.progress],
    PAID: ['Paid', T.good],
    PARTIALLY_FAILED: ['Partly failed', T.bad],
    CANCELLED: ['Cancelled', T.idle],
  },
  sellerPayout: {
    INCLUDED: ['In batch', T.idle],
    PAID: ['Paid', T.good],
    FAILED: ['Transfer failed', T.bad],
    HELD: ['Held', T.waiting],
    // A negative balance is not collected: it waits for the next payout.
    CARRIED_FORWARD: ['Carried forward', T.waiting],
  },
  ticket: {
    NEW: ['New', T.waiting],
    OPEN: ['Open', T.progress],
    PENDING_CUSTOMER: ['Pending customer', T.waiting],
    PENDING_INTERNAL: ['Pending internal', T.review],
    RESOLVED: ['Resolved', T.good],
    CLOSED: ['Closed', T.idle],
  },
  review: {
    PENDING: ['Pending moderation', T.waiting],
    PUBLISHED: ['Published', T.good],
    REJECTED: ['Rejected', T.bad],
    FLAGGED: ['Flagged', T.review],
  },
  questionAnswer: {
    PUBLISHED: ['Published', T.good],
    FLAGGED: ['Flagged', T.review],
    REJECTED: ['Rejected', T.bad],
  },
  abuseReport: {
    OPEN: ['Open', T.waiting],
    DISMISSED: ['Dismissed', T.idle],
    REMOVED: ['Removed', T.bad],
  },
  chatSession: {
    WAITING: ['Waiting', T.waiting],
    ACTIVE: ['Active', T.progress],
    ENDED: ['Ended', T.idle],
    CONVERTED_TO_TICKET: ['Converted to ticket', T.idle],
  },
  priority: {
    LOW: ['Low', T.idle],
    MEDIUM: ['Medium', T.waiting],
    HIGH: ['High', T.bad],
  },
  promo: {
    DRAFT: ['Draft', T.idle],
    SCHEDULED: ['Scheduled', T.progress],
    ACTIVE: ['Active', T.good],
    PAUSED: ['Paused', T.waiting],
    EXPIRED: ['Expired', T.idle],
    EXHAUSTED: ['Budget exhausted', T.bad],
    ENDED: ['Ended', T.idle],
    CANCELLED: ['Cancelled', T.idle],
  },
  adCampaign: {
    DRAFT: ['Draft', T.idle],
    PENDING_REVIEW: ['Pending review', T.waiting],
    ACTIVE: ['Active', T.good],
    PAUSED: ['Paused', T.waiting],
    BUDGET_EXHAUSTED: ['Budget exhausted', T.waiting],
    WALLET_EMPTY: ['Wallet empty', T.bad],
    REJECTED: ['Rejected', T.bad],
    ENDED: ['Ended', T.idle],
    ARCHIVED: ['Archived', T.idle],
  },
  inbound: {
    DRAFT: ['Draft', T.idle],
    SUBMITTED: ['Submitted', T.waiting],
    APPOINTMENT_BOOKED: ['Appointment booked', T.progress],
    ARRIVED: ['Arrived', T.progress],
    RECEIVING: ['Receiving', T.progress],
    RECEIVED: ['Received', T.good],
    CLOSED: ['Closed', T.idle],
    MISSED: ['Missed', T.bad],
    CANCELLED: ['Cancelled', T.idle],
  },
  claim: {
    SUBMITTED: ['Submitted', T.waiting],
    UNDER_REVIEW: ['Under review', T.review],
    INFO_REQUESTED: ['Info requested', T.waiting],
    APPROVED: ['Approved', T.good],
    PARTIALLY_APPROVED: ['Partially approved', T.waiting],
    REJECTED: ['Rejected', T.bad],
    REIMBURSED: ['Reimbursed', T.good],
  },
  privacyRequest: {
    RECEIVED: ['Received', T.waiting],
    VERIFYING: ['Verifying identity', T.progress],
    IN_PROGRESS: ['In progress', T.progress],
    COMPLETED: ['Completed', T.good],
    REJECTED: ['Rejected', T.bad],
    ON_HOLD: ['On hold (legal)', T.review],
  },
  payoutAdjustment: {
    PENDING_APPROVAL: ['Awaiting approval', T.waiting],
    APPROVED: ['Approved, not yet applied', T.progress],
    APPLIED: ['Applied to a payout', T.good],
    REJECTED: ['Rejected', T.bad],
  },
  codRemittance: {
    EXPECTED: ['Expected', T.waiting],
    RECONCILED: ['Reconciled', T.good],
    SHORT_PAID: ['Short paid', T.bad],
    DISPUTED: ['Disputed', T.review],
  },
  reconciliation: {
    RUNNING: ['Running', T.progress],
    RECONCILED: ['Reconciled', T.good],
    NEEDS_REVIEW: ['Needs review', T.waiting],
    FAILED: ['Failed', T.bad],
  },
  walletAccount: {
    ACTIVE: ['Active', T.good],
    FROZEN: ['Frozen', T.bad],
  },
  cashbackRule: {
    SCHEDULED: ['Scheduled', T.idle],
    ACTIVE: ['Active', T.good],
    PAUSED: ['Paused', T.waiting],
    ENDED: ['Ended', T.idle],
  },
  coupon: {
    DRAFT: ['Draft', T.idle],
    SCHEDULED: ['Scheduled', T.waiting],
    ACTIVE: ['Active', T.good],
    PAUSED: ['Paused', T.waiting],
    EXPIRED: ['Expired', T.idle],
    EXHAUSTED: ['Budget exhausted', T.bad],
  },
  flashSale: {
    DRAFT: ['Draft', T.idle],
    NOMINATIONS_OPEN: ['Nominations open', T.waiting],
    CURATION: ['Curation', T.review],
    SCHEDULED: ['Scheduled', T.waiting],
    LIVE: ['Live', T.good],
    ENDED: ['Ended', T.idle],
    CANCELLED: ['Cancelled', T.bad],
  },
  flashSaleNomination: {
    PENDING: ['Pending', T.waiting],
    ACCEPTED: ['Accepted', T.good],
    REJECTED: ['Rejected', T.bad],
    AUTO_REJECTED: ['Auto-rejected', T.bad],
    PULLED: ['Pulled', T.bad],
  },
  saleEvent: {
    SCHEDULED: ['Scheduled', T.waiting],
    LIVE: ['Live', T.good],
    ENDED: ['Ended', T.idle],
  },
  referral: {
    SIGNED_UP: ['Signed up', T.idle],
    FIRST_ORDER_PLACED: ['First order placed', T.progress],
    QUALIFIED: ['Qualified', T.waiting],
    REWARDED: ['Rewarded', T.good],
    FRAUD_REVIEW: ['Fraud review', T.review],
    REJECTED_FRAUD: ['Rejected — fraud', T.bad],
  },
  campaign: {
    DRAFT: ['Draft', T.idle],
    SCHEDULED: ['Scheduled', T.waiting],
    SENDING: ['Sending', T.progress],
    SENT: ['Sent', T.good],
    PAUSED: ['Paused', T.waiting],
    CANCELLED: ['Cancelled', T.idle],
    FAILED: ['Failed', T.bad],
  },
  banner: {
    DRAFT: ['Draft', T.idle],
    SCHEDULED: ['Scheduled', T.waiting],
    LIVE: ['Live', T.good],
    PAUSED: ['Paused', T.waiting],
    EXPIRED: ['Expired', T.idle],
  },
  staticPage: {
    DRAFT: ['Draft', T.idle],
    PUBLISHED: ['Published', T.good],
  },
  homeLayoutVersion: {
    DRAFT: ['Draft', T.idle],
    PUBLISHED: ['Published', T.good],
    ARCHIVED: ['Archived', T.idle],
  },
  notificationLog: {
    QUEUED: ['Queued', T.idle],
    SENT: ['Sent', T.progress],
    DELIVERED: ['Delivered', T.good],
    FAILED: ['Failed', T.bad],
    BOUNCED: ['Bounced', T.bad],
  },
  giftCard: {
    INACTIVE: ['Inactive', T.idle],
    ACTIVE: ['Active', T.good],
    PARTIALLY_REDEEMED: ['Partially redeemed', T.progress],
    REDEEMED: ['Redeemed', T.idle],
    EXPIRED: ['Expired', T.idle],
    BLOCKED: ['Blocked', T.bad],
  },
  generic: {
    ACTIVE: ['Active', T.good],
    INACTIVE: ['Inactive', T.idle],
    PAUSED: ['Paused', T.waiting],
    ERROR: ['Error', T.bad],
    CONNECTED: ['Connected', T.good],
    NOT_CONFIGURED: ['Not configured', T.idle],
    YES: ['Yes', T.good],
    NO: ['No', T.idle],
  },
};

/** Expanded registry: domain → code → { code, label, tone }. */
export const STATUS_MAPS = Object.fromEntries(
  Object.entries(RAW).map(([domain, codes]) => [
    domain,
    Object.fromEntries(
      Object.entries(codes).map(([code, [label, tone]]) => [code, { code, label, tone }]),
    ),
  ]),
);

export function getStatus(domain, code) {
  if (!code) return { code, label: '—', tone: T.idle };
  return (
    STATUS_MAPS[domain]?.[code] ?? {
      code,
      // Unknown code from a newer backend: show it rather than hide it.
      label: String(code).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
      tone: T.idle,
    }
  );
}

/** Options for a Select/filter over a whole domain. */
export function statusOptions(domain) {
  return Object.values(STATUS_MAPS[domain] ?? {}).map((s) => ({ label: s.label, value: s.code }));
}

export const TONES = T;
