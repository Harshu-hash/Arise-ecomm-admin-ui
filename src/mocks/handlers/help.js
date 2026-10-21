import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { created, notFound, ok, validationFailed } from '../engine/respond';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Help centre (M12.5): categories, articles, and the search-with-no-result list. */

/** Searches customers ran that found nothing — seeded as a static sample,
 *  since there is no real search index behind this mock to log against. */
const NO_RESULT_SEARCHES = [
  { term: 'cancel subscription', count: 142 },
  { term: 'where is my refund status page', count: 98 },
  { term: 'return without box', count: 61 },
  { term: 'change upi id', count: 44 },
];

function categoryRow(cat) {
  const articles = filter('helpArticles', (a) => a.categoryId === cat.id);
  return { ...cat, articleCount: articles.length };
}

export const helpHandlers = [
  mswHttp.get(`${BASE}/help-categories`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.view');
    if (g.response) return g.response;
    return ok([...db.helpCategories].sort((a, b) => a.order - b.order).map(categoryRow));
  }),

  mswHttp.get(`${BASE}/help-categories/:categoryId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.view');
    if (g.response) return g.response;
    const category = findById('helpCategories', params.categoryId);
    if (!category) return notFound('That help category no longer exists.');
    return ok({
      ...categoryRow(category),
      articles: filter('helpArticles', (a) => a.categoryId === category.id).sort((a, b) => a.order - b.order),
    });
  }),

  mswHttp.post(`${BASE}/help-categories`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.create');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.title?.trim()) return validationFailed({ title: 'Give the category a title.' });

    const category = insert('helpCategories', {
      id: id('HLC', 3),
      key: body.key ?? body.title.toLowerCase().replace(/\s+/g, '_'),
      icon: body.icon ?? 'help-circle',
      title: body.title.trim(),
      subtitle: body.subtitle ?? '',
      order: db.helpCategories.length,
      active: true,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'help.category_create', entityType: 'helpCategory', entityId: category.id, entityLabel: category.title });
    scheduleSave();
    return created(categoryRow(category));
  }),

  mswHttp.patch(`${BASE}/help-categories/:categoryId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.edit');
    if (g.response) return g.response;
    const category = findById('helpCategories', params.categoryId);
    if (!category) return notFound('That help category no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['icon', 'title', 'subtitle', 'active', 'order']) if (body[key] !== undefined) patch[key] = body[key];
    update('helpCategories', category.id, patch);
    scheduleSave();
    return ok(categoryRow(findById('helpCategories', category.id)));
  }),

  mswHttp.delete(`${BASE}/help-categories/:categoryId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.delete');
    if (g.response) return g.response;
    const category = findById('helpCategories', params.categoryId);
    if (!category) return notFound('That help category no longer exists.');
    for (const article of filter('helpArticles', (a) => a.categoryId === category.id)) {
      remove('helpArticles', article.id);
    }
    remove('helpCategories', category.id);
    writeAudit({ actor: g.user, action: 'help.category_delete', entityType: 'helpCategory', entityId: category.id, entityLabel: category.title });
    scheduleSave();
    return ok({ id: category.id });
  }),

  mswHttp.post(`${BASE}/help-articles`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.create');
    if (g.response) return g.response;
    const body = await request.json();
    const category = findById('helpCategories', body.categoryId);
    if (!category) return validationFailed({ categoryId: 'Choose a category.' });
    if (!body.question?.trim()) return validationFailed({ question: 'Enter the question.' });
    if (!body.answer?.trim()) return validationFailed({ answer: 'Enter the answer.' });

    const article = insert('helpArticles', {
      id: id('HLA', 4),
      categoryId: category.id,
      question: body.question.trim(),
      answer: body.answer.trim(),
      relatedAction: body.relatedAction ?? null,
      helpfulVotes: 0,
      notHelpfulVotes: 0,
      order: filter('helpArticles', (a) => a.categoryId === category.id).length,
      status: 'PUBLISHED',
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'help.article_create', entityType: 'helpArticle', entityId: article.id, entityLabel: article.question });
    scheduleSave();
    return created(article);
  }),

  mswHttp.patch(`${BASE}/help-articles/:articleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.edit');
    if (g.response) return g.response;
    const article = findById('helpArticles', params.articleId);
    if (!article) return notFound('That article no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['question', 'answer', 'relatedAction', 'status', 'order']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('helpArticles', article.id, patch);
    writeAudit({ actor: g.user, action: 'help.article_edit', entityType: 'helpArticle', entityId: article.id, entityLabel: article.question });
    scheduleSave();
    return ok(findById('helpArticles', article.id));
  }),

  mswHttp.delete(`${BASE}/help-articles/:articleId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.delete');
    if (g.response) return g.response;
    const article = findById('helpArticles', params.articleId);
    if (!article) return notFound('That article no longer exists.');
    remove('helpArticles', article.id);
    scheduleSave();
    return ok({ id: article.id });
  }),

  mswHttp.get(`${BASE}/help-search-analytics`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.help.view');
    if (g.response) return g.response;
    return ok({ noResultSearches: NO_RESULT_SEARCHES });
  }),
];
