import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Card, Col, Descriptions, Flex, Row, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { qk, queryClient } from '@core/api/queryClient';
import { useCurrentUser } from '@core/rbac/useCan';
import { avatarColor, initials } from '@core/utils/misc';
import AuditDrawer from '@shared/components/AuditDrawer';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { adminUsersApi } from '../api/adminUsers.api';
import AdminUserConfirmModals from '../components/AdminUserConfirmModals';
import AdminUserTabs from '../components/AdminUserTabs';
import EditAdminUserModal from '../components/EditAdminUserModal';

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const me = useCurrentUser();
  const [confirm, setConfirm] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.adminUsers.detail(id),
    queryFn: () => adminUsersApi.detail(id),
  });

  const user = data?.data;
  const allowed = data?.meta?.allowedActions ?? [];

  const act = useMutation({
    mutationFn: ({ kind, values }) => {
      if (kind === 'UNLOCK') return adminUsersApi.unlock(id);
      if (kind === 'DEACTIVATE') return adminUsersApi.deactivate(id, values);
      if (kind === 'REACTIVATE') return adminUsersApi.reactivate(id);
      if (kind === 'RESET_2FA') return adminUsersApi.reset2fa(id, values);
      if (kind === 'RESEND_INVITE') return adminUsersApi.resendInvite(id);
      if (kind === 'REVOKE_SESSIONS') return adminUsersApi.revokeSessions(id);
      throw new Error(`Unknown action ${kind}`);
    },
    onSuccess: (res, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.adminUsers.all });
      queryClient.invalidateQueries({ queryKey: qk.audit.all });
      setConfirm(null);
      if (variables.kind === 'RESEND_INVITE' && res?.meta?.devHint?.inviteUrl) {
        message.success(`Invitation re-sent. Mock link: ${res.meta.devHint.inviteUrl}`);
      } else if (variables.kind === 'REVOKE_SESSIONS') {
        message.success(`${res.data.revoked} session(s) signed out`);
      } else {
        message.success('Done');
      }
    },
    onError: (e) => {
      // A 202 means the action became an approval request, not a failure.
      if (e instanceof ApiError && e.needsApproval) {
        setConfirm(null);
        queryClient.invalidateQueries({ queryKey: qk.approvals.all });
        message.info('Sent for approval. It takes effect once another admin approves it.');
        return;
      }
      message.error(e.message);
    },
  });

  if (isLoading) return <FullPageSpinner label="Loading admin…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this admin" />;

  const isSelf = user.id === me?.id;

  const actionButtons = [
    allowed.includes('EDIT') && (
      <Button key="edit" onClick={() => setEditOpen(true)}>
        Edit
      </Button>
    ),
    allowed.includes('UNLOCK') && (
      <Button key="unlock" onClick={() => act.mutate({ kind: 'UNLOCK' })} loading={act.isPending}>
        Unlock account
      </Button>
    ),
    allowed.includes('RESEND_INVITE') && (
      <Button key="resend" onClick={() => act.mutate({ kind: 'RESEND_INVITE' })} loading={act.isPending}>
        Re-send invitation
      </Button>
    ),
    allowed.includes('RESET_2FA') && (
      <Button key="reset2fa" onClick={() => setConfirm('RESET_2FA')}>
        Reset 2FA
      </Button>
    ),
    allowed.includes('REVOKE_SESSIONS') && user.activeSessions > 0 && (
      <Button key="revoke" onClick={() => setConfirm('REVOKE_SESSIONS')}>
        Sign out all devices
      </Button>
    ),
    allowed.includes('REACTIVATE') && (
      <Button key="reactivate" type="primary" onClick={() => act.mutate({ kind: 'REACTIVATE' })}>
        Reactivate
      </Button>
    ),
    allowed.includes('DEACTIVATE') && !isSelf && (
      <Button key="deactivate" danger onClick={() => setConfirm('DEACTIVATE')}>
        Deactivate
      </Button>
    ),
    <AuditDrawer key="history" entityType="adminUser" entityId={user.id} entityLabel={user.name} />,
  ].filter(Boolean);

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/admin/users')}
            aria-label="Back to admin users"
          />
        }
        breadcrumbs={[
          { label: 'Administration' },
          { label: 'Admin users', to: '/admin/users' },
          { label: user.name },
        ]}
        title={
          <Space size={10}>
            <Avatar size={30} style={{ backgroundColor: avatarColor(user.email), fontSize: 13 }}>
              {initials(user.name)}
            </Avatar>
            {user.name}
          </Space>
        }
        tags={
          <Space size={6}>
            <StatusTag domain="adminUser" code={user.status} />
            {isSelf && <Tag color="blue">You</Tag>}
            {user.mustChangePassword && <Tag color="gold">Must change password</Tag>}
          </Space>
        }
        meta={
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user.email}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Added <DateText value={user.createdAt} variant="date" /> by {user.createdByName}
            </Typography.Text>
          </>
        }
        actions={<Space wrap>{actionButtons}</Space>}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small">
            <AdminUserTabs
              user={user}
              sessions={data.meta.sessions ?? []}
              loginHistory={data.meta.loginHistory ?? []}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card size="small" title="At a glance">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Last sign-in">
                <DateText value={user.lastLoginAt} />
              </Descriptions.Item>
              <Descriptions.Item label="Active sessions">{user.activeSessions}</Descriptions.Item>
              {user.invitedAt && (
                <Descriptions.Item label="Invited">
                  <DateText value={user.invitedAt} />
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Admin ID">
                <Typography.Text className="mono">{user.id}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <AdminUserConfirmModals
        which={confirm}
        user={user}
        isSelf={isSelf}
        loading={act.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={(kind, values) => act.mutate({ kind, values })}
      />

      <EditAdminUserModal open={editOpen} onClose={() => setEditOpen(false)} user={user} />
    </Flex>
  );
}
