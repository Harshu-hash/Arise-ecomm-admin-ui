import { App, Alert, Button, Col, Flex, Row, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
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

/**
 * Cash the couriers have collected from customers and owe us.
 *
 * This is the platform's largest working-capital exposure: the money exists,
 * but it is in a courier's account, not ours. A remittance that is late or
 * short is chased here.
 */
export default function CodRemittancePage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-periodEnd' });
  const runExport = useExport('cod-remittances');
  const [disputing, setDisputing] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.cod({ ...state.queryParams, tab: state.tab }),
    url: '/cod-remittances',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const dispute = useMutation({
    mutationFn: ({ id, payload }) => financeApi.disputeRemittance(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setDisputing(null);
      message.success('Dispute raised with the courier');
    },
    onError: (e) => message.error(e.message),
  });

  const summary = meta?.summary;

  const columns = [
    { key: 'courierName', title: 'Courier', dataIndex: 'courierName', alwaysVisible: true },
    {
      key: 'period', title: 'Collection period', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} align="center">
          <DateText value={row.periodStart} variant="date" />
          <Typography.Text type="secondary">→</Typography.Text>
          <DateText value={row.periodEnd} variant="date" />
        </Flex>
      ),
    },
    {
      key: 'shipmentCount', title: 'Shipments', dataIndex: 'shipmentCount', align: 'right', priority: 3,
      render: (v) => <Typography.Text className="tabular" style={{ fontSize: 13 }}>{v}</Typography.Text>,
    },
    {
      key: 'expectedPaise', title: 'Expected', dataIndex: 'expectedPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'receivedPaise', title: 'Received', dataIndex: 'receivedPaise', align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    {
      key: 'differencePaise', title: 'Difference', dataIndex: 'differencePaise', sorter: true, align: 'right', priority: 1,
      render: (v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <MoneyText paise={v} colorBySign signed />
          {row.shortfallPct > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.shortfallPct}% short</Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2} align="flex-start">
          <StatusTag domain="codRemittance" code={v} />
          {row.overdue ? <Tag color="red" style={{ marginInlineEnd: 0 }}>overdue</Tag> : null}
        </Flex>
      ),
    },
    {
      key: 'dueAt', title: 'Due', dataIndex: 'dueAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'utr', title: 'Bank reference', dataIndex: 'utr', priority: 3,
      render: (v) =>
        v ? <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>
          : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['SHORT_PAID', 'EXPECTED'].includes(row.status) ? (
          <Can perm="finance.cod.dispute">
            <Button size="small" onClick={(e) => { e.stopPropagation(); setDisputing(row); }}>
              Dispute
            </Button>
          </Can>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="COD remittance"
        breadcrumbs={[{ label: 'Finance' }, { label: 'COD remittance' }]}
        subtitle="Cash collected at the door sits with the courier until it is remitted. Couriers are contracted to pay within 7 days of delivery."
      />

      {summary?.overdueCount ? (
        <Alert
          type="error"
          showIcon
          message={`${summary.overdueCount} remittances are past their due date`}
          description="Escalate with the courier’s finance contact before the next collection cycle adds to the exposure."
        />
      ) : null}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Cash still with couriers" valuePaise={summary?.outstandingPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Overdue" value={summary?.overdueCount} loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Short paid" value={summary?.shortPaidCount} loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          { key: 'courierId', label: 'Courier', kind: 'entity', entity: 'courier', width: 180 },
          { key: 'overdue', label: 'Overdue', kind: 'boolean' },
          { key: 'periodEnd', label: 'Period', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search courier or bank reference"
      />

      <DataTable
        tableId="codRemittances"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'EXPECTED', label: 'Expected' },
          { key: 'SHORT_PAID', label: 'Short paid' },
          { key: 'DISPUTED', label: 'Disputed' },
          { key: 'RECONCILED', label: 'Reconciled' },
        ]}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.cod.export"
        emptyProps={{ title: 'No remittances match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.courierName}</Typography.Text>
              <MoneyText paise={row.differencePaise} colorBySign signed />
            </Flex>
            <Flex justify="space-between" gap={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.shipmentCount} shipments
              </Typography.Text>
              <StatusTag domain="codRemittance" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(disputing)}
        onCancel={() => setDisputing(null)}
        onConfirm={(values) => dispute.mutate({ id: disputing.id, payload: { note: values.reason } })}
        loading={dispute.isPending}
        title={`Dispute ${disputing?.courierName}’s remittance`}
        description={
          disputing
            ? `${disputing.shipmentCount} shipments · expected ₹${(disputing.expectedPaise / 100).toLocaleString('en-IN')}`
            : ''
        }
        impact={
          <span>
            Raises a shortfall of <MoneyText paise={Math.abs(disputing?.differencePaise ?? 0)} strong /> with
            the courier. Attach the delivery scans when you send it on — a dispute without evidence is
            written off at the next reconciliation.
          </span>
        }
        reasonRequired
        reasonLabel="What is being disputed?"
        showNote={false}
        confirmLabel="Raise dispute"
      />
    </Flex>
  );
}
