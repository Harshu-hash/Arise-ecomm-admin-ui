import { Button, Flex, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Can } from '@core/rbac/Can';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeKeys } from '../api/finance.api';
import AdjustmentModal from './AdjustmentModal';
import PayoutHoldModal from './PayoutHoldModal';

const TYPE_LABEL = {
  PENALTY: 'Penalty',
  CLAIM_PAYOUT: 'Claim payout',
  AD_SPEND: 'Ad spend',
  SHORTFALL_RECOVERY: 'Shortfall recovery',
  GOODWILL: 'Goodwill',
  WEIGHT_DISPUTE: 'Weight dispute',
  MANUAL: 'Manual',
};

/**
 * Manual money movements against a seller's payout.
 *
 * An adjustment sits here until a batch sweeps it up — which is why the
 * status matters more than the date: "approved" means agreed but not yet
 * taken, and the seller has not felt it yet.
 */
export default function PayoutAdjustmentsTable() {
  const state = useUrlTableState({ defaultSort: '-raisedAt' });
  const [raising, setRaising] = useState(false);
  const [holding, setHolding] = useState(false);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.adjustments(state.queryParams),
    url: '/payout-adjustments',
    params: state.queryParams,
  });

  const columns = [
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', alwaysVisible: true,
      render: (v, row) => <Link to={`/sellers/${row.sellerId}`}>{v}</Link>,
    },
    {
      key: 'type', title: 'Type', dataIndex: 'type', priority: 1,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong signed colorBySign />,
    },
    {
      key: 'note', title: 'Why', dataIndex: 'note', priority: 2,
      render: (v) => (
        <Typography.Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>{v}</Typography.Text>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="payoutAdjustment" code={v} />,
    },
    {
      key: 'batchId', title: 'Applied in', dataIndex: 'batchId', priority: 2,
      render: (v) =>
        v ? (
          <Link to={`/finance/payouts/${v}`}>
            <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>
          </Link>
        ) : (
          <Typography.Text type="secondary">next batch</Typography.Text>
        ),
    },
    { key: 'raisedByName', title: 'Raised by', dataIndex: 'raisedByName', priority: 3 },
    {
      key: 'raisedAt', title: 'Raised', dataIndex: 'raisedAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <FilterBar
        schema={[
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          {
            key: 'type', label: 'Type', kind: 'multiSelect', width: 200,
            options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search seller or note"
        extra={
          <Space>
            <Can perm="finance.payout.hold">
              <Button onClick={() => setHolding(true)}>Hold or release a seller</Button>
            </Can>
            <Can perm="finance.payout.adjust">
              <Button type="primary" onClick={() => setRaising(true)}>Raise adjustment</Button>
            </Can>
          </Space>
        }
      />

      <DataTable
        tableId="payoutAdjustments"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No adjustments raised' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.sellerName}</Typography.Text>
              <MoneyText paise={row.amountPaise} strong signed colorBySign />
            </Flex>
            <Flex justify="space-between" gap={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {TYPE_LABEL[row.type] ?? row.type}
              </Typography.Text>
              <StatusTag domain="payoutAdjustment" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <AdjustmentModal open={raising} onClose={() => setRaising(false)} />
      <PayoutHoldModal open={holding} onClose={() => setHolding(false)} />
    </Flex>
  );
}
