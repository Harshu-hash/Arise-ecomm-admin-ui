import { Col, Flex, Row, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { walletKeys } from '../api/wallet.api';
import useExport from '../../finance/useExport';

const TYPES = ['REFUND', 'CASHBACK', 'GIFT_CARD', 'GOODWILL', 'PROMO', 'PURCHASE', 'EXPIRY', 'REVERSAL'];

/**
 * The ledger across every wallet.
 *
 * Read as a stream rather than per customer, because that is where a pattern
 * shows: a spike in goodwill credits from one agent, or a run of expiries
 * about to generate complaints.
 */
export default function WalletLedgerPage() {
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const runExport = useExport('wallet-entries');

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: walletKeys.entries({ ...state.queryParams, tab: state.tab }),
    url: '/wallet-entries',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { direction: state.tab } : {}) },
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'createdAt', title: 'When', dataIndex: 'createdAt', sorter: true, alwaysVisible: true,
      render: (v) => <DateText value={v} variant="datetime" />,
    },
    {
      key: 'customerName', title: 'Customer', dataIndex: 'customerName', priority: 1,
      render: (v, row) => <Link to={`/customers/${row.customerId}`}>{v}</Link>,
    },
    {
      key: 'reason', title: 'Entry', dataIndex: 'reason', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Space size={4}>
            <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>{row.type.toLowerCase().replace(/_/g, ' ')}</Tag>
            {row.orderId ? (
              <Link to={`/orders/${row.orderId}`}>
                <Typography.Text className="mono" style={{ fontSize: 10 }}>{row.orderId}</Typography.Text>
              </Link>
            ) : null}
          </Space>
        </Flex>
      ),
    },
    {
      key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v, row) => <MoneyText paise={row.direction === 'CREDIT' ? v : -v} colorBySign signed strong />,
    },
    {
      key: 'balanceAfterPaise', title: 'Balance after', dataIndex: 'balanceAfterPaise', align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'actorName', title: 'By', dataIndex: 'actorName', priority: 2,
      render: (v) => (
        <Typography.Text type={v === 'System' ? 'secondary' : undefined} style={{ fontSize: 12 }}>{v}</Typography.Text>
      ),
    },
    {
      key: 'expiresAt', title: 'Expires', dataIndex: 'expiresAt', priority: 3,
      render: (v) => (v ? <DateText value={v} variant="date" /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Wallet ledger"
        breadcrumbs={[{ label: 'Wallet' }, { label: 'Ledger' }]}
        subtitle="Every credit and debit across all wallets, append-only. Nothing is edited or deleted — a correction is another entry."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Credited, all time" valuePaise={summary?.creditedPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Spent, all time" valuePaise={summary?.debitedPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Issued as goodwill" valuePaise={summary?.goodwillPaise} format="money" loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          {
            key: 'type', label: 'Entry type', kind: 'multiSelect', width: 200,
            options: TYPES.map((v) => ({ value: v, label: v.toLowerCase().replace(/_/g, ' ') })),
          },
          { key: 'createdAt', label: 'When', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search customer id, order or reason"
      />

      <DataTable
        tableId="walletLedger"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'CREDIT', label: 'Credits' },
          { key: 'DEBIT', label: 'Debits' },
        ]}
        facetField="direction"
        onExport={() => runExport(state.queryParams)}
        exportPerm="wallet.ledger.export"
        emptyProps={{ title: 'No ledger entries match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.customerName}</Typography.Text>
              <MoneyText paise={row.direction === 'CREDIT' ? row.amountPaise : -row.amountPaise} colorBySign signed />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.reason}</Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
