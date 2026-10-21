import { http as mswHttp } from 'msw';
import { db } from '../db/store';
import { guard } from '../engine/guard';
import { badRequest, ok } from '../engine/respond';

const BASE = '/api/admin/v1';

/**
 * Async option sources for EntitySelect and CategoryTreeSelect, plus the
 * global command palette. Phase 0 can resolve the reference entities; the
 * domain entities are registered here as later phases seed them.
 */

const SOURCES = {
  seller: {
    collection: 'sellers',
    permission: 'sellers.seller.view',
    search: (s, q) =>
      s.storeName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.gstin.toLowerCase().includes(q),
    map: (s) => ({ value: s.id, label: s.storeName, sublabel: `${s.id} · ${s.city} · ${s.status}` }),
  },
  category: {
    collection: 'categories',
    permission: 'catalog.category.view',
    search: (c, q) => c.name.toLowerCase().includes(q),
    map: (c) => ({ value: c.id, label: c.name, sublabel: `L${c.level} · ${c.rootName}` }),
  },
  brand: {
    collection: 'brands',
    permission: 'catalog.brand.view',
    search: (b, q) => b.name.toLowerCase().includes(q),
    map: (b) => ({ value: b.id, label: b.name, sublabel: b.rootCategory }),
  },
  warehouse: {
    collection: 'warehouses',
    permission: 'warehouse.warehouse.view',
    search: (w, q) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q),
    map: (w) => ({ value: w.id, label: w.name, sublabel: `${w.code} · ${w.city}` }),
  },
  queue: {
    collection: 'supportQueues',
    permission: 'support.queue.view',
    search: (x, q) => x.name.toLowerCase().includes(q),
    map: (x) => ({ value: x.id, label: x.name, sublabel: `${x.openTickets} open` }),
  },
  courier: {
    collection: 'couriers',
    permission: 'logistics.courier.view',
    search: (x, q) => x.name.toLowerCase().includes(q),
    map: (x) => ({ value: x.id, label: x.name, sublabel: x.status }),
  },
  inventorySku: {
    collection: 'inventory',
    permission: 'warehouse.inventory.view',
    search: (i, q) =>
      i.sku.toLowerCase().includes(q)
      || i.productTitle.toLowerCase().includes(q)
      || i.warehouseCode.toLowerCase().includes(q),
    map: (i) => ({
      value: i.id,
      label: `${i.sku} — ${i.productTitle}`,
      sublabel: `${i.warehouseCode} · ${i.sellable} sellable · ${i.sellerName}`,
    }),
  },
  adminUser: {
    collection: 'adminUsers',
    permission: 'admin.user.view',
    search: (u, q) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    map: (u) => ({ value: u.id, label: u.name, sublabel: u.email }),
  },
  role: {
    collection: 'roles',
    permission: 'admin.role.view',
    search: (r, q) => r.name.toLowerCase().includes(q),
    map: (r) => ({ value: r.id, label: r.name, sublabel: r.description }),
  },
  // Marketing (Phase 5): the coupon test tool and segment-targeted screens
  // both need to find a real customer or a real live product by name.
  customer: {
    collection: 'customers',
    permission: 'customers.customer.view',
    search: (c, q) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email?.toLowerCase().includes(q),
    map: (c) => ({ value: c.id, label: c.name, sublabel: `${c.phone} · ${c.city}` }),
  },
  product: {
    collection: 'products',
    permission: 'catalog.product.view',
    search: (p, q) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    map: (p) => ({ value: p.id, label: p.title, sublabel: `${p.id} · ${p.categoryPath}` }),
  },
  // Support (Phase 6): merging a ticket needs to find the one to keep by id
  // or subject.
  ticket: {
    collection: 'tickets',
    permission: 'support.ticket.view',
    search: (t, q) => t.id.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q),
    map: (t) => ({ value: t.id, label: `${t.id} · ${t.subject}`, sublabel: `${t.customerName} · ${t.status}` }),
  },
};

/** Navigation targets, so "go to payouts" works in the palette. */
const NAV = [
  ['Dashboard', '/', 'dashboard.dashboard.view'],
  ['Orders', '/orders', 'orders.order.view'],
  ['Returns & replacements', '/returns', 'orders.return.view'],
  ['Products', '/catalog/products', 'catalog.product.view'],
  ['Listing QC queue', '/catalog/qc', 'catalog.product.view'],
  ['Categories', '/catalog/categories', 'catalog.category.view'],
  ['Sellers', '/sellers', 'sellers.seller.view'],
  ['Onboarding applications', '/sellers/applications', 'sellers.application.view'],
  ['Customers', '/customers', 'customers.customer.view'],
  ['Inventory', '/warehouses/inventory', 'warehouse.inventory.view'],
  ['Shipments', '/logistics/shipments', 'logistics.shipment.view'],
  ['NDR', '/logistics/ndr', 'logistics.ndr.view'],
  ['Refunds', '/finance/refunds', 'finance.refund.view'],
  ['Seller payouts', '/finance/payouts', 'finance.payout.view'],
  ['Coupons', '/marketing/coupons', 'marketing.coupon.view'],
  ['Tickets', '/support/tickets', 'support.ticket.view'],
  ['Admin users', '/admin/users', 'admin.user.view'],
  ['Roles & permissions', '/admin/roles', 'admin.role.view'],
  ['Approvals', '/admin/approvals', 'admin.approval.view'],
  ['Audit log', '/admin/audit', 'admin.audit.view'],
  ['Platform settings', '/admin/settings', 'admin.settings.view'],
];

/** Prefix patterns that jump straight to one record (plan §9). */
function detectTyped(term) {
  const t = term.trim().toUpperCase();
  if (/^ORD-?\d+/.test(t)) return { type: 'order', label: 'Order', link: `/orders/${t}` };
  if (/^SEL-?\d+/.test(t)) return { type: 'seller', label: 'Seller', link: `/sellers/${t}` };
  if (/^TKT-?\d+/.test(t)) return { type: 'ticket', label: 'Ticket', link: `/support/tickets/${t}` };
  if (/^PY[BO]-?\d+/.test(t)) return { type: 'payout', label: 'Payout', link: `/finance/payouts` };
  if (/^RET-?\d+/.test(t)) return { type: 'return', label: 'Return', link: `/returns/${t}` };
  if (/^APR-?\d+/.test(t)) return { type: 'approval', label: 'Approval request', link: `/admin/approvals/${t}` };
  if (/^\d{10}$/.test(t)) return { type: 'customer', label: 'Customer by phone', link: `/customers?q=${t}` };
  if (/^[A-Z0-9]{15}$/.test(t)) return { type: 'seller', label: 'Seller by GSTIN', link: `/sellers?q=${t}` };
  return null;
}

export const lookupHandlers = [
  mswHttp.get(`${BASE}/lookups/:entity`, async ({ request, params }) => {
    const source = SOURCES[params.entity];
    if (!source) return badRequest(`Unknown lookup entity "${params.entity}".`);

    const g = await guard(request, new URL(request.url), source.permission);
    if (g.response) return g.response;

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20));
    const level = url.searchParams.get('level');
    const parentId = url.searchParams.get('parentId');
    const ids = url.searchParams.get('ids');

    let rows = db[source.collection];

    // `ids` resolves already-selected values back to labels on form load.
    if (ids) {
      const wanted = ids.split(',');
      rows = rows.filter((r) => wanted.includes(r.id));
      return ok(rows.map(source.map));
    }

    if (params.entity === 'category') {
      if (level) rows = rows.filter((c) => String(c.level) === String(level));
      if (parentId) rows = rows.filter((c) => c.parentId === parentId);
    }
    if (q) rows = rows.filter((r) => source.search(r, q));

    return ok(rows.slice(0, limit).map(source.map), { total: rows.length });
  }),

  /** Full category tree for CategoryTreeSelect / the taxonomy editor. */
  mswHttp.get(`${BASE}/categories/tree`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.category.view');
    if (g.response) return g.response;

    const byParent = new Map();
    for (const c of db.categories) {
      const key = c.parentId ?? 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const build = (parentKey) =>
      (byParent.get(parentKey) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          status: c.status,
          gated: c.gated,
          liveListings: c.liveListings,
          children: build(c.id),
        }));
    return ok(build('root'));
  }),

  mswHttp.get(`${BASE}/search`, async ({ request }) => {
    const g = await guard(request, new URL(request.url));
    if (g.response) return g.response;

    const url = new URL(request.url);
    const term = (url.searchParams.get('q') ?? '').trim();
    if (term.length < 2) return ok({ typed: null, groups: [] });

    const q = term.toLowerCase();
    const can = (p) => g.permissions.includes('*') || g.permissions.includes(p);
    const groups = [];

    const pages = NAV.filter(([label, , perm]) => can(perm) && label.toLowerCase().includes(q))
      .slice(0, 6)
      .map(([label, link]) => ({ id: link, label, sublabel: link, link }));
    if (pages.length) groups.push({ key: 'pages', label: 'Go to', items: pages });

    for (const [entity, source] of Object.entries(SOURCES)) {
      if (!can(source.permission)) continue;
      const hits = db[source.collection].filter((r) => source.search(r, q)).slice(0, 5);
      if (!hits.length) continue;
      groups.push({
        key: entity,
        label: ENTITY_GROUP_LABEL[entity] ?? entity,
        items: hits.map((r) => {
          const o = source.map(r);
          return { id: o.value, label: o.label, sublabel: o.sublabel, link: linkFor(entity, o.value) };
        }),
      });
    }

    return ok({ typed: detectTyped(term), groups });
  }),
];

const ENTITY_GROUP_LABEL = {
  inventorySku: 'Stock',
  seller: 'Sellers',
  category: 'Categories',
  brand: 'Brands',
  warehouse: 'Warehouses',
  queue: 'Support queues',
  courier: 'Courier partners',
  adminUser: 'Admin users',
  role: 'Roles',
};

function linkFor(entity, value) {
  switch (entity) {
    case 'seller':
      return `/sellers/${value}`;
    case 'category':
      return `/catalog/categories?selected=${value}`;
    case 'brand':
      return `/catalog/brands/${value}`;
    case 'warehouse':
      return `/warehouses/${value}`;
    case 'inventorySku':
      return '/warehouses/inventory';
    case 'queue':
      return `/support/tickets?queueId=${value}`;
    case 'courier':
      return `/logistics/couriers/${value}`;
    case 'adminUser':
      return `/admin/users/${value}`;
    case 'role':
      return `/admin/roles/${value}`;
    default:
      return '/';
  }
}
