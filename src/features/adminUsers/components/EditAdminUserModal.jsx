import { Alert, App, Form, Input, Modal, Select } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@core/api/errors';
import { qk, queryClient } from '@core/api/queryClient';
import { useCurrentUser } from '@core/rbac/useCan';
import { adminUsersApi, rolesApi } from '../api/adminUsers.api';
import { scopeToForm, scopeToPayload } from '../scopeMapping';
import ScopeFields from './ScopeFields';

/**
 * Editing name and scope applies immediately; changing roles is a privilege
 * change, so the server turns it into an approval request. The notice below
 * says so up front rather than surprising the user after they save.
 */
export default function EditAdminUserModal({ open, onClose, user }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const me = useCurrentUser();
  const roleIds = Form.useWatch('roleIds', form);

  const { data: roles } = useQuery({
    queryKey: qk.roles.list({ pageSize: 100 }),
    queryFn: () => rolesApi.list(),
    enabled: open,
  });

  useEffect(() => {
    if (open && user) {
      form.setFieldsValue({
        name: user.name,
        roleIds: user.roleIds,
        defaultLanding: user.defaultLanding,
        scope: scopeToForm(user.scope),
      });
    }
  }, [open, user, form]);

  const scopedBy = (roles?.data ?? [])
    .filter((r) => (roleIds ?? user?.roleIds ?? []).includes(r.id))
    .flatMap((r) => r.scopedBy ?? []);

  const rolesChanged =
    roleIds && JSON.stringify([...roleIds].sort()) !== JSON.stringify([...(user?.roleIds ?? [])].sort());

  const save = useMutation({
    mutationFn: (values) =>
      adminUsersApi.update(user.id, {
        name: values.name,
        roleIds: values.roleIds,
        defaultLanding: values.defaultLanding,
        scope: scopeToPayload(values.scope),
        version: user.version,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.adminUsers.all });
      message.success('Changes saved');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: qk.adminUsers.all });
        queryClient.invalidateQueries({ queryKey: qk.approvals.all });
        message.info('Role change sent for approval. Other edits were saved.');
        onClose();
        return;
      }
      if (e instanceof ApiError && e.isVersionConflict) {
        message.warning('Someone else changed this admin while you were editing. Reload and try again.');
        queryClient.invalidateQueries({ queryKey: qk.adminUsers.detail(user.id) });
        return;
      }
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
        return;
      }
      message.error(e.message);
    },
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      title={`Edit ${user?.name ?? 'admin'}`}
      okText={rolesChanged ? 'Save and send for approval' : 'Save changes'}
      confirmLoading={save.isPending}
      destroyOnHidden
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => save.mutate(values)}
        disabled={save.isPending}
      >
        {rolesChanged && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Role changes need a second approver"
            description="The new roles take effect only once another admin approves. This person is also signed out of all devices when it applies."
          />
        )}

        <Form.Item name="name" label="Full name" rules={[{ required: true, message: 'Enter their name.' }]}>
          <Input />
        </Form.Item>

        <Form.Item
          name="roleIds"
          label="Roles"
          rules={[{ required: true, message: 'Assign at least one role.' }]}
          extra={user?.id === me?.id ? 'You cannot change your own roles.' : undefined}
        >
          <Select
            mode="multiple"
            disabled={user?.id === me?.id}
            options={(roles?.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          name="defaultLanding"
          label="Default landing page"
          extra="Where they land after signing in, when they have not followed a deep link."
        >
          <Input placeholder="/" />
        </Form.Item>

        {scopedBy.length > 0 && <ScopeFields dimensions={scopedBy} />}
      </Form>
    </Modal>
  );
}
