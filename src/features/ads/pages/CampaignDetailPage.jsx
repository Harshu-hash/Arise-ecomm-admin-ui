import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Flex, Row, Space, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Can } from '@core/rbac/Can';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { adsApi, adsKeys, campaignStatusCode } from '../api/ads.api';

/** Settings, ad groups/products, and the daily performance behind a campaign's summary row. */
export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [pausing, setPausing] = useState(false);

  const query = useQuery({ queryKey: adsKeys.campaign(id), queryFn: () => adsApi.campaign(id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ads'] });

  const pause = useMutation({
    mutationFn: (reason) => adsApi.pauseCampaign(id, reason),
    onSuccess: () => { invalidate(); setPausing(false); message.success('Paused'); },
    onError: (e) => message.error(e.message),
  });
  const resume = useMutation({
    mutationFn: () => adsApi.resumeCampaign(id),
    onSuccess: () => { invalidate(); message.success('Resumed'); },
    onError: (e) => message.error(e.message),
  });
  const end = useMutation({
    mutationFn: () => adsApi.endCampaign(id),
    onSuccess: () => { invalidate(); message.success('Ended'); },
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const c = query.data.data;

  return (
    <>
      <PageHeader
        title={c.name}
        breadcrumbs={[{ label: 'Sponsored Ads' }, { label: 'Campaigns', to: '/ads/campaigns' }, { label: c.name }]}
        onBack={<Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back" onClick={() => navigate('/ads/campaigns')} />}
        tags={<StatusTag domain="adCampaign" code={campaignStatusCode(c)} />}
        meta={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.sellerName} · {c.biddingType}</Typography.Text>}
        actions={
          <Space>
            {c.status === 'ACTIVE' && <Can perm="ads.campaign.pause"><Button onClick={() => setPausing(true)}>Pause</Button></Can>}
            {c.status === 'PAUSED' && c.pauseReason !== 'WALLET_EMPTY' && <Can perm="ads.campaign.pause"><Button onClick={() => resume.mutate()}>Resume</Button></Can>}
            {['ACTIVE', 'PAUSED'].includes(c.status) && <Can perm="ads.campaign.pause"><Button danger onClick={() => end.mutate()}>End</Button></Can>}
          </Space>
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}><Card size="small"><Typography.Text type="secondary" style={{ fontSize: 12 }}>Total spend</Typography.Text><div><MoneyText paise={c.spendPaise} strong style={{ fontSize: 18 }} /></div></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Typography.Text type="secondary" style={{ fontSize: 12 }}>Impressions</Typography.Text><div><Typography.Text strong style={{ fontSize: 18 }}>{c.impressions.toLocaleString('en-IN')}</Typography.Text></div></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Typography.Text type="secondary" style={{ fontSize: 12 }}>CTR</Typography.Text><div><Typography.Text strong style={{ fontSize: 18 }}>{c.ctrPct}%</Typography.Text></div></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Typography.Text type="secondary" style={{ fontSize: 12 }}>ROAS</Typography.Text><div><Typography.Text strong type={c.roas < 1 ? 'danger' : undefined} style={{ fontSize: 18 }}>{c.roas}×</Typography.Text></div></Card></Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={10}>
          <Card size="small" title="Settings">
            <Flex vertical gap={6}>
              <SettingRow label="Daily budget"><MoneyText paise={c.dailyBudgetPaise} /></SettingRow>
              <SettingRow label="Total budget"><MoneyText paise={c.totalBudgetPaise} /></SettingRow>
              <SettingRow label="Start date">{new Date(c.startDate).toLocaleDateString('en-IN')}</SettingRow>
              <SettingRow label="End date">{c.endDate ? new Date(c.endDate).toLocaleDateString('en-IN') : '—'}</SettingRow>
              {c.pauseReason && <SettingRow label="Pause reason"><Tag>{c.pauseReason.replace(/_/g, ' ')}</Tag></SettingRow>}
              {c.rejectReason && <SettingRow label="Reject reason">{c.rejectReason}</SettingRow>}
            </Flex>
          </Card>

          <Card size="small" title="Ad groups & products" style={{ marginTop: 12 }}>
            {c.groups.map((grp) => (
              <div key={grp.id} style={{ marginBottom: 12 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>{grp.name} · {grp.targetingType}</Typography.Text>
                <Table
                  size="small" rowKey="id" pagination={false} style={{ marginTop: 6 }}
                  dataSource={grp.products}
                  columns={[
                    { key: 'title', title: 'Product', dataIndex: 'title' },
                    { key: 'status', title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'LIVE' ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{v}</Tag> },
                    { key: 'stock', title: 'Stock', dataIndex: 'stock', align: 'right' },
                  ]}
                />
                {grp.keywords?.length > 0 && (
                  <Flex gap={4} wrap style={{ marginTop: 8 }}>
                    {grp.keywords.map((k, i) => (
                      <Tag key={i}>{k.term} · {k.matchType} · <MoneyText paise={k.bidPaise} compact /></Tag>
                    ))}
                  </Flex>
                )}
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card size="small" title="Daily performance">
            <Table
              size="small" rowKey="id" pagination={{ pageSize: 10, size: 'small' }}
              dataSource={[...c.dailyStats].reverse()}
              columns={[
                { key: 'date', title: 'Date', dataIndex: 'date' },
                { key: 'impressions', title: 'Impr.', dataIndex: 'impressions', align: 'right' },
                { key: 'clicks', title: 'Clicks', dataIndex: 'clicks', align: 'right' },
                { key: 'spendPaise', title: 'Spend', dataIndex: 'spendPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                { key: 'adOrders', title: 'Orders', dataIndex: 'adOrders', align: 'right' },
                { key: 'adGmvPaise', title: 'Ad GMV', dataIndex: 'adGmvPaise', align: 'right', render: (v) => <MoneyText paise={v} compact /> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <ConfirmActionModal
        open={pausing}
        onCancel={() => setPausing(false)}
        onConfirm={(v) => pause.mutate(v.reason)}
        loading={pause.isPending}
        danger
        title="Pause this campaign for policy"
        impact="The advertiser is notified. Their ads stop serving immediately."
        reasonRequired
        reasonLabel="Policy reason"
        showNote={false}
        confirmLabel="Pause"
      />
    </>
  );
}

function SettingRow({ label, children }) {
  return (
    <Flex justify="space-between" gap={12}>
      <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
      <span>{children}</span>
    </Flex>
  );
}
