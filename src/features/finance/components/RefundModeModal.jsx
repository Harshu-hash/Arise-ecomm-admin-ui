import { App, Alert, Form, Input, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import MoneyText from '@shared/components/MoneyText';
import { financeApi } from '../api/finance.api';

const MODES = [
  { value: 'ORIGINAL', label: 'Back to the original payment method' },
  { value: 'WALLET', label: 'Arise wallet (instant)' },
  { value: 'BANK', label: 'Bank transfer (needs account details)' },
];

/**
 * Changing where a refund is paid.
 *
 * This exists because the original route often cannot be used: a closed card,
 * an expired UPI handle, or a COD order that was never charged in the first
 * place. Each route has a different cost to the customer in waiting time, so
 * the modal says so rather than treating them as interchangeable.
 */
export default function RefundModeModal({ refund, onClose, onDone }) {
  const { message } = App.useApp();
  const [mode, setMode] = useState('WALLET');

  const save = useMutation({
    mutationFn: (payload) => financeApi.switchRefundMode(refund.id, payload),
    onSuccess: () => {
      message.success('Refund mode changed');
      onDone();
    },
    onError: (e) => message.error(e.message),
  });

  return (
    <ConfirmActionModal
      open={Boolean(refund)}
      onCancel={onClose}
      onConfirm={(values) =>
        save.mutate({
          mode,
          bankAccount: values.bankAccount,
          ifsc: values.ifsc,
          reason: values.reason,
        })
      }
      loading={save.isPending}
      title="Change where this refund is paid"
      description={`${refund?.id} · ${refund?.customerName}`}
      impact={
        <span>
          <MoneyText paise={refund?.amountPaise ?? 0} strong />{' '}
          {mode === 'WALLET'
            ? 'lands in the customer’s Arise wallet immediately, but can only be spent on Arise.'
            : mode === 'BANK'
              ? 'is sent by NEFT and takes 1–3 working days. The account details must be the customer’s own.'
              : 'goes back to the card or UPI handle that paid, and takes 5–7 working days to appear.'}
        </span>
      }
      reasonRequired
      reasonLabel="Why is the mode changing?"
      showNote={false}
      confirmLabel="Change mode"
      extraFields={
        <>
          <Form.Item label="Pay to" required>
            <Select value={mode} onChange={setMode} options={MODES} />
          </Form.Item>

          {mode === 'BANK' ? (
            <>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Verify these against the customer, on a recorded call"
                description="A refund sent to the wrong account cannot be recalled."
              />
              <Form.Item
                name="bankAccount"
                label="Account number"
                rules={[{ required: true, message: 'Account number is required for a bank transfer.' }]}
              >
                <Input placeholder="50100xxxxxxxxx" className="mono" />
              </Form.Item>
              <Form.Item
                name="ifsc"
                label="IFSC"
                rules={[
                  { required: true, message: 'IFSC is required.' },
                  { pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/, message: 'That is not a valid IFSC.' },
                ]}
              >
                <Input placeholder="HDFC0001234" className="mono" />
              </Form.Item>
            </>
          ) : null}
        </>
      }
    />
  );
}
