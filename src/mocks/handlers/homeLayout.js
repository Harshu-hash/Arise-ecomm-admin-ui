import { http as mswHttp } from 'msw';
import { db, findById, id, insert, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { HOME_SECTION_TYPES, toAppJson } from '../engine/homeLayout';
import { approvalRequired, created, notFound, ok, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/**
 * Home layout builder (M12.1) — the exit criterion for Phase 5: publishing
 * produces the JSON the app actually consumes (`toAppJson`), not the admin's
 * internal version record with its scheduling and audit fields.
 */

export const homeLayoutHandlers = [
  mswHttp.get(`${BASE}/cms/home/versions`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.view');
    if (g.response) return g.response;
    return ok([...db.homeLayoutVersions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }),

  mswHttp.get(`${BASE}/cms/home/draft`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.view');
    if (g.response) return g.response;

    let draft = db.homeLayoutVersions.find((v) => v.status === 'DRAFT');
    if (!draft) {
      // Editing always happens on a draft; start one from the published
      // layout so there is never nothing to edit.
      const published = db.homeLayoutVersions.find((v) => v.status === 'PUBLISHED');
      draft = insert('homeLayoutVersions', {
        id: id('HLV', 4),
        status: 'DRAFT',
        sections: published ? published.sections.map((s) => ({ ...s })) : [],
        createdByName: g.user.name,
        createdAt: mockNowIso(),
        publishedByName: null,
        publishedAt: null,
        note: null,
        version: 1,
      });
      scheduleSave();
    }
    return ok(draft);
  }),

  mswHttp.patch(`${BASE}/cms/home/draft`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.edit');
    if (g.response) return g.response;

    const body = await request.json();
    const draft = db.homeLayoutVersions.find((v) => v.status === 'DRAFT');
    if (!draft) return notFound('No draft to edit. Load it first.');

    if (body.sections) {
      for (const section of body.sections) {
        if (!HOME_SECTION_TYPES.includes(section.type)) {
          return validationFailed({ sections: `Unknown section type: ${section.type}` });
        }
      }
      update('homeLayoutVersions', draft.id, { sections: body.sections });
    }
    scheduleSave();
    return ok(findById('homeLayoutVersions', draft.id));
  }),

  mswHttp.get(`${BASE}/cms/home/published`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.view');
    if (g.response) return g.response;
    const published = db.homeLayoutVersions.find((v) => v.status === 'PUBLISHED');
    if (!published) return notFound('Nothing has been published yet.');
    return ok(toAppJson(published));
  }),

  mswHttp.post(`${BASE}/cms/home/publish`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.publish');
    if (g.response) return g.response;

    const body = await request.json();
    const draft = db.homeLayoutVersions.find((v) => v.status === 'DRAFT');
    if (!draft) return notFound('No draft to publish.');

    const current = db.homeLayoutVersions.find((v) => v.status === 'PUBLISHED');
    if (current) update('homeLayoutVersions', current.id, { status: 'ARCHIVED' });

    update('homeLayoutVersions', draft.id, {
      status: 'PUBLISHED',
      publishedByName: g.user.name,
      publishedAt: mockNowIso(),
      note: body.note ?? null,
    });
    writeAudit({
      actor: g.user, action: 'cms.home.publish', entityType: 'homeLayoutVersion',
      entityId: draft.id, entityLabel: 'Home layout', reason: body.note,
    });

    // A new draft starts from what was just published, so the builder
    // always has somewhere to keep working.
    insert('homeLayoutVersions', {
      id: id('HLV', 4),
      status: 'DRAFT',
      sections: draft.sections.map((s) => ({ ...s })),
      createdByName: g.user.name,
      createdAt: mockNowIso(),
      publishedByName: null,
      publishedAt: null,
      note: null,
      version: 1,
    });
    scheduleSave();
    return created(toAppJson(findById('homeLayoutVersions', draft.id)));
  }),

  mswHttp.post(`${BASE}/cms/home/rollback`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.rollback');
    if (g.response) return g.response;

    const body = await request.json();
    const target = findById('homeLayoutVersions', body.versionId);
    if (!target) return notFound('That version no longer exists.');
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why the layout is being rolled back.' });

    const approval = createApproval({
      actionKey: 'cms.home.rollback', actor: g.user,
      entityType: 'homeLayoutVersion', entityId: target.id, entityLabel: `Version from ${target.publishedAt ?? target.createdAt}`,
      reason: body.reason, summary: 'Roll back the published home layout',
      payload: { versionId: target.id },
      execute: () => {
        const current = db.homeLayoutVersions.find((v) => v.status === 'PUBLISHED');
        if (current) update('homeLayoutVersions', current.id, { status: 'ARCHIVED' });
        const restored = insert('homeLayoutVersions', {
          id: id('HLV', 4),
          status: 'PUBLISHED',
          sections: target.sections.map((s) => ({ ...s })),
          createdByName: target.createdByName,
          createdAt: mockNowIso(),
          publishedByName: g.user.name,
          publishedAt: mockNowIso(),
          note: `Rolled back to the version published ${target.publishedAt ?? 'earlier'}`,
          version: 1,
        });
        scheduleSave();
        return restored;
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  /* ------------------------------------------------------------ tabs */
  mswHttp.get(`${BASE}/cms/category-tabs`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.view');
    if (g.response) return g.response;
    return ok([...db.categoryTabs].sort((a, b) => a.order - b.order));
  }),

  mswHttp.patch(`${BASE}/cms/category-tabs/reorder`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.edit');
    if (g.response) return g.response;
    const body = await request.json();
    (body.orderedIds ?? []).forEach((tabId, i) => update('categoryTabs', tabId, { order: i }));
    scheduleSave();
    return ok([...db.categoryTabs].sort((a, b) => a.order - b.order));
  }),

  mswHttp.patch(`${BASE}/cms/category-tabs/:tabId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.edit');
    if (g.response) return g.response;
    const tab = findById('categoryTabs', params.tabId);
    if (!tab) return notFound('That tab no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['label', 'icon', 'gradient', 'layoutVariant', 'active']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    update('categoryTabs', tab.id, patch);
    scheduleSave();
    return ok(findById('categoryTabs', tab.id));
  }),

  mswHttp.get(`${BASE}/cms/brand-tabs`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.view');
    if (g.response) return g.response;
    return ok([...db.topBrandTabs].sort((a, b) => a.order - b.order));
  }),

  mswHttp.patch(`${BASE}/cms/brand-tabs/:tabId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'cms.home.edit');
    if (g.response) return g.response;
    const tab = findById('topBrandTabs', params.tabId);
    if (!tab) return notFound('That tab no longer exists.');
    const body = await request.json();
    const patch = {};
    for (const key of ['label', 'logo', 'target', 'active']) if (body[key] !== undefined) patch[key] = body[key];
    update('topBrandTabs', tab.id, patch);
    scheduleSave();
    return ok(findById('topBrandTabs', tab.id));
  }),
];
