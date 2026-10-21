import { Card, Col, Drawer, Flex, Image, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber } from '@core/utils/money';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { warehouseApi, warehouseKeys } from '@features/logistics/api/logistics.api';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const STOCK_COLOR = { OUT: 'red', LOW: 'gold', OK: undefined };
const AGE_LABEL = { D0_90: '0–90 days', D91_180: '91–180', D181_365: '181–365', OVER_365: 'Over a year' };

export default function InventoryPage() {
  const state = useUrlTableState({ defaultSort: 'daysOfCover' });
  const [ledgerFor, setLedgerFor] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: warehouseKeys.inventory({ ...state.queryParams, tab: state.tab }),
    url: '/inventory',
    params: { ...state.queryParams, ...(state.tab ? { stockStatus: state.tab } : {}) },
  });

  const ledger = useQuery({
    queryKey: warehouseKeys.ledger(ledgerFor?.id),
    queryFn: () => warehouseApi.inventoryLedger(ledgerFor.id),
    enabled: Boolean(ledgerFor?.id),
  });

  const columns = [
    {
      key: 'sku', title: 'SKU', dataIndex: 'sku', sorter: true, alwaysVisible: true,
      render: (sku, row) => (
        <Space size={8}>
          <Image src={row.image} alt="" width={30} height={30} preview={false} style={{ objectFit: 'cover', borderRadius: 4 }} fallback={BLANK} />
          <div style={{ minWidth: 0, maxWidth: 200 }}>
            <Typography.Text className="mono" style={{ fontSize: 11 }}>{sku}</Typography.Text>
            <div>
              <Typography.Text style={{ fontSize: 12 }} ellipsis>{row.productTitle}</Typography.Text>
            </div>
          </div>
        </Space>
      ),
    },
    { key: 'warehouseCode', title: 'Site', dataIndex: 'warehouseCode', priority: 1 },
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', priority: 3,
      render: (name, row) => <Link to={`/sellers/${row.sellerId}`}>{name}</Link>,
    },
    {
      key: 'sellable', title: 'Sellable', dataIndex: 'sellable', sorter: true, align: 'right', priority: 1,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'reserved', title: 'Reserved', dataIndex: 'reserved', sorter: true, align: 'right', priority: 2,
      render: (v) => <Typography.Text type="secondary" className="tabular">{v}</Typography.Text>,
    },
    {
      key: 'available', title: 'Available', dataIndex: 'available', sorter: true, align: 'right', priority: 1,
      render: (v, row) => (
        <Typography.Text className="tabular" strong type={STOCK_COLOR[row.stockStatus] === 'red' ? 'danger' : undefined}>
          {v}
        </Typography.Text>
      ),
    },
    {
      key: 'daysOfCover', title: 'Days of cover', dataIndex: 'daysOfCover', sorter: true, align: 'right', priority: 1,
      render: (v) =>
        v === null ? <Typography.Text type="secondary">—</Typography.Text> : (
          <Typography.Text className="tabular" type={v < 7 ? 'danger' : v < 14 ? 'warning' : undefined}>
            {v}d
          </Typography.Text>
        ),
    },
    {
      key: 'unsellable', title: 'Damaged', dataIndex: 'unsellable', align: 'right', priority: 3,
      render: (v) => (v ? <Typography.Text type="danger" className="tabular">{v}</Typography.Text> : '—'),
    },
    {
      key: 'returnsPendingQc', title: 'In returns QC', dataIndex: 'returnsPendingQc', align: 'right', priority: 3, defaultHidden: true,
      render: (v) => <span className="tabular">{v}</span>,
    },
    {
      key: 'oldestUnitDays', title: 'Oldest unit', dataIndex: 'oldestUnitDays', sorter: true, align: 'right', priority: 2,
      render: (v, row) => (
        <Space direction="vertical" size={0} align="end">
          <Typography.Text className="tabular" type={v > 365 ? 'danger' : v > 180 ? 'warning' : undefined}>
            {v}d
          </Typography.Text>
          {v > 180 && (
            <Typography.Text type="secondary" style={{ fontSize: 10 }}>{AGE_LABEL[row.ageBucket]}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      key: 'stockStatus', title: 'Status', dataIndex: 'stockStatus', priority: 1,
      render: (v) => (
        <Tag color={STOCK_COLOR[v]} style={{ marginInlineEnd: 0 }}>
          {v === 'OUT' ? 'Out of stock' : v === 'LOW' ? 'Low' : 'In stock'}
        </Tag>
      ),
    },
  ];

  const totals = meta?.totals ?? {};

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Inventory"
        breadcrumbs={[{ label: 'Inventory & warehouses' }, { label: 'Inventory' }]}
        subtitle="Stock in Arise warehouses. Available is what can actually be sold — sellable minus what is already reserved."
      />

      <Row gutter={[12, 12]}>
        {[
          ['SKUs', formatNumber(totals.skus ?? 0)],
          ['Units on hand', formatNumber(totals.units ?? 0)],
          ['Low stock', totals.lowStock ?? 0],
          ['Out of stock', totals.outOfStock ?? 0],
          ['Aged over 180 days', totals.agedOver180 ?? 0],
        ].map(([title, value]) => (
          <Col key={title} xs={12} md={8} xl={4}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{title}</Typography.Text>}
                value={value}
                valueStyle={{ fontSize: 19 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <FilterBar
        schema={[
          { key: 'warehouseId', label: 'Warehouse', kind: 'entity', entity: 'warehouse', width: 200 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'categoryId', label: 'Category', kind: 'entity', entity: 'category', width: 190 },
          {
            key: 'ageBucket', label: 'Stock age', kind: 'select', width: 170,
            options: Object.entries(AGE_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search SKU, product or seller"
      />

      <DataTable
        tableId="inventory"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        facetField="stockStatus"
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'OUT', label: 'Out of stock' },
          { key: 'LOW', label: 'Low' },
          { key: 'OK', label: 'In stock' },
        ]}
        onRowClick={(row) => setLedgerFor(row)}
        onExport={() => {}}
        exportPerm="warehouse.inventory.export"
        emptyProps={{ title: 'No stock matches' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong ellipsis>{row.productTitle}</Typography.Text>
              <Tag color={STOCK_COLOR[row.stockStatus]} style={{ marginInlineEnd: 0 }}>{row.available}</Tag>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sku} · {row.warehouseCode}
            </Typography.Text>
          </Flex>
        )}
      />

      <Drawer
        open={Boolean(ledgerFor)}
        onClose={() => setLedgerFor(null)}
        width={560}
        title={ledgerFor ? `Movements — ${ledgerFor.sku}` : ''}
      >
        {ledger.isLoading ? (
          <FullPageSpinner label="Loading movements…" />
        ) : (
          <Flex vertical gap={12}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Every movement in and out, so a count can be reconciled against what the system thinks.
            </Typography.Text>
            <Table
              size="small"
              rowKey="id"
              pagination={{ pageSize: 15, size: 'small' }}
              dataSource={ledger.data?.meta?.entries ?? []}
              locale={{ emptyText: 'No movements recorded' }}
              columns={[
                { title: 'When', dataIndex: 'at', render: (v) => <DateText value={v} /> },
                {
                  title: 'Type', dataIndex: 'type',
                  render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v.toLowerCase()}</Tag>,
                },
                {
                  title: 'Qty', dataIndex: 'qty', align: 'right',
                  render: (v) => (
                    <Typography.Text className="tabular" type={v < 0 ? 'danger' : 'success'}>
                      {v > 0 ? `+${v}` : v}
                    </Typography.Text>
                  ),
                },
                { title: 'Balance', dataIndex: 'balanceAfter', align: 'right', render: (v) => <span className="tabular">{v}</span> },
                { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
              ]}
            />
          </Flex>
        )}
      </Drawer>
    </Flex>
  );
}
