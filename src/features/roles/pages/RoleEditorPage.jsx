import { ArrowLeftOutlined, DeleteOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Flex, Form, Modal, Select, Space, Tag } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { qk, queryClient } from '@core/api/queryClient';
import { sensitiveKeysIn } from '@core/rbac/catalog';
import AuditDrawer from '@shared/components/AuditDrawer';
import DiffList from '@shared/components/DiffList';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { rolesApi } from '@features/adminUsers/api/adminUsers.api';
import PermissionMatrix from '../components/PermissionMatrix';
import RoleDetailsForm from '../components/RoleDetailsForm';

export default function RoleEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [permissions, setPermissions] = useState([]);
  const [compareRoleId, setCompareRoleId] = useState(null);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.roles.detail(id),
    queryFn: () => rolesApi.detail(id),
    enabled: !isNew,
  });

  const { data: allRoles } = useQuery({
    queryKey: qk.roles.list({ pageSize: 100 }),
    queryFn: () => rolesApi.list(),
  });

  const role = data?.data;
  const readOnly = Boolean(role?.system);

  useEffect(() => {
    if (isNew) {
      setPermissions([]);
      form.setFieldsValue({ name: '', description: '', scopedBy: [] });
      return;
    }
    if (role) {
      setPermissions(role.permissions.includes('*') ? [] : role.permissions);
      form.setFieldsValue({
        name: role.name,
        description: role.description,
        scopedBy: role.scopedBy ?? [],
      });
      setDirty(false);
    }
  }, [role, isNew, form]);

  const compareWith = useMemo(() => {
    if (!compareRoleId) return null;
    const r = (allRoles?.data ?? []).find((x) => x.id === compareRoleId);
    return r?.permissions ?? null;
  }, [compareRoleId, allRoles]);

  // Guard against navigating away with unsaved permission changes.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !readOnly && currentLocation.pathname !== nextLocation.pathname,
  );

  const changes = useMemo(() => {
    if (isNew || !role) return [];
    const before = role.permissions.includes('*') ? [] : role.permissions;
    const added = permissions.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !permissions.includes(p));
    const out = [];
    if (added.length) out.push({ field: 'Permissions granted', from: null, to: added });
    if (removed.length) out.push({ field: 'Permissions revoked', from: removed, to: null });
    return out;
  }, [permissions, role, isNew]);

  const save = useMutation({
    mutationFn: (values) => {
      const payload = {
        name: values.name,
        description: values.description,
        scopedBy: values.scopedBy ?? [],
        permissions,
        reason: values.reason,
      };
      return isNew ? rolesApi.create(payload) : rolesApi.update(id, { ...payload, version: role.version });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: qk.roles.all });
      setDirty(false);
      message.success('Saved');
      if (isNew && res?.data?.id) navigate(`/admin/roles/${res.data.id}`, { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        setDirty(false);
        queryClient.invalidateQueries({ queryKey: qk.approvals.all });
        message.info('Sent for approval. The change applies once another admin approves it.');
        navigate('/admin/roles');
        return;
      }
      if (e instanceof ApiError && e.isVersionConflict) {
        message.warning('Someone else changed this role. Reload to see their version.');
        return;
      }
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
        return;
      }
      message.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => rolesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.roles.all });
      message.info('Deletion sent for approval.');
      navigate('/admin/roles');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: qk.approvals.all });
        message.info('Deletion sent for approval.');
        navigate('/admin/roles');
        return;
      }
      message.error(e.message);
    },
  });

  if (!isNew && isLoading) return <FullPageSpinner label="Loading role…" />;
  if (!isNew && error) return <ErrorState error={error} onRetry={refetch} title="Could not load this role" />;

  const sensitive = sensitiveKeysIn(permissions);
  const isSuperAdmin = role?.permissions?.includes('*');

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/roles')} aria-label="Back" />
        }
        breadcrumbs={[
          { label: 'Administration' },
          { label: 'Roles & permissions', to: '/admin/roles' },
          { label: isNew ? 'New role' : role.name },
        ]}
        title={isNew ? 'New role' : role.name}
        tags={
          <Space size={6}>
            {readOnly && <Tag>System role</Tag>}
            {!isNew && <Tag>{data.meta.users.length} admins</Tag>}
          </Space>
        }
        actions={
          <Space wrap>
            <Select
              allowClear
              placeholder="Compare with…"
              style={{ width: 200 }}
              value={compareRoleId}
              onChange={setCompareRoleId}
              options={(allRoles?.data ?? [])
                .filter((r) => r.id !== id)
                .map((r) => ({ value: r.id, label: r.name }))}
            />
            {!isNew && <AuditDrawer entityType="role" entityId={id} entityLabel={role.name} />}
            {!readOnly && !isNew && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  Modal.confirm({
                    title: `Delete the role "${role.name}"?`,
                    content:
                      'This needs a second approver. Admins using this role must be reassigned first.',
                    okText: 'Send for approval',
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(),
                  })
                }
              >
                Delete
              </Button>
            )}
            {!readOnly && (
              <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
                {isNew ? 'Create role' : 'Save changes'}
              </Button>
            )}
          </Space>
        }
      />

      {readOnly && (
        <Alert
          type="info"
          showIcon
          message="This is a system role"
          description="System roles are fixed so the panel always has known-good defaults. Clone it from the roles list to make an editable variant."
        />
      )}

      {isSuperAdmin && (
        <Alert
          type="warning"
          showIcon
          message="Super Admin holds every permission"
          description="Its access is a wildcard rather than a list, so the matrix below is shown empty. Cloning it materialises every permission as an explicit tick."
        />
      )}

      <RoleDetailsForm
        form={form}
        readOnly={readOnly}
        saving={save.isPending}
        isNew={isNew}
        onSubmit={(values) => save.mutate(values)}
        onDirty={() => setDirty(true)}
      />

      {sensitive.length > 0 && !readOnly && (
        <Alert
          type="warning"
          showIcon
          message={`${sensitive.length} sensitive permission${sensitive.length === 1 ? '' : 's'} selected`}
          description="These can move money, hide listings, change other admins' access or reveal personal data. Keep them to as few roles as possible."
        />
      )}

      {changes.length > 0 && (
        <Card size="small" title="Pending changes">
          <DiffList changes={changes} />
        </Card>
      )}

      <Card size="small" title="Permissions">
        <PermissionMatrix
          value={permissions}
          onChange={(next) => {
            setPermissions(next);
            setDirty(true);
          }}
          disabled={readOnly}
          compareWith={compareWith}
        />
      </Card>

      <Modal
        open={blocker.state === 'blocked'}
        title="Discard unsaved changes?"
        okText="Discard changes"
        okButtonProps={{ danger: true }}
        cancelText="Keep editing"
        onOk={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        You have changed this role&apos;s permissions but not saved them.
      </Modal>
    </Flex>
  );
}
