import { App, Form, Segmented } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import EntitySelect from '@shared/components/EntitySelect';
import { financeApi } from '../api/finance.api';

/**
 * Holding or releasing a seller's payouts.
 *
 * A hold stops money leaving immediately — their unbatched settlements are
 * re-marked on the spot rather than at the next cycle. Releasing it does not
 * blanket-approve everything: each line is re-evaluated, so items inside
 * their return window stay held.
 */
export default function PayoutHoldModal({ open, onClose, sellerId }) {
  const { message } = App.useApp();
  const [seller, setSeller] = useState(sellerId ?? null);
  const [mode, setMode] = useState('HOLD');

  const onHold = mode === 'HOLD';

  const save = useMutation({
    mutationFn: (payload) => financeApi.holdSellerPayouts(seller, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      message.success('Done');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        message.info('Sent for approval. It takes effect once another approver agrees.');
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
      onConfirm={(values) => save.mutate({ onHold, reason: values.reason })}
      loading={save.isPending}
      danger={onHold}
      needsApproval
      title={onHold ? 'Hold a seller’s payouts' : 'Release a payout hold'}
      description="Both directions need a second approver."
      impact={
        onHold
          ? 'Every settlement not already in a batch stops being payable immediately, including money the seller has already earned. Their listings and orders are unaffected.'
          : 'Settlements become payable again — except any still inside their return window, or with an open return or claim, which stay held for their own reasons.'
      }
      reasonRequired
      reasonLabel={onHold ? 'Why are payouts being held?' : 'Why is the hold being released?'}
      showNote={false}
      extraFields={
        <>
          <Form.Item label="Action">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'HOLD', label: 'Hold payouts' },
                { value: 'RELEASE', label: 'Release hold' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Seller" required>
            <EntitySelect entity="seller" value={seller} onChange={setSeller} placeholder="Search sellers" />
          </Form.Item>
        </>
      }
    />
  );
}
