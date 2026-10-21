import { Alert, Col, Flex, Row, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { walletKeys } from '../api/wallet.api';
import WalletDetailDrawer from '../components/WalletDetailDrawer';

/**
 * Customer wallets.
 *
 * The wallet is store credit only: it is funded by refunds, cashback, gift
 * cards and goodwill, and can only be spent on Arise. There is no transfer
 * between customers and no cash-out, which is what keeps it outside the
 * prepaid-instrument rules.
 */
export default function WalletAccountsPage() {
  const state = useUrlTableState({ defaultSort: '-balancePaise' });
  const [selected, setSelected] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: walletKeys.accounts({ ...state.queryParams, tab: state.tab }),
    url: '/wallets',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'customerName', title: 'Customer', dataIndex: 'customerName', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Link to={`/customers/${row.customerId}`} onClick={(e) => e.stopPropagation()}>{v}</Link>
          <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
            {row.customerPhone}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'balancePaise', title: 'Balance', dataIndex: 'balancePaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    {
      key: 'lifetimeCreditedPaise', title: 'Credited', dataIndex: 'lifetimeCreditedPaise', sorter: true, align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'lifetimeDebitedPaise', title: 'Spent', dataIndex: 'lifetimeDebitedPaise', align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => <StatusTag domain="walletAccount" code={v} tooltip={row.frozenReason ?? undefined} />,
    },
    {
      key: 'id', title: 'Wallet', dataIndex: 'id', priority: 3,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Wallet accounts"
        breadcrumbs={[{ label: 'Wallet' }, { label: 'Accounts' }]}
        subtitle="Store credit only — funded by refunds, cashback and gift cards, spendable on Arise. No transfers, no cash-out."
      />

      <Alert
        type="info"
        showIcon
        message="Unspent balances are a liability, not revenue"
        description="Every rupee here is something a customer can still spend. Finance carries the total on the balance sheet until it is used or expires."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Outstanding balance" valuePaise={summary?.liabilityPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Wallets holding credit" value={summary?.accountsWithBalance} loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Frozen" value={summary?.frozenCount} loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[{ key: 'balancePaise', label: 'Balance (paise)', kind: 'numberRange', width: 220 }]}
        tableState={state}
        searchPlaceholder="Search customer, phone or wallet id"
      />

      <DataTable
        tableId="walletAccounts"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setSelected(row.id)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'FROZEN', label: 'Frozen' },
        ]}
        emptyProps={{ title: 'No wallets match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.customerName}</Typography.Text>
              <MoneyText paise={row.balancePaise} strong />
            </Flex>
            <Flex justify="space-between" gap={8}>
              <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
                {row.customerPhone}
              </Typography.Text>
              <StatusTag domain="walletAccount" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <WalletDetailDrawer walletId={selected} onClose={() => setSelected(null)} />
    </Flex>
  );
}
