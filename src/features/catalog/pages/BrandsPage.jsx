import { Flex, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { catalogKeys } from '../api/catalog.api';

const STATUS_COLOR = { VERIFIED: 'green', PENDING: 'gold', REJECTED: 'red', BLOCKED: 'red' };

export default function BrandsPage() {
  const state = useUrlTableState({ defaultSort: 'name', defaultPageSize: 50 });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: catalogKeys.brands({ ...state.queryParams, tab: state.tab }),
    url: '/brands',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const columns = [
    {
      key: 'name', title: 'Brand', dataIndex: 'name', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <div>
          <Space size={6}>
            <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
            {row.gated && <Tag color="gold" style={{ marginInlineEnd: 0 }}>Gated</Tag>}
          </Space>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.rootCategory}</Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
      render: (v) => <Tag color={STATUS_COLOR[v]} style={{ marginInlineEnd: 0 }}>{v.toLowerCase()}</Tag>,
    },
    {
      key: 'ownerType', title: 'Owner', dataIndex: 'ownerType', priority: 3,
      render: (v) => v.replace(/_/g, ' ').toLowerCase(),
    },
    {
      key: 'productCount', title: 'Products', dataIndex: 'productCount', sorter: true, align: 'right', priority: 1,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'authorisedSellerCount', title: 'Authorised sellers', dataIndex: 'authorisedSellerCount', sorter: true, align: 'right', priority: 2,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'pendingRequests', title: 'Pending claims', dataIndex: 'pendingRequests', align: 'right', priority: 1,
      render: (v) =>
        v ? (
          <Link to={`/sellers/brand-approvals?q=`}>
            <Tag color="gold" style={{ marginInlineEnd: 0 }}>{v}</Tag>
          </Link>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Brands"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Brands' }]}
        subtitle="Gated brands can only be listed by sellers with an approved authorisation."
      />

      <FilterBar
        schema={[
          { key: 'gated', label: 'Gated only', kind: 'boolean' },
          { key: 'rootCategory', label: 'Category', kind: 'text', width: 170 },
        ]}
        tableState={state}
        searchPlaceholder="Search brand"
      />

      <DataTable
        tableId="brands"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'VERIFIED', label: 'Verified' },
          { key: 'PENDING', label: 'Pending verification' },
        ]}
        emptyProps={{ title: 'No brands match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.name}</Typography.Text>
              <Tag color={STATUS_COLOR[row.status]} style={{ marginInlineEnd: 0 }}>{row.status.toLowerCase()}</Tag>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.productCount} products · {row.authorisedSellerCount} sellers
            </Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
