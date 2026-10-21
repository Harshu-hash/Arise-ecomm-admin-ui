import { http as mswHttp } from 'msw';
import { db, filter, findById, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { isAriseAssured, rankOffers, weightsSumTo100 } from '../engine/buyBox';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { approvalRequired, ok, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

function sellersFor(offers) {
  return new Map(offers.map((o) => [o.sellerId, findById('sellers', o.sellerId)]));
}

/** Buy-box & badge rules (M3.9): configurable ranking weights and the Arise Assured thresholds. */
export const catalogRulesHandlers = [
  mswHttp.get(`${BASE}/catalog/buybox-rules`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.rules.view');
    if (g.response) return g.response;
    return ok(findById('settings', 'buyBoxRules'));
  }),

  /** Ranks every offer on a product's variants under both the published weights and a draft, so a change can be judged before it ships. */
  mswHttp.post(`${BASE}/catalog/buybox-rules/simulate`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.rules.view');
    if (g.response) return g.response;
    const body = await request.json();
    const product = findById('products', body.productId);
    if (!product) return validationFailed({ productId: 'Choose a product.' });
    if (body.weights && !weightsSumTo100(body.weights)) return validationFailed({ weights: 'Weights must add up to 100.' });

    const rules = findById('settings', 'buyBoxRules');
    const variants = filter('variants', (v) => v.productId === product.id);

    const byVariant = variants.map((variant) => {
      const offers = filter('offers', (o) => o.variantId === variant.id);
      const sellerById = sellersFor(offers);
      return {
        variantId: variant.id,
        variantLabel: variant.label,
        current: rankOffers(offers, sellerById, rules.weights),
        draft: rankOffers(offers, sellerById, body.weights ?? rules.weights),
      };
    });

    return ok({ productId: product.id, productTitle: product.title, variants: byVariant });
  }),

  mswHttp.patch(`${BASE}/catalog/buybox-rules`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'catalog.rules.edit');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why the rules are changing.' });
    if (body.weights && !weightsSumTo100(body.weights)) return validationFailed({ weights: 'Weights must add up to 100.' });

    const current = findById('settings', 'buyBoxRules');
    const nextWeights = body.weights ?? current.weights;
    const nextAriseAssured = body.ariseAssured ?? current.ariseAssured;

    const approval = createApproval({
      actionKey: 'catalog.rules.edit', actor: g.user,
      entityType: 'settings', entityId: 'buyBoxRules', entityLabel: 'Buy-box & badge rules',
      reason: body.reason, summary: 'Change buy-box weights and/or the Arise Assured thresholds',
      payload: { weights: nextWeights, ariseAssured: nextAriseAssured },
      execute: () => {
        update('settings', 'buyBoxRules', {
          weights: nextWeights, ariseAssured: nextAriseAssured,
          version: current.version + 1, updatedAt: mockNowIso(), updatedByName: g.user.name,
        });

        // Every variant's buy-box winner and every offer's Arise Assured
        // badge are recomputed against the newly published rules — the
        // same thing an individual price/stock change already triggers.
        const rules = findById('settings', 'buyBoxRules');
        for (const variant of db.variants) {
          const offers = filter('offers', (o) => o.variantId === variant.id);
          if (!offers.length) continue;
          for (const o of offers) o.buyBoxWinner = false;
          const sellerById = sellersFor(offers);
          const ranked = rankOffers(offers, sellerById, rules.weights);
          if (ranked[0]) findById('offers', ranked[0].id).buyBoxWinner = true;
          for (const offer of offers) {
            offer.ariseAssured = isAriseAssured(offer, sellerById.get(offer.sellerId), rules.ariseAssured);
          }
        }
        writeAudit({
          actor: g.user, action: 'catalog.rules.publish', entityType: 'settings', entityId: 'buyBoxRules',
          entityLabel: 'Buy-box & badge rules', reason: body.reason,
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),
];
