import { App, Button, Card, Col, Drawer, Flex, Form, Input, Row, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { settingsApi, settingsKeys } from '../api/settings.api';

const STATUS_COLOR = { CONNECTED: 'green', ERROR: 'red', NOT_CONFIGURED: 'default' };
const STATUS_LABEL = { CONNECTED: 'Connected', ERROR: 'Error', NOT_CONFIGURED: 'Not configured' };

/** Integrations (M17.7): connection health per provider, and credential changes — the one guarded action here. */
export default function IntegrationsPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: settingsKeys.integrations, queryFn: () => settingsApi.integrations() });
  const [editingCreds, setEditingCreds] = useState(null);
  const [viewingLog, setViewingLog] = useState(null);

  const webhooks = useQuery({
    queryKey: settingsKeys.webhooks(viewingLog?.key, {}),
    queryFn: () => settingsApi.webhooks(viewingLog.key, { pageSize: 50 }),
    enabled: Boolean(viewingLog),
  });

  const setCreds = useMutation({
    mutationFn: ({ key, credentials, reason }) => settingsApi.setCredentials(key, { credentials, reason }),
    onSuccess: () => {
      query.refetch();
      setEditingCreds(null);
      message.info('Sent for approval. The connection updates once another admin agrees.');
    },
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const integrations = query.data.data;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Integrations"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Integrations' }]}
        subtitle="Credentials are write-only — once saved, they are never shown again."
      />

      <Row gutter={[12, 12]}>
        {integrations.map((i) => (
          <Col key={i.id} xs={24} sm={12} lg={8}>
            <Card size="small" title={i.label} extra={<Tag color={STATUS_COLOR[i.status]} style={{ marginInlineEnd: 0 }}>{STATUS_LABEL[i.status]}</Tag>}>
              <Flex vertical gap={6}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{i.category}</Typography.Text>
                <Flex justify="space-between"><Typography.Text style={{ fontSize: 13 }}>Last success</Typography.Text><DateText value={i.lastSuccessAt} /></Flex>
                <Flex justify="space-between">
                  <Typography.Text style={{ fontSize: 13 }}>Error rate</Typography.Text>
                  <Typography.Text type={i.errorRatePct > 5 ? 'danger' : undefined} style={{ fontSize: 13 }}>{i.errorRatePct}%</Typography.Text>
                </Flex>
                <Flex justify="space-between"><Typography.Text style={{ fontSize: 13 }}>Credentials set</Typography.Text><DateText value={i.credentialsSetAt} /></Flex>
                <Flex gap={8} style={{ marginTop: 4 }}>
                  <Button size="small" onClick={() => setViewingLog(i)}>Webhook log</Button>
                  <Can perm="admin.integration.edit">
                    <Button size="small" onClick={() => setEditingCreds(i)}>
                      {i.status === 'NOT_CONFIGURED' ? 'Connect' : 'Change credentials'}
                    </Button>
                  </Can>
                </Flex>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>

      <ConfirmActionModal
        open={Boolean(editingCreds)}
        onCancel={() => setEditingCreds(null)}
        onConfirm={(v) => setCreds.mutate({ key: editingCreds.key, credentials: { apiKey: v.apiKey, apiSecret: v.apiSecret }, reason: v.reason })}
        loading={setCreds.isPending}
        needsApproval
        title={`${editingCreds?.status === 'NOT_CONFIGURED' ? 'Connect' : 'Change credentials for'} ${editingCreds?.label}`}
        impact="The new credentials take effect once another admin agrees, and the old ones are discarded — there is no going back to them."
        reasonRequired
        reasonLabel="Why is this changing?"
        showNote={false}
        confirmLabel="Request change"
        extraFields={
          <>
            <Form.Item name="apiKey" label="API key" rules={[{ required: true, message: 'Required.' }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="apiSecret" label="API secret">
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </>
        }
      />

      <Drawer open={Boolean(viewingLog)} onClose={() => setViewingLog(null)} title={`${viewingLog?.label} — webhook log`} width={520}>
        <Table
          size="small" rowKey="id" pagination={{ pageSize: 10, size: 'small' }}
          dataSource={webhooks.data?.data ?? []}
          loading={webhooks.isLoading}
          columns={[
            { key: 'at', title: 'Time', dataIndex: 'at', render: (v) => <DateText value={v} /> },
            { key: 'event', title: 'Event', dataIndex: 'event' },
            { key: 'status', title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'SUCCESS' ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{v}</Tag> },
            { key: 'payloadPreview', title: 'Payload', dataIndex: 'payloadPreview', render: (v) => <Typography.Text code style={{ fontSize: 11 }}>{v}</Typography.Text> },
          ]}
        />
      </Drawer>
    </Flex>
  );
}
