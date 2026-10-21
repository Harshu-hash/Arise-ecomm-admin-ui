import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import { dayjs } from '@core/utils/date';

const CATEGORIES = ['Fashion', 'Mobiles', 'Electronics', 'Beauty', 'Home', 'Grocery', 'Sports', 'Toys & Baby'];

export default function FlashSaleFormModal({ open, onClose, onSubmit, loading }) {
  const [form] = Form.useForm();

  const submit = async () => {
    const v = await form.validateFields();
    onSubmit({
      name: v.name,
      startsAt: v.window[0].toISOString(),
      endsAt: v.window[1].toISOString(),
      categoryRootNames: v.categoryRootNames,
      minDiscountPct: v.minDiscountPct,
      maxUnitsPerCustomer: v.maxUnitsPerCustomer,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title="New flash sale"
      okText="Create and open nominations"
      okButtonProps={{ loading }}
      destroyOnHidden
      afterOpenChange={(opened) => opened && form.resetFields()}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ minDiscountPct: 50, maxUnitsPerCustomer: 2, window: [dayjs().add(1, 'day'), dayjs().add(1, 'day').add(4, 'hour')] }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="Electronics Flash Sale" />
        </Form.Item>
        <Form.Item name="window" label="Window" rules={[{ required: true }]}>
          <DatePicker.RangePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="categoryRootNames" label="Categories">
          <Select mode="multiple" options={CATEGORIES.map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="minDiscountPct" label="Minimum discount" rules={[{ required: true }]}>
          <InputNumber min={1} max={95} addonAfter="%" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="maxUnitsPerCustomer" label="Max units per customer" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
