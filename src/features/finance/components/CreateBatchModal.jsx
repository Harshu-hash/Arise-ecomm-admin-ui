import { App, Alert, DatePicker, Form, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { dayjs } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import MoneyText from '@shared/components/MoneyText';
import { financeApi } from '../api/finance.api';

/**
 * Builds a payout batch for a settlement period.
 *
 * The batch is only the first half of the cycle: it claims the eligible lines
 * and then waits for someone else to release it. The modal says so, because a
 * finance executive who thinks they have just paid 200 sellers will not chase
 * the approver.
 */
export default function CreateBatchModal({ open, onClose, payablePaise, lineCount, sellerCount }) {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: (payload) => financeApi.createBatch(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      message.success('Batch built and sent for release');
      onClose();
      navigate(`/finance/payouts/${res.data.id}`);
    },
    onError: (e) => message.error(e.message),
  });

  return (
    <ConfirmActionModal
      open={open}
      onCancel={onClose}
      onConfirm={(values) =>
        create.mutate({
          periodStart: values.period[0].startOf('day').toISOString(),
          periodEnd: values.period[1].endOf('day').toISOString(),
        })
      }
      loading={create.isPending}
      title="Build a payout batch"
      description="Only settlements that are eligible and not already in a batch are included."
      impact={
        <span>
          Up to <MoneyText paise={payablePaise} strong /> across {lineCount} settlement lines and{' '}
          {sellerCount} sellers. Nothing is sent to any bank until a second person releases the batch.
        </span>
      }
      reasonRequired={false}
      showNote={false}
      confirmLabel="Build batch"
      extraFields={
        <>
          <Form.Item
            name="period"
            label="Settlement period"
            initialValue={[dayjs().subtract(7, 'day'), dayjs()]}
            rules={[{ required: true, message: 'Choose the period to settle.' }]}
            extra="Based on the delivery date of each item, not the order date."
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="Lines on hold stay behind"
            description={
              <Typography.Text style={{ fontSize: 12 }}>
                Items inside their return window, items with an open return, and sellers whose
                payouts are suspended are all excluded automatically. Approved adjustments —
                penalties, claim payouts, ad spend — are swept into this batch.
              </Typography.Text>
            }
          />
        </>
      }
    />
  );
}
