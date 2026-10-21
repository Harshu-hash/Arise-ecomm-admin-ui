import { http as mswHttp } from 'msw';
import { db, findById, id, insert, remove, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { created, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNow, mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Banners, onboarding slides and static pages (M12.2–M12.4).
 *
 * Grouped in one file: each is simple CRUD plus one small state machine
 * (banner scheduling, page publish/re-acceptance), none complex enough to
 * need its own file the way the home layout builder does.
 */

function bannerRow(b) {
  const now = mockNow();
  let status = b.status;
  if (status === 'LIVE' && new Date(b.endsAt).getTime() < now) status = 'EXPIRED';
  if (status === 'SCHEDULED' && new Date(b.startsAt).getTime() <= now) status = 'LIVE';
  if (status !== b.status) update('banners', b.id, { status });
  return { ...b, status, ctr: b.impressions ? Number(((b.clicks / b.impressions) * 100).toFixed(2)) : 0 };
}

export const contentHandlers = [
  /* ------------------------------------------------------------- banners */
  mswHttp.get(`${BASE}/banners`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'cms.banner.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: 'priority' });
    const result = listResult(db.banners.map(bannerRow), query, {
      searchFields: ['name'],
      filterSpec: { status: 'status', kind: 'kind' },
      sortable: ['priority', 'startsAt', 'impressions', 'ctr'],
      facetFields: ['status', 'kind'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/banners`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.banner.create');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.name?.trim()) return validationFailed({ name: 'Give the banner a name.' });
    if (!body.startsAt || !body.endsAt) return validationFailed({ startsAt: 'Set a schedule.' });

    const banner = insert('banners', {
      id: id('BNR', 4),
      name: body.name.trim(),
      kind: body.kind ?? 'HERO',
      images: body.images ?? { mobile_16_9: null, tile_1_1: null, web: null },
      altText: body.altText ?? body.name,
      deepLink: body.deepLink ?? { screen: 'Home' },
      placements: body.placements ?? ['HOME_HERO'],
      targeting: body.targeting ?? { segmentId: null, city: null, platform: null },
      priority: db.banners.length,
      status: new Date(body.startsAt).getTime() > mockNow() ? 'SCHEDULED' : 'LIVE',
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      impressions: 0,
      clicks: 0,
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'banner.create', entityType: 'banner', entityId: banner.id, entityLabel: banner.name });
    scheduleSave();
    return created(bannerRow(banner));
  }),

  mswHttp.patch(`${BASE}/banners/:bannerId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.banner.edit');
    if (g.response) return g.response;
    const banner = findById('banners', params.bannerId);
    if (!banner) return notFound('That banner no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['name', 'images', 'altText', 'deepLink', 'placements', 'targeting', 'priority', 'startsAt', 'endsAt']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.status === 'PAUSED' || body.status === 'LIVE') patch.status = body.status;
    update('banners', banner.id, patch);
    writeAudit({ actor: g.user, action: 'banner.edit', entityType: 'banner', entityId: banner.id, entityLabel: banner.name });
    scheduleSave();
    return ok(bannerRow(findById('banners', banner.id)));
  }),

  mswHttp.delete(`${BASE}/banners/:bannerId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.banner.delete');
    if (g.response) return g.response;
    const banner = findById('banners', params.bannerId);
    if (!banner) return notFound('That banner no longer exists.');
    remove('banners', banner.id);
    writeAudit({ actor: g.user, action: 'banner.delete', entityType: 'banner', entityId: banner.id, entityLabel: banner.name });
    scheduleSave();
    return ok({ id: banner.id });
  }),

  /* ------------------------------------------------------ onboarding */
  mswHttp.get(`${BASE}/onboarding-slides`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.onboarding.view');
    if (g.response) return g.response;
    return ok([...db.onboardingSlides].sort((a, b) => a.order - b.order));
  }),

  mswHttp.post(`${BASE}/onboarding-slides`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.onboarding.create');
    if (g.response) return g.response;
    const body = await request.json();
    if (!body.title?.trim()) return validationFailed({ title: 'Give the slide a title.' });

    const slide = insert('onboardingSlides', {
      id: id('OBS', 3),
      icon: body.icon ?? 'star',
      title: body.title.trim(),
      description: body.description ?? '',
      bg: body.bg ?? '#EFF6FF',
      order: db.onboardingSlides.length,
      active: true,
      version: 1,
    });
    writeAudit({ actor: g.user, action: 'onboarding.create', entityType: 'onboardingSlide', entityId: slide.id, entityLabel: slide.title });
    scheduleSave();
    return created(slide);
  }),

  mswHttp.patch(`${BASE}/onboarding-slides/reorder`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.onboarding.edit');
    if (g.response) return g.response;
    const body = await request.json();
    (body.orderedIds ?? []).forEach((slideId, i) => update('onboardingSlides', slideId, { order: i }));
    scheduleSave();
    return ok([...db.onboardingSlides].sort((a, b) => a.order - b.order));
  }),

  mswHttp.patch(`${BASE}/onboarding-slides/:slideId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.onboarding.edit');
    if (g.response) return g.response;
    const slide = findById('onboardingSlides', params.slideId);
    if (!slide) return notFound('That slide no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['icon', 'title', 'description', 'bg', 'active', 'order']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('onboardingSlides', slide.id, patch);
    scheduleSave();
    return ok(findById('onboardingSlides', slide.id));
  }),

  mswHttp.delete(`${BASE}/onboarding-slides/:slideId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.onboarding.delete');
    if (g.response) return g.response;
    const slide = findById('onboardingSlides', params.slideId);
    if (!slide) return notFound('That slide no longer exists.');
    remove('onboardingSlides', slide.id);
    scheduleSave();
    return ok({ id: slide.id });
  }),

  /* -------------------------------------------------------- static pages */
  mswHttp.get(`${BASE}/static-pages`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.page.view');
    if (g.response) return g.response;
    return ok(db.staticPages);
  }),

  mswHttp.get(`${BASE}/static-pages/:pageId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.page.view');
    if (g.response) return g.response;
    const page = findById('staticPages', params.pageId);
    if (!page) return notFound('That page no longer exists.');
    return ok(page);
  }),

  mswHttp.patch(`${BASE}/static-pages/:pageId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.page.edit');
    if (g.response) return g.response;
    const page = findById('staticPages', params.pageId);
    if (!page) return notFound('That page no longer exists.');
    const body = await request.json();
    if (!body.body?.trim()) return validationFailed({ body: 'The page cannot be empty.' });

    const versions = [
      ...page.versions,
      { body: body.body, editedByName: g.user.name, editedAt: mockNowIso(), note: body.note ?? null },
    ];
    update('staticPages', page.id, {
      body: body.body,
      versions,
      materialChange: Boolean(body.materialChange),
      requiresReacceptance: Boolean(body.materialChange),
      publishedAt: mockNowIso(),
    });
    writeAudit({
      actor: g.user, action: 'page.publish', entityType: 'staticPage', entityId: page.id,
      entityLabel: page.title, reason: body.note,
      metadata: { materialChange: Boolean(body.materialChange) },
    });
    scheduleSave();
    return ok(findById('staticPages', page.id));
  }),
];
