import { App, Alert, Button, Flex, Input, Select, Space, Switch, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { formatDateTime, fromNow } from '@core/utils/date';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';

const PLACEMENTS = [
  { value: 'PDP', label: 'Product page' },
  { value: 'CHECKOUT', label: 'Checkout' },
  { value: 'OFFERS_PAGE', label: 'Offers page' },
];

/**
 * Bank offer display (M10.8).
 *
 * Everything the gateway sends — rate, cap, minimum spend, EMI terms — is
 * read-only here; admin only controls whether, where and in what order an
 * offer is shown.
 */
export default function BankOffersPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'displayOrder' });
  const [editingCopy, setEditingCopy] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.bankOffers(state.queryParams),
    url: '/bank-offers',
    params: state.queryParams,
  });

  const update = useMutation({
    mutationFn: ({ id, payload }) => marketingApi.updateBankOffer(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'bankOffers'] }),
    onError: (e) => message.error(e.message),
  });
  const sync = useMutation({
    mutationFn: () => marketingApi.syncBankOffers(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'bankOffers'] });
      message.success(`Synced ${res.data.count} offers`);
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'bank', title: 'Bank', dataIndex: 'bank', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text strong style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.cardType.replace('_', ' ').toLowerCase()}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'discount', title: 'Offer (read-only)', priority: 1,
      render: (_v, row) => (
        <Typography.Text style={{ fontSize: 12 }}>
          {row.discountPct}% off, up to ₹{(row.capPaise / 100).toLocaleString('en-IN')}
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            min spend ₹{(row.minSpendPaise / 100).toLocaleString('en-IN')}
          </Typography.Text>
        </Typography.Text>
      ),
    },
    {
      key: 'validTo', title: 'Valid until', dataIndex: 'validTo', priority: 2,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <DateText value={v} variant="date" />
          {row.expired ? <Tag color="red" style={{ marginInlineEnd: 0, width: 'fit-content' }}>expired</Tag> : null}
        </Flex>
      ),
    },
    {
      key: 'adminVisible', title: 'Shown in app', dataIndex: 'adminVisible', priority: 1,
      render: (v, row) => (
        <Can perm="marketing.bankoffer.display" disable>
          <Switch
            size="small"
            checked={v}
            disabled={row.expired}
            onChange={(checked) => update.mutate({ id: row.id, payload: { adminVisible: checked } })}
          />
        </Can>
      ),
    },
    {
      key: 'placements', title: 'Placements', dataIndex: 'placements', priority: 2,
      render: (v, row) => (
        <Can perm="marketing.bankoffer.display" disable>
          <Select
            mode="multiple"
            size="small"
            style={{ minWidth: 160 }}
            value={v}
            options={PLACEMENTS}
            maxTagCount="responsive"
            onChange={(placements) => update.mutate({ id: row.id, payload: { placements } })}
          />
        </Can>
      ),
    },
    {
      key: 'titleOverride', title: 'Display copy', priority: 3,
      render: (_v, row) =>
        editingCopy === row.id ? (
          <Input
            size="small"
            autoFocus
            defaultValue={row.titleOverride ?? ''}
            onBlur={(e) => { update.mutate({ id: row.id, payload: { titleOverride: e.target.value || null } }); setEditingCopy(null); }}
            onPressEnter={(e) => { update.mutate({ id: row.id, payload: { titleOverride: e.target.value || null } }); setEditingCopy(null); }}
          />
        ) : (
          <Can perm="marketing.bankoffer.display" disable>
            <Typography.Text
              style={{ fontSize: 12, cursor: 'pointer' }}
              onClick={() => setEditingCopy(row.id)}
              type={row.titleOverride ? undefined : 'secondary'}
            >
              {row.titleOverride ?? 'default copy — click to override'}
            </Typography.Text>
          </Can>
        ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Bank offer display"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Bank offer display' }]}
        subtitle="Rates come from the payment gateway's own offer engine. Admin only controls visibility, placement and display order."
        actions={
          <Can perm="marketing.bankoffer.display">
            <Space>
              {meta?.lastSyncedAt && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }} title={formatDateTime(meta.lastSyncedAt)}>
                  Last synced {fromNow(meta.lastSyncedAt)}
                </Typography.Text>
              )}
              <Button onClick={() => sync.mutate()} loading={sync.isPending}>Sync now</Button>
            </Space>
          </Can>
        }
      />

      <Alert type="info" showIcon message="The rate, cap and minimum spend are never editable here — they come from the gateway." />

      <DataTable
        tableId="bankOffers"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No bank offers synced yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.bank}</Typography.Text>
              <Switch size="small" checked={row.adminVisible} disabled />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.discountPct}% off</Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
