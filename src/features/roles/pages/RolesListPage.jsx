import { CopyOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Flex, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { qk, queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { formatNumber } from '@core/utils/money';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { rolesApi } from '@features/adminUsers/api/adminUsers.api';

export default function RolesListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'name', defaultPageSize: 50 });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: qk.roles.list(state.queryParams),
    url: '/roles',
    params: state.queryParams,
  });

  const clone = useMutation({
    mutationFn: (role) => rolesApi.clone(role.id, { name: `${role.name} (copy)` }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: qk.roles.all });
      message.success('Role cloned. Adjust its permissions and save.');
      navigate(`/admin/roles/${res.data.id}`);
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'name',
      title: 'Role',
      dataIndex: 'name',
      sorter: true,
      alwaysVisible: true,
      render: (name, row) => (
        <div style={{ minWidth: 0 }}>
          <Space size={6}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {name}
            </Typography.Text>
            {row.system && <Tag style={{ marginInlineEnd: 0 }}>System</Tag>}
          </Space>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.description}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'permissionCount',
      title: 'Permissions',
      dataIndex: 'permissionCount',
      sorter: true,
      align: 'right',
      priority: 1,
      render: (v) => (
        <span className="tabular">{v === 'ALL' ? 'All' : formatNumber(v)}</span>
      ),
    },
    {
      key: 'userCount',
      title: 'Admins',
      dataIndex: 'userCount',
      sorter: true,
      align: 'right',
      priority: 1,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'scopedBy',
      title: 'Scoped by',
      dataIndex: 'scopedBy',
      priority: 3,
      render: (dims) =>
        dims?.length ? (
          <Space size={[4, 4]} wrap>
            {dims.map((d) => (
              <Tag key={d} style={{ marginInlineEnd: 0 }}>
                {d}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Typography.Text>
        ),
    },
    {
      key: 'updatedAt',
      title: 'Last changed',
      dataIndex: 'updatedAt',
      sorter: true,
      priority: 2,
      render: (v, row) => (
        <div>
          <DateText value={v} />
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {row.updatedByName}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      priority: 2,
      render: (_v, row) => (
        <Can perm="admin.role.create">
          <Button
            size="small"
            icon={<CopyOutlined />}
            loading={clone.isPending && clone.variables?.id === row.id}
            onClick={(e) => {
              e.stopPropagation();
              clone.mutate(row);
            }}
          >
            Clone
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Roles & permissions"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles & permissions' }]}
        subtitle="System roles cannot be edited — clone one to make a variant you control."
        actions={
          <Can perm="admin.role.create" disable reason="You cannot create roles">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/admin/roles/new')}>
              New role
            </Button>
          </Can>
        }
      />

      <FilterBar
        schema={[
          {
            key: 'system',
            label: 'Type',
            kind: 'select',
            options: [
              { value: 'true', label: 'System roles' },
              { value: 'false', label: 'Custom roles' },
            ],
            width: 170,
          },
          {
            key: 'hasUsers',
            label: 'Assignment',
            kind: 'select',
            options: [
              { value: 'true', label: 'In use' },
              { value: 'false', label: 'Unused' },
            ],
            width: 150,
          },
        ]}
        tableState={state}
        searchPlaceholder="Search roles"
      />

      <DataTable
        tableId="roles"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => navigate(`/admin/roles/${row.id}`)}
        emptyProps={{ title: 'No roles match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Space size={6}>
              <Typography.Text strong>{row.name}</Typography.Text>
              {row.system && <Tag style={{ marginInlineEnd: 0 }}>System</Tag>}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.description}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.permissionCount === 'ALL' ? 'All permissions' : `${row.permissionCount} permissions`} ·{' '}
              {row.userCount} admin{row.userCount === 1 ? '' : 's'}
            </Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
