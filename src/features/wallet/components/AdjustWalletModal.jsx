import { App, Alert, DatePicker, Flex, Form, InputNumber, Select, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { formatINR } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import { walletApi } from '../api/wallet.api';

const CREDIT_TYPES = [
  { value: 'GOODWILL', label: 'Goodwill — service recovery' },
  { value: 'REFUND', label: 'Refund credited to wallet' },
  { value: 'PROMO', label: 'Promotional credit' },
];

/**
 * A manual credit or debit.
 *
 * Above the agent's own limit this becomes an approval request rather than a
 * credit — the modal says so on the button, so nobody walks away thinking the
 * customer has the money.
 */
export default function AdjustWalletModal({ account, onClose, onDone }) {
  const { message } = App.useApp();
  const [direction, setDirection] = useState('CREDIT');
  const [amount, setAmount] = useState(100);

  const save = useMutation({
    mutationFn: (payload) => walletApi.adjust(account.id, payload),
    onSuccess: () => {
      message.success(direction === 'CREDIT' ? 'Credit added' : 'Balance debited');
      onDone();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        message.info('Sent for approval. The credit appears once another admin approves it.');
        onDone();
        return;
      }
      message.error(e.message);
    },
  });

  const paise = Math.round((amount ?? 0) * 100);
  const overBalance = direction === 'DEBIT' && account && paise > account.balancePaise;

  return (
    <ConfirmActionModal
      open={Boolean(account)}
      onCancel={onClose}
      onConfirm={(values) =>
        save.mutate({
          direction,
          amountPaise: paise,
          type: direction === 'CREDIT' ? values.type : undefined,
          expiresAt: values.expiresAt ? values.expiresAt.endOf('day').toISOString() : undefined,
          reason: values.reason,
        })
      }
      loading={save.isPending}
      title={direction === 'CREDIT' ? 'Credit this wallet' : 'Debit this wallet'}
      description={account ? `${account.customerName} · balance ${formatINR(account.balancePaise)}` : ''}
      impact={
        direction === 'CREDIT' ? (
          <span>
            {formatINR(paise)} becomes spendable on Arise immediately, and is carried as a liability
            until it is used. Large credits need a second approver.
          </span>
        ) : (
          <span>
            {formatINR(paise)} is removed from the customer’s balance. Only do this to reverse credit
            that was issued in error — never to recover money owed on an order.
          </span>
        )
      }
      reasonRequired
      reasonLabel="Why is this adjustment being made?"
      showNote={false}
      confirmLabel={direction === 'CREDIT' ? 'Add credit' : 'Debit balance'}
      extraFields={
        <>
          <Flex gap={8}>
            <Form.Item label="Direction" style={{ flex: '1 1 160px' }}>
              <Select
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'CREDIT', label: 'Credit — give money' },
                  { value: 'DEBIT', label: 'Debit — take money back' },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="Amount (₹)"
              style={{ flex: '1 1 120px' }}
              validateStatus={overBalance ? 'error' : undefined}
              help={overBalance ? `Only ${formatINR(account.balancePaise)} is available.` : undefined}
            >
              <InputNumber
                value={amount}
                onChange={setAmount}
                min={1}
                max={100000}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Flex>

          {direction === 'CREDIT' ? (
            <>
              <Form.Item name="type" label="Reason code" initialValue="GOODWILL">
                <Select options={CREDIT_TYPES} />
              </Form.Item>
              <Form.Item
                name="expiresAt"
                label="Expires on (optional)"
                extra="Promotional credit should expire. Money being refunded must not."
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          ) : (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="A debit is visible to the customer"
              description={
                <Typography.Text style={{ fontSize: 12 }}>
                  It appears in their wallet history with the reason you give here, so write it for
                  them to read.
                </Typography.Text>
              }
            />
          )}
        </>
      }
    />
  );
}
