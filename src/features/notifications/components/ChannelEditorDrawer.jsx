import { App, Alert, Button, Drawer, Flex, Input, List, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@core/api/errors';
import { Can } from '@core/rbac/Can';
import DateText from '@shared/components/DateText';
import { notificationsApi } from '../api/notifications.api';

/** Edit one event's content for one channel, with its own history and a test send. */
export default function ChannelEditorDrawer({ value, onClose, onSaved }) {
  const { message } = App.useApp();
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [dltTemplateId, setDltTemplateId] = useState('');
  const [error, setError] = useState(null);

  const channelConfig = value ? value.template.channels[value.channel] : null;

  useEffect(() => {
    if (!channelConfig) return;
    setBody(channelConfig.content?.body ?? '');
    setSubject(channelConfig.content?.subject ?? '');
    setDltTemplateId(channelConfig.dltTemplateId ?? '');
    setError(null);
  }, [channelConfig]);

  const save = useMutation({
    mutationFn: () => notificationsApi.updateChannel(value.template.id, value.channel, {
      content: value.channel === 'EMAIL' ? { subject, body } : { body },
      dltTemplateId: value.channel === 'SMS' ? dltTemplateId : undefined,
    }),
    onSuccess: () => { message.success('Saved'); onSaved(); },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) { setError(Object.values(e.fieldErrors)[0]); return; }
      message.error(e.message);
    },
  });

  const testSend = useMutation({
    mutationFn: () => notificationsApi.testSend(value.template.id, value.channel),
    onSuccess: (res) => message.success(`Test sent to ${res.data.sentTo}`),
    onError: (e) => message.error(e.message),
  });

  return (
    <Drawer
      open={Boolean(value)}
      onClose={onClose}
      width={480}
      title={value ? `${value.template.eventLabel} · ${value.channel}` : ''}
      extra={
        <Space>
          <Can perm="notifications.template.test_send">
            <Button size="small" onClick={() => testSend.mutate()} loading={testSend.isPending}>Send test</Button>
          </Can>
          <Can perm="notifications.template.edit">
            <Button type="primary" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </Can>
        </Space>
      }
    >
      {channelConfig ? (
        <Flex vertical gap={12}>
          {error && <Alert type="error" showIcon message={error} />}

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Variables: {value.template.variables.map((v) => <Tag key={v}>{`{{${v}}}`}</Tag>)}
          </Typography.Text>

          {value.channel === 'EMAIL' && (
            <Flex vertical gap={4}>
              <Typography.Text style={{ fontSize: 13 }}>Subject</Typography.Text>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Flex>
          )}

          <Flex vertical gap={4}>
            <Typography.Text style={{ fontSize: 13 }}>Message</Typography.Text>
            <Input.TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </Flex>

          {value.channel === 'SMS' && (
            <Flex vertical gap={4}>
              <Typography.Text style={{ fontSize: 13 }}>DLT template ID</Typography.Text>
              <Input value={dltTemplateId} onChange={(e) => setDltTemplateId(e.target.value)} className="mono" />
            </Flex>
          )}

          {value.channel === 'WHATSAPP' && (
            <Alert
              type={channelConfig.whatsappApprovalStatus === 'APPROVED' ? 'success' : 'warning'}
              showIcon
              message={`Provider approval: ${channelConfig.whatsappApprovalStatus}`}
            />
          )}

          <Typography.Text strong style={{ fontSize: 13 }}>Edit history</Typography.Text>
          <List
            size="small"
            dataSource={[...channelConfig.history].reverse()}
            locale={{ emptyText: 'No edits yet' }}
            renderItem={(h) => (
              <List.Item>
                <Typography.Text style={{ fontSize: 12 }}>{h.editedByName} · <DateText value={h.editedAt} variant="datetime" /></Typography.Text>
              </List.Item>
            )}
          />
        </Flex>
      ) : null}
    </Drawer>
  );
}
