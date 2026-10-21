import { App, Button, Card, Col, Flex, Form, Input, InputNumber, Row, Select, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';

/** Referral program (M10.5): config, the referral list, and fraud review. */
export default function ReferralPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const [deciding, setDeciding] = useState(null);

  const config = useQuery({
    queryKey: marketingKeys.referralConfig,
    queryFn: () => marketingApi.referralConfig(),
  });

  useEffect(() => {
    if (config.data) {
      const c = config.data.data;
      form.setFieldsValue({
        referrerRewardRupees: c.referrerRewardPaise / 100,
        refereeRewardType: c.refereeRewardType,
        refereeRewardRupees: c.refereeRewardPaise / 100,
        maxReferralsPerMonth: c.maxReferralsPerMonth,
        validityDays: c.validityDays,
        terms: c.terms,
      });
    }
  }, [config.data, form]);

  const saveConfig = useMutation({
    mutationFn: (payload) => marketingApi.updateReferralConfig(payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: marketingKeys.referralConfig }); message.success('Saved'); },
    onError: (e) => message.error(e.message),
  });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.referrals({ ...state.queryParams, tab: state.tab }),
    url: '/referrals',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) => marketingApi.decideReferral(id, decision, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'referrals'] });
      setDeciding(null);
      message.success('Done');
    },
    onError: (e) => message.error(e.message),
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'referrerName', title: 'Referrer', dataIndex: 'referrerName', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>{row.code}</Typography.Text>
        </Flex>
      ),
    },
    { key: 'refereeName', title: 'Referee', dataIndex: 'refereeName', priority: 1 },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => <StatusTag domain="referral" code={v} tooltip={row.fraudReason ?? undefined} />,
    },
    {
      key: 'rewardPaise', title: 'Reward', dataIndex: 'rewardPaise', align: 'right', priority: 2,
      render: (v) => (v ? <MoneyText paise={v} /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'createdAt', title: 'Started', dataIndex: 'createdAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['QUALIFIED', 'FRAUD_REVIEW'].includes(row.status) ? (
          <Can perm="marketing.referral.decide">
            <Button size="small" onClick={(e) => { e.stopPropagation(); setDeciding(row); }}>Decide</Button>
          </Can>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Referral program"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Referral program' }]}
        subtitle="A referral is rewarded once the referee's first order is delivered and its return window has closed — not on sign-up."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Rewarded so far" valuePaise={summary?.rewardedPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Flagged for fraud" value={summary?.flaggedCount} loading={loading} />
        </Col>
      </Row>

      <Card size="small" title="Program configuration">
        <Form form={form} layout="vertical" onFinish={(v) => saveConfig.mutate({
          referrerRewardPaise: Math.round(v.referrerRewardRupees * 100),
          refereeRewardType: v.refereeRewardType,
          refereeRewardPaise: Math.round(v.refereeRewardRupees * 100),
          maxReferralsPerMonth: v.maxReferralsPerMonth,
          validityDays: v.validityDays,
          terms: v.terms,
        })}>
          <Flex gap={12} wrap>
            <Form.Item name="referrerRewardRupees" label="Referrer reward (₹)" style={{ flex: '1 1 160px' }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="refereeRewardType" label="Referee reward type" style={{ flex: '1 1 160px' }}>
              <Select options={[{ value: 'WALLET', label: 'Wallet credit' }, { value: 'COUPON', label: 'Coupon' }]} />
            </Form.Item>
            <Form.Item name="refereeRewardRupees" label="Referee reward (₹)" style={{ flex: '1 1 160px' }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxReferralsPerMonth" label="Max referrals / month" style={{ flex: '1 1 160px' }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="validityDays" label="Code validity (days)" style={{ flex: '1 1 160px' }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Form.Item name="terms" label="Terms shown in the app">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Can perm="marketing.referral.edit">
            <Button type="primary" htmlType="submit" loading={saveConfig.isPending}>Save configuration</Button>
          </Can>
        </Form>
      </Card>

      <DataTable
        tableId="referrals"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'QUALIFIED', label: 'Awaiting decision' },
          { key: 'FRAUD_REVIEW', label: 'Fraud review' },
          { key: 'REWARDED', label: 'Rewarded' },
          { key: 'REJECTED_FRAUD', label: 'Rejected' },
        ]}
        onExport={() => {}}
        exportPerm="marketing.referral.export"
        emptyProps={{ title: 'No referrals yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text style={{ fontSize: 13 }}>{row.referrerName} → {row.refereeName}</Typography.Text>
              <StatusTag domain="referral" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(deciding)}
        onCancel={() => setDeciding(null)}
        onConfirm={(values) => decide.mutate({ id: deciding.id, decision: values.decision, reason: values.reason })}
        loading={decide.isPending}
        title="Decide this referral"
        description={deciding ? `${deciding.referrerName} → ${deciding.refereeName}` : ''}
        impact={deciding?.status === 'FRAUD_REVIEW'
          ? 'Auto-held: this referrer, referee or payment instrument overlaps with another account.'
          : 'This referral has qualified for a reward.'}
        reasonRequired
        reasonLabel="Note"
        showNote={false}
        confirmLabel="Submit decision"
        extraFields={
          <Form.Item name="decision" label="Decision" initialValue="REWARDED" rules={[{ required: true }]}>
            <Select
              options={[{ value: 'REWARDED', label: 'Approve and reward' }, { value: 'REJECTED_FRAUD', label: 'Reject — fraud' }]}
            />
          </Form.Item>
        }
      />
    </Flex>
  );
}
