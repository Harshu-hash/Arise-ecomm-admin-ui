import { App, Button, Flex, Progress, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import CouponFormDrawer from '../components/CouponFormDrawer';

const TYPE_LABEL = { FLAT: 'Flat ₹', PERCENT: '%', FREE_DELIVERY: 'Free delivery', BXGY: 'Buy X get Y' };

/**
 * Coupons (M10.1).
 *
 * Journey 5's home screen: a coupon created here has to be the same one the
 * test tool on its detail page checks against a real cart, and the same one
 * the usage report below adds up — never three slightly different ideas of
 * "this coupon."
 */
export default function CouponsListPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.coupons({ ...state.queryParams, tab: state.tab }),
    url: '/coupons',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['marketing', 'coupons'] });

  const pause = useMutation({
    mutationFn: (id) => marketingApi.pauseCoupon(id),
    onSuccess: () => { refreshAll(); message.success('Done'); },
    onError: (e) => message.error(e.message),
  });
  const clone = useMutation({
    mutationFn: (id) => marketingApi.cloneCoupon(id),
    onSuccess: (res) => { refreshAll(); setEditing(res.data); message.success('Cloned as a draft — review and activate it'); },
    onError: (e) => message.error(e.message),
  });
  const end = useMutation({
    mutationFn: (id) => marketingApi.endCoupon(id),
    onSuccess: () => { refreshAll(); setEnding(null); message.success('Coupon ended'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'code', title: 'Coupon', dataIndex: 'code', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text className="mono" strong style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>{row.name}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'type', title: 'Discount', dataIndex: 'type', priority: 1,
      render: (v, row) => (
        <Typography.Text style={{ fontSize: 13 }}>
          {v === 'PERCENT' ? `${row.valuePct}%${row.maxDiscountPaise ? ` (max ${(row.maxDiscountPaise / 100).toFixed(0)})` : ''}`
            : v === 'FLAT' ? <MoneyText paise={row.valuePaise} />
            : TYPE_LABEL[v]}
        </Typography.Text>
      ),
    },
    {
      key: 'fundedBy', title: 'Funded by', dataIndex: 'fundedBy', priority: 3,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v.replace('_', ' ').toLowerCase()}</Tag>,
    },
    {
      key: 'audience', title: 'Audience', priority: 2,
      render: (_v, row) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {{ ALL: 'Everyone', NEW: 'New customers', SEGMENT: 'Segment', CUSTOM: 'Custom list' }[row.audience?.type] ?? '—'}
        </Typography.Text>
      ),
    },
    {
      key: 'usage', title: 'Used', priority: 1,
      render: (_v, row) => (
        <Typography.Text className="tabular" style={{ fontSize: 12 }}>
          {row.totalRedemptions} / {row.totalLimit}
        </Typography.Text>
      ),
    },
    {
      key: 'budgetBurnPct', title: 'Budget burn', dataIndex: 'budgetBurnPct', sorter: true, priority: 1,
      render: (v) => (
        <Flex vertical gap={2} style={{ minWidth: 100 }}>
          <Progress percent={v} size="small" showInfo={false} status={v >= 90 ? 'exception' : 'active'} />
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>{v}%</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => <StatusTag domain="coupon" code={v} tooltip={row.visibility === 'HIDDEN' ? 'Hidden — code only, not listed in the app' : undefined} />,
    },
    {
      key: 'endsAt', title: 'Ends', dataIndex: 'endsAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          {['ACTIVE', 'PAUSED', 'SCHEDULED'].includes(row.status) && (
            <Can perm="marketing.coupon.pause">
              <Button size="small" onClick={() => pause.mutate(row.id)}>
                {row.status === 'PAUSED' ? 'Resume' : 'Pause'}
              </Button>
            </Can>
          )}
          <Can perm="marketing.coupon.create">
            <Button size="small" type="text" onClick={() => clone.mutate(row.id)}>Clone</Button>
          </Can>
          {['ACTIVE', 'PAUSED', 'SCHEDULED'].includes(row.status) && (
            <Can perm="marketing.coupon.pause">
              <Button size="small" type="text" danger onClick={() => setEnding(row)}>End</Button>
            </Can>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Coupons"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Coupons' }]}
        subtitle="Discounts customers apply at checkout. Every rate here is checked against a real cart by the same logic that will run at checkout."
        actions={
          <Can perm="marketing.coupon.create">
            <Button type="primary" onClick={() => setCreating(true)}>New coupon</Button>
          </Can>
        }
      />

      <FilterBar
        schema={[
          {
            key: 'type', label: 'Discount type', kind: 'multiSelect', width: 180,
            options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            key: 'fundedBy', label: 'Funded by', kind: 'select', width: 150,
            options: ['ARISE', 'SELLER', 'CO_FUNDED'].map((v) => ({ value: v, label: v.replace('_', ' ').toLowerCase() })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search code or name"
      />

      <DataTable
        tableId="coupons"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setEditing(row)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'SCHEDULED', label: 'Scheduled' },
          { key: 'PAUSED', label: 'Paused' },
          { key: 'EXHAUSTED', label: 'Exhausted' },
          { key: 'EXPIRED', label: 'Expired' },
        ]}
        emptyProps={{ title: 'No coupons match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 13 }}>{row.code}</Typography.Text>
              <StatusTag domain="coupon" code={row.status} showIcon={false} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{row.name}</Typography.Text>
          </Flex>
        )}
      />

      <CouponFormDrawer
        coupon={editing}
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => { refreshAll(); setEditing(null); setCreating(false); }}
      />

      <ConfirmActionModal
        open={Boolean(ending)}
        onCancel={() => setEnding(null)}
        onConfirm={() => end.mutate(ending.id)}
        loading={end.isPending}
        danger
        title="End this coupon now"
        description={ending?.code}
        impact="No further redemptions are possible. This cannot be undone — clone the coupon to run it again later."
        reasonRequired={false}
        showNote={false}
        confirmLabel="End coupon"
      />
    </Flex>
  );
}
