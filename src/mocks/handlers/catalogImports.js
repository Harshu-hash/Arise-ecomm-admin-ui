import { http as mswHttp } from 'msw';
import { filter, find, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';
import { recomputeBuyBox } from './products';

const BASE = '/api/admin/v1';

/**
 * Bulk uploads (M3.10): price & stock updates and offer deactivation, both
 * matched by SKU + seller. Both apply directly — neither touches the product
 * content the revision/QC flow protects, since a price or stock change has
 * never gone through that flow in this panel (it lives on the per-seller
 * offer, not the shared product). New-product creation, image-URL and
 * attribute bulk edits are not built — see the plan's Phase 8 decisions.
 */

function findOffer(sku, sellerId) {
  const variant = find('variants', (v) => v.sku === sku);
  if (!variant) return { error: 'No variant has that SKU.' };
  const offer = find('offers', (o) => o.variantId === variant.id && o.sellerId === sellerId);
  if (!offer) return { error: 'That seller has no offer on this SKU.' };
  return { offer, variant };
}

function applyRow(jobType, row) {
  const { offer, error } = findOffer(row.sku, row.sellerId);
  if (error) return { row, success: false, error };

  if (jobType === 'PRICE_STOCK_UPDATE') {
    const priceRupees = Number(row.sellingPriceRupees);
    const stock = Number(row.stock);
    if (!(priceRupees > 0)) return { row, success: false, error: 'Price must be a positive number.' };
    if (!(stock >= 0)) return { row, success: false, error: 'Stock must be zero or a positive number.' };
    update('offers', offer.id, {
      sellingPricePaise: Math.round(priceRupees * 100),
      stock,
      status: stock > 0 && offer.status === 'OUT_OF_STOCK' ? 'LIVE' : stock === 0 && offer.status === 'LIVE' ? 'OUT_OF_STOCK' : offer.status,
    });
    recomputeBuyBox(offer.variantId);
    return { row, success: true };
  }

  if (jobType === 'OFFER_DEACTIVATION') {
    if (offer.status === 'INACTIVE') return { row, success: false, error: 'Already inactive.' };
    update('offers', offer.id, { status: 'INACTIVE' });
    recomputeBuyBox(offer.variantId);
    return { row, success: true };
  }

  return { row, success: false, error: 'Unknown job type.' };
}

const JOB_TYPE_LABEL = {
  PRICE_STOCK_UPDATE: 'Price & stock update',
  OFFER_DEACTIVATION: 'Offer deactivation',
};

export const catalogImportHandlers = [
  mswHttp.get(`${BASE}/catalog/imports`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'catalog.import.view');
    if (g.response) return g.response;
    const query = parseListQuery(url, { defaultSort: '-createdAt' });
    const result = listResult(filter('jobs', (j) => j.type === 'IMPORT'), query, {
      searchFields: ['label', 'id'],
      filterSpec: { status: 'status' },
      sortable: ['createdAt', 'status', 'totalRows'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/catalog/imports`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.import.commit');
    if (g.response) return g.response;
    const body = await request.json();
    if (!JOB_TYPE_LABEL[body.jobType]) return validationFailed({ jobType: 'Unknown job type.' });
    if (!body.rows?.length) return validationFailed({ rows: 'Nothing to import.' });

    const results = body.rows.map((row) => applyRow(body.jobType, row));
    const failRows = results.filter((r) => !r.success).length;

    const job = insert('jobs', {
      id: id('JOB', 6),
      type: 'IMPORT',
      label: `${JOB_TYPE_LABEL[body.jobType]} — ${results.length} row(s)`,
      status: failRows > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      createdById: g.user.id,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      startedAtMs: mockNow(),
      durationMs: 0,
      totalRows: results.length,
      failRows,
      processedRows: results.length,
      resultUrl: null,
      metadata: { jobType: body.jobType, rowResults: results },
      error: null,
      completedAt: mockNowIso(),
      expiresAt: new Date(mockNow() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    writeAudit({
      actor: g.user, action: 'catalog.import.commit', entityType: 'job', entityId: job.id,
      entityLabel: job.label, metadata: { jobType: body.jobType, totalRows: results.length, failRows },
    });
    scheduleSave();
    return ok(job);
  }),

  /** Re-runs only the rows that failed last time, as their own new job. */
  mswHttp.post(`${BASE}/catalog/imports/:jobId/retry`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'catalog.import.commit');
    if (g.response) return g.response;
    const original = findById('jobs', params.jobId);
    if (!original || original.type !== 'IMPORT') return notFound('That import job no longer exists.');
    const failedRows = (original.metadata?.rowResults ?? []).filter((r) => !r.success).map((r) => r.row);
    if (!failedRows.length) return validationFailed({ jobId: 'Nothing to retry.' });

    const results = failedRows.map((row) => applyRow(original.metadata.jobType, row));
    const failRows = results.filter((r) => !r.success).length;
    const job = insert('jobs', {
      id: id('JOB', 6),
      type: 'IMPORT',
      label: `Retry — ${original.label}`,
      status: failRows > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      createdById: g.user.id,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      startedAtMs: mockNow(),
      durationMs: 0,
      totalRows: results.length,
      failRows,
      processedRows: results.length,
      resultUrl: null,
      metadata: { jobType: original.metadata.jobType, rowResults: results },
      error: null,
      completedAt: mockNowIso(),
      expiresAt: new Date(mockNow() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    scheduleSave();
    return ok(job);
  }),
];
