import { ROLE_TEMPLATES, buildRoleFromTemplate } from '@core/rbac/roleTemplates';
import { id, insert } from '../db/store';
import { mockNowIso } from '../engine/settings';

/** Seeds the 15 system roles from the catalog templates (plan §12.2). */
export function seedRoles() {
  const roles = ROLE_TEMPLATES.map((template) => {
    const built = buildRoleFromTemplate(template);
    return insert('roles', {
      // Via the id() helper, so the counter advances past the seeded rows and
      // a role created later cannot be handed an id that already exists.
      id: id('ROLE', 3),
      key: built.key,
      name: built.name,
      description: built.description,
      system: built.system,
      scopedBy: built.scopedBy,
      permissions: built.permissions,
      createdAt: mockNowIso(),
      createdByName: 'System',
      updatedAt: mockNowIso(),
      updatedByName: 'System',
      version: 1,
    });
  });
  return roles;
}
