import { App, Button, Flex, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { ApiError } from '@core/api/errors';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import CampaignWizardModal from '../components/CampaignWizardModal';

/** Campaigns (M10.6): push / SMS / email / in-app / WhatsApp broadcasts. */
export default function CampaignsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [sending, setSending] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.campaigns({ ...state.queryParams, tab: state.tab }),
    url: '/campaigns',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['marketing', 'campaigns'] });

  const cancel = useMutation({
    mutationFn: (id) => marketingApi.cancelCampaign(id),
    onSuccess: () => { refreshAll(); setCancelling(null); message.success('Cancelled'); },
    onError: (e) => message.error(e.message),
  });

  const testSend = useMutation({
    mutationFn: (id) => marketingApi.testSendCampaign(id),
    onSuccess: (res) => message.success(`Test sent to ${res.data.sentTo}`),
    onError: (e) => message.error(e.message),
  });

  const send = useMutation({
    mutationFn: ({ id, overrideQuietHours }) => marketingApi.sendCampaign(id, { overrideQuietHours }),
    onSuccess: () => { refreshAll(); setSending(null); message.success('Sent'); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'QUIET_HOURS') {
        setSending((c) => ({ ...c, quietHoursBlock: e.message }));
        return;
      }
      message.error(e.message);
    },
  });

  const columns = [
    { key: 'name', title: 'Campaign', dataIndex: 'name', alwaysVisible: true },
    {
      key: 'channels', title: 'Channels', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} wrap>
          {row.channels.map((c) => <Tag key={c} style={{ marginInlineEnd: 0 }}>{c}</Tag>)}
        </Flex>
      ),
    },
    {
      key: 'estimatedReach', title: 'Reach', dataIndex: 'estimatedReach', align: 'right', priority: 1,
      render: (v) => <Typography.Text className="tabular">{v.toLocaleString('en-IN')}</Typography.Text>,
    },
    {
      key: 'stats', title: 'Delivered / opened', priority: 2,
      render: (_v, row) => row.stats
        ? <Typography.Text className="tabular" style={{ fontSize: 12 }}>{row.stats.delivered} / {row.stats.opened}</Typography.Text>
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="campaign" code={v} />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} onClick={(e) => e.stopPropagation()}>
          {row.status === 'DRAFT' && (
            <Can perm="marketing.campaign.create">
              <Button size="small" onClick={() => testSend.mutate(row.id)} loading={testSend.isPending}>
                Send test to me
              </Button>
            </Can>
          )}
          {row.status === 'DRAFT' && (
            <Can perm="marketing.campaign.send">
              <Button size="small" type="primary" onClick={() => setSending(row)}>Send</Button>
            </Can>
          )}
          {['SCHEDULED', 'SENDING', 'DRAFT'].includes(row.status) && (
            <Can perm="marketing.campaign.cancel">
              <Button size="small" danger onClick={() => setCancelling(row)}>Cancel</Button>
            </Can>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Campaigns"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Campaigns' }]}
        subtitle="Push, SMS, email, in-app and WhatsApp broadcasts. Push respects quiet hours (10 PM–8 AM) unless explicitly overridden."
        actions={
          <Can perm="marketing.campaign.create">
            <Button type="primary" onClick={() => setCreating(true)}>New campaign</Button>
          </Can>
        }
      />

      <DataTable
        tableId="campaigns"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'DRAFT', label: 'Draft' },
          { key: 'SCHEDULED', label: 'Scheduled' },
          { key: 'SENT', label: 'Sent' },
          { key: 'CANCELLED', label: 'Cancelled' },
        ]}
        emptyProps={{ title: 'No campaigns yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
              <StatusTag domain="campaign" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <CampaignWizardModal open={creating} onClose={() => setCreating(false)} onSaved={() => { refreshAll(); setCreating(false); }} />

      <ConfirmActionModal
        open={Boolean(cancelling)}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancel.mutate(cancelling.id)}
        loading={cancel.isPending}
        danger
        title="Cancel this campaign"
        description={cancelling?.name}
        impact="Nothing further is sent. Anyone already reached keeps what they received."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Cancel"
      />

      <ConfirmActionModal
        open={Boolean(sending)}
        onCancel={() => setSending(null)}
        onConfirm={() => send.mutate({ id: sending.id, overrideQuietHours: Boolean(sending?.quietHoursBlock) })}
        loading={send.isPending}
        title={sending?.quietHoursBlock ? 'Send during quiet hours anyway?' : 'Send this campaign now'}
        description={sending?.name}
        impact={sending?.quietHoursBlock ?? `Reaches an estimated ${sending?.estimatedReach ?? 0} customers across ${sending?.channels?.join(', ')}.`}
        reasonRequired={false}
        showNote={false}
        danger={Boolean(sending?.quietHoursBlock)}
        confirmLabel={sending?.quietHoursBlock ? 'Send anyway' : 'Send now'}
      />
    </Flex>
  );
}
