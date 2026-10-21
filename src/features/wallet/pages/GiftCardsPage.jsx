import { App, Alert, Button, Col, Flex, Row, Typography } from 'antd';
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
import StatCard from '@shared/components/StatCard';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { walletApi, walletKeys } from '../api/wallet.api';
import GenerateGiftCardsModal from '../components/GenerateGiftCardsModal';

/**
 * Gift cards.
 *
 * A card is a bearer instrument: whoever holds the code can spend it. So the
 * full code is never shown or returned by the API — only the last four
 * digits — and blocking a card is available on every active one.
 */
export default function GiftCardsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-issuedAt' });
  const [generating, setGenerating] = useState(false);
  const [blocking, setBlocking] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: walletKeys.giftCards({ ...state.queryParams, tab: state.tab }),
    url: '/gift-cards',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const block = useMutation({
    mutationFn: ({ id, payload }) => walletApi.blockGiftCard(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setBlocking(null);
      message.success('Card blocked');
    },
    onError: (e) => message.error(e.message),
  });

  const summary = meta?.summary;
  const programs = meta?.programs ?? [];

  const columns = [
    {
      key: 'codeLast4', title: 'Card', dataIndex: 'codeLast4', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text className="mono" strong style={{ fontSize: 12 }}>•••• {v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.programName}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'facePaise', title: 'Face value', dataIndex: 'facePaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'balancePaise', title: 'Unspent', dataIndex: 'balancePaise', sorter: true, align: 'right', priority: 1,
      render: (v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <MoneyText paise={v} strong />
          {row.redeemedPaise && row.status === 'ACTIVE' ? (
            <Typography.Text type="secondary" style={{ fontSize: 10 }}>part redeemed</Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => <StatusTag domain="giftCard" code={v} tooltip={row.blockedReason ?? undefined} />,
    },
    {
      key: 'issuedTo', title: 'Issued to', dataIndex: 'issuedTo', priority: 2,
      render: (v) => (
        <Typography.Text ellipsis style={{ fontSize: 12, maxWidth: 180 }}>{v ?? '—'}</Typography.Text>
      ),
    },
    {
      key: 'issuedAt', title: 'Issued', dataIndex: 'issuedAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'expiresAt', title: 'Expires', dataIndex: 'expiresAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['ACTIVE', 'EXPIRED'].includes(row.status) ? (
          <Can perm="wallet.giftcard.block">
            <Button size="small" danger onClick={(e) => { e.stopPropagation(); setBlocking(row); }}>
              Block
            </Button>
          </Can>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Gift cards"
        breadcrumbs={[{ label: 'Wallet' }, { label: 'Gift cards' }]}
        subtitle="Codes are shown only as their last four digits — a gift card is a bearer instrument and the full code is never displayed."
        actions={
          <Can perm="wallet.giftcard.generate">
            <Button type="primary" onClick={() => setGenerating(true)}>Generate cards</Button>
          </Can>
        }
      />

      <Alert
        type="info"
        showIcon
        message="Unspent card balances are a liability"
        description="Issuing cards does not earn revenue — it creates an obligation that is only discharged when the card is spent or expires."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Issued, face value" valuePaise={summary?.issuedPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Redeemed" valuePaise={summary?.redeemedPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Outstanding liability" valuePaise={summary?.liabilityPaise} format="money" loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          {
            key: 'programId', label: 'Programme', kind: 'select', width: 200,
            options: programs.map((p) => ({ value: p.id, label: p.name })),
          },
          { key: 'expiresAt', label: 'Expires', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search last 4 digits, recipient or programme"
      />

      <DataTable
        tableId="giftCards"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'REDEEMED', label: 'Redeemed' },
          { key: 'EXPIRED', label: 'Expired' },
          { key: 'BLOCKED', label: 'Blocked' },
        ]}
        emptyProps={{ title: 'No gift cards match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>•••• {row.codeLast4}</Typography.Text>
              <MoneyText paise={row.balancePaise} strong />
            </Flex>
            <Flex justify="space-between" gap={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.programName}</Typography.Text>
              <StatusTag domain="giftCard" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <GenerateGiftCardsModal
        open={generating}
        programs={programs}
        onClose={() => setGenerating(false)}
      />

      <ConfirmActionModal
        open={Boolean(blocking)}
        onCancel={() => setBlocking(null)}
        onConfirm={(values) => block.mutate({ id: blocking.id, payload: { reason: values.reason } })}
        loading={block.isPending}
        danger
        title="Block this gift card"
        description={blocking ? `•••• ${blocking.codeLast4} · ${blocking.programName}` : ''}
        impact={
          <span>
            <MoneyText paise={blocking?.balancePaise ?? 0} strong /> can no longer be spent. If the
            card was bought legitimately, the holder will need a replacement issued.
          </span>
        }
        reasonRequired
        reasonLabel="Why is the card being blocked?"
        showNote={false}
        confirmLabel="Block card"
      />
    </Flex>
  );
}
