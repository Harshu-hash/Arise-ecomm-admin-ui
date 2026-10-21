import { Flex, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeKeys } from '../api/finance.api';
import useExport from '../useExport';
import SettlementBreakdownDrawer from './SettlementBreakdownDrawer';

/**
 * One row per delivered item: what it sold for, what we took, what the seller
 * gets. Clicking a row opens the full breakdown, which is the answer finance
 * reads out when a seller disputes a deduction.
 */
export default function SettlementLinesTable() {
  const state = useUrlTableState({ defaultSort: '-deliveredAt' });
  const runExport = useExport('settlements');
  const [inspecting, setInspecting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.settlements(state.queryParams),
    url: '/settlements',
    params: state.queryParams,
  });

  const columns = [
    {
      key: 'productTitle', title: 'Item', dataIndex: 'productTitle', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 260 }}>{v}</Typography.Text>
          <Link to={`/orders/${row.orderId}`}>
            <Typography.Text className="mono" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
          </Link>
        </Flex>
      ),
    },
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', priority: 1,
      render: (v, row) => <Link to={`/sellers/${row.sellerId}`}>{v}</Link>,
    },
    {
      key: 'salePaise', title: 'Sold for', dataIndex: 'salePaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'commissionPaise', title: 'Commission', dataIndex: 'commissionPaise', sorter: true, align: 'right', priority: 2,
      render: (v, row) => (
        <Tooltip title={`${row.commissionPct}% of the sale`}>
          <span><MoneyText paise={-v} colorBySign /></span>
        </Tooltip>
      ),
    },
    {
      key: 'deductions', title: 'Other fees + tax', align: 'right', priority: 2,
      render: (_v, row) => (
        <MoneyText
          paise={-(row.feesBeforeTaxPaise - row.commissionPaise + row.gstOnFeesPaise + row.tcsPaise + row.tdsPaise)}
          colorBySign
        />
      ),
    },
    {
      key: 'netPaise', title: 'Seller receives', dataIndex: 'netPaise', sorter: true, align: 'right', priority: 1,
      render: (v, row) => <MoneyText paise={v} strong type={row.negative ? 'danger' : undefined} />,
    },
    {
      key: 'fulfillmentType', title: 'Fulfilled by', dataIndex: 'fulfillmentType', priority: 3,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v === 'ARISE' ? 'Arise' : 'Seller'}</Tag>,
    },
    {
      key: 'eligible', title: 'Payable', dataIndex: 'eligible', priority: 1,
      render: (v, row) =>
        v ? (
          <Tag color="green" style={{ marginInlineEnd: 0 }}>Payable</Tag>
        ) : (
          <Tooltip title={row.holdReason}>
            <Tag color="gold" style={{ marginInlineEnd: 0 }}>On hold</Tag>
          </Tooltip>
        ),
    },
    {
      key: 'batchId', title: 'Batch', dataIndex: 'batchId', priority: 2,
      render: (v) =>
        v ? (
          <Link to={`/finance/payouts/${v}`}>
            <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>
          </Link>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      key: 'deliveredAt', title: 'Delivered', dataIndex: 'deliveredAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <FilterBar
        schema={[
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'eligible', label: 'Payable', kind: 'boolean' },
          { key: 'unbatched', label: 'Not in a batch', kind: 'boolean' },
          {
            key: 'fulfillmentType', label: 'Fulfilled by', kind: 'select', width: 150,
            options: [{ value: 'SELLER', label: 'Seller' }, { value: 'ARISE', label: 'Arise' }],
          },
          {
            key: 'paymentMethod', label: 'Paid by', kind: 'select', width: 140,
            options: ['UPI', 'CARD', 'NETBANKING', 'COD'].map((v) => ({ value: v, label: v })),
          },
          { key: 'deliveredAt', label: 'Delivered', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search order, seller, product or SKU"
      />

      <DataTable
        tableId="settlementLines"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={setInspecting}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.payout.export"
        emptyProps={{ title: 'No settlement lines match these filters' }}
        toolbarLeft={
          meta?.summary ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              This page: <MoneyText paise={meta.summary.grossPaise} compact /> sold ·{' '}
              <MoneyText paise={meta.summary.netPaise} compact strong /> payable
            </Typography.Text>
          ) : null
        }
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text ellipsis style={{ fontSize: 13 }}>{row.productTitle}</Typography.Text>
              <MoneyText paise={row.netPaise} strong />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sellerName} · {row.eligible ? 'payable' : row.holdReason}
            </Typography.Text>
          </Flex>
        )}
      />

      <SettlementBreakdownDrawer line={inspecting} onClose={() => setInspecting(null)} />
    </Flex>
  );
}
