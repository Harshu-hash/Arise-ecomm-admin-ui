import { Alert, Form, Input, Select, Space } from 'antd';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import MoneyText from '@shared/components/MoneyText';

/** Reason lists mirror the mobile app's own CANCEL_REASONS and RETURN_REASONS. */
const CANCEL_REASONS = [
  'Ordered by mistake',
  'Found a better price elsewhere',
  'Item no longer needed',
  'Delivery time is too long',
  'Seller unable to fulfil',
  'Suspected fraud',
  'Other',
];

const RETURN_REASONS = [
  'Item is damaged or defective',
  'Wrong item delivered',
  'Item not as described',
  'Size/fit issue',
  'Changed my mind',
  'Other',
];

export default function OrderActionModals({
  which, order, selectedItems, returnItem, estimatedRefundPaise, loading, onCancel, onConfirm,
}) {
  const count = selectedItems?.length ?? 0;
  const isWholeOrder = count > 0 && count === order?.itemCount;

  return (
    <>
      <ConfirmActionModal
        open={which === 'CANCEL'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('CANCEL', v)}
        loading={loading}
        danger
        title={`Cancel ${count} item${count === 1 ? '' : 's'}?`}
        description={selectedItems?.map((i) => i.name).join(', ')}
        impact={
          <Space direction="vertical" size={2}>
            <span>
              Refund of <MoneyText paise={estimatedRefundPaise} strong /> to the original payment
              method.
            </span>
            {isWholeOrder && <span>Delivery and platform fees are refunded because the whole order is going.</span>}
            {!isWholeOrder && <span>Any coupon discount is recovered proportionally from this refund.</span>}
            {order?.paymentMethod === 'COD' && (
              <span>This is a COD order — nothing has been charged, so no refund is created.</span>
            )}
          </Space>
        }
        reasons={CANCEL_REASONS}
        reasonLabel="Reason"
        confirmLabel="Cancel items"
        extraFields={
          <Form.Item
            name="actor"
            label="Cancelled on behalf of"
            initialValue="CUSTOMER"
            extra="Seller-attributed cancellations count against the seller's performance."
          >
            <Select
              options={[
                { value: 'CUSTOMER', label: 'The customer asked' },
                { value: 'SELLER', label: 'Seller cannot fulfil' },
                { value: 'ADMIN', label: 'Arise decision' },
                { value: 'SYSTEM', label: 'Fraud or policy' },
              ]}
            />
          </Form.Item>
        }
      />

      <ConfirmActionModal
        open={which === 'RETURN'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('RETURN', v)}
        loading={loading}
        title="Start a return on the customer's behalf"
        description={returnItem?.name}
        impact="A pickup is arranged. The refund is released only after the item passes QC at the origin."
        reasons={RETURN_REASONS}
        reasonLabel="Why is it coming back?"
        confirmLabel="Create return"
        extraFields={
          <>
            <Form.Item name="type" label="Outcome" initialValue="REFUND">
              <Select
                options={[
                  { value: 'REFUND', label: 'Refund' },
                  { value: 'REPLACEMENT', label: 'Replacement' },
                ]}
              />
            </Form.Item>
            <Form.Item name="comments" label="What the customer told us">
              <Input.TextArea rows={2} placeholder="Helps the QC team know what to look for" />
            </Form.Item>
          </>
        }
      />

      <ConfirmActionModal
        open={which === 'HOLD'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('HOLD', v)}
        loading={loading}
        title={`Put ${order?.id} on hold?`}
        description="Sellers stop processing it until the hold is released."
        impact="The dispatch SLA pauses. Nothing is cancelled or refunded."
        reasons={[
          'Payment verification',
          'Address verification',
          'Fraud review',
          'Customer asked us to pause it',
          'Other',
        ]}
        confirmLabel="Put on hold"
      />

      <ConfirmActionModal
        open={which === 'ADDRESS'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('ADDRESS', v)}
        loading={loading}
        title="Change the delivery address"
        description="Only possible before the parcel is handed to a courier."
        impact="Serviceability and the delivery promise are rechecked for the new pincode."
        reasonRequired={false}
        reasonLabel="Note (optional)"
        showNote={false}
        confirmLabel="Update address"
        extraFields={
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="Confirm the new address with the customer before saving"
            />
            <Form.Item name="name" label="Name" initialValue={order?.address?.name} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="line" label="Address" initialValue={order?.address?.line} rules={[{ required: true }]}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="cityLine" label="City, state and pincode" initialValue={order?.address?.cityLine} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="pincode"
              label="Pincode"
              initialValue={order?.address?.pincode}
              rules={[{ required: true }, { pattern: /^\d{6}$/, message: 'A pincode is 6 digits.' }]}
            >
              <Input maxLength={6} />
            </Form.Item>
            <Form.Item name="phone" label="Phone" initialValue={order?.address?.phone} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </>
        }
      />
    </>
  );
}

