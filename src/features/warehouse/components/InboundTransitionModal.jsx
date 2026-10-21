import { DatePicker, Form, Input } from 'antd';
import { dayjs } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import { STEP_LABEL } from '../inboundSteps';


/** Moves a consignment one step along, collecting whatever that step needs. */
export default function InboundTransitionModal({ target, slot, setSlot, loading, onCancel, onConfirm }) {
  return (
    <ConfirmActionModal
      open={Boolean(target)}
      onCancel={onCancel}
      onConfirm={onConfirm}
      loading={loading}
      title={`${STEP_LABEL[target] ?? target}?`}
      impact={
        target === 'MISSED'
          ? 'The seller is told the slot was missed and will need to rebook.'
          : undefined
      }
      reasonRequired={false}
      reasonLabel="Note (optional)"
      showNote={false}
      confirmLabel="Confirm"
      extraFields={
        target === 'APPOINTMENT_BOOKED' ? (
          <Form.Item
            label="Dock slot"
            required
            validateStatus={slot ? undefined : 'error'}
            help={slot ? undefined : 'Pick a date.'}
          >
            <DatePicker
              style={{ width: '100%' }}
              value={slot}
              onChange={setSlot}
              disabledDate={(d) => d && d < dayjs().startOf('day')}
            />
          </Form.Item>
        ) : target === 'ARRIVED' ? (
          <Form.Item name="vehicleNo" label="Vehicle number">
            <Input placeholder="MH12AB1234" />
          </Form.Item>
        ) : null
      }
    />
  );
}
