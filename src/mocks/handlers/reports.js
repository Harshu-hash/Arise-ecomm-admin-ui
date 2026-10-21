import { http as mswHttp } from 'msw';
import { db, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { createJob } from '../engine/jobs';
import { listResult, parseListQuery } from '../engine/list';
import { created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Sums `fn(row)` over `rows`. */
function sumBy(rows, fn) {
  return rows.reduce((n, r) => n + (fn(r) || 0), 0);
}

/** Groups `rows` by `keyFn`, each bucket reduced by `reduceFn(bucketRows)`. */
function groupBy(rows, keyFn, reduceFn) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined) continue;
    (buckets.get(key) ?? buckets.set(key, []).get(key)).push(row);
  }
  return Array.from(buckets.entries()).map(([key, bucketRows]) => ({ key, ...reduceFn(bucketRows) }));
}

function topN(rows, n = 5) {
  return [...rows].sort((a, b) => (b.gmvPaise ?? b.count ?? 0) - (a.gmvPaise ?? a.count ?? 0)).slice(0, n);
}

/**
 * Analytics Dashboards (M15.1): nine domains, each aggregated live from the
 * collections the rest of the panel already maintains — real orders, real
 * finance records, real tickets — rather than a second, invented series.
 * Perm per domain matches the permission catalog's own `reports.*` split.
 */
const ANALYTICS_DOMAINS = {
  sales(days) {
    const cutoff = mockNow() - days * 86400_000;
    const orders = db.orders.filter((o) => new Date(o.placedAt).getTime() >= cutoff);
    const items = db.orderItems.filter(
      (it) => orders.some((o) => o.id === it.orderId) && it.status !== 'CANCELLED' && it.status !== 'PAYMENT_FAILED',
    );
    const productById = new Map(db.products.map((p) => [p.id, p]));
    const categoryById = new Map(db.categories.map((c) => [c.id, c]));

    const gmvPaise = sumBy(orders, (o) => o.grandTotalPaise);
    const units = sumBy(items, (it) => it.qty);

    return {
      totals: { gmvPaise, orders: orders.length, units, aovPaise: orders.length ? Math.round(gmvPaise / orders.length) : 0 },
      byCategory: topN(groupBy(
        items,
        (it) => categoryById.get(productById.get(it.productId)?.categoryId)?.name ?? 'Uncategorised',
        (rows) => ({ label: rows[0] && (categoryById.get(productById.get(rows[0].productId)?.categoryId)?.name ?? 'Uncategorised'), gmvPaise: sumBy(rows, (r) => r.linePaise), units: sumBy(rows, (r) => r.qty) }),
      )),
      byChannel: groupBy(orders, (o) => o.channel, (rows) => ({ label: rows[0].channel, orders: rows.length, gmvPaise: sumBy(rows, (o) => o.grandTotalPaise) })),
      byCity: topN(groupBy(orders, (o) => o.address?.city, (rows) => ({ label: rows[0].address?.city ?? 'Unknown', gmvPaise: sumBy(rows, (o) => o.grandTotalPaise), orders: rows.length }))),
    };
  },

  customers(days) {
    const cutoff = mockNow() - days * 86400_000;
    const newCustomers = db.customers.filter((c) => new Date(c.joinedAt).getTime() >= cutoff);
    const returning = db.customers.filter((c) => c.ordersCount > 1);
    return {
      totals: {
        newCustomers: newCustomers.length,
        returningCustomers: returning.length,
        totalCustomers: db.customers.length,
        avgGmvPaise: db.customers.length ? Math.round(sumBy(db.customers, (c) => c.gmvPaise) / db.customers.length) : 0,
      },
      topCities: topN(groupBy(db.customers, (c) => c.city, (rows) => ({ label: rows[0].city ?? 'Unknown', count: rows.length, gmvPaise: sumBy(rows, (c) => c.gmvPaise) }))),
    };
  },

  catalog() {
    const live = db.products.filter((p) => p.status === 'LIVE');
    const outOfStockOffers = db.offers.filter((o) => o.status === 'LIVE' && o.stock === 0);
    const liveOffers = db.offers.filter((o) => o.status === 'LIVE');
    return {
      totals: {
        liveListings: live.length,
        qcQueueSize: db.listingSubmissions.length,
        qcHighPriority: db.listingSubmissions.filter((s) => s.priority === 'HIGH').length,
        outOfStockPct: liveOffers.length ? Number(((outOfStockOffers.length / liveOffers.length) * 100).toFixed(1)) : 0,
      },
      byCategory: topN(groupBy(live, (p) => p.categoryId, (rows) => ({ label: findById('categories', rows[0].categoryId)?.name ?? 'Uncategorised', count: rows.length })), 8),
    };
  },

  sellers() {
    const byStatus = groupBy(db.sellers, (s) => s.status, (rows) => ({ label: rows[0].status, count: rows.length }));
    const active = db.sellers.filter((s) => s.status === 'ACTIVE');
    const byTier = groupBy(active, (s) => s.tier, (rows) => ({ label: rows[0].tier, count: rows.length }));
    return {
      totals: {
        activeSellers: active.length,
        avgRating: active.length ? Number((sumBy(active, (s) => s.rating ?? 0) / active.length).toFixed(2)) : 0,
        avgCancellationPct: active.length ? Number((sumBy(active, (s) => s.cancellationPct) / active.length).toFixed(2)) : 0,
      },
      onboardingFunnel: byStatus,
      byTier,
    };
  },

  fulfilment() {
    const shipments = db.shipments;
    const delivered = shipments.filter((s) => s.status === 'DELIVERED');
    const ndr = db.ndrRecords;
    const rto = shipments.filter((s) => s.status.startsWith('RTO'));
    return {
      totals: {
        shipments: shipments.length,
        deliveredPct: shipments.length ? Number(((delivered.length / shipments.length) * 100).toFixed(1)) : 0,
        ndrPct: shipments.length ? Number(((ndr.length / shipments.length) * 100).toFixed(1)) : 0,
        rtoPct: shipments.length ? Number(((rto.length / shipments.length) * 100).toFixed(1)) : 0,
      },
      byCourier: topN(
        groupBy(shipments.filter((s) => s.courierName), (s) => s.courierName, (rows) => ({
          label: rows[0].courierName,
          count: rows.length,
          ndrCount: rows.filter((s) => s.status === 'UNDELIVERED').length,
        })),
        10,
      ),
    };
  },

  returns() {
    const returns = db.returns;
    const byReason = topN(groupBy(returns, (r) => r.reason, (rows) => ({ label: rows[0].reason, count: rows.length })), 8);
    const bySeller = topN(groupBy(returns, (r) => r.sellerName, (rows) => ({ label: rows[0].sellerName, count: rows.length })));
    const closed = returns.filter((r) => r.status === 'CLOSED');
    return {
      totals: {
        totalReturns: returns.length,
        returnRatePct: db.orderItems.length ? Number(((returns.length / db.orderItems.length) * 100).toFixed(2)) : 0,
        qcFailPct: returns.length ? Number(((returns.filter((r) => r.qcResult === 'FAIL').length / returns.length) * 100).toFixed(1)) : 0,
        closedCount: closed.length,
      },
      byReason,
      bySeller,
    };
  },

  finance(days) {
    const cutoff = mockNow() - days * 86400_000;
    const lines = db.settlementLines.filter((l) => l.deliveredAt && new Date(l.deliveredAt).getTime() >= cutoff);
    const adsSpend = sumBy(db.adDailyStats, (s) => s.spendPaise);
    const refunds = db.refunds.filter((r) => new Date(r.initiatedAt).getTime() >= cutoff);
    const codOutstanding = sumBy(
      db.codRemittances.filter((c) => c.status !== 'RECONCILED'),
      (c) => c.expectedPaise - c.receivedPaise,
    );
    return {
      totals: {
        commissionPaise: sumBy(lines, (l) => l.commissionPaise),
        feesPaise: sumBy(lines, (l) => l.feesBeforeTaxPaise),
        adsRevenuePaise: adsSpend,
        netRevenuePaise: sumBy(lines, (l) => l.commissionPaise + l.feesBeforeTaxPaise) + adsSpend,
        refundsPaise: sumBy(refunds, (r) => r.amountPaise),
        payoutsPaidPaise: sumBy(db.sellerPayouts.filter((p) => p.status === 'PAID'), (p) => p.netPaise ?? 0),
        codOutstandingPaise: codOutstanding,
      },
    };
  },

  marketing(days) {
    const cutoff = mockNow() - days * 86400_000;
    const redemptions = db.couponRedemptions.filter((r) => new Date(r.redeemedAt).getTime() >= cutoff);
    const campaignsSent = db.campaigns.filter((c) => c.stats);
    const referralFunnel = groupBy(db.referrals, (r) => r.status, (rows) => ({ label: rows[0].status, count: rows.length }));
    const flashSalesEnded = db.flashSales.filter((f) => f.status === 'ENDED' || f.status === 'LIVE');
    return {
      totals: {
        couponRedemptions: redemptions.length,
        couponDiscountGivenPaise: sumBy(redemptions, (r) => r.discountPaise),
        couponNetGmvPaise: sumBy(redemptions, (r) => r.orderTotalPaise),
        flashSaleGmvPaise: sumBy(flashSalesEnded, (f) => f.gmvPaise),
      },
      campaignPerformance: campaignsSent.map((c) => ({
        label: c.name,
        sent: c.stats.sent,
        openRatePct: c.stats.sent ? Number(((c.stats.opened / c.stats.sent) * 100).toFixed(1)) : 0,
        clickRatePct: c.stats.sent ? Number(((c.stats.clicked / c.stats.sent) * 100).toFixed(1)) : 0,
      })),
      referralFunnel,
    };
  },

  support(days) {
    const cutoff = mockNow() - days * 86400_000;
    const tickets = db.tickets.filter((t) => new Date(t.createdAt).getTime() >= cutoff);
    const resolved = tickets.filter((t) => t.resolvedAt);
    const scored = tickets.filter((t) => t.csatScore !== null);
    const frtMins = (t) => (t.firstRespondedAt ? (new Date(t.firstRespondedAt) - new Date(t.createdAt)) / 60000 : null);
    const resolutionHrs = (t) => (t.resolvedAt ? (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000 : null);
    const withFrt = tickets.filter((t) => frtMins(t) !== null);
    const ordersInRange = db.orders.filter((o) => new Date(o.placedAt).getTime() >= cutoff).length;
    return {
      totals: {
        ticketVolume: tickets.length,
        avgFirstResponseMins: withFrt.length ? Math.round(sumBy(withFrt, frtMins) / withFrt.length) : 0,
        avgResolutionHrs: resolved.length ? Number((sumBy(resolved, resolutionHrs) / resolved.length).toFixed(1)) : 0,
        avgCsat: scored.length ? Number((sumBy(scored, (t) => t.csatScore) / scored.length).toFixed(2)) : null,
        contactRatePct: ordersInRange ? Number(((tickets.length / ordersInRange) * 100).toFixed(1)) : 0,
      },
      byChannel: groupBy(tickets, (t) => t.channel, (rows) => ({ label: rows[0].channel, count: rows.length })),
    };
  },
};

export const reportsHandlers = [
  mswHttp.get(`${BASE}/reports/analytics/:domain`, async ({ request, params }) => {
    const url = new URL(request.url);
    const builder = ANALYTICS_DOMAINS[params.domain];
    if (!builder) return notFound('Unknown analytics domain.');

    const permByDomain = {
      sales: 'reports.sales.view', customers: 'reports.sales.view',
      catalog: 'reports.operations.view', sellers: 'reports.operations.view',
      fulfilment: 'reports.operations.view', returns: 'reports.operations.view',
      finance: 'reports.finance.view', marketing: 'reports.sales.view', support: 'reports.operations.view',
    };
    const g = await guard(request, url, permByDomain[params.domain]);
    if (g.response) return g.response;

    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 30)));
    return ok({ domain: params.domain, days, ...builder(days) });
  }),

  /* ------------------------------------------------------------- report library */
  mswHttp.get(`${BASE}/reports/library`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'reports.library.view');
    if (g.response) return g.response;
    return ok(db.reportDefinitions);
  }),

  mswHttp.post(`${BASE}/reports/library/:reportKey/run`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reports.library.export');
    if (g.response) return g.response;
    const def = db.reportDefinitions.find((r) => r.key === params.reportKey);
    if (!def) return notFound('That report no longer exists.');

    const body = await request.json().catch(() => ({}));
    const job = createJob({
      type: 'EXPORT',
      label: def.name,
      actor: g.user,
      totalRows: db[def.collection]?.length ?? 0,
      durationMs: 4000,
      resultUrl: `mock://exports/${def.key}.csv`,
      metadata: { filters: body.filters ?? null, reportKey: def.key, containsPii: ['sales', 'finance'].includes(def.domain) === false },
    });
    writeAudit({ actor: g.user, action: 'reports.run', entityType: 'reportDefinition', entityId: def.id, entityLabel: def.name });
    scheduleSave();
    return ok(job);
  }),

  /* ---------------------------------------------------------- scheduled reports */
  mswHttp.get(`${BASE}/reports/scheduled`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'reports.schedule.view');
    if (g.response) return g.response;
    const query = parseListQuery(url, { defaultSort: '-lastRunAt' });
    const result = listResult(db.scheduledReports, query, {
      searchFields: ['reportName'],
      filterSpec: { frequency: 'frequency', enabled: { path: 'enabled', kind: 'boolean' } },
      sortable: ['lastRunAt', 'nextRunAt', 'reportName'],
      facetFields: ['frequency'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/reports/scheduled`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'reports.schedule.create');
    if (g.response) return g.response;
    const body = await request.json();
    const def = db.reportDefinitions.find((r) => r.key === body.reportKey);
    if (!def) return validationFailed({ reportKey: 'Choose a report.' });
    if (!body.recipientIds?.length) return validationFailed({ recipientIds: 'Choose at least one recipient.' });

    const schedule = insert('scheduledReports', {
      id: id('SCH', 3),
      reportKey: def.key,
      reportName: def.name,
      frequency: body.frequency ?? 'WEEKLY',
      format: body.format ?? 'CSV',
      recipientIds: body.recipientIds,
      enabled: true,
      lastRunAt: null,
      nextRunAt: mockNowIso(),
      createdByName: g.user.name,
      version: 1,
    });
    scheduleSave();
    return created(schedule);
  }),

  mswHttp.patch(`${BASE}/reports/scheduled/:scheduleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reports.schedule.edit');
    if (g.response) return g.response;
    const schedule = findById('scheduledReports', params.scheduleId);
    if (!schedule) return notFound('That schedule no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['frequency', 'format', 'recipientIds', 'enabled']) if (body[key] !== undefined) patch[key] = body[key];
    update('scheduledReports', schedule.id, patch);
    scheduleSave();
    return ok(findById('scheduledReports', schedule.id));
  }),

  mswHttp.delete(`${BASE}/reports/scheduled/:scheduleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reports.schedule.delete');
    if (g.response) return g.response;
    const schedule = findById('scheduledReports', params.scheduleId);
    if (!schedule) return notFound('That schedule no longer exists.');
    remove('scheduledReports', schedule.id);
    scheduleSave();
    return ok({ id: schedule.id });
  }),
];
