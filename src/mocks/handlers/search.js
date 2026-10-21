import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Search configuration (M12.6): synonyms, redirects, boost/bury, trending, blocked terms. */

export const searchHandlers = [
  mswHttp.get(`${BASE}/search-rules`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'cms.search.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: 'order' });
    const result = listResult(db.searchRules, query, {
      searchFields: ['term', 'synonym', 'keyword', 'targetLabel', 'scopeLabel'],
      filterSpec: { type: 'type', active: { path: 'active', kind: 'boolean' } },
      sortable: ['order', 'type'],
      facetFields: ['type'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/search-rules`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.edit');
    if (g.response) return g.response;
    const body = await request.json();
    if (!['SYNONYM', 'REDIRECT', 'BOOST', 'BURY', 'BLOCKED'].includes(body.type)) {
      return validationFailed({ type: 'Choose a rule type.' });
    }
    if (body.type === 'SYNONYM' && (!body.term?.trim() || !body.synonym?.trim())) {
      return validationFailed({ term: 'Enter both terms.' });
    }
    if (body.type === 'REDIRECT' && !body.keyword?.trim()) {
      return validationFailed({ keyword: 'Enter the search keyword to redirect.' });
    }
    if (['BOOST', 'BURY'].includes(body.type) && !body.scopeLabel?.trim()) {
      return validationFailed({ scopeLabel: 'Say what this rule applies to.' });
    }
    if (body.type === 'BLOCKED' && !body.term?.trim()) {
      return validationFailed({ term: 'Enter the term to block.' });
    }

    const rule = insert('searchRules', {
      id: id('SCH', 4),
      type: body.type,
      term: body.term ?? null,
      synonym: body.synonym ?? null,
      direction: body.direction ?? 'BOTH',
      keyword: body.keyword ?? null,
      targetType: body.targetType ?? null,
      targetLabel: body.targetLabel ?? null,
      scopeType: body.scopeType ?? null,
      scopeLabel: body.scopeLabel ?? null,
      weight: body.weight ?? null,
      active: true,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      order: db.searchRules.length,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'search.rule_create', entityType: 'searchRule', entityId: rule.id, entityLabel: rule.term ?? rule.keyword ?? rule.scopeLabel });
    scheduleSave();
    return created(rule);
  }),

  mswHttp.patch(`${BASE}/search-rules/:ruleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.edit');
    if (g.response) return g.response;
    const rule = findById('searchRules', params.ruleId);
    if (!rule) return notFound('That rule no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['term', 'synonym', 'direction', 'keyword', 'targetType', 'targetLabel', 'scopeType', 'scopeLabel', 'weight', 'active']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('searchRules', rule.id, patch);
    scheduleSave();
    return ok(findById('searchRules', rule.id));
  }),

  mswHttp.delete(`${BASE}/search-rules/:ruleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.edit');
    if (g.response) return g.response;
    const rule = findById('searchRules', params.ruleId);
    if (!rule) return notFound('That rule no longer exists.');
    remove('searchRules', rule.id);
    writeAudit({ actor: g.user, action: 'search.rule_delete', entityType: 'searchRule', entityId: rule.id, entityLabel: rule.term ?? rule.keyword ?? rule.scopeLabel });
    scheduleSave();
    return ok({ id: rule.id });
  }),

  mswHttp.get(`${BASE}/trending-searches`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.view');
    if (g.response) return g.response;
    return ok([...db.trendingSearches].sort((a, b) => (b.pinned - a.pinned) || a.order - b.order));
  }),

  mswHttp.post(`${BASE}/trending-searches`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.edit');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.term?.trim()) return validationFailed({ term: 'Enter a search term.' });

    const row = insert('trendingSearches', {
      id: id('TRS', 3), term: body.term.trim(), searchCount: 0, pinned: Boolean(body.pinned),
      order: db.trendingSearches.length, version: 1,
    });
    scheduleSave();
    return created(row);
  }),

  mswHttp.patch(`${BASE}/trending-searches/:termId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.edit');
    if (g.response) return g.response;
    const row = findById('trendingSearches', params.termId);
    if (!row) return notFound('That term no longer exists.');
    const body = await request.json();
    if (body.pinned !== undefined) update('trendingSearches', row.id, { pinned: body.pinned });
    scheduleSave();
    return ok(findById('trendingSearches', row.id));
  }),

  mswHttp.delete(`${BASE}/trending-searches/:termId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.search.edit');
    if (g.response) return g.response;
    const row = findById('trendingSearches', params.termId);
    if (!row) return notFound('That term no longer exists.');
    remove('trendingSearches', row.id);
    scheduleSave();
    return ok({ id: row.id });
  }),

  /**
   * Test search: runs a query against the live catalog and shows which
   * configured rule touched the result, so a change can be checked before
   * it reaches real customers.
   */
  mswHttp.get(`${BASE}/search/test`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'cms.search.view');
    if (g.response) return g.response;

    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    if (!q) return validationFailed({ q: 'Enter a search term.' });

    const blocked = filter('searchRules', (r) => r.type === 'BLOCKED' && r.active && q.includes(r.term.toLowerCase()));
    if (blocked.length) {
      return ok({ query: q, blocked: true, blockedBy: blocked[0].term, results: [], appliedRules: [] });
    }

    const redirect = filter('searchRules', (r) => r.type === 'REDIRECT' && r.active && r.keyword.toLowerCase() === q)[0];
    if (redirect) {
      return ok({ query: q, redirectedTo: { type: redirect.targetType, label: redirect.targetLabel }, results: [], appliedRules: [redirect] });
    }

    const synonyms = filter(
      'searchRules',
      (r) => r.type === 'SYNONYM' && r.active
        && (r.term.toLowerCase() === q || (r.direction === 'BOTH' && r.synonym.toLowerCase() === q)),
    );
    const terms = [q, ...synonyms.map((s) => (s.term.toLowerCase() === q ? s.synonym : s.term).toLowerCase())];

    let results = filter('products', (p) => terms.some((t) => p.title.toLowerCase().includes(t)))
      .filter((p) => p.status === 'LIVE')
      .slice(0, 30)
      .map((p) => ({ id: p.id, title: p.title, score: 100 }));

    const boosts = filter('searchRules', (r) => ['BOOST', 'BURY'].includes(r.type) && r.active);
    for (const rule of boosts) {
      results = results.map((r) => {
        const product = findById('products', r.id);
        const seller = db.offers.find((o) => o.productId === r.id)?.sellerId;
        const sellerRecord = seller ? findById('sellers', seller) : null;
        const applies = (rule.scopeType === 'STOCK' && product?.status === 'LIVE')
          || (rule.scopeType === 'SELLER_FLAG' && rule.scopeLabel.includes('Assured') && sellerRecord?.tier === 'PLATINUM')
          || (rule.scopeType === 'SELLER_FLAG' && rule.scopeLabel.includes('New') && sellerRecord
            && new Date(sellerRecord.joinedAt).getTime() > Date.now() - 30 * 86400_000);
        return applies ? { ...r, score: r.score + rule.weight } : r;
      });
    }
    results.sort((a, b) => b.score - a.score);

    return ok({ query: q, results, appliedRules: [...synonyms, ...boosts] });
  }),
];
