import { fakerEN_IN as faker } from '@faker-js/faker';
import { db, filter, id, insert } from '../db/store';
import { mockNow } from '../engine/settings';

/**
 * Wallet, gift cards and cashback.
 *
 * The wallet is store credit only — no peer-to-peer transfer and no Scan &
 * Pay — so every entry traces to something the platform did: a refund, a
 * cashback accrual, a gift card redemption, a goodwill credit or a purchase.
 *
 * Balances are never stored independently of the ledger. They are summed from
 * it at seed time and asserted in the Phase 4 tests, because a wallet balance
 * that disagrees with its own ledger is money nobody can account for.
 */

const CREDIT = ['REFUND', 'CASHBACK', 'GIFT_CARD', 'GOODWILL', 'PROMO'];

const CREDIT_REASON = {
  REFUND: 'Refund credited to wallet',
  CASHBACK: 'Cashback on order',
  GIFT_CARD: 'Gift card redeemed',
  GOODWILL: 'Goodwill credit issued by support',
  PROMO: 'Promotional credit',
};

const DEBIT_REASON = {
  PURCHASE: 'Used on order',
  EXPIRY: 'Credit expired',
  REVERSAL: 'Credit reversed — order cancelled',
};

/** Wallet accounts for customers, with a ledger that sums to the balance. */
export function seedWallets() {
  const customers = db.customers;
  const accounts = [];

  customers.forEach((customer, i) => {
    // Not every customer has ever held store credit.
    if (i % 3 === 2) return;

    const account = insert('walletAccounts', {
      id: id('WAL', 6),
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      balancePaise: 0,
      lifetimeCreditedPaise: 0,
      lifetimeDebitedPaise: 0,
      // A frozen wallet can neither be spent nor credited: used while a
      // refund-abuse investigation is open.
      status: i % 47 === 0 ? 'FROZEN' : 'ACTIVE',
      frozenReason: i % 47 === 0 ? 'Refund abuse investigation — ticket open' : null,
      createdAt: customer.joinedAt ?? new Date(mockNow() - 200 * 86400_000).toISOString(),
      version: 1,
    });

    const entryCount = faker.number.int({ min: 1, max: 7 });
    let balance = 0;
    let credited = 0;
    let debited = 0;

    // Oldest first. The running balance only makes sense in time order, and
    // the ledger is read newest-first, so unsorted timestamps would make
    // `balanceAfterPaise` disagree with the account's own balance.
    const timestamps = Array.from(
      { length: entryCount },
      () => mockNow() - faker.number.int({ min: 1, max: 180 }) * 86400_000,
    )
      .sort((a, b) => a - b)
      // Strictly increasing: two entries at the same instant cannot be put
      // back in order later, and the one that is "latest" decides the balance.
      .map((at, n, all) => (n > 0 && at <= all[n - 1] ? all[n - 1] + 60_000 : at));

    for (let n = 0; n < entryCount; n += 1) {
      const at = timestamps[n];
      const isCredit = n === 0 || n % 2 === 0;
      const type = isCredit
        ? faker.helpers.arrayElement(CREDIT)
        : faker.helpers.arrayElement(['PURCHASE', 'PURCHASE', 'EXPIRY', 'REVERSAL']);
      // A debit can never exceed the running balance, so the ledger can
      // never drive a wallet negative.
      const amount = isCredit
        ? faker.number.int({ min: 50, max: 3000 }) * 100
        : Math.min(balance, faker.number.int({ min: 20, max: 1500 }) * 100);
      if (!isCredit && amount === 0) continue;

      balance += isCredit ? amount : -amount;
      if (isCredit) credited += amount;
      else debited += amount;

      insert('walletEntries', {
        id: id('WLE', 7),
        walletId: account.id,
        customerId: customer.id,
        direction: isCredit ? 'CREDIT' : 'DEBIT',
        type,
        amountPaise: amount,
        balanceAfterPaise: balance,
        reason: isCredit ? CREDIT_REASON[type] : DEBIT_REASON[type],
        orderId: ['PURCHASE', 'CASHBACK', 'REFUND', 'REVERSAL'].includes(type)
          ? db.orders.find((o) => o.customerId === customer.id)?.id ?? null
          : null,
        // Promotional credit expires; refunded money does not.
        expiresAt: isCredit && ['CASHBACK', 'PROMO'].includes(type)
          ? new Date(at + 180 * 86400_000).toISOString()
          : null,
        actorName: type === 'GOODWILL' ? 'Rohit Sharma' : 'System',
        createdAt: new Date(at).toISOString(),
      });
    }

    account.balancePaise = balance;
    account.lifetimeCreditedPaise = credited;
    account.lifetimeDebitedPaise = debited;
    accounts.push(account);
  });

  return accounts;
}

/** Gift card programmes and the cards issued under them. */
export function seedGiftCards() {
  const programs = [
    ['Arise Gift Card', 'RETAIL', [50000, 100000, 200000, 500000], 12],
    ['Corporate Rewards', 'CORPORATE', [100000, 250000, 500000], 24],
    ['Service Recovery Voucher', 'GOODWILL', [20000, 50000], 6],
  ].map(([name, channel, denominations, validityMonths]) =>
    insert('giftCardPrograms', {
      id: id('GCP', 3),
      name,
      channel,
      denominationsPaise: denominations,
      validityMonths,
      // Gift card balances are a liability on the books until spent or
      // expired, so finance tracks issued vs redeemed per programme.
      status: 'ACTIVE',
      issuedCount: 0,
      issuedPaise: 0,
      redeemedPaise: 0,
      version: 1,
    }),
  );

  const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'REDEEMED', 'REDEEMED', 'EXPIRED', 'BLOCKED'];

  for (let i = 0; i < 140; i += 1) {
    const program = programs[i % programs.length];
    const value = program.denominationsPaise[i % program.denominationsPaise.length];
    const status = statuses[i % statuses.length];
    const issuedAt = mockNow() - faker.number.int({ min: 5, max: 400 }) * 86400_000;
    const redeemed = status === 'REDEEMED' ? value : status === 'ACTIVE' && i % 5 === 0 ? Math.round(value / 2) : 0;

    insert('giftCards', {
      id: id('GFT', 6),
      programId: program.id,
      programName: program.name,
      // Only the last four digits are ever shown; the full code is a bearer
      // instrument and is never returned by the API.
      codeLast4: faker.string.numeric(4),
      facePaise: value,
      balancePaise: status === 'ACTIVE' ? value - redeemed : 0,
      redeemedPaise: redeemed,
      status,
      issuedTo: faker.internet.email().toLowerCase(),
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + program.validityMonths * 30 * 86400_000).toISOString(),
      redeemedByCustomerId: redeemed ? db.customers[i % db.customers.length]?.id ?? null : null,
      redeemedAt: status === 'REDEEMED' ? new Date(issuedAt + 10 * 86400_000).toISOString() : null,
      blockedReason: status === 'BLOCKED' ? 'Reported as fraudulently obtained' : null,
      version: 1,
    });

    program.issuedCount += 1;
    program.issuedPaise += value;
    program.redeemedPaise += redeemed;
  }

  return programs;
}

/** Cashback rules — the accrual side of the wallet. */
export function seedCashbackRules() {
  const rules = [
    ['First order cashback', 'FIRST_ORDER', 10, 15000, 50000, 'ACTIVE'],
    ['UPI payment cashback', 'PAYMENT_METHOD', 5, 10000, 30000, 'ACTIVE'],
    ['Fashion weekend', 'CATEGORY', 8, 25000, 100000, 'SCHEDULED'],
    ['App install bonus', 'CHANNEL', 100, 10000, 0, 'ENDED'],
    ['Grocery repeat purchase', 'CATEGORY', 4, 8000, 40000, 'PAUSED'],
  ];

  return rules.map(([name, trigger, pct, capPaise, minOrderPaise, status], i) => {
    const start = mockNow() - (status === 'SCHEDULED' ? -7 : 30) * 86400_000;
    const accrued = status === 'ENDED' || status === 'ACTIVE'
      ? faker.number.int({ min: 20_000, max: 9_00_000 }) * 100
      : 0;

    return insert('cashbackRules', {
      id: id('CBK', 4),
      name,
      trigger,
      cashbackPct: pct,
      maxCashbackPaise: capPaise,
      minOrderPaise,
      creditDelayDays: trigger === 'FIRST_ORDER' ? 0 : 7,
      // Credit is held until the return window closes, otherwise cashback is
      // paid on orders that come straight back.
      creditAfterReturnWindow: trigger !== 'CHANNEL',
      validityDays: 180,
      status,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + 90 * 86400_000).toISOString(),
      budgetPaise: 25_00_000 * 100,
      accruedPaise: accrued,
      ordersCount: accrued ? faker.number.int({ min: 100, max: 9000 }) : 0,
      categoryRootName: trigger === 'CATEGORY' ? ['Fashion', 'Grocery'][i % 2] : null,
      paymentMethod: trigger === 'PAYMENT_METHOD' ? 'UPI' : null,
      version: 1,
    });
  });
}

/** Manual payout adjustments finance has raised against sellers. */
export function seedPayoutAdjustments() {
  const sellers = filter('sellers', (s) => s.status === 'ACTIVE');
  const kinds = [
    ['PENALTY', -1, 'Late dispatch penalty for September'],
    ['CLAIM_PAYOUT', 1, 'Approved claim for an item lost in transit'],
    ['AD_SPEND', -1, 'Sponsored ads spend recovery'],
    ['SHORTFALL_RECOVERY', -1, 'Recovery of an earlier overpayment'],
    ['GOODWILL', 1, 'Goodwill credit agreed by the account manager'],
    ['WEIGHT_DISPUTE', -1, 'Weight discrepancy charge upheld'],
  ];

  const rows = [];
  sellers.forEach((seller, i) => {
    if (i % 4 !== 0) return;
    const [type, sign, note] = kinds[i % kinds.length];
    const amount = faker.number.int({ min: 200, max: 9000 }) * 100 * sign;
    const status = i % 12 === 0 ? 'PENDING_APPROVAL' : i % 7 === 0 ? 'APPLIED' : 'APPROVED';

    rows.push(
      insert('payoutAdjustments', {
        id: id('ADJ', 5),
        sellerId: seller.id,
        sellerName: seller.storeName,
        type,
        amountPaise: amount,
        note,
        status,
        batchId: null,
        raisedByName: 'Nikhil Joshi',
        raisedAt: new Date(mockNow() - faker.number.int({ min: 1, max: 40 }) * 86400_000).toISOString(),
        approvedByName: status === 'PENDING_APPROVAL' ? null : 'Meera Krishnan',
        version: 1,
      }),
    );
  });
  return rows;
}
