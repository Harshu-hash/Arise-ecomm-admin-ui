import { App, Alert, Button, Drawer, Flex, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { formatINR } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import { walletApi, walletKeys } from '../api/wallet.api';
import AdjustWalletModal from './AdjustWalletModal';

/** One customer's wallet: balance, ledger, and the actions on it. */
export default function WalletDetailDrawer({ walletId, onClose }) {
  const { message } = App.useApp();
  const [adjusting, setAdjusting] = useState(false);
  const [freezing, setFreezing] = useState(false);

  const query = useQuery({
    queryKey: walletKeys.account(walletId),
    queryFn: () => walletApi.account(walletId),
    enabled: Boolean(walletId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wallet'] });

  const freeze = useMutation({
    mutationFn: (payload) => walletApi.freeze(walletId, payload),
    onSuccess: () => {
      invalidate();
      setFreezing(false);
      message.success('Wallet updated');
    },
    onError: (e) => message.error(e.message),
  });

  const account = query.data?.data;
  const frozen = account?.status === 'FROZEN';

  return (
    <Drawer
      open={Boolean(walletId)}
      onClose={onClose}
      width={560}
      title={account ? account.customerName : 'Wallet'}
      extra={
        account ? (
          <Space>
            <Can perm="wallet.adjust.create">
              <Button size="small" onClick={() => setAdjusting(true)} disabled={frozen}>
                Credit or debit
              </Button>
            </Can>
            <Can perm="wallet.account.freeze">
              <Button size="small" danger={!frozen} onClick={() => setFreezing(true)}>
                {frozen ? 'Unfreeze' : 'Freeze'}
              </Button>
            </Can>
          </Space>
        ) : null
      }
    >
      {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      {account ? (
        <Flex vertical gap={12}>
          {frozen ? (
            <Alert type="error" showIcon message="This wallet is frozen" description={account.frozenReason} />
          ) : null}

          <Flex gap={24} wrap>
            <Statistic title="Balance" value={formatINR(account.balancePaise)} />
            <Statistic title="Credited, lifetime" value={formatINR(account.lifetimeCreditedPaise)} />
            <Statistic title="Spent, lifetime" value={formatINR(account.lifetimeDebitedPaise)} />
          </Flex>

          {account.expiringSoonPaise ? (
            <Alert
              type="warning"
              showIcon
              message={`${formatINR(account.expiringSoonPaise)} expires within 30 days`}
              description="Promotional credit and cashback expire; refunded money does not. Support is often asked about this."
            />
          ) : null}

          <Flex justify="space-between" align="center">
            <Typography.Text strong style={{ fontSize: 13 }}>Ledger</Typography.Text>
            <StatusTag domain="walletAccount" code={account.status} />
          </Flex>

          <Table
            size="small"
            rowKey="id"
            dataSource={account.entries}
            pagination={account.entries.length > 15 ? { pageSize: 15, size: 'small' } : false}
            columns={[
              {
                key: 'createdAt', title: 'When', dataIndex: 'createdAt', width: 110,
                render: (v) => <DateText value={v} variant="date" />,
              },
              {
                key: 'reason', title: 'Entry', dataIndex: 'reason',
                render: (v, row) => (
                  <Flex vertical gap={0} style={{ minWidth: 0 }}>
                    <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>
                    <Space size={4}>
                      <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>{row.type.toLowerCase()}</Tag>
                      {row.orderId ? (
                        <Link to={`/orders/${row.orderId}`}>
                          <Typography.Text className="mono" style={{ fontSize: 10 }}>{row.orderId}</Typography.Text>
                        </Link>
                      ) : null}
                      {row.expiresAt ? (
                        <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                          expires <DateText value={row.expiresAt} variant="date" />
                        </Typography.Text>
                      ) : null}
                    </Space>
                  </Flex>
                ),
              },
              {
                key: 'amountPaise', title: 'Amount', dataIndex: 'amountPaise', width: 100, align: 'right',
                render: (v, row) => (
                  <MoneyText paise={row.direction === 'CREDIT' ? v : -v} colorBySign signed />
                ),
              },
              {
                key: 'balanceAfterPaise', title: 'Balance', dataIndex: 'balanceAfterPaise', width: 100, align: 'right',
                render: (v) => <MoneyText paise={v} />,
              },
            ]}
          />

          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            The balance is derived from this ledger, never stored on its own — so the two can never
            disagree.
          </Typography.Text>
        </Flex>
      ) : null}

      <AdjustWalletModal
        account={adjusting ? account : null}
        onClose={() => setAdjusting(false)}
        onDone={() => {
          invalidate();
          setAdjusting(false);
        }}
      />

      <ConfirmActionModal
        open={freezing}
        onCancel={() => setFreezing(false)}
        onConfirm={(values) => freeze.mutate({ frozen: !frozen, reason: values.reason })}
        loading={freeze.isPending}
        danger={!frozen}
        title={frozen ? 'Unfreeze this wallet' : 'Freeze this wallet'}
        description={account?.customerName}
        impact={
          frozen
            ? 'The customer can spend their balance again, and credits resume.'
            : 'The customer cannot spend their balance and no new credit can be added. Use this only while an investigation is open — it blocks legitimate refunds too.'
        }
        reasonRequired
        reasonLabel={frozen ? 'Why is it being unfrozen?' : 'Why is it being frozen?'}
        showNote={false}
        confirmLabel={frozen ? 'Unfreeze' : 'Freeze wallet'}
      />
    </Drawer>
  );
}
