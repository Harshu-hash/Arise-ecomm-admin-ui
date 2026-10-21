import { App, Button, Card, Col, Flex, Form, Input, List, Row, Select, Statistic, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import PageHeader from '@shared/components/PageHeader';
import { supportApi, supportKeys } from '../api/support.api';

/**
 * Live chat (M14.2). There is no websocket in a mock, so the incoming
 * queue, the open session and its messages are all refreshed by polling —
 * the honest substitute for the "typing indicator" and live updates the
 * spec describes, and good enough at a few-second interval for a support
 * floor to actually use.
 */
export default function LiveChatPage() {
  const { message } = App.useApp();
  const [activeId, setActiveId] = useState(null);
  const [ending, setEnding] = useState(false);
  const [draft, setDraft] = useState('');

  const sessions = useQuery({
    queryKey: supportKeys.chatSessions,
    queryFn: () => supportApi.chatSessions(),
    refetchInterval: 8000,
  });

  const detail = useQuery({
    queryKey: supportKeys.chatSession(activeId),
    queryFn: () => supportApi.chatSession(activeId),
    enabled: Boolean(activeId),
    refetchInterval: 4000,
  });

  const claim = useMutation({
    mutationFn: (id) => supportApi.claimChat(id),
    onSuccess: (res) => { sessions.refetch(); setActiveId(res.data.id); },
    onError: (e) => message.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => supportApi.sendChatMessage(activeId, draft),
    onSuccess: () => { setDraft(''); detail.refetch(); },
    onError: (e) => message.error(e.message),
  });
  const convert = useMutation({
    mutationFn: () => supportApi.convertChat(activeId),
    onSuccess: (res) => message.success(`Converted to ticket ${res.data.ticketId}`),
    onError: (e) => message.error(e.message),
  });
  const end = useMutation({
    mutationFn: (dispositionCode) => supportApi.endChat(activeId, dispositionCode),
    onSuccess: () => { setEnding(false); sessions.refetch(); setActiveId(null); },
    onError: (e) => message.error(e.message),
  });

  if (sessions.error) return <ErrorState error={sessions.error} onRetry={sessions.refetch} />;
  const rows = sessions.data?.data ?? [];
  const waiting = rows.filter((s) => s.status === 'WAITING');
  const active = rows.filter((s) => s.status === 'ACTIVE');
  const summary = sessions.data?.meta?.summary;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Live chat console"
        breadcrumbs={[{ label: 'Support' }, { label: 'Live chat' }]}
        subtitle="The bot transcript hands off here when a customer asks for a human."
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Waiting" value={summary?.waitingCount ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Active" value={summary?.activeCount ?? 0} /></Card></Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Avg wait" value={Math.round((summary?.avgWaitMs ?? 0) / 60000)} suffix="min" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <Card size="small" title={`Waiting (${waiting.length})`}>
            <List
              size="small"
              dataSource={waiting}
              locale={{ emptyText: 'Nobody waiting' }}
              renderItem={(s) => (
                <List.Item actions={[
                  <Can key="claim" perm="support.chat.handle">
                    <Button size="small" type="primary" onClick={() => claim.mutate(s.id)} loading={claim.isPending}>Claim</Button>
                  </Can>,
                ]}>
                  <Flex vertical gap={0}>
                    <Typography.Text style={{ fontSize: 13 }}>{s.customerName}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      waiting {Math.round(s.waitingMs / 60000)} min
                    </Typography.Text>
                  </Flex>
                </List.Item>
              )}
            />
          </Card>

          <Card size="small" title={`My active chats (${active.length})`} style={{ marginTop: 12 }}>
            <List
              size="small"
              dataSource={active}
              locale={{ emptyText: 'No active chats' }}
              renderItem={(s) => (
                <List.Item onClick={() => setActiveId(s.id)} style={{ cursor: 'pointer', background: s.id === activeId ? 'var(--ant-color-fill-tertiary)' : undefined }}>
                  <Flex vertical gap={0}>
                    <Typography.Text style={{ fontSize: 13 }}>{s.customerName}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{s.messageCount} messages</Typography.Text>
                  </Flex>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {detail.data ? (
            <Card
              size="small"
              title={detail.data.data.customerName}
              extra={
                <Flex gap={6}>
                  <Can perm="support.chat.handle">
                    <Button size="small" onClick={() => convert.mutate()} loading={convert.isPending}>Convert to ticket</Button>
                  </Can>
                  <Can perm="support.chat.handle">
                    <Button size="small" danger onClick={() => setEnding(true)}>End chat</Button>
                  </Can>
                </Flex>
              }
            >
              <Flex vertical gap={8} style={{ maxHeight: 420, overflowY: 'auto', marginBottom: 10 }}>
                {detail.data.data.messages.map((m) => (
                  <Flex key={m.id} justify={m.authorType === 'ADMIN' ? 'flex-end' : 'flex-start'}>
                    <Flex vertical gap={2} style={{ maxWidth: '75%', background: m.authorType === 'ADMIN' ? 'var(--ant-color-primary-bg)' : 'var(--ant-color-fill-tertiary)', borderRadius: 8, padding: '6px 10px' }}>
                      <Typography.Text strong style={{ fontSize: 11 }}>{m.authorName}</Typography.Text>
                      <Typography.Text style={{ fontSize: 13 }}>{m.body}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 10 }}><DateText value={m.createdAt} /></Typography.Text>
                    </Flex>
                  </Flex>
                ))}
              </Flex>
              <Flex gap={8}>
                <Input.TextArea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" />
                <Button type="primary" onClick={() => send.mutate()} loading={send.isPending} disabled={!draft.trim()}>Send</Button>
              </Flex>
            </Card>
          ) : (
            <Card size="small"><Typography.Text type="secondary">Claim a waiting chat, or select one of your active chats.</Typography.Text></Card>
          )}
        </Col>
      </Row>

      <ConfirmActionModal
        open={ending}
        onCancel={() => setEnding(false)}
        onConfirm={(v) => end.mutate(v.dispositionCode)}
        loading={end.isPending}
        title="End this chat"
        reasonRequired={false}
        showNote={false}
        confirmLabel="End chat"
        extraFields={
          <Form.Item name="dispositionCode" label="Disposition code" rules={[{ required: true, message: 'Required.' }]}>
            <Select
              options={[
                { value: 'RESOLVED_SELF_SERVICE', label: 'Resolved' },
                { value: 'ESCALATED', label: 'Escalated' },
                { value: 'TRANSFERRED', label: 'Transferred' },
                { value: 'ABANDONED_BY_CUSTOMER', label: 'Abandoned by customer' },
              ]}
            />
          </Form.Item>
        }
      />
    </Flex>
  );
}
