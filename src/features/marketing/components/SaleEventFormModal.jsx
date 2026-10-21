import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { marketingApi } from '../api/marketing.api';

const CATEGORIES = ['Fashion', 'Mobiles', 'Electronics', 'Beauty', 'Home', 'Grocery', 'Sports', 'Toys & Baby'];

export default function SaleEventFormModal({ open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const create = useMutation({
    mutationFn: (payload) => marketingApi.createSaleEvent(payload),
    onSuccess: () => { message.success('Event created'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  const submit = async () => {
    const v = await form.validateFields();
    create.mutate({
      name: v.name,
      startsAt: v.window[0].startOf('day').toISOString(),
      endsAt: v.window[1].endOf('day').toISOString(),
      earlyAccessHours: v.earlyAccessHours ?? 0,
      participatingCategoryRootNames: v.participatingCategoryRootNames,
      minSellerDiscountPct: v.minSellerDiscountPct,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title="New sale event"
      okText="Create"
      okButtonProps={{ loading: create.isPending }}
      destroyOnHidden
      afterOpenChange={(opened) => opened && form.resetFields()}
    >
      <Form form={form} layout="vertical" initialValues={{ minSellerDiscountPct: 20, earlyAccessHours: 0 }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="Monsoon Mega Sale" />
        </Form.Item>
        <Form.Item name="window" label="Dates" rules={[{ required: true }]}>
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="earlyAccessHours" label="Early access, hours before launch">
          <InputNumber min={0} max={48} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="participatingCategoryRootNames" label="Participating categories">
          <Select mode="multiple" options={CATEGORIES.map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="minSellerDiscountPct" label="Minimum seller discount" rules={[{ required: true }]}>
          <InputNumber min={0} max={90} addonAfter="%" style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
