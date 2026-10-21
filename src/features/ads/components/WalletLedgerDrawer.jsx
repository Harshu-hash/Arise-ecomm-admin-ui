import { Drawer, Flex, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import MoneyText from '@shared/components/MoneyText';
import { adsApi, adsKeys } from '../api/ads.api';

const LEDGER_COLOR = {
  RECHARGE: 'green',
  SPEND: 'default',
  INVALID_CLICK_CREDIT: 'blue',
};

/** A wallet's own ledger — recharges, spend debits, and invalid-traffic credits in one timeline. */
export default function WalletLedgerDrawer({ walletId, onClose }) {
  const query = useQuery({
    queryKey: adsKeys.wallet(walletId),
    queryFn: () => adsApi.wallet(walletId),
    enabled: Boolean(walletId),
  });

  const wallet = query.data?.data;

  return (
    <Drawer open={Boolean(walletId)} onClose={onClose} title={wallet?.sellerName ?? 'Wallet'} width={520}>
      {query.isLoading && <Typography.Text type="secondary">Loading…</Typography.Text>}
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
      {wallet && (
        <Flex vertical gap={16}>
          <Flex justify="space-between">
            <Typography.Text type="secondary">Balance</Typography.Text>
            {wallet.fundingMode === 'PREPAID' ? <MoneyText paise={wallet.balancePaise} strong /> : <Tag>Deducted from payout</Tag>}
          </Flex>

          <Table
            size="small"
            rowKey="id"
            pagination={{ pageSize: 10, size: 'small' }}
            dataSource={wallet.ledger}
            columns={[
              { key: 'createdAt', title: 'Date', dataIndex: 'createdAt', render: (v) => <DateText value={v} /> },
              { key: 'type', title: 'Type', dataIndex: 'type', render: (v) => <Tag color={LEDGER_COLOR[v] ?? 'default'} style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ')}</Tag> },
              { key: 'description', title: 'Description', dataIndex: 'description' },
              {
                key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', align: 'right',
                render: (v) => <MoneyText paise={v} type={v < 0 ? 'danger' : 'success'} />,
              },
            ]}
          />
        </Flex>
      )}
    </Drawer>
  );
}
