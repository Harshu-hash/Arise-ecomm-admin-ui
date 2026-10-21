import { App, Button, Flex, Progress, Space, Tag, Tooltip, Typography } from 'antd';
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
import { walletApi, walletKeys } from '../api/wallet.api';
import CashbackRuleModal from '../components/CashbackRuleModal';

const TRIGGER_LABEL = {
  FIRST_ORDER: 'First order',
  PAYMENT_METHOD: 'Payment method',
  CATEGORY: 'Category',
  CHANNEL: 'App or web',
};

/**
 * Cashback rules — the accrual side of the wallet.
 *
 * Each rule has a per-order cap and a total budget, both mandatory: an
 * uncapped percentage rule is how a promotion quietly costs more than the
 * margin it was meant to buy.
 */
export default function CashbackRulesPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-accruedPaise' });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [pausing, setPausing] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: walletKeys.cashback({ ...state.queryParams, tab: state.tab }),
    url: '/cashback-rules',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const toggle = useMutation({
    mutationFn: ({ id, payload }) => walletApi.updateCashbackRule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setPausing(null);
      message.success('Rule updated');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'name', title: 'Rule', dataIndex: 'name', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {TRIGGER_LABEL[row.trigger] ?? row.trigger}
            {row.categoryRootName ? ` · ${row.categoryRootName}` : ''}
            {row.paymentMethod ? ` · ${row.paymentMethod}` : ''}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'cashbackPct', title: 'Cashback', dataIndex: 'cashbackPct', align: 'right', priority: 1,
      render: (v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <Typography.Text strong className="tabular" style={{ fontSize: 13 }}>{v}%</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>
            max <MoneyText paise={row.maxCashbackPaise} />
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'minOrderPaise', title: 'Min order', dataIndex: 'minOrderPaise', align: 'right', priority: 3,
      render: (v) => (v ? <MoneyText paise={v} /> : <Typography.Text type="secondary">none</Typography.Text>),
    },
    {
      key: 'budget', title: 'Budget used', dataIndex: 'budgetUsedPct', sorter: true, priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2} style={{ minWidth: 130 }}>
          <Progress
            percent={Math.min(100, v)}
            size="small"
            showInfo={false}
            status={v >= 90 ? 'exception' : 'active'}
          />
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>
            <MoneyText paise={row.accruedPaise} compact /> of <MoneyText paise={row.budgetPaise} compact />
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'creditAfterReturnWindow', title: 'Credited', dataIndex: 'creditAfterReturnWindow', priority: 2,
      render: (v, row) => (
        <Tooltip
          title={
            v
              ? 'Held until the return window closes, so cashback is not paid on orders that come straight back.'
              : 'Credited immediately, before the return window closes.'
          }
        >
          <Tag color={v ? 'green' : 'gold'} style={{ marginInlineEnd: 0 }}>
            {v ? 'after return window' : `${row.creditDelayDays} days`}
          </Tag>
        </Tooltip>
      ),
    },
    {
      key: 'ordersCount', title: 'Orders', dataIndex: 'ordersCount', align: 'right', priority: 3,
      render: (v) => <Typography.Text className="tabular" style={{ fontSize: 13 }}>{v}</Typography.Text>,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="cashbackRule" code={v} />,
    },
    {
      key: 'endsAt', title: 'Ends', dataIndex: 'endsAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        row.status === 'ENDED' ? null : (
          <Space size={4} onClick={(e) => e.stopPropagation()}>
            <Can perm="wallet.cashback.edit">
              <Button size="small" onClick={() => setEditing(row)}>Edit</Button>
            </Can>
            <Can perm="wallet.cashback.pause">
              <Button size="small" type="text" onClick={() => setPausing(row)}>
                {row.status === 'PAUSED' ? 'Resume' : 'Pause'}
              </Button>
            </Can>
          </Space>
        ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Cashback rules"
        breadcrumbs={[{ label: 'Wallet' }, { label: 'Cashback' }]}
        subtitle="Cashback accrues to the wallet, not to the card. Every rule carries a per-order cap and a total budget."
        actions={
          <Can perm="wallet.cashback.create">
            <Button type="primary" onClick={() => setCreating(true)}>New rule</Button>
          </Can>
        }
      />

      <FilterBar
        schema={[
          {
            key: 'trigger', label: 'Trigger', kind: 'select', width: 180,
            options: Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search rule name"
      />

      <DataTable
        tableId="cashbackRules"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'ACTIVE', label: 'Running' },
          { key: 'SCHEDULED', label: 'Scheduled' },
          { key: 'PAUSED', label: 'Paused' },
          { key: 'ENDED', label: 'Ended' },
        ]}
        emptyProps={{ title: 'No cashback rules yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
              <Typography.Text strong className="tabular">{row.cashbackPct}%</Typography.Text>
            </Flex>
            <Flex justify="space-between" gap={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.budgetUsedPct}% of budget used
              </Typography.Text>
              <StatusTag domain="cashbackRule" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <CashbackRuleModal
        open={creating || Boolean(editing)}
        rule={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmActionModal
        open={Boolean(pausing)}
        onCancel={() => setPausing(null)}
        onConfirm={() =>
          toggle.mutate({
            id: pausing.id,
            payload: { status: pausing.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED', version: pausing.version },
          })
        }
        loading={toggle.isPending}
        title={pausing?.status === 'PAUSED' ? 'Resume this rule' : 'Pause this rule'}
        description={pausing?.name}
        impact={
          pausing?.status === 'PAUSED'
            ? 'Orders start accruing cashback again from the moment this is saved.'
            : 'Orders placed from now on accrue nothing. Cashback already accrued is still credited to customers — pausing does not claw it back.'
        }
        reasonRequired={false}
        showNote={false}
        confirmLabel={pausing?.status === 'PAUSED' ? 'Resume' : 'Pause'}
      />
    </Flex>
  );
}
