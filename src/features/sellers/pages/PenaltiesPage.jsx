import { App, Button, Flex, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { ApiError } from '@core/api/errors';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { sellerKeys, sellerOpsApi } from '../api/sellers.api';

const VIOLATIONS = [
  { value: 'SELLER_CANCELLATION', label: 'Seller cancellation' },
  { value: 'LATE_DISPATCH', label: 'Late dispatch' },
  { value: 'WRONG_PRODUCT', label: 'Wrong product delivered' },
  { value: 'COUNTERFEIT', label: 'Counterfeit complaint' },
  { value: 'FAKE_TRACKING', label: 'Fake tracking' },
];

const STATUS_COLOR = { APPLIED: 'default', DISPUTED: 'gold', WAIVED: 'green', RECOVERED: 'blue' };

export default function PenaltiesPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-appliedAt' });
  const [waiving, setWaiving] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: sellerKeys.penalties({ ...state.queryParams, tab: state.tab }),
    url: '/penalties',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const waive = useMutation({
    mutationFn: ({ id, reason }) => sellerOpsApi.waivePenalty(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
      setWaiving(null);
      message.info('Waiver sent for approval.');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        setWaiving(null);
        message.info('Waiver sent for approval. It applies once another admin approves it.');
        return;
      }
      message.error(e.message);
    },
  });

  const columns = [
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <Link to={`/sellers/${row.sellerId}`}>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
        </Link>
      ),
    },
    { key: 'violationLabel', title: 'Violation', dataIndex: 'violationLabel', priority: 1 },
    {
      key: 'orderId', title: 'Order', dataIndex: 'orderId', priority: 3,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
    },
    {
      key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    { key: 'appliedAt', title: 'Applied', dataIndex: 'appliedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} /> },
    {
      key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
      render: (v, row) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_COLOR[v]} style={{ marginInlineEnd: 0, width: 'fit-content' }}>{v}</Tag>
          {v === 'DISPUTED' && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.disputeReason}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['APPLIED', 'DISPUTED'].includes(row.status) ? (
          <Can perm="sellers.penalty.waive">
            <Button size="small" onClick={(e) => { e.stopPropagation(); setWaiving(row); }}>
              Waive
            </Button>
          </Can>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Penalties"
        breadcrumbs={[{ label: 'Sellers' }, { label: 'Penalties' }]}
        subtitle="Charges raised against sellers for policy violations."
        meta={
          meta?.totals && (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                <MoneyText paise={meta.totals.appliedPaise} compact /> currently applied
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {meta.totals.disputed} disputed
              </Typography.Text>
            </>
          )
        }
      />

      <FilterBar
        schema={[
          { key: 'violationCode', label: 'Violation', kind: 'multiSelect', options: VIOLATIONS, width: 220 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 200 },
          { key: 'appliedAt', label: 'Applied', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search seller, order or violation"
      />

      <DataTable
        tableId="penalties"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'APPLIED', label: 'Applied' },
          { key: 'DISPUTED', label: 'Disputed' },
          { key: 'WAIVED', label: 'Waived' },
          { key: 'RECOVERED', label: 'Recovered' },
        ]}
        onExport={() => {}}
        exportPerm="sellers.penalty.export"
        emptyProps={{ title: 'No penalties match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.sellerName}</Typography.Text>
              <MoneyText paise={row.amountPaise} strong />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.violationLabel}</Typography.Text>
            <Tag color={STATUS_COLOR[row.status]} style={{ marginInlineEnd: 0, width: 'fit-content' }}>{row.status}</Tag>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(waiving)}
        onCancel={() => setWaiving(null)}
        onConfirm={(values) => waive.mutate({ id: waiving.id, reason: values.reason })}
        loading={waive.isPending}
        needsApproval
        title={`Waive this penalty on ${waiving?.sellerName}?`}
        description={waiving?.violationLabel}
        impact={
          <span>
            <MoneyText paise={waiving?.amountPaise ?? 0} strong /> is returned to the seller at the
            next payout.
          </span>
        }
        reasons={[
          'Courier was at fault, not the seller',
          'Customer cancelled, wrongly attributed',
          'Evidence does not support the penalty',
          'Goodwill for a long-standing seller',
          'Other',
        ]}
        confirmLabel="Send for approval"
      />
    </Flex>
  );
}
