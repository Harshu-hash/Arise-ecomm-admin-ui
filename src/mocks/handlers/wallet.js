import { fakerEN_IN as faker } from '@faker-js/faker';
import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval, requiresApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  created,
  notFound,
  ok,
  okList,
  validationFailed,
  versionConflict,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Wallet (store credit), gift cards and cashback.
 *
 * Every balance change goes through `postEntry`, which writes a ledger row
 * and derives the balance from it. Nothing updates `balancePaise` directly:
 * a balance that cannot be explained by its own ledger is unauditable.
 */
function postEntry(account, { direction, type, amountPaise, reason, actor, orderId = null, expiresAt = null }) {
  const delta = direction === 'CREDIT' ? amountPaise : -amountPaise;
  const balance = account.balancePaise + delta;

  const entry = insert('walletEntries', {
    id: id('WLE', 7),
    walletId: account.id,
    customerId: account.customerId,
    direction,
    type,
    amountPaise,
    balanceAfterPaise: balance,
    reason,
    orderId,
    expiresAt,
    actorName: actor?.name ?? 'System',
    createdAt: mockNowIso(),
  });

  update('walletAccounts', account.id, {
    balancePaise: balance,
    lifetimeCreditedPaise: account.lifetimeCreditedPaise + (direction === 'CREDIT' ? amountPaise : 0),
    lifetimeDebitedPaise: account.lifetimeDebitedPaise + (direction === 'DEBIT' ? amountPaise : 0),
  });

  return entry;
}

export const walletHandlers = [
  /* ------------------------------------------------------- wallet accounts */
  mswHttp.get(`${BASE}/wallets`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'wallet.account.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-balancePaise' });
    const result = listResult(db.walletAccounts, query, {
      searchFields: ['id', 'customerName', 'customerPhone', 'customerId'],
      filterSpec: {
        status: 'status',
        customerId: 'customerId',
        balancePaise: { path: 'balancePaise' },
      },
      sortable: ['balancePaise', 'lifetimeCreditedPaise', 'customerName'],
      facetFields: ['status'],
    });

    return okList(result.items, {
      ...result.meta,
      summary: {
        // The outstanding balance is a liability on the platform's books,
        // which is why finance watches this number and not the credits.
        liabilityPaise: db.walletAccounts.reduce((n, w) => n + w.balancePaise, 0),
        frozenCount: db.walletAccounts.filter((w) => w.status === 'FROZEN').length,
        accountsWithBalance: db.walletAccounts.filter((w) => w.balancePaise > 0).length,
      },
    });
  }),

  mswHttp.get(`${BASE}/wallets/:walletId`, async ({ request, params }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'wallet.account.view');
    if (g.response) return g.response;

    const account = findById('walletAccounts', params.walletId);
    if (!account) return notFound('That wallet no longer exists.');

    // Newest first, tie-broken by id so the ordering is total: two entries
    // posted in the same second must still have a defined "latest", or the
    // balance read back from the ledger depends on sort stability.
    const entries = filter('walletEntries', (e) => e.walletId === account.id)
      .sort((a, b) => (
        new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id)
      ));
    const expiring = entries.filter(
      (e) => e.direction === 'CREDIT' && e.expiresAt
        && new Date(e.expiresAt).getTime() > mockNow()
        && new Date(e.expiresAt).getTime() < mockNow() + 30 * 86400_000,
    );

    return ok({
      ...account,
      entries,
      // Credit the customer is about to lose: support gets asked about this
      // constantly, so it is computed here rather than in the UI.
      expiringSoonPaise: expiring.reduce((n, e) => n + e.amountPaise, 0),
      ledgerBalancePaise: entries.length ? entries[0].balanceAfterPaise : 0,
    });
  }),

  mswHttp.get(`${BASE}/wallets/:walletId/entries`, async ({ request, params }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'wallet.ledger.view');
    if (g.response) return g.response;

    const account = findById('walletAccounts', params.walletId);
    if (!account) return notFound('That wallet no longer exists.');

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const rows = filter('walletEntries', (e) => e.walletId === account.id);
    const result = listResult(rows, query, {
      searchFields: ['id', 'reason', 'orderId'],
      filterSpec: {
        direction: 'direction',
        type: 'type',
        createdAt: { path: 'createdAt', kind: 'date' },
      },
      sortable: ['createdAt', 'amountPaise'],
      facetFields: ['direction', 'type'],
    });
    return okList(result.items, result.meta);
  }),

  /**
   * The ledger across every wallet.
   *
   * Finance reads this one rather than per-account: it is where a spike in
   * goodwill credits or a run of expiries shows up.
   */
  mswHttp.get(`${BASE}/wallet-entries`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'wallet.ledger.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(db.walletEntries, query, {
      searchFields: ['id', 'customerId', 'reason', 'orderId'],
      filterSpec: {
        direction: 'direction',
        type: 'type',
        customerId: 'customerId',
        walletId: 'walletId',
        createdAt: { path: 'createdAt', kind: 'date' },
      },
      sortable: ['createdAt', 'amountPaise'],
      facetFields: ['direction', 'type'],
      map: (entry) => ({
        ...entry,
        customerName: findById('walletAccounts', entry.walletId)?.customerName ?? '—',
      }),
    });

    const credits = db.walletEntries.filter((e) => e.direction === 'CREDIT');
    const debits = db.walletEntries.filter((e) => e.direction === 'DEBIT');
    return okList(result.items, {
      ...result.meta,
      summary: {
        creditedPaise: credits.reduce((n, e) => n + e.amountPaise, 0),
        debitedPaise: debits.reduce((n, e) => n + e.amountPaise, 0),
        goodwillPaise: db.walletEntries
          .filter((e) => e.type === 'GOODWILL')
          .reduce((n, e) => n + e.amountPaise, 0),
      },
    });
  }),

  /* ----------------------------------------------------- freeze / unfreeze */
  mswHttp.post(`${BASE}/wallets/:walletId/freeze`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'wallet.account.freeze');
    if (g.response) return g.response;

    const body = await request.json();
    const account = findById('walletAccounts', params.walletId);
    if (!account) return notFound('That wallet no longer exists.');
    if (!body.reason?.trim()) return validationFailed({ reason: 'A reason is required.' });

    const freeze = Boolean(body.frozen);
    if ((account.status === 'FROZEN') === freeze) {
      return conflict(freeze ? 'This wallet is already frozen.' : 'This wallet is not frozen.', 'NO_CHANGE');
    }

    update('walletAccounts', account.id, {
      status: freeze ? 'FROZEN' : 'ACTIVE',
      frozenReason: freeze ? body.reason : null,
    });
    writeAudit({
      actor: g.user, action: freeze ? 'wallet.freeze' : 'wallet.unfreeze',
      entityType: 'wallet', entityId: account.id, entityLabel: account.customerName,
      reason: body.reason,
    });
    scheduleSave();
    return ok(findById('walletAccounts', account.id));
  }),

  /* ----------------------------------------------------- manual adjustment */
  mswHttp.post(`${BASE}/wallets/:walletId/adjust`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'wallet.adjust.create');
    if (g.response) return g.response;

    const body = await request.json();
    const account = findById('walletAccounts', params.walletId);
    if (!account) return notFound('That wallet no longer exists.');

    const amountPaise = Number(body.amountPaise);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return validationFailed({ amountPaise: 'Enter an amount.' });
    }
    if (!['CREDIT', 'DEBIT'].includes(body.direction)) {
      return validationFailed({ direction: 'Choose credit or debit.' });
    }
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why this adjustment is being made.' });
    if (account.status === 'FROZEN') {
      return conflict('This wallet is frozen. Unfreeze it before adjusting the balance.', 'WALLET_FROZEN');
    }
    // A debit can never exceed the balance: store credit must not go
    // negative, or the customer owes us money we can never collect.
    if (body.direction === 'DEBIT' && amountPaise > account.balancePaise) {
      return validationFailed({
        amountPaise: `Only ₹${(account.balancePaise / 100).toLocaleString('en-IN')} is available to debit.`,
      });
    }

    const apply = () =>
      postEntry(account, {
        direction: body.direction,
        type: body.direction === 'CREDIT' ? (body.type ?? 'GOODWILL') : 'REVERSAL',
        amountPaise,
        reason: body.reason,
        actor: g.user,
        orderId: body.orderId ?? null,
        expiresAt: body.expiresAt ?? null,
      });

    if (requiresApproval('wallet.adjust', { actor: g.user, amountPaise })) {
      const approval = createApproval({
        actionKey: 'wallet.adjust', actor: g.user, entityType: 'wallet',
        entityId: account.id, entityLabel: account.customerName, reason: body.reason,
        summary: `${body.direction === 'CREDIT' ? 'Credit' : 'Debit'} ₹${(amountPaise / 100).toLocaleString('en-IN')} ${body.direction === 'CREDIT' ? 'to' : 'from'} ${account.customerName}`,
        amountPaise, payload: { walletId: account.id, ...body },
        execute: () => {
          apply();
          scheduleSave();
        },
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    const entry = apply();
    writeAudit({
      actor: g.user, action: 'wallet.adjust', entityType: 'wallet',
      entityId: account.id, entityLabel: account.customerName, reason: body.reason,
      metadata: { direction: body.direction, amountPaise },
    });
    scheduleSave();
    return created({ entry, account: findById('walletAccounts', account.id) });
  }),

  /* ------------------------------------------------------------ gift cards */
  mswHttp.get(`${BASE}/gift-cards`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'wallet.giftcard.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-issuedAt' });
    const result = listResult(db.giftCards, query, {
      searchFields: ['id', 'codeLast4', 'issuedTo', 'programName'],
      filterSpec: {
        status: 'status',
        programId: 'programId',
        issuedAt: { path: 'issuedAt', kind: 'date' },
        expiresAt: { path: 'expiresAt', kind: 'date' },
      },
      sortable: ['issuedAt', 'facePaise', 'balancePaise', 'expiresAt'],
      facetFields: ['status', 'programName'],
    });

    return okList(result.items, {
      ...result.meta,
      programs: db.giftCardPrograms,
      summary: {
        issuedPaise: db.giftCards.reduce((n, c) => n + c.facePaise, 0),
        redeemedPaise: db.giftCards.reduce((n, c) => n + c.redeemedPaise, 0),
        liabilityPaise: db.giftCards.filter((c) => c.status === 'ACTIVE').reduce((n, c) => n + c.balancePaise, 0),
      },
    });
  }),

  mswHttp.post(`${BASE}/gift-cards`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'wallet.giftcard.generate');
    if (g.response) return g.response;

    const body = await request.json();
    const program = findById('giftCardPrograms', body.programId);
    if (!program) return validationFailed({ programId: 'Choose a programme.' });

    const quantity = Number(body.quantity);
    const facePaise = Number(body.facePaise);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return validationFailed({ quantity: 'Generate between 1 and 500 cards at a time.' });
    }
    if (!program.denominationsPaise.includes(facePaise)) {
      return validationFailed({ facePaise: 'That denomination is not offered by this programme.' });
    }
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say what this batch is for.' });

    const totalPaise = quantity * facePaise;
    const generate = () => {
      const cards = [];
      for (let i = 0; i < quantity; i += 1) {
        cards.push(
          insert('giftCards', {
            id: id('GFT', 6),
            programId: program.id,
            programName: program.name,
            codeLast4: faker.string.numeric(4),
            facePaise,
            balancePaise: facePaise,
            redeemedPaise: 0,
            status: 'ACTIVE',
            issuedTo: body.issuedTo ?? null,
            issuedAt: mockNowIso(),
            expiresAt: new Date(mockNow() + program.validityMonths * 30 * 86400_000).toISOString(),
            redeemedByCustomerId: null,
            redeemedAt: null,
            blockedReason: null,
            batchReason: body.reason,
            version: 1,
          }),
        );
      }
      update('giftCardPrograms', program.id, {
        issuedCount: program.issuedCount + quantity,
        issuedPaise: program.issuedPaise + totalPaise,
      });
      scheduleSave();
      return cards;
    };

    // Generating cards creates a liability out of thin air, so a large batch
    // needs a second approver.
    if (requiresApproval('giftcard.generate', { actor: g.user, amountPaise: totalPaise })) {
      const approval = createApproval({
        actionKey: 'giftcard.generate', actor: g.user, entityType: 'giftCardProgram',
        entityId: program.id, entityLabel: program.name, reason: body.reason,
        summary: `Generate ${quantity} × ₹${(facePaise / 100).toLocaleString('en-IN')} gift cards (₹${(totalPaise / 100).toLocaleString('en-IN')})`,
        amountPaise: totalPaise, payload: body,
        execute: generate,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    const cards = generate();
    writeAudit({
      actor: g.user, action: 'giftcard.generate', entityType: 'giftCardProgram',
      entityId: program.id, entityLabel: program.name, reason: body.reason,
      metadata: { quantity, facePaise, totalPaise },
    });
    return created({ count: cards.length, totalPaise, cards: cards.slice(0, 10) });
  }),

  mswHttp.post(`${BASE}/gift-cards/:cardId/block`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'wallet.giftcard.block');
    if (g.response) return g.response;

    const body = await request.json();
    const card = findById('giftCards', params.cardId);
    if (!card) return notFound('That gift card no longer exists.');
    if (card.status === 'REDEEMED') {
      return conflict('This card has already been fully redeemed.', 'ILLEGAL_TRANSITION');
    }
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why the card is being blocked.' });

    update('giftCards', card.id, { status: 'BLOCKED', blockedReason: body.reason });
    writeAudit({
      actor: g.user, action: 'giftcard.block', entityType: 'giftCard',
      entityId: card.id, entityLabel: `•••• ${card.codeLast4}`, reason: body.reason,
      metadata: { balancePaise: card.balancePaise },
    });
    scheduleSave();
    return ok(findById('giftCards', card.id));
  }),

  /* -------------------------------------------------------- cashback rules */
  mswHttp.get(`${BASE}/cashback-rules`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'wallet.cashback.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-accruedPaise' });
    const result = listResult(db.cashbackRules, query, {
      searchFields: ['name', 'trigger'],
      filterSpec: { status: 'status', trigger: 'trigger' },
      sortable: ['accruedPaise', 'name', 'startsAt'],
      facetFields: ['status', 'trigger'],
      map: (rule) => ({
        ...rule,
        budgetUsedPct: rule.budgetPaise
          ? Number(((rule.accruedPaise / rule.budgetPaise) * 100).toFixed(1))
          : 0,
      }),
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/cashback-rules`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'wallet.cashback.create');
    if (g.response) return g.response;

    const body = await request.json();
    const errors = {};
    if (!body.name?.trim()) errors.name = 'Give the rule a name.';
    if (!body.trigger) errors.trigger = 'Choose what triggers the cashback.';
    const pct = Number(body.cashbackPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) errors.cashbackPct = 'Enter 1–100%.';
    if (!Number(body.maxCashbackPaise)) errors.maxCashbackPaise = 'Set a per-order cap.';
    // An uncapped budget on a percentage rule is how a promotion quietly
    // costs more than the margin it was meant to buy.
    if (!Number(body.budgetPaise)) errors.budgetPaise = 'Set a total budget.';
    if (Object.keys(errors).length) return validationFailed(errors);

    const rule = insert('cashbackRules', {
      id: id('CBK', 4),
      name: body.name.trim(),
      trigger: body.trigger,
      cashbackPct: pct,
      maxCashbackPaise: Number(body.maxCashbackPaise),
      minOrderPaise: Number(body.minOrderPaise ?? 0),
      creditDelayDays: Number(body.creditDelayDays ?? 7),
      creditAfterReturnWindow: body.creditAfterReturnWindow ?? true,
      validityDays: Number(body.validityDays ?? 180),
      status: body.status ?? 'SCHEDULED',
      startsAt: body.startsAt ?? mockNowIso(),
      endsAt: body.endsAt ?? null,
      budgetPaise: Number(body.budgetPaise),
      accruedPaise: 0,
      ordersCount: 0,
      categoryRootName: body.categoryRootName ?? null,
      paymentMethod: body.paymentMethod ?? null,
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'cashback.create', entityType: 'cashbackRule',
      entityId: rule.id, entityLabel: rule.name,
      metadata: { cashbackPct: pct, budgetPaise: rule.budgetPaise },
    });
    scheduleSave();
    return created(rule);
  }),

  mswHttp.patch(`${BASE}/cashback-rules/:ruleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'wallet.cashback.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const rule = findById('cashbackRules', params.ruleId);
    if (!rule) return notFound('That cashback rule no longer exists.');
    if (body.version !== undefined && body.version !== rule.version) return versionConflict(rule);
    if (rule.status === 'ENDED') {
      return conflict('An ended rule cannot be changed. Create a new one.', 'ILLEGAL_TRANSITION');
    }

    const patch = {};
    for (const key of ['name', 'cashbackPct', 'maxCashbackPaise', 'minOrderPaise', 'budgetPaise', 'endsAt', 'status']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (patch.status && !['ACTIVE', 'PAUSED', 'SCHEDULED', 'ENDED'].includes(patch.status)) {
      return validationFailed({ status: 'Unknown status.' });
    }
    if (!Object.keys(patch).length) return validationFailed({ name: 'Nothing to change.' });

    update('cashbackRules', rule.id, patch);
    writeAudit({
      actor: g.user, action: 'cashback.edit', entityType: 'cashbackRule',
      entityId: rule.id, entityLabel: rule.name, reason: body.reason,
      metadata: patch,
    });
    scheduleSave();
    return ok(findById('cashbackRules', rule.id));
  }),
];
