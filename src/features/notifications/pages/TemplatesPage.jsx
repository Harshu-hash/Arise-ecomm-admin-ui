import { App, Collapse, Flex, Switch, Table, Tag } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { notificationsApi, notificationsKeys } from '../api/notifications.api';
import ChannelEditorDrawer from '../components/ChannelEditorDrawer';

const CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_APP'];

/** Transactional templates (M16): one row per event, each carrying every channel. */
export default function TemplatesPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: notificationsKeys.templates, queryFn: () => notificationsApi.templates() });
  const [editing, setEditing] = useState(null);

  const toggle = useMutation({
    mutationFn: ({ templateId, channel, enabled }) => notificationsApi.updateChannel(templateId, channel, { enabled }),
    onSuccess: () => query.refetch(),
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Transactional templates"
        breadcrumbs={[{ label: 'Notifications' }, { label: 'Templates' }]}
        subtitle="One template per event, with its own content for each channel. SMS needs a DLT template ID per TRAI rules; WhatsApp needs provider approval."
      />

      <Collapse
        items={query.data.data.map((t) => ({
          key: t.id,
          label: t.eventLabel,
          children: (
            <Table
              size="small"
              rowKey={(row) => row.channel}
              pagination={false}
              dataSource={CHANNELS.map((channel) => ({ channel, ...t.channels[channel] }))}
              onRow={(row) => ({ onClick: () => setEditing({ template: t, channel: row.channel }), style: { cursor: 'pointer' } })}
              columns={[
                { key: 'channel', title: 'Channel', dataIndex: 'channel' },
                {
                  key: 'content', title: 'Content', dataIndex: 'content',
                  render: (v) => <span style={{ fontSize: 12 }}>{v?.subject ?? v?.body}</span>,
                },
                {
                  key: 'status', title: 'Status',
                  render: (_v, row) => (
                    <Flex gap={6}>
                      {row.channel === 'SMS' && !row.dltTemplateId && <Tag color="red">no DLT ID</Tag>}
                      {row.channel === 'WHATSAPP' && row.whatsappApprovalStatus === 'PENDING' && <Tag color="gold">approval pending</Tag>}
                    </Flex>
                  ),
                },
                {
                  key: 'enabled', title: 'Enabled', width: 90,
                  render: (_v, row) => (
                    <Can perm="notifications.template.edit" disable>
                      <Switch
                        size="small"
                        checked={row.enabled}
                        onClick={(_checked, e) => e.stopPropagation()}
                        onChange={(enabled) => toggle.mutate({ templateId: t.id, channel: row.channel, enabled })}
                      />
                    </Can>
                  ),
                },
              ]}
            />
          ),
        }))}
      />

      <ChannelEditorDrawer
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { query.refetch(); setEditing(null); }}
      />
    </Flex>
  );
}
