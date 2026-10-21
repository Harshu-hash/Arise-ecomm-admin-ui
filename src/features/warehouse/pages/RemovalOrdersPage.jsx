import { App, Button, Flex, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { warehouseApi, warehouseKeys } from '@features/logistics/api/logistics.api';

const STATUS_COLOR = {
  REQUESTED: 'gold', APPROVED: 'blue', PICKING: 'blue', SHIPPED: 'blue',
  DELIVERED_TO_SELLER: 'green', DISPOSED: 'default', CLOSED: 'default',
};

/**
 * Clearing aged stock out of a warehouse. Storage is charged monthly, so
 * stock sitting past a year usually costs the seller more than it is worth.
 */
export default function RemovalOrdersPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-requestedAt' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: warehouseKeys.removals({ ...state.queryParams, tab: state.tab }),
    url: '/removal-orders',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const approve = useMutation({
    mutationFn: (rowId) => warehouseApi.approveRemoval(rowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      message.success('Removal approved');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'sku', title: 'SKU', dataIndex: 'sku', alwaysVisible: true,
      render: (sku, row) => (
        <div style={{ minWidth: 0, maxWidth: 220 }}>
          <Typography.Text className="mono" style={{ fontSize: 11 }}>{sku}</Typography.Text>
          <div>
            <Typography.Text style={{ fontSize: 12 }} ellipsis>{row.productTitle}</Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', priority: 1,
      render: (name, row) => <Link to={`/sellers/${row.sellerId}`}>{name}</Link>,
    },
    { key: 'warehouseCode', title: 'Site', dataIndex: 'warehouseCode', priority: 2 },
    {
      key: 'type', title: 'Outcome', dataIndex: 'type', priority: 1,
      render: (v) => (
        <Tag color={v === 'DISPOSE' ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>
          {v === 'DISPOSE' ? 'Dispose' : 'Back to seller'}
        </Tag>
      ),
    },
    {
      key: 'qty', title: 'Units', dataIndex: 'qty', sorter: true, align: 'right', priority: 1,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'feePaise', title: 'Removal fee', dataIndex: 'feePaise', sorter: true, align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} />,
    },
    { key: 'reason', title: 'Why', dataIndex: 'reason', priority: 2 },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => (
        <Tag color={STATUS_COLOR[v]} style={{ marginInlineEnd: 0 }}>
          {v.replace(/_/g, ' ').toLowerCase()}
        </Tag>
      ),
    },
    {
      key: 'requestedAt', title: 'Requested', dataIndex: 'requestedAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        row.status === 'REQUESTED' ? (
          <Button
            size="small"
            type="primary"
            loading={approve.isPending && approve.variables === row.id}
            onClick={(e) => {
              e.stopPropagation();
              approve.mutate(row.id);
            }}
          >
            Approve
          </Button>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Removal orders"
        breadcrumbs={[{ label: 'Inventory & warehouses' }, { label: 'Removal orders' }]}
        subtitle="Getting aged stock out of a warehouse — either back to the seller, or disposed."
      />

      <FilterBar
        schema={[
          { key: 'warehouseId', label: 'Warehouse', kind: 'entity', entity: 'warehouse', width: 200 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          {
            key: 'type', label: 'Outcome', kind: 'select', width: 170,
            options: [
              { value: 'RETURN_TO_SELLER', label: 'Back to seller' },
              { value: 'DISPOSE', label: 'Dispose' },
            ],
          },
        ]}
        tableState={state}
        searchPlaceholder="Search SKU, product or seller"
      />

      <DataTable
        tableId="removalOrders"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'REQUESTED', label: 'To approve' },
          { key: 'APPROVED', label: 'Approved' },
          { key: 'SHIPPED', label: 'On the way back' },
          { key: 'CLOSED', label: 'Closed' },
        ]}
        emptyProps={{ title: 'No removal orders' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong ellipsis>{row.productTitle}</Typography.Text>
              <Tag color={STATUS_COLOR[row.status]} style={{ marginInlineEnd: 0 }}>
                {row.status.replace(/_/g, ' ').toLowerCase()}
              </Tag>
            </Flex>
            <Space size={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.qty} units</Typography.Text>
              <MoneyText paise={row.feePaise} />
            </Space>
          </Flex>
        )}
      />
    </Flex>
  );
}
