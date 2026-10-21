import { http as mswHttp } from 'msw';
import { PERMISSION_KEYS, expandImplied, isValidPermission } from '@core/rbac/catalog';
import { db, find, findById, id, insert, remove, update } from '../db/store';
import { createApproval } from '../engine/approvals';
import { diffOf, writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import {
  approvalRequired,

  conflict,
  created,
  notFound,
  ok,
  okList,
  validationFailed,
  versionConflict,
} from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

function withUserCount(role) {
  return {
    ...role,
    userCount: db.adminUsers.filter((u) => (u.roleIds ?? []).includes(role.id)).length,
    permissionCount: role.permissions.includes('*') ? 'ALL' : role.permissions.length,
  };
}

function validatePayload(body, { requireName = true } = {}) {
  const fieldErrors = {};
  if (requireName && !String(body?.name ?? '').trim()) fieldErrors.name = 'Give the role a name.';
  const perms = body?.permissions;
  if (perms !== undefined) {
    if (!Array.isArray(perms)) fieldErrors.permissions = 'Permissions must be a list.';
    else {
      const unknown = perms.filter((p) => p !== '*' && !isValidPermission(p));
      if (unknown.length) fieldErrors.permissions = `Unknown permissions: ${unknown.slice(0, 3).join(', ')}`;
      if (perms.length === 0) fieldErrors.permissions = 'Select at least one permission.';
    }
  }
  return fieldErrors;
}

export const roleHandlers = [
  mswHttp.get(`${BASE}/roles`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.role.view');
    if (g.response) return g.response;

    const url = new URL(request.url);
    const query = parseListQuery(url, { defaultSort: 'name', defaultPageSize: 50 });
    const { items, meta } = listResult(db.roles.map(withUserCount), query, {
      searchFields: ['name', 'description', 'key'],
      filterSpec: {
        system: { path: 'system', kind: 'boolean' },
        hasUsers: (row, v) => (String(v) === 'true' ? row.userCount > 0 : row.userCount === 0),
      },
      sortable: ['name', 'userCount', 'updatedAt', 'permissionCount'],
      facetFields: ['system'],
    });
    return okList(items, meta);
  }),

  mswHttp.get(`${BASE}/roles/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.role.view');
    if (g.response) return g.response;

    const role = findById('roles', params.id);
    if (!role) return notFound('That role no longer exists.');

    return ok(withUserCount(role), {
      allowedActions: role.system ? ['CLONE'] : ['EDIT', 'CLONE', 'DELETE'],
      users: db.adminUsers
        .filter((u) => (u.roleIds ?? []).includes(role.id))
        .map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status })),
    });
  }),

  mswHttp.post(`${BASE}/roles`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'admin.role.create');
    if (g.response) return g.response;

    const body = await request.json();
    const fieldErrors = validatePayload(body);
    if (find('roles', (r) => r.name.toLowerCase() === String(body?.name ?? '').trim().toLowerCase())) {
      fieldErrors.name = 'A role with this name already exists.';
    }
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const permissions = expandImplied(body.permissions.filter((p) => p !== '*'));

    // Creating a role is itself a privilege change, so it is four-eyed.
    const approval = createApproval({
      actionKey: 'role.change',
      actor: g.user,
      entityType: 'role',
      entityId: 'new',
      entityLabel: body.name,
      reason: body.reason ?? null,
      summary: `Create role "${body.name}" with ${permissions.length} permissions`,
      diff: [{ field: 'permissions', from: [], to: permissions }],
      execute: () => {
        const role = insert('roles', {
          id: id('ROLE', 3),
          key: String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          name: String(body.name).trim(),
          description: body.description ?? '',
          system: false,
          scopedBy: body.scopedBy ?? [],
          permissions,
          createdAt: mockNowIso(),
          createdByName: g.user.name,
          updatedAt: mockNowIso(),
          updatedByName: g.user.name,
          version: 1,
        });
        writeAudit({
          actor: g.user,
          action: 'admin.role.create',
          entityType: 'role',
          entityId: role.id,
          entityLabel: role.name,
          changes: [{ field: 'permissions', from: [], to: permissions }],
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  mswHttp.patch(`${BASE}/roles/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.role.edit');
    if (g.response) return g.response;

    const role = findById('roles', params.id);
    if (!role) return notFound('That role no longer exists.');
    if (role.system) {
      return conflict('System roles cannot be edited. Clone this role to customise it.', 'ROLE_IS_SYSTEM');
    }

    const body = await request.json();
    if (body.version !== undefined && body.version !== role.version) {
      return versionConflict(withUserCount(role));
    }
    const fieldErrors = validatePayload(body, { requireName: body.name !== undefined });
    if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);

    const next = {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.scopedBy !== undefined ? { scopedBy: body.scopedBy } : {}),
      ...(body.permissions !== undefined
        ? { permissions: expandImplied(body.permissions.filter((p) => p !== '*')) }
        : {}),
    };
    const changes = diffOf(role, { ...role, ...next });
    if (!changes.length) return ok(withUserCount(role));

    const approval = createApproval({
      actionKey: 'role.change',
      actor: g.user,
      entityType: 'role',
      entityId: role.id,
      entityLabel: role.name,
      reason: body.reason ?? null,
      summary: `Change role "${role.name}" (${changes.length} change${changes.length === 1 ? '' : 's'})`,
      diff: changes,
      execute: () => {
        const before = { ...role };
        update('roles', role.id, { ...next, updatedAt: mockNowIso(), updatedByName: g.user.name });
        writeAudit({
          actor: g.user,
          action: 'admin.role.edit',
          entityType: 'role',
          entityId: role.id,
          entityLabel: role.name,
          changes: diffOf(before, findById('roles', role.id)),
          reason: body.reason ?? null,
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),

  mswHttp.post(`${BASE}/roles/:id/clone`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.role.create');
    if (g.response) return g.response;

    const source = findById('roles', params.id);
    if (!source) return notFound('That role no longer exists.');
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? `${source.name} (copy)`).trim();
    if (find('roles', (r) => r.name.toLowerCase() === name.toLowerCase())) {
      return validationFailed({ name: 'A role with this name already exists.' });
    }

    // A clone starts as a draft copy and is editable, so it needs no approval
    // until its permissions are actually changed and saved.
    const role = insert('roles', {
      id: id('ROLE', 3),
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name,
      description: body?.description ?? source.description,
      system: false,
      scopedBy: [...(source.scopedBy ?? [])],
      // Cloning Super Admin materialises its wildcard into explicit keys, so
      // the copy can then be narrowed in the matrix.
      permissions: source.permissions.includes('*') ? [...PERMISSION_KEYS] : [...source.permissions],
      createdAt: mockNowIso(),
      createdByName: g.user.name,
      updatedAt: mockNowIso(),
      updatedByName: g.user.name,
      version: 1,
    });
    writeAudit({
      actor: g.user,
      action: 'admin.role.create',
      entityType: 'role',
      entityId: role.id,
      entityLabel: role.name,
      metadata: { clonedFrom: source.id },
    });
    scheduleSave();
    return created(withUserCount(role));
  }),

  mswHttp.delete(`${BASE}/roles/:id`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'admin.role.delete');
    if (g.response) return g.response;

    const role = findById('roles', params.id);
    if (!role) return notFound('That role no longer exists.');
    if (role.system) return conflict('System roles cannot be deleted.', 'ROLE_IS_SYSTEM');

    const assigned = db.adminUsers.filter((u) => (u.roleIds ?? []).includes(role.id));
    if (assigned.length) {
      return conflict(
        `${assigned.length} admin${assigned.length === 1 ? '' : 's'} still use this role. Reassign them first.`,
        'ROLE_IN_USE',
        { details: { users: assigned.map((u) => ({ id: u.id, name: u.name })) } },
      );
    }

    const approval = createApproval({
      actionKey: 'role.change',
      actor: g.user,
      entityType: 'role',
      entityId: role.id,
      entityLabel: role.name,
      summary: `Delete role "${role.name}"`,
      diff: [{ field: 'role', from: role.name, to: null }],
      execute: () => {
        remove('roles', role.id);
        writeAudit({
          actor: g.user,
          action: 'admin.role.delete',
          entityType: 'role',
          entityId: role.id,
          entityLabel: role.name,
          severity: 'warning',
        });
      },
    });
    scheduleSave();
    return approvalRequired(approval);
  }),
];
