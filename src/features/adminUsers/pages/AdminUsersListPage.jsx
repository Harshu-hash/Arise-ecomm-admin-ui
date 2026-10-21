import { PlusOutlined } from '@ant-design/icons';
import { Avatar, Button, Flex, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { qk } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { avatarColor, initials } from '@core/utils/misc';
import { statusOptions } from '@shared/constants/statusMaps';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { rolesApi } from '../api/adminUsers.api';
import InviteAdminModal from '../components/InviteAdminModal';

export default function AdminUsersListPage() {
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const state = useUrlTableState({ defaultSort: 'name' });

  const { data: roles } = useQuery({
    queryKey: qk.roles.list({ pageSize: 100 }),
    queryFn: () => rolesApi.list(),
  });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: qk.adminUsers.list(state.queryParams),
    url: '/admin-users',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const columns = [
    {
      key: 'name',
      title: 'Name',
      dataIndex: 'name',
      sorter: true,
      alwaysVisible: true,
      render: (name, row) => (
        <Space size={8}>
          <Avatar size={26} style={{ backgroundColor: row.avatarColor ?? avatarColor(row.email), fontSize: 11 }}>
            {initials(name)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {name}
            </Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.email}
              </Typography.Text>
            </div>
          </div>
        </Space>
      ),
    },
    {
      key: 'roleNames',
      title: 'Roles',
      dataIndex: 'roleNames',
      priority: 1,
      render: (names) => (
        <Space size={[4, 4]} wrap>
          {(names ?? []).map((n) => (
            <Tag key={n} style={{ marginInlineEnd: 0 }}>
              {n}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      key: 'scope',
      title: 'Scope',
      dataIndex: 'scope',
      priority: 3,
      render: (scope, row) =>
        row.scopedBy?.length ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {describeScopeShort(scope)}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Unrestricted
          </Typography.Text>
        ),
    },
    {
      key: 'status',
      title: 'Status',
      dataIndex: 'status',
      sorter: true,
      priority: 1,
      render: (code) => <StatusTag domain="adminUser" code={code} />,
    },
    {
      key: 'twoFactorEnrolled',
      title: '2FA',
      dataIndex: 'twoFactorEnrolled',
      priority: 2,
      render: (on) =>
        on ? (
          <Tag color="green" style={{ marginInlineEnd: 0 }}>
            Enrolled
          </Tag>
        ) : (
          <Tag color="gold" style={{ marginInlineEnd: 0 }}>
            Not set up
          </Tag>
        ),
    },
    {
      key: 'activeSessions',
      title: 'Sessions',
      dataIndex: 'activeSessions',
      priority: 3,
      align: 'right',
      render: (n) => <span className="tabular">{n}</span>,
    },
    {
      key: 'lastLoginAt',
      title: 'Last sign-in',
      dataIndex: 'lastLoginAt',
      sorter: true,
      priority: 2,
      render: (v) => <DateText value={v} />,
    },
    {
      key: 'createdAt',
      title: 'Added',
      dataIndex: 'createdAt',
      sorter: true,
      priority: 3,
      defaultHidden: true,
      render: (v) => <DateText value={v} variant="date" />,
    },
  ];

  const filterSchema = [
    { key: 'status', label: 'Status', kind: 'multiSelect', options: statusOptions('adminUser'), width: 190 },
    {
      key: 'roleId',
      label: 'Role',
      kind: 'select',
      options: (roles?.data ?? []).map((r) => ({ value: r.id, label: r.name })),
      width: 200,
    },
    { key: 'twoFactorEnrolled', label: 'Missing 2FA', kind: 'boolean' },
    { key: 'lastLoginAt', label: 'Last sign-in', kind: 'dateRange' },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Admin users"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Admin users' }]}
        subtitle="Who can sign in to this panel, and what they can reach."
        actions={
          <Can perm="admin.user.invite" disable reason="You cannot invite admins">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
              Invite admin
            </Button>
          </Can>
        }
      />

      <FilterBar
        schema={filterSchema}
        tableState={state}
        searchPlaceholder="Search name, email or ID"
      />

      <DataTable
        tableId="adminUsers"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'INVITED', label: 'Invited' },
          { key: 'LOCKED', label: 'Locked' },
          { key: 'DEACTIVATED', label: 'Deactivated' },
        ]}
        emptyProps={{
          title: 'No admins match',
          actionLabel: 'Invite admin',
          onAction: () => setInviteOpen(true),
        }}
        mobileCard={(row) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" align="flex-start" gap={8}>
              <Space size={8}>
                <Avatar size={28} style={{ backgroundColor: avatarColor(row.email), fontSize: 12 }}>
                  {initials(row.name)}
                </Avatar>
                <div>
                  <Typography.Text strong>{row.name}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.email}
                    </Typography.Text>
                  </div>
                </div>
              </Space>
              <StatusTag domain="adminUser" code={row.status} />
            </Flex>
            <Space size={[4, 4]} wrap>
              {(row.roleNames ?? []).map((n) => (
                <Tag key={n} style={{ marginInlineEnd: 0 }}>
                  {n}
                </Tag>
              ))}
            </Space>
          </Flex>
        )}
      />

      <InviteAdminModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Flex>
  );
}

function describeScopeShort(scope) {
  if (!scope) return 'Unrestricted';
  const parts = [];
  if (scope.categories?.length) parts.push(`${scope.categories.length} categories`);
  if (scope.sellers?.length) parts.push(`${scope.sellers.length} sellers`);
  if (scope.warehouses?.length) parts.push(`${scope.warehouses.length} warehouses`);
  if (scope.queues?.length) parts.push(`${scope.queues.length} queues`);
  if (scope.refundLimit) parts.push('refund capped');
  return parts.length ? parts.join(' · ') : 'Unrestricted';
}
