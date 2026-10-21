import { Card, Col, Flex, List, Row, Statistic, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { supportApi, supportKeys } from '../api/support.api';

/** CSAT & quality (M14.5): scores by agent and queue, the low-score follow-up queue, and QA sampling. */
export default function CsatPage() {
  const dashboard = useQuery({ queryKey: supportKeys.csatDashboard, queryFn: () => supportApi.csatDashboard() });
  const qa = useQuery({ queryKey: supportKeys.qaReviews({}), queryFn: () => supportApi.qaReviews({ pageSize: 50 }) });

  if (dashboard.isLoading) return <FullPageSpinner />;
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />;
  const d = dashboard.data.data;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="CSAT & quality"
        breadcrumbs={[{ label: 'Support' }, { label: 'CSAT' }]}
        subtitle="Sent to the customer on resolve. A lead samples resolved tickets against a rubric separately."
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Overall CSAT" value={d.overallAvg ?? '—'} suffix="/5" /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Response rate" value={d.responseRate} suffix="%" /></Card></Col>
        <Col xs={24} sm={12}><Card size="small"><Statistic title="Needs follow-up" value={d.lowScoreFollowUps.length} /></Card></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="By agent">
            <Table
              size="small" rowKey="agentName" pagination={false}
              dataSource={d.byAgent}
              columns={[
                { key: 'agentName', title: 'Agent', dataIndex: 'agentName' },
                { key: 'avg', title: 'Avg', dataIndex: 'avg', align: 'right', render: (v) => v ?? '—' },
                { key: 'count', title: 'Scored', dataIndex: 'count', align: 'right' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="By queue">
            <Table
              size="small" rowKey="queueName" pagination={false}
              dataSource={d.byQueue}
              columns={[
                { key: 'queueName', title: 'Queue', dataIndex: 'queueName' },
                { key: 'avg', title: 'Avg', dataIndex: 'avg', align: 'right', render: (v) => v ?? '—' },
                { key: 'count', title: 'Scored', dataIndex: 'count', align: 'right' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Low-score follow-up queue">
        <List
          size="small"
          dataSource={d.lowScoreFollowUps}
          locale={{ emptyText: 'Nothing needs following up' }}
          renderItem={(t) => (
            <List.Item>
              <Flex justify="space-between" style={{ width: '100%' }}>
                <Flex vertical gap={0}>
                  <Typography.Text style={{ fontSize: 13 }}>{t.subject} · {t.customerName}</Typography.Text>
                  {t.csatComment && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.csatComment}</Typography.Text>}
                </Flex>
                <Tag color="red">{t.csatScore}/5</Tag>
              </Flex>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="QA reviews">
        <Table
          size="small" rowKey="id" loading={qa.isLoading}
          pagination={{ pageSize: 10, size: 'small' }}
          dataSource={qa.data?.data ?? []}
          columns={[
            { key: 'ticketId', title: 'Ticket', dataIndex: 'ticketId', render: (v) => <Typography.Text className="mono" style={{ fontSize: 12 }}>{v}</Typography.Text> },
            { key: 'reviewerName', title: 'Reviewer', dataIndex: 'reviewerName' },
            { key: 'overallScore', title: 'Score', dataIndex: 'overallScore', align: 'right' },
            { key: 'notes', title: 'Notes', dataIndex: 'notes', ellipsis: true },
          ]}
        />
      </Card>
    </Flex>
  );
}
