import { App, Button, Card, Col, DatePicker, Flex, Form, Progress, Row, Select, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { dayjs } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeApi, financeKeys } from '../api/finance.api';
import useExport from '../useExport';

/**
 * Gateway reconciliation.
 *
 * Every payment we think we took is matched against the gateway's own
 * settlement file. The four mismatch buckets are deliberately kept apart,
 * because each one is a different problem: an amount mismatch is usually a
 * partial capture, a row missing at the gateway is a payment we recorded but
 * never actually received, and a row missing here is money sitting
 * unallocated.
 */
export default function ReconciliationPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-runAt' });
  const runExport = useExport('reconciliation');
  const [running, setRunning] = useState(false);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.reconciliation(state.queryParams),
    url: '/reconciliation',
    params: state.queryParams,
  });

  const run = useMutation({
    mutationFn: (payload) => financeApi.runReconciliation(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setRunning(false);
      message.success('Reconciliation started');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'gateway', title: 'Gateway', dataIndex: 'gateway', alwaysVisible: true,
      render: (v) => <Typography.Text strong style={{ fontSize: 13 }}>{v}</Typography.Text>,
    },
    {
      key: 'period', title: 'Period', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} align="center">
          <DateText value={row.periodStart} variant="date" />
          <Typography.Text type="secondary">→</Typography.Text>
          <DateText value={row.periodEnd} variant="date" />
        </Flex>
      ),
    },
    {
      key: 'matchedPct', title: 'Matched', dataIndex: 'matchedPct', sorter: true, priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2} style={{ minWidth: 120 }}>
          <Progress
            percent={v}
            size="small"
            showInfo={false}
            status={v === 100 ? 'success' : 'active'}
          />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {row.matched} of {row.totalRows} rows
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'amountMismatch', title: 'Amount differs', dataIndex: 'amountMismatch', align: 'right', priority: 2,
      render: (v) => <Count value={v} />,
    },
    {
      key: 'missingInGateway', title: 'Not at gateway', dataIndex: 'missingInGateway', align: 'right', priority: 2,
      render: (v) => <Count value={v} />,
    },
    {
      key: 'missingInArise', title: 'Not in Arise', dataIndex: 'missingInArise', align: 'right', priority: 2,
      render: (v) => <Count value={v} />,
    },
    {
      key: 'duplicates', title: 'Duplicates', dataIndex: 'duplicates', align: 'right', priority: 3,
      render: (v) => <Count value={v} />,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="reconciliation" code={v} />,
    },
    {
      key: 'runAt', title: 'Run', dataIndex: 'runAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Reconciliation"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Reconciliation' }]}
        subtitle="Matches what Arise recorded against the gateway’s settlement file. Anything unmatched is money we cannot account for."
        actions={
          <Can perm="finance.recon.create">
            <Button type="primary" onClick={() => setRunning(true)}>Run reconciliation</Button>
          </Can>
        }
      />

      <Row gutter={[12, 12]}>
        <Col span={24}>
          <Card size="small">
            <Flex gap={16} wrap>
              <Legend tone="gold" label="Amount differs" hint="Usually a partial capture or a gateway fee deducted at source." />
              <Legend tone="red" label="Not at gateway" hint="Recorded as captured here, but the gateway has no such payment." />
              <Legend tone="blue" label="Not in Arise" hint="The gateway took money we have no order for — refund or allocate it." />
              <Legend tone="purple" label="Duplicates" hint="The customer was charged twice; one capture must be refunded." />
            </Flex>
          </Card>
        </Col>
      </Row>

      <DataTable
        tableId="reconciliation"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.recon.export"
        emptyProps={{ title: 'No reconciliation runs yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.gateway}</Typography.Text>
              <StatusTag domain="reconciliation" code={row.status} showIcon={false} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.matchedPct}% matched · {row.unmatched} rows to review
            </Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={running}
        onCancel={() => setRunning(false)}
        onConfirm={(values) =>
          run.mutate({
            gateway: values.gateway,
            periodStart: values.period[0].startOf('day').toISOString(),
            periodEnd: values.period[1].endOf('day').toISOString(),
          })
        }
        loading={run.isPending}
        title="Run a reconciliation"
        description="Matches captured payments in the period against the gateway’s settlement file."
        impact="Reconciliation only reports differences. Nothing is refunded, written off or adjusted automatically."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Start run"
        extraFields={
          <>
            <Form.Item name="gateway" label="Gateway" initialValue="Razorpay" rules={[{ required: true }]}>
              <Select options={['Razorpay', 'PayU'].map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item
              name="period"
              label="Period"
              initialValue={[dayjs().subtract(7, 'day'), dayjs()]}
              rules={[{ required: true, message: 'Choose the period to reconcile.' }]}
            >
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </>
        }
      />
    </Flex>
  );
}

function Count({ value }) {
  return value
    ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>{value}</Tag>
    : <Typography.Text type="secondary">—</Typography.Text>;
}

function Legend({ tone, label, hint }) {
  return (
    <Flex vertical gap={2} style={{ flex: '1 1 200px', minWidth: 180 }}>
      <Tag color={tone} style={{ marginInlineEnd: 0, width: 'fit-content' }}>{label}</Tag>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>{hint}</Typography.Text>
    </Flex>
  );
}
