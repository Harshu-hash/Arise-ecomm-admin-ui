import { App, Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { qk, queryClient } from '@core/api/queryClient';
import { IS_MOCK } from '@core/config/env';
import { adminUsersApi, rolesApi } from '../api/adminUsers.api';
import { scopeToPayload } from '../scopeMapping';
import ScopeFields from './ScopeFields';

/** Invite flow: name, email, roles, then any scopes those roles expect. */
export default function InviteAdminModal({ open, onClose }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [inviteUrl, setInviteUrl] = useState(null);
  const roleIds = Form.useWatch('roleIds', form);

  const { data: roles } = useQuery({
    queryKey: qk.roles.list({ pageSize: 100 }),
    queryFn: () => rolesApi.list(),
    enabled: open,
  });

  const scopedBy = (roles?.data ?? [])
    .filter((r) => (roleIds ?? []).includes(r.id))
    .flatMap((r) => r.scopedBy ?? []);

  const invite = useMutation({
    mutationFn: (payload) => adminUsersApi.invite(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: qk.adminUsers.all });
      message.success(`Invitation sent to ${res.data.email}`);
      if (IS_MOCK && res.meta?.devHint?.inviteUrl) setInviteUrl(res.meta.devHint.inviteUrl);
      else close();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
      } else {
        message.error(e.message);
      }
    },
  });

  const close = () => {
    form.resetFields();
    setInviteUrl(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      title="Invite an admin"
      okText={inviteUrl ? 'Done' : 'Send invitation'}
      onOk={() => (inviteUrl ? close() : form.submit())}
      confirmLoading={invite.isPending}
      cancelButtonProps={{ style: inviteUrl ? { display: 'none' } : undefined }}
      destroyOnHidden
      width={520}
    >
      {inviteUrl ? (
        <Alert
          type="warning"
          showIcon
          message="Mock environment — no email is sent"
          description={
            <Typography.Text>
              Open the invitation at{' '}
              <Typography.Text copyable code>
                {inviteUrl}
              </Typography.Text>
            </Typography.Text>
          }
        />
      ) : (
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          // Scope limits are typed in rupees and stored in paise.
          onFinish={(values) => invite.mutate({ ...values, scope: scopeToPayload(values.scope) })}
          disabled={invite.isPending}
        >
          <Form.Item name="name" label="Full name" rules={[{ required: true, message: 'Enter their name.' }]}>
            <Input autoFocus placeholder="Ananya Deshpande" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Work email"
            rules={[
              { required: true, message: 'Enter their email.' },
              { type: 'email', message: 'That does not look like an email address.' },
            ]}
          >
            <Input placeholder="ananya@arise.test" />
          </Form.Item>

          <Form.Item
            name="roleIds"
            label="Roles"
            rules={[{ required: true, message: 'Assign at least one role.' }]}
            extra="Permissions are the union of every role assigned."
          >
            <Select
              mode="multiple"
              placeholder="Pick one or more roles"
              options={(roles?.data ?? []).map((r) => ({
                value: r.id,
                label: r.name,
                description: r.description,
              }))}
              optionFilterProp="label"
            />
          </Form.Item>

          {scopedBy.length > 0 && <ScopeFields dimensions={scopedBy} />}
        </Form>
      )}
    </Modal>
  );
}
