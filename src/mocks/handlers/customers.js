import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

function customerRow(c) {
  return {
    ...c,
    riskLevel: c.riskScore >= 60 ? 'HIGH' : c.riskScore >= 35 ? 'MEDIUM' : 'LOW',
    openFlags: db.riskFlags.filter((f) => f.entityId === c.id && f.status === 'OPEN').length,
  };
}

export const customerHandlers = [
  mswHttp.get(`${BASE}/customers`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'customers.customer.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-gmvPaise' });
    const rows = db.customers.map(customerRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['name', 'email', 'phone', 'id'],
      filterSpec: {
        status: 'status',
        city: 'city',
        state: 'state',
        platform: 'platform',
        riskLevel: 'riskLevel',
        codDisabled: { path: 'codDisabled', kind: 'boolean' },
        joinedAt: { path: 'joinedAt', kind: 'date' },
        lastOrderAt: { path: 'lastOrderAt', kind: 'date' },
        ordersCount: { path: 'ordersCount' },
        gmvPaise: { path: 'gmvPaise' },
      },
      sortable: ['name', 'joinedAt', 'ordersCount', 'gmvPaise', 'lastOrderAt', 'riskScore', 'rtoPct'],
      facetFields: ['status', 'riskLevel'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/customers/privacy-requests`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'customers.privacy.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'dueAt' });
    const rows = db.privacyRequests.map((r) => ({
      ...r,
      overdue: new Date(r.dueAt).getTime() < mockNow() && !['COMPLETED', 'REJECTED'].includes(r.status),
    }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['customerName', 'id', 'typeLabel'],
      filterSpec: { status: 'status', type: 'type', dueAt: { path: 'dueAt', kind: 'date' } },
      sortable: ['dueAt', 'receivedAt', 'status', 'customerName'],
      facetFields: ['status', 'type'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/customers/risk`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'customers.risk.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-flaggedAt' });
    const { items, meta } = listResult(db.riskFlags, query, {
      searchFields: ['entityLabel', 'ruleName', 'id'],
      filterSpec: { status: 'status', ruleId: 'ruleId', flaggedAt: { path: 'flaggedAt', kind: 'date' } },
      sortable: ['flaggedAt', 'score', 'status'],
      facetFields: ['status'],
    });
    return okList(items, { ...meta, rules: db.riskRules, blocklist: db.blocklistEntries });
  }),

  mswHttp.get(`${BASE}/customers/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'customers.customer.view');
    if (g.response) return g.response;

    const customer = findById('customers', params.id);
    if (!customer) return notFound('That customer no longer exists.');

    const orders = filter('orders', (o) => o.customerId === customer.id);
    const returns = filter('returns', (r) => r.customerId === customer.id);
    const refunds = filter('refunds', (r) => r.customerId === customer.id);

    // Accounts sharing a device, phone or address are the usual shape of
    // refund and coupon abuse rings.
    const devices = filter('customerDevices', (d) => d.customerId === customer.id);
    const linked = devices.length
      ? db.customerDevices
          .filter((d) => d.customerId !== customer.id && d.ip === devices[0].ip)
          .map((d) => {
            const other = findById('customers', d.customerId);
            return other ? { id: other.id, name: other.name, status: other.status, reason: 'same IP' } : null;
          })
          .filter(Boolean)
          .slice(0, 5)
      : [];

    return ok(customerRow(customer), {
      allowedActions: [
        ...(g.permissions.includes('*') || g.permissions.includes('customers.customer.block')
          ? [customer.status === 'BLOCKED' ? 'UNBLOCK' : 'BLOCK'] : []),
        ...(g.permissions.includes('*') || g.permissions.includes('customers.customer.disable_cod')
          ? [customer.codDisabled ? 'ENABLE_COD' : 'DISABLE_COD'] : []),
      ],
      addresses: filter('customerAddresses', (a) => a.customerId === customer.id),
      devices,
      linkedAccounts: linked,
      riskFlags: db.riskFlags.filter((f) => f.entityId === customer.id),
      recentOrders: orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 10),
      returns,
      refunds,
      stats: {
        orders: orders.length,
        gmvPaise: customer.gmvPaise,
        aovPaise: orders.length ? Math.round(customer.gmvPaise / orders.length) : 0,
        cancelled: filter('orderItems', (i) => orders.some((o) => o.id === i.orderId) && i.status === 'CANCELLED').length,
        returns: returns.length,
        refundedPaise: refunds.filter((r) => r.status === 'COMPLETED').reduce((n, r) => n + r.amountPaise, 0),
      },
    });
  }),

  mswHttp.post(`${BASE}/customers/:id/:action`, async ({ request, params }) => {
    const map = {
      block: ['customers.customer.block', true],
      unblock: ['customers.customer.block', true],
      'disable-cod': ['customers.customer.disable_cod', true],
      'enable-cod': ['customers.customer.disable_cod', false],
    };
    const entry = map[params.action];
    if (!entry) return notFound('Unknown action.');
    const [permission, needsReason] = entry;

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    const customer = findById('customers', params.id);
    if (!customer) return notFound('That customer no longer exists.');
    const body = await request.json().catch(() => ({}));
    if (needsReason && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Give a reason.' });
    }

    if (params.action === 'block') {
      if (customer.status === 'BLOCKED') return conflict('Already blocked.', 'ALREADY_BLOCKED');
      update('customers', customer.id, { status: 'BLOCKED', blockedReason: body.reason });
    } else if (params.action === 'unblock') {
      update('customers', customer.id, { status: 'ACTIVE', blockedReason: null });
    } else {
      update('customers', customer.id, { codDisabled: params.action === 'disable-cod' });
    }

    writeAudit({
      actor: g.user,
      action: `customers.customer.${params.action.replace(/-/g, '_')}`,
      entityType: 'customer',
      entityId: customer.id,
      entityLabel: customer.name,
      reason: body.reason ?? null,
      severity: 'warning',
    });
    scheduleSave();
    return ok(customerRow(findById('customers', customer.id)));
  }),

  /** Privacy request handling, including the pre-checks before a deletion. */
  mswHttp.get(`${BASE}/privacy-requests/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'customers.privacy.view');
    if (g.response) return g.response;

    const row = findById('privacyRequests', params.id);
    if (!row) return notFound('That request no longer exists.');
    const customer = findById('customers', row.customerId);
    const orders = filter('orders', (o) => o.customerId === row.customerId);

    // Deleting an account with money or obligations still in flight would
    // strand both sides, so these are surfaced as blockers.
    const openOrders = orders.filter(
      (o) => !['DELIVERED', 'CANCELLED', 'PAYMENT_FAILED'].includes(o.status),
    );
    const pendingRefunds = filter(
      'refunds',
      (r) => r.customerId === row.customerId && !['COMPLETED', 'FAILED'].includes(r.status),
    );
    const blockers = [];
    if (openOrders.length) blockers.push(`${openOrders.length} order(s) still in progress`);
    if (pendingRefunds.length) blockers.push(`${pendingRefunds.length} refund(s) still processing`);
    if (customer?.walletBalancePaise > 0) {
      blockers.push(`Wallet still holds ₹${(customer.walletBalancePaise / 100).toLocaleString('en-IN')}`);
    }

    return ok(row, {
      customer,
      blockers,
      openOrders: openOrders.slice(0, 5),
      allowedActions:
        row.status === 'COMPLETED' || row.status === 'REJECTED'
          ? []
          : ['PROCESS', 'REJECT', 'HOLD'],
    });
  }),

  mswHttp.post(`${BASE}/privacy-requests/:id/:action`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'customers.privacy.process');
    if (g.response) return g.response;

    const row = findById('privacyRequests', params.id);
    if (!row) return notFound('That request no longer exists.');
    if (['COMPLETED', 'REJECTED'].includes(row.status)) {
      return conflict('This request has already been closed.', 'ALREADY_DECIDED');
    }
    const body = await request.json().catch(() => ({}));

    if (params.action === 'process') {
      const customer = findById('customers', row.customerId);
      const openOrders = filter(
        'orders',
        (o) => o.customerId === row.customerId && !['DELIVERED', 'CANCELLED', 'PAYMENT_FAILED'].includes(o.status),
      );
      if (row.type === 'ACCOUNT_DELETION' && openOrders.length && !body.force) {
        return conflict('This customer still has orders in progress.', 'PRIVACY_BLOCKED', {
          details: { openOrders: openOrders.length },
        });
      }

      if (row.type === 'ACCOUNT_DELETION') {
        // Orders are kept for tax law but stripped of anything identifying.
        update('customers', customer.id, {
          status: 'DELETED',
          name: 'Deleted customer',
          email: `deleted-${customer.id}@removed.invalid`,
          phone: '0000000000',
        });
        for (const o of filter('orders', (x) => x.customerId === customer.id)) {
          update('orders', o.id, {
            customerName: 'Deleted customer',
            customerPhone: '0000000000',
            address: { ...o.address, name: 'Deleted customer', phone: '0000000000' },
          });
        }
      }
      update('privacyRequests', row.id, {
        status: 'COMPLETED', completedAt: mockNowIso(), handledByName: g.user.name,
      });
    } else if (params.action === 'reject') {
      if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });
      update('privacyRequests', row.id, { status: 'REJECTED', decisionReason: body.reason });
    } else if (params.action === 'hold') {
      if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give the legal basis.' });
      update('privacyRequests', row.id, { status: 'ON_HOLD', holdReason: body.reason });
    } else {
      return notFound('Unknown action.');
    }

    writeAudit({
      actor: g.user,
      action: `customers.privacy.${params.action}`,
      entityType: 'privacyRequest',
      entityId: row.id,
      entityLabel: `${row.typeLabel} — ${row.customerName}`,
      reason: body.reason ?? null,
      severity: 'warning',
    });
    scheduleSave();
    return ok(findById('privacyRequests', row.id));
  }),

  mswHttp.post(`${BASE}/risk-flags/:id/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'customers.risk.decide');
    if (g.response) return g.response;

    const flag = findById('riskFlags', params.id);
    if (!flag) return notFound('That flag no longer exists.');
    if (flag.status !== 'OPEN') return conflict('Already reviewed.', 'ALREADY_DECIDED');

    const body = await request.json();
    if (!['CLEARED', 'CONFIRMED_FRAUD'].includes(body?.decision)) {
      return validationFailed({ decision: 'Clear the flag or confirm it as fraud.' });
    }

    update('riskFlags', flag.id, {
      status: body.decision,
      reviewerName: g.user.name,
      reviewedAt: mockNowIso(),
      decisionReason: body.reason ?? null,
    });

    // Confirming fraud blocks the account — that is the point of the review.
    if (body.decision === 'CONFIRMED_FRAUD' && flag.entityType === 'customer') {
      update('customers', flag.entityId, {
        status: 'BLOCKED',
        blockedReason: `Confirmed fraud: ${flag.ruleName}`,
      });
    }

    writeAudit({
      actor: g.user, action: 'customers.risk.decide', entityType: 'riskFlag',
      entityId: flag.id, entityLabel: flag.entityLabel,
      metadata: { decision: body.decision }, reason: body.reason ?? null, severity: 'warning',
    });
    scheduleSave();
    return ok(findById('riskFlags', flag.id));
  }),

  mswHttp.post(`${BASE}/blocklist`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'customers.blocklist.create');
    if (g.response) return g.response;

    const body = await request.json();
    const fieldErrors = {};
    if (!['PHONE', 'EMAIL', 'DEVICE', 'PINCODE_COD'].includes(body?.kind)) fieldErrors.kind = 'Pick a type.';
    if (!String(body?.value ?? '').trim()) fieldErrors.value = 'Enter the value to block.';
    if (!String(body?.reason ?? '').trim()) fieldErrors.reason = 'Give a reason.';
    if (db.blocklistEntries.some((b) => b.kind === body?.kind && b.value === body?.value)) {
      fieldErrors.value = 'This is already on the blocklist.';
    }
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const row = insert('blocklistEntries', {
      id: id('BLK', 4),
      kind: body.kind,
      value: body.value.trim(),
      reason: body.reason,
      addedByName: g.user.name,
      addedAt: mockNowIso(),
      expiresAt: body.expiresAt ?? null,
      version: 1,
    });
    writeAudit({
      actor: g.user, action: 'customers.blocklist.create', entityType: 'blocklistEntry',
      entityId: row.id, entityLabel: `${row.kind} ${row.value}`, reason: row.reason, severity: 'warning',
    });
    scheduleSave();
    return ok(row);
  }),
];
