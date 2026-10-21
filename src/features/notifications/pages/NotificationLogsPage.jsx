import { App, Button, Flex, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { notificationsApi, notificationsKeys } from '../api/notifications.api';

const CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_APP'];

/** Delivery logs (M16): every notification sent, per channel, with a resend for what failed. */
export default function NotificationLogsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-sentAt' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: notificationsKeys.logs({ ...state.queryParams, tab: state.tab }),
    url: '/notification-logs',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const resend = useMutation({
    mutationFn: (id) => notificationsApi.resendLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'logs'] });
      message.success('Resent');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'eventLabel', title: 'Event', dataIndex: 'eventLabel', alwaysVisible: true },
    {
      key: 'channel', title: 'Channel', dataIndex: 'channel', priority: 1,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag>,
    },
    {
      key: 'recipientMasked', title: 'Recipient', dataIndex: 'recipientMasked', priority: 2,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 12 }}>{v}</Typography.Text>,
    },
    { key: 'provider', title: 'Provider', dataIndex: 'provider', priority: 3 },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => <StatusTag domain="notificationLog" code={v} tooltip={row.failureReason ?? undefined} />,
    },
    {
      key: 'sentAt', title: 'Sent', dataIndex: 'sentAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['FAILED', 'BOUNCED'].includes(row.status) ? (
          <Can perm="notifications.log.resend">
            <Button size="small" onClick={(e) => { e.stopPropagation(); resend.mutate(row.id); }}>Resend</Button>
          </Can>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Delivery logs"
        breadcrumbs={[{ label: 'Notifications' }, { label: 'Delivery logs' }]}
        subtitle="Every notification sent, with the provider that carried it."
      />

      <FilterBar
        schema={[
          { key: 'channel', label: 'Channel', kind: 'multiSelect', width: 180, options: CHANNELS.map((v) => ({ value: v, label: v })) },
        ]}
        tableState={state}
        searchPlaceholder="Search event or recipient"
      />

      <DataTable
        tableId="notificationLogs"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'DELIVERED', label: 'Delivered' },
          { key: 'FAILED', label: 'Failed' },
          { key: 'BOUNCED', label: 'Bounced' },
        ]}
        onExport={() => {}}
        exportPerm="notifications.log.export"
        emptyProps={{ title: 'No notifications match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.eventLabel}</Typography.Text>
              <StatusTag domain="notificationLog" code={row.status} showIcon={false} />
            </Flex>
            <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>{row.recipientMasked}</Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
