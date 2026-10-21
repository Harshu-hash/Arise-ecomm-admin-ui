import { Flex, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { warehouseKeys } from '@features/logistics/api/logistics.api';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'SUBMITTED', label: 'To book' },
  { key: 'APPOINTMENT_BOOKED', label: 'Booked' },
  { key: 'ARRIVED', label: 'At the dock', codes: ['ARRIVED', 'RECEIVING'] },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'MISSED', label: 'Missed' },
  { key: 'CLOSED', label: 'Closed' },
];

export default function InboundPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-createdAt' });

  const tabCodes = TABS.find((t) => t.key === state.tab)?.codes;
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: warehouseKeys.inbound({ ...state.queryParams, tab: state.tab }),
    url: '/inbound',
    params: {
      ...state.queryParams,
      ...(state.tab ? { status: (tabCodes ?? [state.tab]).join(',') } : {}),
    },
  });

  const columns = [
    {
      key: 'id', title: 'Consignment', dataIndex: 'id', alwaysVisible: true,
      render: (v, row) => (
        <div style={{ minWidth: 0 }}>
          <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{v}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.invoiceNo}</Typography.Text>
          </div>
        </div>
      ),
    },
    { key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', sorter: true, priority: 1 },
    {
      key: 'warehouseCode', title: 'Warehouse', dataIndex: 'warehouseCode', priority: 1,
      render: (v, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.warehouseName}</Typography.Text>
        </Space>
      ),
    },
    {
      key: 'declaredUnits', title: 'Declared', dataIndex: 'declaredUnits', sorter: true, align: 'right', priority: 1,
      render: (v, row) => (
        <Space direction="vertical" size={0} align="end">
          <span className="tabular">{v}</span>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {row.lineCount} SKU{row.lineCount === 1 ? '' : 's'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      key: 'receivedUnits', title: 'Received', dataIndex: 'receivedUnits', align: 'right', priority: 1,
      render: (v, row) =>
        ['RECEIVED', 'CLOSED'].includes(row.status) ? (
          <Space direction="vertical" size={0} align="end">
            <span className="tabular">{v}</span>
            {row.discrepancyUnits > 0 && (
              <Typography.Text type="danger" style={{ fontSize: 11 }}>
                {row.discrepancyUnits} short or damaged
              </Typography.Text>
            )}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      key: 'appointmentAt', title: 'Dock slot', dataIndex: 'appointmentAt', sorter: true, priority: 2,
      render: (v, row) =>
        v ? (
          <Space direction="vertical" size={0}>
            <DateText value={v} variant="date" />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.appointmentSlot}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Not booked</Typography.Text>
        ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
      render: (code, row) => (
        <Space direction="vertical" size={2}>
          <StatusTag domain="inbound" code={code} />
          {row.hasDiscrepancy && <Tag color="red" style={{ marginInlineEnd: 0 }}>Discrepancy</Tag>}
        </Space>
      ),
    },
    {
      key: 'createdAt', title: 'Raised', dataIndex: 'createdAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Inbound consignments"
        breadcrumbs={[{ label: 'Inventory & warehouses' }, { label: 'Inbound' }]}
        subtitle="Stock arriving from sellers. Nothing becomes sellable until the GRN is posted."
      />

      <FilterBar
        schema={[
          { key: 'warehouseId', label: 'Warehouse', kind: 'entity', entity: 'warehouse', width: 200 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'hasDiscrepancy', label: 'Has a discrepancy', kind: 'boolean' },
          { key: 'createdAt', label: 'Raised', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search consignment, seller or invoice"
      />

      <DataTable
        tableId="inbound"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={TABS}
        onRowClick={(row) => navigate(`/warehouses/inbound/${row.id}`)}
        emptyProps={{ title: 'No consignments', description: 'Sellers raise these when sending stock to a fulfilment centre.' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.id}</Typography.Text>
              <StatusTag domain="inbound" code={row.status} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sellerName} → {row.warehouseCode} · {row.declaredUnits} units
            </Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
