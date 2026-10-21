import { App, Alert, Form, Input, InputNumber, Select, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { formatINR } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import { walletApi } from '../api/wallet.api';

/**
 * Generating a batch of cards.
 *
 * This creates a liability out of nothing, so a large batch needs a second
 * approver. The total is shown before the button, because "100 × ₹5,000" does
 * not read as five lakh rupees until it is spelled out.
 */
export default function GenerateGiftCardsModal({ open, programs, onClose }) {
  const { message } = App.useApp();
  const [programId, setProgramId] = useState(null);
  const [facePaise, setFacePaise] = useState(null);
  const [quantity, setQuantity] = useState(10);

  const program = programs.find((p) => p.id === programId) ?? programs[0];
  const denominations = program?.denominationsPaise ?? [];
  const face = facePaise ?? denominations[0];
  const totalPaise = (face ?? 0) * (quantity ?? 0);

  const generate = useMutation({
    mutationFn: (payload) => walletApi.generateGiftCards(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      message.success(`${res.data.count} cards generated`);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        message.info('Sent for approval. The cards are created once another admin approves it.');
        onClose();
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
        generate.mutate({
          programId: program?.id,
          facePaise: face,
          quantity,
          issuedTo: values.issuedTo,
          reason: values.reason,
        })
      }
      loading={generate.isPending}
      title="Generate gift cards"
      description={program?.name}
      impact={
        <span>
          {quantity} cards at {formatINR(face ?? 0)} each — a total liability of{' '}
          <strong>{formatINR(totalPaise)}</strong>. Codes are generated server-side and never shown
          in full.
        </span>
      }
      reasonRequired
      reasonLabel="What is this batch for?"
      showNote={false}
      confirmLabel="Generate"
      extraFields={
        <>
          <Form.Item label="Programme" required>
            <Select
              value={program?.id}
              onChange={(v) => {
                setProgramId(v);
                setFacePaise(null);
              }}
              options={programs.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>

          <Form.Item label="Denomination" required extra="Only the denominations this programme offers.">
            <Select
              value={face}
              onChange={setFacePaise}
              options={denominations.map((v) => ({ value: v, label: formatINR(v) }))}
            />
          </Form.Item>

          <Form.Item label="How many" required>
            <InputNumber value={quantity} onChange={setQuantity} min={1} max={500} style={{ width: 160 }} />
          </Form.Item>

          <Form.Item name="issuedTo" label="Issue to (optional)" extra="An email, or leave blank for unassigned stock.">
            <Input placeholder="rewards@company.example" />
          </Form.Item>

          {totalPaise > 10000000 ? (
            <Alert
              type="warning"
              showIcon
              message="This batch needs a second approver"
              description={
                <Typography.Text style={{ fontSize: 12 }}>
                  Batches over {formatINR(10000000)} are held for approval. Nothing is created until
                  someone else agrees.
                </Typography.Text>
              }
            />
          ) : null}
        </>
      }
    />
  );
}
