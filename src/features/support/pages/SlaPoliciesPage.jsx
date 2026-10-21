import { App, Card, Flex, InputNumber, Switch, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Can } from '@core/rbac/Can';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { supportApi, supportKeys } from '../api/support.api';

/** SLA policies & routing (M14.4): first-response and resolution targets per priority/queue, and the routing rules that assign a queue. */
export default function SlaPoliciesPage() {
  const { message } = App.useApp();
  const policies = useQuery({ queryKey: supportKeys.slaPolicies, queryFn: () => supportApi.slaPolicies() });
  const rules = useQuery({ queryKey: supportKeys.routingRules, queryFn: () => supportApi.routingRules() });
  const queues = useQuery({ queryKey: supportKeys.queues, queryFn: () => supportApi.queues() });
  const queueName = (id) => queues.data?.data.find((q) => q.id === id)?.name ?? id;

  const updatePolicy = useMutation({
    mutationFn: ({ id, payload }) => supportApi.updateSlaPolicy(id, payload),
    onSuccess: () => policies.refetch(),
    onError: (e) => message.error(e.message),
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, active }) => supportApi.updateRoutingRule(id, { active }),
    onSuccess: () => rules.refetch(),
    onError: (e) => message.error(e.message),
  });

  if (policies.isLoading || rules.isLoading) return <FullPageSpinner />;
  if (policies.error) return <ErrorState error={policies.error} onRetry={policies.refetch} />;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="SLA policies & routing"
        breadcrumbs={[{ label: 'Support' }, { label: 'SLA policies' }]}
        subtitle="Minutes to first response and to resolution, by priority — with an optional override for a specific queue."
      />

      <Card size="small" title="SLA targets">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={policies.data.data}
          columns={[
            { key: 'priority', title: 'Priority', dataIndex: 'priority', render: (v) => <StatusTag domain="priority" code={v} showIcon={false} /> },
            {
              key: 'queueId', title: 'Scope', dataIndex: 'queueId',
              render: (v) => (v ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>Queue override</Tag> : <Tag style={{ marginInlineEnd: 0 }}>Default</Tag>),
            },
            {
              key: 'firstResponseMins', title: 'First response (min)', dataIndex: 'firstResponseMins',
              render: (v, row) => (
                <Can perm="support.sla.edit" disable>
                  <InputNumber
                    size="small" min={1} value={v}
                    onBlur={(e) => Number(e.target.value) !== v && updatePolicy.mutate({ id: row.id, payload: { firstResponseMins: Number(e.target.value) } })}
                  />
                </Can>
              ),
            },
            {
              key: 'resolutionMins', title: 'Resolution (min)', dataIndex: 'resolutionMins',
              render: (v, row) => (
                <Can perm="support.sla.edit" disable>
                  <InputNumber
                    size="small" min={1} value={v}
                    onBlur={(e) => Number(e.target.value) !== v && updatePolicy.mutate({ id: row.id, payload: { resolutionMins: Number(e.target.value) } })}
                  />
                </Can>
              ),
            },
            { key: 'escalateAtPct', title: 'Escalate at', dataIndex: 'escalateAtPct', render: (v) => `${v}%` },
          ]}
        />
      </Card>

      <Card size="small" title="Routing rules">
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          A new ticket is routed by the first matching rule, top to bottom.
        </Typography.Paragraph>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={rules.data.data}
          columns={[
            { key: 'order', title: '#', dataIndex: 'order', width: 40, render: (v) => v + 1 },
            { key: 'name', title: 'Rule', dataIndex: 'name' },
            {
              key: 'conditions', title: 'Condition', dataIndex: 'conditions',
              render: (v) => (v.subject ? <Tag style={{ marginInlineEnd: 0 }}>subject = {v.subject}</Tag> : <Tag style={{ marginInlineEnd: 0 }}>any ticket</Tag>),
            },
            {
              key: 'queueId', title: 'Queue', dataIndex: 'queueId',
              render: (v) => queueName(v),
            },
            {
              key: 'active', title: 'Active', dataIndex: 'active', width: 80,
              render: (v, row) => (
                <Can perm="support.queue.manage" disable>
                  <Switch size="small" checked={v} onChange={(active) => toggleRule.mutate({ id: row.id, active })} />
                </Can>
              ),
            },
          ]}
        />
      </Card>
    </Flex>
  );
}
