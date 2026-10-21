import { App, Button, Col, Flex, Row, Space, Tag, Tooltip, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import CopyableId from '@shared/components/CopyableId';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeApi, financeKeys } from '../api/finance.api';
import useExport from '../useExport';
import RefundModeModal from '../components/RefundModeModal';

const MODE_LABEL = {
  ORIGINAL: 'Back to source',
  WALLET: 'Arise wallet',
  BANK: 'Bank transfer',
};

/**
 * The refund queue.
 *
 * A refund that has failed or is waiting on bank details is money the
 * customer is owed and has not received, so those two states lead the tabs
 * rather than sitting behind a filter.
 */
export default function RefundsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-initiatedAt' });
  const runExport = useExport('refunds');
  const [retrying, setRetrying] = useState(null);
  const [switching, setSwitching] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.refunds({ ...state.queryParams, tab: state.tab }),
    url: '/refunds',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance'] });

  const retry = useMutation({
    mutationFn: (id) => financeApi.retryRefund(id),
    onSuccess: () => {
      invalidate();
      setRetrying(null);
      message.success('Refund re-submitted to the gateway');
    },
    onError: (e) => message.error(e.message),
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'id', title: 'Refund', dataIndex: 'id', alwaysVisible: true,
      render: (v) => <CopyableId value={v} />,
    },
    {
      key: 'orderId', title: 'Order', dataIndex: 'orderId', priority: 1,
      render: (v) => (
        <Link to={`/orders/${v}`}>
          <Typography.Text className="mono" style={{ fontSize: 12 }}>{v}</Typography.Text>
        </Link>
      ),
    },
    { key: 'customerName', title: 'Customer', dataIndex: 'customerName', priority: 2 },
    {
      key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    {
      key: 'type', title: 'Reason', dataIndex: 'type', priority: 3,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ').toLowerCase()}</Tag>,
    },
    {
      key: 'mode', title: 'Paid to', dataIndex: 'mode', priority: 2,
      render: (v) => <Typography.Text style={{ fontSize: 13 }}>{MODE_LABEL[v] ?? v}</Typography.Text>,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2}>
          <StatusTag domain="refund" code={v} tooltip={row.failureReason ?? undefined} />
          {row.arn ? (
            <Typography.Text type="secondary" className="mono" style={{ fontSize: 10 }}>{row.arn}</Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      key: 'ageDays', title: 'Age', dataIndex: 'ageDays', sorter: true, align: 'right', priority: 2,
      render: (v, row) =>
        row.slaBreached ? (
          <Tooltip title="Past the 7-day refund promise shown to the customer">
            <Tag color="red" style={{ marginInlineEnd: 0 }}>{v} days</Tag>
          </Tooltip>
        ) : (
          <Typography.Text className="tabular" style={{ fontSize: 12 }}>{v} days</Typography.Text>
        ),
    },
    {
      key: 'initiatedAt', title: 'Initiated', dataIndex: 'initiatedAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          {row.status === 'FAILED' ? (
            <Can perm="finance.refund.retry">
              <Button size="small" onClick={() => setRetrying(row)}>Retry</Button>
            </Can>
          ) : null}
          {!['COMPLETED'].includes(row.status) ? (
            <Can perm="finance.refund.switch_mode">
              <Button size="small" type="text" onClick={() => setSwitching(row)}>Change mode</Button>
            </Can>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Refunds"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Refunds' }]}
        subtitle="Money owed back to customers. A failed refund is a complaint that has not arrived yet."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Owed and not yet paid" valuePaise={summary?.pendingPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Failed at the gateway" value={summary?.failedCount} loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Past the 7-day promise" value={summary?.breachedCount} loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          {
            key: 'type', label: 'Reason', kind: 'multiSelect', width: 190,
            options: ['CANCELLATION', 'RETURN', 'GOODWILL', 'MANUAL'].map((v) => ({
              value: v, label: v.toLowerCase(),
            })),
          },
          {
            key: 'mode', label: 'Paid to', kind: 'select', width: 170,
            options: Object.entries(MODE_LABEL).map(([value, label]) => ({ value, label })),
          },
          { key: 'slaBreached', label: 'Past promise', kind: 'boolean' },
          { key: 'initiatedAt', label: 'Initiated', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search refund, order, ARN or customer"
      />

      <DataTable
        tableId="refunds"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'FAILED', label: 'Failed' },
          { key: 'PENDING_DETAILS', label: 'Awaiting details' },
          { key: 'INITIATED', label: 'Initiated' },
          { key: 'PROCESSING', label: 'Processing' },
          { key: 'COMPLETED', label: 'Completed' },
        ]}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.refund.export"
        emptyProps={{ title: 'No refunds match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.orderId}</Typography.Text>
              <MoneyText paise={row.amountPaise} strong />
            </Flex>
            <Flex justify="space-between" gap={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {MODE_LABEL[row.mode] ?? row.mode} · {row.ageDays} days
              </Typography.Text>
              <StatusTag domain="refund" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(retrying)}
        onCancel={() => setRetrying(null)}
        onConfirm={() => retry.mutate(retrying.id)}
        loading={retry.isPending}
        title="Re-submit this refund"
        description={`${retrying?.id} · ${retrying?.customerName}`}
        impact={
          <span>
            <MoneyText paise={retrying?.amountPaise ?? 0} strong /> goes back to the gateway. If the
            details that caused the failure have not changed, it will fail again — consider changing
            the refund mode instead.
          </span>
        }
        reasonRequired={false}
        reasonLabel="Note"
        showNote={false}
        confirmLabel="Retry refund"
      />

      <RefundModeModal
        refund={switching}
        onClose={() => setSwitching(null)}
        onDone={() => {
          invalidate();
          setSwitching(null);
        }}
      />
    </Flex>
  );
}
