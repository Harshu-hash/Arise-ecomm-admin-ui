import { App, Button, Col, Flex, Form, InputNumber, Row, Segmented, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { adsApi, adsKeys } from '../api/ads.api';
import InvalidTrafficTable from '../components/InvalidTrafficTable';
import WalletLedgerDrawer from '../components/WalletLedgerDrawer';

/** Advertiser billing (M11.4): wallets, recharges, invoices, and invalid-traffic credits in one place. */
export default function BillingPage() {
  const { message } = App.useApp();
  const [view, setView] = useState('wallets');
  const state = useUrlTableState({ defaultSort: 'balancePaise' });
  const [viewingWallet, setViewingWallet] = useState(null);
  const [recharging, setRecharging] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: adsKeys.wallets(state.queryParams),
    url: '/ads/billing/wallets',
    params: state.queryParams,
  });
  const invoicesState = useUrlTableState({ defaultSort: '-issuedAt' });
  const invoices = useListQuery({
    queryKey: adsKeys.invoices(invoicesState.queryParams),
    url: '/ads/billing/invoices',
    params: invoicesState.queryParams,
  });

  const recharge = useMutation({
    mutationFn: ({ id, amountPaise }) => adsApi.rechargeWallet(id, amountPaise),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      refetch();
      setRecharging(null);
      message.success('Recharged');
    },
    onError: (e) => message.error(e.message),
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'sellerName', title: 'Advertiser', dataIndex: 'sellerName', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Tag style={{ marginInlineEnd: 0, width: 'fit-content' }}>{row.fundingMode === 'PREPAID' ? 'Prepaid wallet' : 'Deducted from payout'}</Tag>
        </Flex>
      ),
    },
    {
      key: 'balancePaise', title: 'Balance', dataIndex: 'balancePaise', sorter: true, align: 'right', priority: 1,
      render: (v, row) => row.fundingMode === 'PREPAID'
        ? <MoneyText paise={v} strong type={row.lowBalance ? 'danger' : undefined} />
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'lowBalance', title: '', priority: 1,
      render: (_v, row) => (row.lowBalance ? <Tag color="red" style={{ marginInlineEnd: 0 }}>Low balance</Tag> : null),
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} onClick={(e) => e.stopPropagation()}>
          <Button size="small" type="text" onClick={() => setViewingWallet(row.id)}>Ledger</Button>
          {row.fundingMode === 'PREPAID' && (
            <Can perm="ads.billing.credit">
              <Button size="small" onClick={() => setRecharging(row)}>Recharge</Button>
            </Can>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Advertiser billing"
        breadcrumbs={[{ label: 'Sponsored Ads' }, { label: 'Billing' }]}
        subtitle="Prepaid wallets fund ad spend directly; deduct-from-payout advertisers are settled through the seller payout instead."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12}>
          <StatCard label="Low-balance advertisers" value={summary?.lowBalanceCount ?? 0} loading={loading} />
        </Col>
      </Row>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'wallets', label: 'Wallets' },
          { value: 'invoices', label: 'Invoices' },
          { value: 'invalidTraffic', label: 'Invalid traffic' },
        ]}
      />

      {view === 'wallets' && (
        <DataTable
          tableId="advertiserWallets"
          columns={columns}
          rows={rows}
          meta={meta}
          loading={loading || fetching}
          error={error}
          onRetry={refetch}
          tableState={state}
          emptyProps={{ title: 'No advertiser wallets yet' }}
          mobileCard={(row) => (
            <Flex vertical gap={4}>
              <Flex justify="space-between" gap={8}>
                <Typography.Text strong style={{ fontSize: 13 }}>{row.sellerName}</Typography.Text>
                {row.fundingMode === 'PREPAID' ? <MoneyText paise={row.balancePaise} strong /> : <Typography.Text type="secondary">—</Typography.Text>}
              </Flex>
            </Flex>
          )}
        />
      )}

      {view === 'invoices' && (
        <DataTable
          tableId="adInvoices"
          columns={[
            { key: 'invoiceNo', title: 'Invoice', dataIndex: 'invoiceNo', render: (v) => <Typography.Text className="mono" style={{ fontSize: 12 }}>{v}</Typography.Text> },
            { key: 'sellerName', title: 'Advertiser', dataIndex: 'sellerName' },
            { key: 'period', title: 'Period', dataIndex: 'period' },
            { key: 'spendPaise', title: 'Spend', dataIndex: 'spendPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
            { key: 'gstPaise', title: 'GST', dataIndex: 'gstPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
            { key: 'totalPaise', title: 'Total', dataIndex: 'totalPaise', align: 'right', render: (v) => <MoneyText paise={v} strong /> },
            { key: 'issuedAt', title: 'Issued', dataIndex: 'issuedAt', render: (v) => <DateText value={v} variant="date" /> },
          ]}
          rows={invoices.rows}
          meta={invoices.meta}
          loading={invoices.loading}
          error={invoices.error}
          onRetry={invoices.refetch}
          tableState={invoicesState}
          emptyProps={{ title: 'No invoices generated yet' }}
        />
      )}

      {view === 'invalidTraffic' && <InvalidTrafficTable />}

      <WalletLedgerDrawer walletId={viewingWallet} onClose={() => setViewingWallet(null)} />

      <ConfirmActionModal
        open={Boolean(recharging)}
        onCancel={() => setRecharging(null)}
        onConfirm={(v) => recharge.mutate({ id: recharging.id, amountPaise: Math.round(v.amountRupees * 100) })}
        loading={recharge.isPending}
        title="Recharge this advertiser's wallet"
        description={recharging?.sellerName}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Recharge"
        extraFields={
          <Form.Item name="amountRupees" label="Amount (₹)" rules={[{ required: true, message: 'Enter an amount.' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        }
      />
    </Flex>
  );
}
