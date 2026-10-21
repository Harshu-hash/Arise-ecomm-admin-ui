import { Flex, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { formatPercent } from '@core/utils/money';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { customerKeys } from '@features/orders/api/orders.api';

const RISK_COLOR = { HIGH: 'red', MEDIUM: 'gold', LOW: undefined };

export default function CustomersListPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-gmvPaise' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: customerKeys.list({ ...state.queryParams, tab: state.tab }),
    url: '/customers',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const columns = [
    {
      key: 'name', title: 'Customer', dataIndex: 'name', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <div style={{ minWidth: 0 }}>
          <Space size={6}>
            <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
            {row.status === 'BLOCKED' && <Tag color="red" style={{ marginInlineEnd: 0 }}>Blocked</Tag>}
            {row.status === 'DELETED' && <Tag style={{ marginInlineEnd: 0 }}>Deleted</Tag>}
          </Space>
          <div>
            <MaskedValue value={row.phone} kind="phone" entityType="customer" entityId={row.id} entityLabel={name} />
          </div>
        </div>
      ),
    },
    {
      key: 'city', title: 'Location', dataIndex: 'city', priority: 2,
      render: (city, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{city}, {row.state}</Typography.Text>
      ),
    },
    {
      key: 'ordersCount', title: 'Orders', dataIndex: 'ordersCount', sorter: true, align: 'right', priority: 1,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'gmvPaise', title: 'Lifetime value', dataIndex: 'gmvPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} compact />,
    },
    {
      key: 'lastOrderAt', title: 'Last order', dataIndex: 'lastOrderAt', sorter: true, priority: 2,
      render: (v) => (v ? <DateText value={v} /> : <Typography.Text type="secondary">Never</Typography.Text>),
    },
    {
      key: 'rtoPct', title: 'RTO', dataIndex: 'rtoPct', sorter: true, align: 'right', priority: 2,
      render: (v) => (
        <Typography.Text className="tabular" type={v > 25 ? 'danger' : undefined}>{formatPercent(v, 1)}</Typography.Text>
      ),
    },
    {
      key: 'returnPct', title: 'Returns', dataIndex: 'returnPct', align: 'right', priority: 3,
      render: (v) => (
        <Typography.Text className="tabular" type={v > 25 ? 'danger' : undefined}>{formatPercent(v, 1)}</Typography.Text>
      ),
    },
    {
      key: 'walletBalancePaise', title: 'Wallet', dataIndex: 'walletBalancePaise', align: 'right', priority: 3,
      render: (v) => (v ? <MoneyText paise={v} /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'riskLevel', title: 'Risk', dataIndex: 'riskLevel', priority: 1,
      render: (v, row) => (
        <Space size={4}>
          <Tag color={RISK_COLOR[v]} style={{ marginInlineEnd: 0 }}>{v.toLowerCase()}</Tag>
          {row.openFlags > 0 && <Tag color="red" style={{ marginInlineEnd: 0 }}>{row.openFlags}</Tag>}
        </Space>
      ),
    },
    {
      key: 'joinedAt', title: 'Joined', dataIndex: 'joinedAt', sorter: true, priority: 3, defaultHidden: true,
      render: (v) => <DateText value={v} variant="date" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Customers"
        breadcrumbs={[{ label: 'Customers' }, { label: 'All customers' }]}
        subtitle="Personal data is masked by default. Revealing it is logged against your name."
      />

      <FilterBar
        schema={[
          {
            key: 'riskLevel', label: 'Risk', kind: 'select', width: 140,
            options: [
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
            ],
          },
          { key: 'city', label: 'City', kind: 'text', width: 150 },
          {
            key: 'platform', label: 'Platform', kind: 'select', width: 140,
            options: [{ value: 'Android', label: 'Android' }, { value: 'iOS', label: 'iOS' }],
          },
          { key: 'codDisabled', label: 'COD disabled', kind: 'boolean' },
          { key: 'joinedAt', label: 'Joined', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search name, phone, email or ID"
      />

      <DataTable
        tableId="customers"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'BLOCKED', label: 'Blocked' },
          { key: 'DELETED', label: 'Deleted' },
        ]}
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
        onExport={() => {}}
        exportPerm="customers.customer.export"
        emptyProps={{ title: 'No customers match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.name}</Typography.Text>
              <Tag color={RISK_COLOR[row.riskLevel]} style={{ marginInlineEnd: 0 }}>{row.riskLevel.toLowerCase()}</Tag>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.ordersCount} orders · <MoneyText paise={row.gmvPaise} compact />
            </Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
