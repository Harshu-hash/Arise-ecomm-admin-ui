import { Col, Flex, Row, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
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
import { financeKeys } from '../api/finance.api';
import useExport from '../useExport';

/**
 * Every payment attempt, successful or not.
 *
 * COD is shown here as PENDING rather than hidden, because the money exists
 * as an obligation long before it reaches the bank — and the gap between the
 * two is what COD remittance reconciles.
 */
export default function PaymentsPage() {
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const runExport = useExport('payments');

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.payments({ ...state.queryParams, tab: state.tab }),
    url: '/payments',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'id', title: 'Payment', dataIndex: 'id', alwaysVisible: true,
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
    {
      key: 'customerName', title: 'Customer', dataIndex: 'customerName', priority: 2,
      render: (v, row) =>
        row.customerId
          ? <Link to={`/customers/${row.customerId}`}>{v}</Link>
          : <Typography.Text>{v}</Typography.Text>,
    },
    {
      key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    {
      key: 'refundedPaise', title: 'Refunded', dataIndex: 'refundedPaise', align: 'right', priority: 2,
      render: (v) => (v ? <MoneyText paise={v} type="danger" /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'settledPaise', title: 'Net', dataIndex: 'settledPaise', align: 'right', priority: 3,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'method', title: 'Method', dataIndex: 'method', priority: 1,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag>,
    },
    { key: 'gateway', title: 'Gateway', dataIndex: 'gateway', priority: 3 },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2}>
          <StatusTag domain="payment" code={v} />
          {row.failureReason ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.failureReason}</Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      key: 'txnRef', title: 'Gateway ref', dataIndex: 'txnRef', priority: 4,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
    },
    {
      key: 'createdAt', title: 'When', dataIndex: 'createdAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Payments"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
        subtitle="What the gateway captured, what failed, and what is still owed on cash orders."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Captured" valuePaise={summary?.capturedPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            label="Cash on delivery, not yet collected"
            valuePaise={summary?.pendingCodPaise}
            format="money"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Failed attempts" value={summary?.failedCount} loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          {
            key: 'method', label: 'Method', kind: 'multiSelect', width: 170,
            options: ['UPI', 'CARD', 'NETBANKING', 'COD', 'WALLET'].map((v) => ({ value: v, label: v })),
          },
          {
            key: 'gateway', label: 'Gateway', kind: 'select', width: 150,
            options: ['Razorpay', 'PayU', 'CASH'].map((v) => ({ value: v, label: v })),
          },
          { key: 'createdAt', label: 'Captured', kind: 'dateRange' },
          { key: 'amountPaise', label: 'Amount', kind: 'numberRange', money: true },
        ]}
        tableState={state}
        searchPlaceholder="Search payment, order or gateway reference"
      />

      <DataTable
        tableId="payments"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'CAPTURED', label: 'Captured' },
          { key: 'PENDING', label: 'Pending' },
          { key: 'FAILED', label: 'Failed' },
        ]}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.payment.export"
        emptyProps={{ title: 'No payments match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.orderId}</Typography.Text>
              <MoneyText paise={row.amountPaise} strong />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.method} · {row.customerName}
            </Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
