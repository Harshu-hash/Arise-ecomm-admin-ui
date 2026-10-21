import { http as mswHttp } from 'msw';
import { db, findById, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { approvalRequired, notFound, ok, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { SENSITIVE_SETTINGS_SECTIONS } from '../seed/platform';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Platform settings (M17.5): ten sectioned documents in `settings`, each saved and versioned independently. */
export const settingsHandlers = [
  mswHttp.get(`${BASE}/admin/settings`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.settings.view');
    if (g.response) return g.response;
    const sections = db.settings.filter((s) => SETTINGS_IDS.includes(s.id));
    return ok(sections);
  }),

  mswHttp.patch(`${BASE}/admin/settings/:sectionId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.settings.edit');
    if (g.response) return g.response;
    const section = findById('settings', params.sectionId);
    if (!section || !SETTINGS_IDS.includes(section.id)) return notFound('That settings section does not exist.');

    const body = await request.json();
    const nextValues = { ...section.values, ...body.values };

    const apply = () => {
      update('settings', section.id, {
        values: nextValues,
        version: section.version + 1,
        updatedAt: mockNowIso(),
        updatedByName: g.user.name,
      });
      writeAudit({
        actor: g.user, action: 'settings.edit', entityType: 'settings', entityId: section.id,
        entityLabel: section.label, reason: body.reason,
        metadata: { section: section.id, changed: Object.keys(body.values ?? {}) },
      });
    };

    if (SENSITIVE_SETTINGS_SECTIONS.includes(section.id)) {
      if (!body.reason?.trim()) return validationFailed({ reason: 'Say why this setting is changing.' });
      const approval = createApproval({
        actionKey: 'settings.edit', actor: g.user,
        entityType: 'settings', entityId: section.id, entityLabel: section.label,
        reason: body.reason, summary: `Change ${section.label} settings`,
        payload: { sectionId: section.id, values: nextValues },
        execute: apply,
      });
      scheduleSave();
      return approvalRequired(approval);
    }

    apply();
    scheduleSave();
    return ok(findById('settings', section.id));
  }),
];

const SETTINGS_IDS = [
  'general', 'orders', 'returns', 'fees', 'payments', 'tax', 'sellerPolicies', 'approvalThresholds', 'security', 'support',
];
