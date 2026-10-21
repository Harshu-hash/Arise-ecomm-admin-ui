import { App, Alert, Flex, Form, InputNumber, Select, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { formatINR } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import EntitySelect from '@shared/components/EntitySelect';
import { financeApi } from '../api/finance.api';

const TYPES = [
  { value: 'PENALTY', label: 'Penalty — SLA or policy breach', sign: -1 },
  { value: 'SHORTFALL_RECOVERY', label: 'Recovery of an overpayment', sign: -1 },
  { value: 'AD_SPEND', label: 'Sponsored ads spend', sign: -1 },
  { value: 'WEIGHT_DISPUTE', label: 'Weight discrepancy charge', sign: -1 },
  { value: 'CLAIM_PAYOUT', label: 'Approved claim — pay the seller', sign: 1 },
  { value: 'GOODWILL', label: 'Goodwill credit', sign: 1 },
];

/**
 * A manual adjustment to a seller's next payout.
 *
 * The direction follows the type rather than being typed as a signed number:
 * "-50000" in a free-text field is exactly the sort of entry that ends up
 * taking money when it meant to give it.
 */
export default function AdjustmentModal({ open, onClose, sellerId }) {
  const { message } = App.useApp();
  const [seller, setSeller] = useState(sellerId ?? null);
  const [type, setType] = useState('PENALTY');
  const [amount, setAmount] = useState(500);

  const rule = TYPES.find((t) => t.value === type);
  const signedPaise = Math.round((amount ?? 0) * 100) * (rule?.sign ?? -1);
  const takesMoney = signedPaise < 0;

  const save = useMutation({
    mutationFn: (payload) => financeApi.createAdjustment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      message.success('Adjustment raised');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        message.info('Sent for approval. It is applied to a payout once another approver agrees.');
        onClose();
        return;
      }
      if (e instanceof ApiError && e.fieldErrors) {
        message.error(Object.values(e.fieldErrors)[0]);
        return;
      }
      message.error(e.message);
    },
  });

  return (
    <ConfirmActionModal
      open={open}
      onCancel={onClose}
      onConfirm={(values) =>
        save.mutate({ sellerId: seller, type, amountPaise: signedPaise, note: values.reason })
      }
      loading={save.isPending}
      danger={takesMoney}
      title="Raise a payout adjustment"
      description="Applied to whichever batch picks the seller up next."
      impact={
        <span>
          {takesMoney ? 'Deducts ' : 'Adds '}
          <strong>{formatINR(Math.abs(signedPaise))}</strong>
          {takesMoney ? ' from' : ' to'} the seller’s next payout. Anything over{' '}
          {formatINR(1000000)} needs a second approver. The seller sees this line and the note you
          write, so write it for them.
        </span>
      }
      reasonRequired
      reasonLabel="Note to the seller"
      showNote={false}
      confirmLabel={takesMoney ? 'Raise deduction' : 'Raise credit'}
      extraFields={
        <>
          <Form.Item label="Seller" required>
            <EntitySelect entity="seller" value={seller} onChange={setSeller} placeholder="Search sellers" />
          </Form.Item>

          <Flex gap={8} wrap>
            <Form.Item label="Type" style={{ flex: '1 1 220px' }}>
              <Select value={type} onChange={setType} options={TYPES} />
            </Form.Item>
            <Form.Item label="Amount (₹)" style={{ flex: '1 1 120px' }}>
              <InputNumber value={amount} onChange={setAmount} min={1} max={500000} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>

          <Alert
            type={takesMoney ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            message={takesMoney ? 'This takes money from the seller' : 'This pays the seller'}
            description={
              <Typography.Text style={{ fontSize: 12 }}>
                {takesMoney
                  ? 'If their next settlement is smaller than the deduction, the payout goes negative and is carried forward rather than collected.'
                  : 'It is added on top of whatever the seller’s settlements come to.'}
              </Typography.Text>
            }
          />
        </>
      }
    />
  );
}
