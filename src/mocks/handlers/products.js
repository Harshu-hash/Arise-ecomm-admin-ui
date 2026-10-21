import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { diffOf, writeAudit } from '../engine/audit';
import { isAriseAssured, rankOffers } from '../engine/buyBox';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,
  conflict,
  illegalTransition,
  notFound,
  ok,
  okList,
  validationFailed,
  versionConflict,
} from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Listing state machine from MODULE_SPECS §M3.8. */
const TRANSITIONS = {
  DRAFT: ['QC_PENDING'],
  QC_PENDING: ['LIVE', 'NEEDS_CHANGES', 'REJECTED'],
  NEEDS_CHANGES: ['QC_PENDING', 'ARCHIVED'],
  LIVE: ['INACTIVE', 'OUT_OF_STOCK', 'BLOCKED', 'ARCHIVED'],
  INACTIVE: ['LIVE', 'ARCHIVED'],
  OUT_OF_STOCK: ['LIVE', 'INACTIVE'],
  BLOCKED: ['LIVE', 'ARCHIVED'],
  REJECTED: ['QC_PENDING', 'ARCHIVED'],
  ARCHIVED: [],
};

function can(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

function categoryInScope(categoryId, user) {
  const scope = user.scope?.categories;
  if (!scope?.length) return true;
  let node = findById('categories', categoryId);
  while (node) {
    if (scope.includes(node.id)) return true;
    node = node.parentId ? findById('categories', node.parentId) : null;
  }
  return false;
}

/**
 * Recomputes the buy-box winner and the Arise Assured badge after any price,
 * stock or status change, using the published rules (M3.9) — the same
 * `rankOffers`/`isAriseAssured` the rules page's own publish and simulate
 * actions call, so a listing can never disagree with what the rules page says.
 */
export function recomputeBuyBox(variantId) {
  const offers = filter('offers', (o) => o.variantId === variantId);
  for (const o of offers) o.buyBoxWinner = false;

  const rules = findById('settings', 'buyBoxRules');
  const sellerById = new Map(offers.map((o) => [o.sellerId, findById('sellers', o.sellerId)]));
  const ranked = rankOffers(offers, sellerById, rules.weights);
  if (ranked[0]) findById('offers', ranked[0].id).buyBoxWinner = true;

  for (const offer of offers) {
    offer.ariseAssured = isAriseAssured(offer, sellerById.get(offer.sellerId), rules.ariseAssured);
  }
}

function productRow(p) {
  const offers = filter('offers', (o) => o.productId === p.id);
  const live = offers.filter((o) => o.status === 'LIVE');
  const prices = live.map((o) => o.sellingPricePaise);
  const buyBox = offers.find((o) => o.buyBoxWinner);

  return {
    ...p,
    variantCount: filter('variants', (v) => v.productId === p.id).length,
    sellerCount: new Set(offers.map((o) => o.sellerId)).size,
    liveOfferCount: live.length,
    buyBoxSellerName: buyBox?.sellerName ?? null,
    minPricePaise: prices.length ? Math.min(...prices) : null,
    maxPricePaise: prices.length ? Math.max(...prices) : null,
    totalStock: offers.reduce((n, o) => n + o.stock, 0),
  };
}

function allowedActionsFor(product, permissions) {
  const has = (k) => permissions.includes('*') || permissions.includes(k);
  const out = [];
  if (has('catalog.product.edit')) out.push('EDIT');
  if (product.status === 'QC_PENDING' && has('catalog.product.approve')) {
    out.push('APPROVE', 'REQUEST_CHANGES', 'REJECT');
  }
  if (product.status === 'LIVE' && has('catalog.product.activate')) out.push('DEACTIVATE');
  if (product.status === 'INACTIVE' && has('catalog.product.activate')) out.push('ACTIVATE');
  if (product.status !== 'BLOCKED' && has('catalog.product.block')) out.push('BLOCK');
  if (product.status === 'BLOCKED' && has('catalog.product.block')) out.push('UNBLOCK');
  if (product.status !== 'ARCHIVED' && has('catalog.product.archive')) out.push('ARCHIVE');
  return out;
}

export const productHandlers = [
  /* ---------------------------------------------------------- QC queue */
  mswHttp.get(`${BASE}/listing-submissions`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'submittedAt' });
    const rows = db.listingSubmissions
      .filter((s) => categoryInScope(s.categoryId, g.user))
      .map((s) => ({
        ...s,
        ageHours: Math.floor((mockNow() - new Date(s.submittedAt).getTime()) / 3600_000),
        // QC SLA is 24 hours; a breach is what makes the queue urgent.
        slaDueAt: new Date(new Date(s.submittedAt).getTime() + 24 * 3600_000).toISOString(),
        failedChecks: s.autoChecks.filter((c) => c.result === 'FAIL').length,
        warnChecks: s.autoChecks.filter((c) => c.result === 'WARN').length,
        assignedToName: s.assignedToId ? findById('adminUsers', s.assignedToId)?.name : null,
      }));

    const { items, meta } = listResult(rows, query, {
      searchFields: ['productTitle', 'sellerName', 'productId', 'id'],
      filterSpec: {
        status: 'status',
        type: 'type',
        priority: 'priority',
        sellerId: 'sellerId',
        categoryId: 'categoryId',
        assignedToId: 'assignedToId',
        mine: (row, v) => (String(v) === 'true' ? row.assignedToId === g.user.id : true),
        unassigned: (row, v) => (String(v) === 'true' ? !row.assignedToId : true),
        slaBreached: (row, v) =>
          String(v) === 'true' ? new Date(row.slaDueAt).getTime() < mockNow() : true,
      },
      sortable: ['submittedAt', 'priority', 'ageHours', 'sellerName', 'productTitle', 'failedChecks'],
      facetFields: ['status', 'type', 'priority'],
    });

    return okList(items, {
      ...meta,
      counts: {
        mine: rows.filter((r) => r.assignedToId === g.user.id).length,
        unassigned: rows.filter((r) => !r.assignedToId).length,
        breaching: rows.filter((r) => new Date(r.slaDueAt).getTime() < mockNow()).length,
      },
    });
  }),

  mswHttp.post(`${BASE}/listing-submissions/:id/claim`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.approve');
    if (g.response) return g.response;

    const row = findById('listingSubmissions', params.id);
    if (!row) return notFound('That submission is no longer in the queue.');
    if (row.assignedToId && row.assignedToId !== g.user.id) {
      const holder = findById('adminUsers', row.assignedToId);
      return conflict(`${holder?.name ?? 'Someone else'} is already reviewing this.`, 'ALREADY_CLAIMED');
    }
    update('listingSubmissions', row.id, { assignedToId: g.user.id });
    scheduleSave();
    return ok(findById('listingSubmissions', row.id));
  }),

  /** Approve, request changes, or reject — the three QC outcomes. */
  mswHttp.post(`${BASE}/listing-submissions/:id/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.approve');
    if (g.response) return g.response;

    const submission = findById('listingSubmissions', params.id);
    if (!submission) return notFound('That submission is no longer in the queue.');
    if (submission.status === 'DONE') {
      return conflict('This submission has already been decided.', 'ALREADY_DECIDED');
    }
    const product = findById('products', submission.productId);
    if (!product) return notFound('The product no longer exists.');
    if (!categoryInScope(product.categoryId, g.user)) {
      return conflict('This listing is outside the categories assigned to you.', 'OUT_OF_SCOPE');
    }

    const body = await request.json();
    const decision = body?.decision;

    if (decision === 'APPROVE') {
      // A failing automated check is a hard stop: approving over it is how
      // priced-above-MRP listings reach customers.
      const failed = submission.autoChecks.filter((c) => c.result === 'FAIL');
      if (failed.length && !body.overrideChecks) {
        return conflict('This listing fails an automated check.', 'AUTO_CHECK_FAILED', {
          details: { failed: failed.map((c) => c.label) },
        });
      }
      if (!can(product.status, 'LIVE') && product.status !== 'LIVE') {
        return illegalTransition(product.status, 'approve');
      }

      const before = { ...product };
      if (product.status !== 'LIVE') update('products', product.id, { status: 'LIVE', updatedAt: mockNowIso() });
      // Offers go live with the product, unless they have no stock.
      for (const offer of filter('offers', (o) => o.productId === product.id)) {
        update('offers', offer.id, { status: offer.stock > 0 ? 'LIVE' : 'OUT_OF_STOCK' });
      }
      for (const variant of filter('variants', (v) => v.productId === product.id)) {
        recomputeBuyBox(variant.id);
      }
      update('listingSubmissions', submission.id, { status: 'DONE', decidedAt: mockNowIso(), decidedByName: g.user.name });

      writeAudit({
        actor: g.user,
        action: 'catalog.product.approve',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.title,
        changes: diffOf(before, findById('products', product.id)),
        metadata: { overrodeChecks: Boolean(body.overrideChecks) },
      });
      scheduleSave();
      return ok(findById('products', product.id));
    }

    if (decision === 'REQUEST_CHANGES') {
      if (!body?.issues?.length) {
        return validationFailed({ issues: 'Pick what the seller needs to fix.' });
      }
      update('products', product.id, { status: 'NEEDS_CHANGES', updatedAt: mockNowIso() });
      update('listingSubmissions', submission.id, {
        status: 'NEEDS_CHANGES',
        issues: body.issues,
        sellerMessage: body.message ?? null,
        decidedAt: mockNowIso(),
        decidedByName: g.user.name,
      });
      writeAudit({
        actor: g.user,
        action: 'catalog.product.request_changes',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.title,
        metadata: { issues: body.issues },
      });
      scheduleSave();
      return ok(findById('products', product.id));
    }

    if (decision === 'REJECT') {
      if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });
      update('products', product.id, { status: 'REJECTED', rejectionReason: body.reason, updatedAt: mockNowIso() });
      update('listingSubmissions', submission.id, {
        status: 'DONE',
        decidedAt: mockNowIso(),
        decidedByName: g.user.name,
      });
      writeAudit({
        actor: g.user,
        action: 'catalog.product.reject',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.title,
        reason: body.reason,
        severity: 'warning',
      });
      scheduleSave();
      return ok(findById('products', product.id));
    }

    return validationFailed({ decision: 'Choose approve, request changes or reject.' });
  }),

  /* ---------------------------------------------------------- products */
  mswHttp.get(`${BASE}/products`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: '-updatedAt' });
    const rows = db.products
      .filter((p) => categoryInScope(p.categoryId, g.user))
      .map(productRow);

    const { items, meta } = listResult(rows, query, {
      searchFields: ['title', 'id', 'brandName', 'productCode'],
      filterSpec: {
        status: 'status',
        categoryId: 'categoryId',
        brandId: 'brandId',
        assured: { path: 'assured', kind: 'boolean' },
        sellerId: (row, v) => filter('offers', (o) => o.productId === row.id).some((o) => o.sellerId === v),
        stock: (row, v) => {
          if (v === 'OUT') return row.totalStock === 0;
          if (v === 'LOW') return row.totalStock > 0 && row.totalStock < 20;
          return row.totalStock >= 20;
        },
        contentScore: { path: 'contentScore' },
        rating: { path: 'rating' },
        createdAt: { path: 'createdAt', kind: 'date' },
      },
      sortable: ['title', 'status', 'createdAt', 'updatedAt', 'rating', 'contentScore', 'minPricePaise', 'totalStock'],
      facetFields: ['status'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/products/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.view');
    if (g.response) return g.response;

    const product = findById('products', params.id);
    if (!product) return notFound('That product no longer exists.');
    if (!categoryInScope(product.categoryId, g.user)) {
      return conflict('This product is outside the categories assigned to you.', 'OUT_OF_SCOPE');
    }

    const variants = filter('variants', (v) => v.productId === product.id);
    const offers = filter('offers', (o) => o.productId === product.id).map((o) => ({
      ...o,
      variantLabel: variants.find((v) => v.id === o.variantId)?.label ?? '—',
      sellerStatus: findById('sellers', o.sellerId)?.status ?? null,
      // A price above MRP is illegal to display and must be obvious here.
      priceAboveMrp: o.sellingPricePaise > o.mrpPaise,
    }));
    const category = findById('categories', product.categoryId);
    const set = category?.attributeSetId ? findById('attributeSets', category.attributeSetId) : null;

    return ok(productRow(product), {
      allowedActions: allowedActionsFor(product, g.permissions),
      variants,
      offers,
      category,
      attributes: (set?.attributeIds ?? []).map((aid) => findById('attributes', aid)).filter(Boolean),
      sizeChart: product.sizeChartId ? findById('sizeCharts', product.sizeChartId) : null,
      submission: db.listingSubmissions.find(
        (s) => s.productId === product.id && s.status !== 'DONE',
      ) ?? null,
    });
  }),

  mswHttp.patch(`${BASE}/products/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.edit');
    if (g.response) return g.response;

    const product = findById('products', params.id);
    if (!product) return notFound('That product no longer exists.');
    const body = await request.json();
    if (body.version !== undefined && body.version !== product.version) {
      return versionConflict(productRow(product));
    }

    const before = { ...product };
    const patch = {};
    for (const key of [
      'title', 'description', 'highlights', 'attributes', 'fit', 'modelInfo', 'care',
      'manufacturer', 'countryOfOrigin', 'hsnCode', 'gstRate', 'searchKeywords', 'sizeChartId',
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (!Object.keys(patch).length) return ok(productRow(product));
    patch.updatedAt = mockNowIso();

    // Editing a live listing creates a revision for QC rather than changing
    // what customers see; the live copy stays untouched until it is approved.
    if (product.status === 'LIVE') {
      const existing = db.listingSubmissions.find(
        (s) => s.productId === product.id && s.type === 'REVISION' && s.status !== 'DONE',
      );
      const revision = insert('productRevisions', {
        id: id('REV', 6),
        productId: product.id,
        changes: diffOf(before, { ...product, ...patch }),
        payload: patch,
        createdByName: g.user.name,
        createdAt: mockNowIso(),
        status: 'PENDING',
      });
      if (!existing) {
        insert('listingSubmissions', {
          id: id('QC', 6),
          productId: product.id,
          productTitle: product.title,
          productImage: product.images[0],
          sellerId: filter('offers', (o) => o.productId === product.id)[0]?.sellerId ?? null,
          sellerName: filter('offers', (o) => o.productId === product.id)[0]?.sellerName ?? '—',
          sellerTier: 'BRONZE',
          categoryId: product.categoryId,
          categoryPath: product.categoryPath,
          type: 'REVISION',
          status: 'QC_PENDING',
          submittedAt: mockNowIso(),
          priority: 'NORMAL',
          assignedToId: null,
          autoChecks: [],
          issues: [],
          revisionId: revision.id,
          version: 1,
        });
      }
      writeAudit({
        actor: g.user,
        action: 'catalog.product.revision_submitted',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.title,
        changes: revision.changes,
      });
      scheduleSave();
      return ok(productRow(product), {
        pendingRevision: true,
        message: 'Saved as a pending revision. The live listing is unchanged until QC approves it.',
      });
    }

    update('products', product.id, patch);
    writeAudit({
      actor: g.user,
      action: 'catalog.product.edit',
      entityType: 'product',
      entityId: product.id,
      entityLabel: product.title,
      changes: diffOf(before, findById('products', product.id)),
    });
    scheduleSave();
    return ok(productRow(findById('products', product.id)));
  }),

  /** Status verbs. Blocking is four-eyed because it removes a live listing. */
  mswHttp.post(`${BASE}/products/:id/:action`, async ({ request, params }) => {
    const map = {
      activate: ['LIVE', 'catalog.product.activate', false],
      deactivate: ['INACTIVE', 'catalog.product.activate', false],
      block: ['BLOCKED', 'catalog.product.block', true],
      unblock: ['LIVE', 'catalog.product.block', true],
      archive: ['ARCHIVED', 'catalog.product.archive', false],
    };
    const entry = map[params.action];
    if (!entry) return notFound('Unknown action.');
    const [next, permission, needsApproval] = entry;

    const g = await guard(request, new URL(request.url), permission);
    if (g.response) return g.response;

    const product = findById('products', params.id);
    if (!product) return notFound('That product no longer exists.');
    if (!can(product.status, next)) return illegalTransition(product.status, params.action);

    const body = await request.json().catch(() => ({}));
    if ((needsApproval || params.action === 'deactivate') && !String(body?.reason ?? '').trim()) {
      return validationFailed({ reason: 'Give a reason.' });
    }

    const apply = () => {
      const before = { ...product };
      update('products', product.id, {
        status: next,
        blockedReason: next === 'BLOCKED' ? body.reason : null,
        updatedAt: mockNowIso(),
      });
      for (const offer of filter('offers', (o) => o.productId === product.id)) {
        update('offers', offer.id, {
          status: next === 'LIVE' ? (offer.stock > 0 ? 'LIVE' : 'OUT_OF_STOCK') : next,
        });
      }
      for (const variant of filter('variants', (v) => v.productId === product.id)) {
        recomputeBuyBox(variant.id);
      }
      writeAudit({
        actor: g.user,
        action: `catalog.product.${params.action}`,
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.title,
        reason: body.reason ?? null,
        changes: diffOf(before, findById('products', product.id)),
        severity: needsApproval ? 'warning' : 'info',
      });
    };

    if (needsApproval) {
      const approval = createApproval({
        actionKey: 'product.bulk_override',
        actor: g.user,
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.title,
        reason: body.reason,
        summary: `${params.action} "${product.title}" across ${filter('offers', (o) => o.productId === product.id).length} seller offers`,
        diff: [{ field: 'status', from: product.status, to: next }],
        execute: apply,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    apply();
    scheduleSave();
    return ok(productRow(findById('products', product.id)), {
      allowedActions: allowedActionsFor(findById('products', product.id), g.permissions),
    });
  }),

  /** Admin-side offer controls: deactivate a specific seller's offer. */
  mswHttp.post(`${BASE}/offers/:id/deactivate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'catalog.product.activate');
    if (g.response) return g.response;

    const offer = findById('offers', params.id);
    if (!offer) return notFound('That offer no longer exists.');
    const body = await request.json().catch(() => ({}));
    if (!String(body?.reason ?? '').trim()) return validationFailed({ reason: 'Give a reason.' });

    update('offers', offer.id, { status: 'INACTIVE' });
    recomputeBuyBox(offer.variantId);
    writeAudit({
      actor: g.user,
      action: 'catalog.product.offer_deactivate',
      entityType: 'offer',
      entityId: offer.id,
      entityLabel: `${offer.sellerName} — ${offer.productId}`,
      reason: body.reason,
      severity: 'warning',
    });
    scheduleSave();
    return ok(findById('offers', offer.id));
  }),
];
