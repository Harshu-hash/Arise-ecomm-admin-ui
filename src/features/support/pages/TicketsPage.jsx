import { Flex, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { slaCountdown } from '@core/utils/date';
import { supportApi, supportKeys } from '../api/support.api';

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My open' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'breaching', label: 'Breaching SLA' },
];

/** Ticket queues & inbox (M14.1): a queue-scoped agent only ever sees their own queues' tickets. */
export default function TicketsPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-createdAt', defaultTab: 'all' });

  const queues = useQuery({ queryKey: supportKeys.queues, queryFn: () => supportApi.queues() });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: supportKeys.tickets({ ...state.queryParams, view: state.tab }),
    url: '/tickets',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { view: state.tab } : {}) },
  });

  const columns = [
    {
      key: 'id', title: 'Ticket', dataIndex: 'id', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{v}</Typography.Text>
          <Typography.Text style={{ fontSize: 12 }} ellipsis>{row.subject}</Typography.Text>
        </Flex>
      ),
    },
    { key: 'customerName', title: 'Requester', dataIndex: 'customerName', priority: 1 },
    {
      key: 'orderId', title: 'Order', dataIndex: 'orderId', priority: 3,
      render: (v) => v ? <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'priority', title: 'Priority', dataIndex: 'priority', priority: 1,
      render: (v) => <StatusTag domain="priority" code={v} showIcon={false} />,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="ticket" code={v} />,
    },
    { key: 'assigneeName', title: 'Assignee', dataIndex: 'assigneeName', priority: 2, render: (v) => v ?? <Typography.Text type="secondary">Unassigned</Typography.Text> },
    {
      key: 'sla', title: 'SLA', priority: 1,
      render: (_v, row) => {
        if (['RESOLVED', 'CLOSED'].includes(row.status)) return <Typography.Text type="secondary">—</Typography.Text>;
        const c = slaCountdown(row.resolutionDueAt);
        return <Tag color={c.overdue ? 'red' : 'default'} style={{ marginInlineEnd: 0 }}>{c.label}</Tag>;
      },
    },
    { key: 'channel', title: 'Channel', dataIndex: 'channel', priority: 3 },
    {
      key: 'csatScore', title: 'CSAT', dataIndex: 'csatScore', priority: 3,
      render: (v) => v ? <Typography.Text className="tabular">{v}/5</Typography.Text> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'createdAt', title: 'Last update', dataIndex: 'createdAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Ticket queues"
        breadcrumbs={[{ label: 'Support' }, { label: 'Tickets' }]}
        subtitle="Every ticket a customer, seller or live chat has raised. Scoped to the queues you are assigned to."
      />

      <FilterBar
        schema={[
          {
            key: 'queueId', label: 'Queue', kind: 'select', width: 180,
            options: (queues.data?.data ?? []).map((q) => ({ value: q.id, label: q.name })),
          },
          {
            key: 'priority', label: 'Priority', kind: 'multiSelect', width: 150,
            options: ['LOW', 'MEDIUM', 'HIGH'].map((v) => ({ value: v, label: v })),
          },
          {
            key: 'channel', label: 'Channel', kind: 'select', width: 150,
            options: ['APP', 'LIVE_CHAT', 'SELLER_PANEL'].map((v) => ({ value: v, label: v })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search ticket, subject, requester or order"
      />

      <DataTable
        tableId="tickets"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => navigate(`/support/tickets/${row.id}`)}
        tabs={VIEWS}
        emptyProps={{ title: 'No tickets match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.id}</Typography.Text>
              <StatusTag domain="ticket" code={row.status} showIcon={false} />
            </Flex>
            <Typography.Text style={{ fontSize: 13 }} ellipsis>{row.subject}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.customerName}</Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
