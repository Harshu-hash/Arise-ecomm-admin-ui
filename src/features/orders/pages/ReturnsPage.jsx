import { Flex, Image, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { orderKeys } from '../api/orders.api';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

const FAULT_COLOR = { SELLER: 'red', CUSTOMER: 'default', COURIER: 'gold', UNKNOWN: 'default' };

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'RETURN_REQUESTED', label: 'Requested' },
  { key: 'RETURN_APPROVED', label: 'Pickup pending', codes: ['RETURN_APPROVED', 'PICKUP_SCHEDULED'] },
  { key: 'IN_TRANSIT_TO_ORIGIN', label: 'In transit', codes: ['PICKED_UP', 'IN_TRANSIT_TO_ORIGIN'] },
  { key: 'RECEIVED', label: 'QC pending' },
  { key: 'QC_FAILED', label: 'QC failed' },
  { key: 'CLOSED', label: 'Closed', codes: ['CLOSED', 'QC_PASSED'] },
  { key: 'RETURN_REJECTED', label: 'Rejected' },
];

export default function ReturnsPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: 'requestedAt' });

  const tabCodes = TABS.find((t) => t.key === state.tab)?.codes;
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: orderKeys.returns({ ...state.queryParams, tab: state.tab }),
    url: '/returns',
    params: {
      ...state.queryParams,
      ...(state.tab ? { status: (tabCodes ?? [state.tab]).join(',') } : {}),
    },
  });

  const columns = [
    {
      key: 'productName', title: 'Item', dataIndex: 'productName', alwaysVisible: true,
      render: (name, row) => (
        <Space size={8}>
          <Image src={row.image} alt="" width={32} height={32} preview={false} style={{ objectFit: 'cover', borderRadius: 4 }} fallback={BLANK} />
          <div style={{ minWidth: 0, maxWidth: 200 }}>
            <Typography.Text style={{ fontSize: 13 }} ellipsis>{name}</Typography.Text>
            <div>
              <Typography.Text className="mono" type="secondary" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
            </div>
          </div>
        </Space>
      ),
    },
    { key: 'customerName', title: 'Customer', dataIndex: 'customerName', sorter: true, priority: 2 },
    {
      key: 'type', title: 'Type', dataIndex: 'type', priority: 1,
      render: (v) => <Tag color={v === 'REPLACEMENT' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>{v.toLowerCase()}</Tag>,
    },
    { key: 'reason', title: 'Reason', dataIndex: 'reason', priority: 2 },
    {
      key: 'faultAttribution', title: 'Fault', dataIndex: 'faultAttribution', priority: 2,
      render: (v) => (
        <Tag color={FAULT_COLOR[v]} style={{ marginInlineEnd: 0 }}>{v.toLowerCase()}</Tag>
      ),
    },
    {
      key: 'amountPaise', title: 'Value', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'ageDays', title: 'Age', dataIndex: 'ageDays', sorter: true, align: 'right', priority: 2,
      render: (v) => (
        <Typography.Text className="tabular" type={v > 10 ? 'danger' : undefined}>{v}d</Typography.Text>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
      render: (v) => <StatusTag domain="returnRequest" code={v} />,
    },
    {
      key: 'qcResult', title: 'QC', dataIndex: 'qcResult', priority: 3,
      render: (v) =>
        v ? <Tag color={v === 'PASS' ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{v}</Tag>
          : <Typography.Text type="secondary">—</Typography.Text>,
    },
    { key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', priority: 3, defaultHidden: true },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Returns & replacements"
        breadcrumbs={[{ label: 'Orders' }, { label: 'Returns & replacements' }]}
        subtitle="Fault attribution decides who absorbs the reverse shipping cost. QC at the origin releases the refund."
      />

      <FilterBar
        schema={[
          {
            key: 'type', label: 'Type', kind: 'select', width: 160,
            options: [{ value: 'REFUND', label: 'Refund' }, { value: 'REPLACEMENT', label: 'Replacement' }],
          },
          {
            key: 'faultAttribution', label: 'Fault', kind: 'select', width: 150,
            options: [
              { value: 'SELLER', label: 'Seller' },
              { value: 'CUSTOMER', label: 'Customer' },
              { value: 'COURIER', label: 'Courier' },
            ],
          },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'requestedAt', label: 'Requested', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search return, order, customer or product"
      />

      <DataTable
        tableId="returns"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={TABS}
        onRowClick={(row) => navigate(`/returns/${row.id}`)}
        onExport={() => {}}
        exportPerm="orders.return.export"
        emptyProps={{ title: 'No returns match' }}
        mobileCard={(row) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong ellipsis>{row.productName}</Typography.Text>
              <StatusTag domain="returnRequest" code={row.status} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.customerName} · {row.reason}
            </Typography.Text>
            <Space size={8}>
              <MoneyText paise={row.amountPaise} strong />
              <Tag color={FAULT_COLOR[row.faultAttribution]} style={{ marginInlineEnd: 0 }}>
                {row.faultAttribution.toLowerCase()}
              </Tag>
            </Space>
          </Flex>
        )}
      />
    </Flex>
  );
}
