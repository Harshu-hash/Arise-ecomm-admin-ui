import { http as mswHttp } from 'msw';
import { db, findById } from '../db/store';
import { pendingForApprover } from '../engine/approvals';
import { guard } from '../engine/guard';
import { ok } from '../engine/respond';
import { mockNow } from '../engine/settings';

const BASE = '/api/admin/v1';

/**
 * Top categories/sellers/products are computed live from real order items
 * rather than seeded alongside the synthetic daily series, because real
 * orders, products and sellers already exist by this phase — unlike the
 * series itself, there is no reason for this cut to stay invented.
 */
function topBy(itemsInRange, keyFn, labelFn) {
  const totals = new Map();
  for (const item of itemsInRange) {
    const key = keyFn(item);
    if (!key) continue;
    const row = totals.get(key) ?? { key, label: labelFn(item), gmvPaise: 0, units: 0 };
    row.gmvPaise += item.linePaise;
    row.units += item.qty;
    totals.set(key, row);
  }
  return Array.from(totals.values()).sort((a, b) => b.gmvPaise - a.gmvPaise).slice(0, 5);
}

/** Sums a metric over a slice of the seeded daily series. */
function totals(series) {
  return series.reduce(
    (acc, d) => ({
      gmvPaise: acc.gmvPaise + d.gmvPaise,
      orders: acc.orders + d.orders,
      units: acc.units + d.units,
      newCustomers: acc.newCustomers + d.newCustomers,
      cancellations: acc.cancellations + d.cancellations,
      returns: acc.returns + d.returns,
    }),
    { gmvPaise: 0, orders: 0, units: 0, newCustomers: 0, cancellations: 0, returns: 0 },
  );
}

function delta(current, previous) {
  if (!previous) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export const dashboardHandlers = [
  mswHttp.get(`${BASE}/dashboard/summary`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'dashboard.dashboard.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const days = Math.min(120, Math.max(1, Number(url.searchParams.get('days') ?? 1)));
    const seed = findById('settings', 'dashboard');
    const series = seed?.series ?? [];

    const current = series.slice(-days);
    const previous = series.slice(-days * 2, -days);
    const cur = totals(current);
    const prev = totals(previous);

    const showFinance = g.permissions.includes('*') || g.permissions.includes('dashboard.finance_widgets.view');

    // Commission plus fees plus ads, approximated as a blended take rate until
    // the finance module computes it for real (Phase 4).
    const netRevenuePaise = Math.round(cur.gmvPaise * 0.118);

    const kpis = [
      { key: 'gmv', label: 'GMV', valuePaise: cur.gmvPaise, deltaPct: delta(cur.gmvPaise, prev.gmvPaise), format: 'money' },
      ...(showFinance
        ? [{ key: 'netRevenue', label: 'Net revenue', valuePaise: netRevenuePaise, deltaPct: delta(netRevenuePaise, Math.round(prev.gmvPaise * 0.118)), format: 'money' }]
        : []),
      { key: 'orders', label: 'Orders', value: cur.orders, deltaPct: delta(cur.orders, prev.orders), format: 'number' },
      { key: 'units', label: 'Units', value: cur.units, deltaPct: delta(cur.units, prev.units), format: 'number' },
      {
        key: 'aov',
        label: 'AOV',
        valuePaise: cur.orders ? Math.round(cur.gmvPaise / cur.orders) : 0,
        deltaPct: delta(cur.orders ? cur.gmvPaise / cur.orders : 0, prev.orders ? prev.gmvPaise / prev.orders : 0),
        format: 'money',
      },
      { key: 'newCustomers', label: 'New customers', value: cur.newCustomers, deltaPct: delta(cur.newCustomers, prev.newCustomers), format: 'number' },
      {
        key: 'cancellationPct',
        label: 'Cancellation rate',
        value: cur.orders ? Number(((cur.cancellations / cur.orders) * 100).toFixed(2)) : 0,
        deltaPct: delta(cur.cancellations / Math.max(1, cur.orders), prev.cancellations / Math.max(1, prev.orders)),
        format: 'percent',
        invertDelta: true,
      },
      {
        key: 'returnPct',
        label: 'Return rate',
        value: cur.orders ? Number(((cur.returns / cur.orders) * 100).toFixed(2)) : 0,
        deltaPct: delta(cur.returns / Math.max(1, cur.orders), prev.returns / Math.max(1, prev.orders)),
        format: 'percent',
        invertDelta: true,
      },
      {
        key: 'activeSellers',
        label: 'Active sellers',
        value: db.sellers.filter((s) => s.status === 'ACTIVE').length,
        deltaPct: 2.4,
        format: 'number',
      },
      {
        key: 'liveListings',
        label: 'Live listings',
        value: db.sellers.reduce((n, s) => n + s.liveListings, 0),
        deltaPct: 1.1,
        format: 'number',
      },
    ];

    const cutoffMs = mockNow() - days * 86400_000;
    const ordersInRange = new Set(
      db.orders.filter((o) => new Date(o.placedAt).getTime() >= cutoffMs).map((o) => o.id),
    );
    const itemsInRange = db.orderItems.filter(
      (it) => ordersInRange.has(it.orderId) && it.status !== 'CANCELLED' && it.status !== 'PAYMENT_FAILED',
    );
    const productById = new Map(db.products.map((p) => [p.id, p]));
    const categoryById = new Map(db.categories.map((c) => [c.id, c]));

    return ok({
      range: { days, from: current[0]?.date ?? null, to: current.at(-1)?.date ?? null },
      kpis,
      series: current,
      previousSeries: previous,
      paymentMix: showFinance ? (seed?.paymentMix ?? []) : [],
      topStates: seed?.topStates ?? [],
      topCategories: topBy(
        itemsInRange,
        (it) => productById.get(it.productId)?.categoryId,
        (it) => categoryById.get(productById.get(it.productId)?.categoryId)?.name ?? 'Uncategorised',
      ),
      topSellers: topBy(itemsInRange, (it) => it.sellerId, (it) => it.sellerName),
      topProducts: topBy(itemsInRange, (it) => it.productId, (it) => it.name),
      funnel: [
        { stage: 'Placed', count: cur.orders },
        { stage: 'Accepted', count: Math.round(cur.orders * 0.97) },
        { stage: 'Packed', count: Math.round(cur.orders * 0.94) },
        { stage: 'Shipped', count: Math.round(cur.orders * 0.91) },
        { stage: 'Delivered', count: Math.round(cur.orders * 0.86) },
      ],
    });
  }),

  mswHttp.get(`${BASE}/dashboard/action-center`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'dashboard.action_center.view');
    if (g.response) return g.response;

    const seed = findById('settings', 'dashboard');
    const c = seed?.actionCenter ?? {};
    const approvalsPending = pendingForApprover(g.user, g.permissions).length;

    /** Each tile declares the permission needed, so the UI can filter. */
    const tiles = [
      ['sellerApplicationsPending', 'Seller applications pending', c.sellerApplicationsPending, '/sellers/applications', 'sellers.application.view', false],
      ['listingsInQc', 'Listings in QC', c.listingsInQc, '/catalog/qc', 'catalog.product.approve', false],
      ['brandApprovalsPending', 'Brand approvals pending', c.brandApprovalsPending, '/sellers/brand-approvals', 'sellers.brandapproval.view', false],
      ['ordersNotAccepted', 'Not accepted past SLA', c.ordersNotAccepted, '/orders?status=PLACED&slaBreached=true', 'orders.order.view', true],
      ['notDispatched', 'Not dispatched past SLA', c.notDispatched, '/orders?status=PACKED&slaBreached=true', 'orders.order.view', true],
      ['ndrPending', 'NDRs awaiting action', c.ndrPending, '/logistics/ndr', 'logistics.ndr.view', true],
      ['returnsAwaitingQc', 'Returns awaiting QC', c.returnsAwaitingQc, '/returns?status=RECEIVED', 'orders.return.view', false],
      ['failedRefunds', 'Failed refunds', c.failedRefunds, '/finance/refunds?status=FAILED', 'finance.refund.view', true],
      ['payoutBatchesAwaitingApproval', 'Payout batches to approve', c.payoutBatchesAwaitingApproval, '/finance/payouts', 'finance.payout.view', false],
      ['approvalsPendingMe', 'Approvals pending me', approvalsPending, '/admin/approvals', 'admin.approval.view', false],
      ['ticketsBreachingSla', 'Tickets breaching SLA', c.ticketsBreachingSla, '/support/tickets?view=breaching', 'support.ticket.view', true],
      ['adCampaignsPendingReview', 'Ad campaigns to review', c.adCampaignsPendingReview, '/ads/review', 'ads.review.view', false],
      ['lowStockFbaSkus', 'Low-stock FBA SKUs', c.lowStockFbaSkus, '/warehouses/inventory?stock=LOW', 'warehouse.inventory.view', false],
      ['weightDisputesOpen', 'Weight disputes open', c.weightDisputesOpen, '/logistics/weight-disputes', 'logistics.weight.view', false],
      ['privacyRequestsDue', 'Privacy requests due', c.privacyRequestsDue, '/customers/privacy', 'customers.privacy.view', true],
    ];

    const visible = tiles
      .filter(([, , , , perm]) => g.permissions.includes('*') || g.permissions.includes(perm))
      .map(([key, label, count, link, permission, urgent]) => ({
        key,
        label,
        count: count ?? 0,
        link,
        permission,
        urgent: Boolean(urgent) && (count ?? 0) > 0,
      }));

    return ok(visible);
  }),

  mswHttp.get(`${BASE}/dashboard/alerts`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'dashboard.dashboard.view');
    if (g.response) return g.response;

    const rows = db.adminAlerts
      .filter((a) => new Date(a.at).getTime() <= mockNow())
      .map((a) => ({ ...a, read: a.readBy.includes(g.user.id) }))
      .sort((a, b) => b.at.localeCompare(a.at));
    return ok(rows, { unread: rows.filter((a) => !a.read).length });
  }),

  mswHttp.post(`${BASE}/dashboard/alerts/:id/read`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'dashboard.dashboard.view');
    if (g.response) return g.response;
    const alert = findById('adminAlerts', params.id);
    if (alert && !alert.readBy.includes(g.user.id)) alert.readBy.push(g.user.id);
    return ok({ ok: true });
  }),
];
