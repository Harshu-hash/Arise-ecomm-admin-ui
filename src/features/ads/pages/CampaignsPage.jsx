import { App, Button, Flex, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { glossify } from '@shared/utils/glossify';
import { adsApi, adsKeys, campaignStatusCode } from '../api/ads.api';
import CampaignFormModal from '../components/CampaignFormModal';

/** Ad campaigns (M11.1): daily budget, spend, performance and the lifecycle actions. */
export default function CampaignsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const [creating, setCreating] = useState(false);
  const [pausing, setPausing] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: adsKeys.campaigns(state.queryParams),
    url: '/ads/campaigns',
    params: state.queryParams,
  });

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['ads'] });

  const submit = useMutation({
    mutationFn: (id) => adsApi.submitCampaign(id),
    onSuccess: () => { refreshAll(); message.success('Sent for policy review'); },
    onError: (e) => message.error(e.message),
  });
  const pause = useMutation({
    mutationFn: ({ id, reason }) => adsApi.pauseCampaign(id, reason),
    onSuccess: () => { refreshAll(); setPausing(null); message.success('Paused'); },
    onError: (e) => message.error(e.message),
  });
  const resume = useMutation({
    mutationFn: (id) => adsApi.resumeCampaign(id),
    onSuccess: () => { refreshAll(); message.success('Resumed'); },
    onError: (e) => message.error(e.message),
  });
  const end = useMutation({
    mutationFn: (id) => adsApi.endCampaign(id),
    onSuccess: () => { refreshAll(); message.success('Ended'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'name', title: 'Campaign', dataIndex: 'name', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text style={{ fontSize: 13 }} ellipsis>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.sellerName}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'biddingType', title: 'Type', dataIndex: 'biddingType', priority: 3,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{glossify(v === 'MANUAL_CPC' ? 'Manual CPC' : 'Automatic')}</Tag>,
    },
    {
      key: 'budgets', title: 'Daily / total budget', align: 'right', priority: 2,
      render: (_v, row) => (
        <Flex vertical gap={0} align="flex-end">
          <MoneyText paise={row.dailyBudgetPaise} compact />
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>of <MoneyText paise={row.totalBudgetPaise} compact /></Typography.Text>
        </Flex>
      ),
    },
    { key: 'spendTodayPaise', title: 'Spend today', dataIndex: 'spendTodayPaise', sorter: true, align: 'right', priority: 1, render: (v) => <MoneyText paise={v} /> },
    { key: 'spendPaise', title: 'Total spend', dataIndex: 'spendPaise', sorter: true, align: 'right', priority: 1, render: (v) => <MoneyText paise={v} compact /> },
    { key: 'impressions', title: 'Impr.', dataIndex: 'impressions', sorter: true, align: 'right', priority: 3, render: (v) => v.toLocaleString('en-IN') },
    { key: 'clicks', title: 'Clicks', dataIndex: 'clicks', sorter: true, align: 'right', priority: 3 },
    { key: 'ctrPct', title: 'CTR', dataIndex: 'ctrPct', sorter: true, align: 'right', priority: 2, render: (v) => `${v}%` },
    { key: 'avgCpcPaise', title: 'Avg CPC', dataIndex: 'avgCpcPaise', align: 'right', priority: 3, render: (v) => <MoneyText paise={v} /> },
    { key: 'adOrders', title: 'Ad orders', dataIndex: 'adOrders', align: 'right', priority: 3 },
    { key: 'roas', title: 'ROAS', dataIndex: 'roas', sorter: true, align: 'right', priority: 1, render: (v) => <Typography.Text type={v < 1 ? 'danger' : undefined} strong>{v}×</Typography.Text> },
    { key: 'status', title: 'Status', priority: 1, render: (_v, row) => <StatusTag domain="adCampaign" code={campaignStatusCode(row)} /> },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} onClick={(e) => e.stopPropagation()}>
          {row.status === 'DRAFT' && (
            <Can perm="ads.campaign.edit">
              <Button size="small" onClick={() => submit.mutate(row.id)}>Submit</Button>
            </Can>
          )}
          {row.status === 'ACTIVE' && (
            <Can perm="ads.campaign.pause">
              <Button size="small" onClick={() => setPausing(row)}>Pause</Button>
            </Can>
          )}
          {row.status === 'PAUSED' && row.pauseReason !== 'WALLET_EMPTY' && (
            <Can perm="ads.campaign.pause">
              <Button size="small" onClick={() => resume.mutate(row.id)}>Resume</Button>
            </Can>
          )}
          {['ACTIVE', 'PAUSED'].includes(row.status) && (
            <Can perm="ads.campaign.pause">
              <Button size="small" danger onClick={() => end.mutate(row.id)}>End</Button>
            </Can>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Ad campaigns"
        breadcrumbs={[{ label: 'Sponsored Ads' }, { label: 'Campaigns' }]}
        subtitle="Sellers are the advertiser throughout; the admin can create and manage a campaign on their behalf."
        actions={
          <Can perm="ads.campaign.create">
            <Button type="primary" onClick={() => setCreating(true)}>New campaign</Button>
          </Can>
        }
      />

      <FilterBar
        schema={[
          { key: 'sellerId', label: 'Advertiser', kind: 'entity', entity: 'seller', width: 190 },
          {
            key: 'biddingType', label: 'Bidding', kind: 'select', width: 150,
            options: [{ value: 'AUTOMATIC', label: 'Automatic' }, { value: 'MANUAL_CPC', label: 'Manual CPC' }],
          },
        ]}
        tableState={state}
        searchPlaceholder="Search campaign or advertiser"
      />

      <DataTable
        tableId="adCampaigns"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => navigate(`/ads/campaigns/${row.id}`)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'DRAFT', label: 'Draft' },
          { key: 'PENDING_REVIEW', label: 'Pending review' },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'PAUSED', label: 'Paused' },
          { key: 'ENDED', label: 'Ended' },
        ]}
        emptyProps={{ title: 'No campaigns match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }} ellipsis>{row.name}</Typography.Text>
              <StatusTag domain="adCampaign" code={campaignStatusCode(row)} showIcon={false} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.sellerName} · ROAS {row.roas}×</Typography.Text>
          </Flex>
        )}
      />

      <CampaignFormModal open={creating} onClose={() => setCreating(false)} onSaved={() => { refreshAll(); setCreating(false); }} />

      <ConfirmActionModal
        open={Boolean(pausing)}
        onCancel={() => setPausing(null)}
        onConfirm={(v) => pause.mutate({ id: pausing.id, reason: v.reason })}
        loading={pause.isPending}
        danger
        title="Pause this campaign for policy"
        description={pausing?.name}
        impact="The advertiser is notified. Their ads stop serving immediately."
        reasonRequired
        reasonLabel="Policy reason"
        showNote={false}
        confirmLabel="Pause"
      />
    </Flex>
  );
}
