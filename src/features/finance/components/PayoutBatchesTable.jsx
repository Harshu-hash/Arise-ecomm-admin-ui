import { Flex, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import CopyableId from '@shared/components/CopyableId';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeKeys } from '../api/finance.api';

/** Weekly payout batches, newest first. */
export default function PayoutBatchesTable() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-periodEnd' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.batches(state.queryParams),
    url: '/payout-batches',
    params: state.queryParams,
  });

  const columns = [
    {
      key: 'id', title: 'Batch', dataIndex: 'id', alwaysVisible: true,
      render: (v) => <CopyableId value={v} strong />,
    },
    {
      key: 'period', title: 'Settlement period', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} align="center">
          <DateText value={row.periodStart} variant="date" />
          <Typography.Text type="secondary">→</Typography.Text>
          <DateText value={row.periodEnd} variant="date" />
        </Flex>
      ),
    },
    {
      key: 'sellerCount', title: 'Sellers', dataIndex: 'sellerCount', sorter: true, align: 'right', priority: 1,
      render: (v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <Typography.Text className="tabular" strong style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.lineCount} lines</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'grossPaise', title: 'Gross', dataIndex: 'grossPaise', align: 'right', priority: 3,
      render: (v) => <MoneyText paise={v} compact />,
    },
    {
      key: 'netPaise', title: 'Net paid out', dataIndex: 'netPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2} align="flex-start">
          <StatusTag domain="payoutBatch" code={v} />
          {row.failedCount ? (
            <Tag color="red" style={{ marginInlineEnd: 0 }}>{row.failedCount} transfers failed</Tag>
          ) : null}
        </Flex>
      ),
    },
    { key: 'createdByName', title: 'Built by', dataIndex: 'createdByName', priority: 3 },
    {
      key: 'approvedByName', title: 'Released by', dataIndex: 'approvedByName', priority: 2,
      render: (v) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'releasedAt', title: 'Released', dataIndex: 'releasedAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
  ];

  return (
    <DataTable
      tableId="payoutBatches"
      columns={columns}
      rows={rows}
      meta={meta}
      loading={loading || fetching}
      error={error}
      onRetry={refetch}
      tableState={state}
      onRowClick={(row) => navigate(`/finance/payouts/${row.id}`)}
      emptyProps={{
        title: 'No payout batches yet',
        description: 'Build one from the eligible settlements to start the weekly cycle.',
      }}
      mobileCard={(row) => (
        <Flex vertical gap={4}>
          <Flex justify="space-between" gap={8}>
            <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.id}</Typography.Text>
            <MoneyText paise={row.netPaise} strong />
          </Flex>
          <Flex justify="space-between" gap={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sellerCount} sellers
            </Typography.Text>
            <StatusTag domain="payoutBatch" code={row.status} showIcon={false} />
          </Flex>
        </Flex>
      )}
    />
  );
}
