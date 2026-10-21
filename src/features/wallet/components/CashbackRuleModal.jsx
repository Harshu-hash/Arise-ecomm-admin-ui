import { App, Alert, DatePicker, Flex, Form, Input, InputNumber, Modal, Select, Switch, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { dayjs } from '@core/utils/date';
import { walletApi } from '../api/wallet.api';

const TRIGGERS = [
  { value: 'FIRST_ORDER', label: 'A customer’s first order' },
  { value: 'PAYMENT_METHOD', label: 'A particular payment method' },
  { value: 'CATEGORY', label: 'Orders in a category' },
  { value: 'CHANNEL', label: 'App or web' },
];

const CATEGORIES = ['Fashion', 'Mobiles', 'Electronics', 'Beauty', 'Home', 'Grocery', 'Sports', 'Toys & Baby'];

/**
 * Create or edit a cashback rule.
 *
 * Amounts are entered in rupees and converted at the boundary; the cap and
 * the budget are required by the server, and the form says why rather than
 * just rejecting an empty field.
 */
export default function CashbackRuleModal({ open, rule, onClose }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const trigger = Form.useWatch('trigger', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (rule) {
      form.setFieldsValue({
        name: rule.name,
        trigger: rule.trigger,
        cashbackPct: rule.cashbackPct,
        maxCashback: rule.maxCashbackPaise / 100,
        minOrder: rule.minOrderPaise / 100,
        budget: rule.budgetPaise / 100,
        categoryRootName: rule.categoryRootName,
        paymentMethod: rule.paymentMethod,
        creditAfterReturnWindow: rule.creditAfterReturnWindow,
        endsAt: rule.endsAt ? dayjs(rule.endsAt) : null,
      });
    }
  }, [open, rule, form]);

  const save = useMutation({
    mutationFn: (payload) =>
      rule ? walletApi.updateCashbackRule(rule.id, payload) : walletApi.createCashbackRule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      message.success(rule ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(
          Object.entries(e.fieldErrors).map(([name, errors]) => ({ name, errors: [errors] })),
        );
        return;
      }
      message.error(e.message);
    },
  });

  const submit = async () => {
    const v = await form.validateFields();
    save.mutate({
      name: v.name,
      trigger: v.trigger,
      cashbackPct: v.cashbackPct,
      maxCashbackPaise: Math.round(v.maxCashback * 100),
      minOrderPaise: Math.round((v.minOrder ?? 0) * 100),
      budgetPaise: Math.round(v.budget * 100),
      categoryRootName: v.trigger === 'CATEGORY' ? v.categoryRootName : null,
      paymentMethod: v.trigger === 'PAYMENT_METHOD' ? v.paymentMethod : null,
      creditAfterReturnWindow: v.creditAfterReturnWindow,
      endsAt: v.endsAt ? v.endsAt.endOf('day').toISOString() : null,
      ...(rule ? { version: rule.version } : {}),
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title={rule ? `Edit ${rule.name}` : 'New cashback rule'}
      okText={rule ? 'Save' : 'Create rule'}
      okButtonProps={{ loading: save.isPending }}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" initialValues={{ creditAfterReturnWindow: true, cashbackPct: 5 }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the rule a name.' }]}>
          <Input placeholder="UPI payment cashback" />
        </Form.Item>

        <Form.Item name="trigger" label="Applies to" rules={[{ required: true, message: 'Choose a trigger.' }]}>
          <Select options={TRIGGERS} />
        </Form.Item>

        {trigger === 'CATEGORY' ? (
          <Form.Item name="categoryRootName" label="Category" rules={[{ required: true }]}>
            <Select options={CATEGORIES.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        ) : null}

        {trigger === 'PAYMENT_METHOD' ? (
          <Form.Item name="paymentMethod" label="Payment method" rules={[{ required: true }]}>
            <Select options={['UPI', 'CARD', 'NETBANKING'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        ) : null}

        <Flex gap={8} wrap>
          <Form.Item
            name="cashbackPct"
            label="Cashback"
            style={{ flex: '1 1 120px' }}
            rules={[{ required: true, message: 'Enter a percentage.' }]}
          >
            <InputNumber min={1} max={100} addonAfter="%" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxCashback"
            label="Cap per order (₹)"
            style={{ flex: '1 1 140px' }}
            rules={[{ required: true, message: 'A per-order cap is required.' }]}
            extra="Without a cap, one large order can consume the whole budget."
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Flex>

        <Flex gap={8} wrap>
          <Form.Item name="minOrder" label="Minimum order (₹)" style={{ flex: '1 1 140px' }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="budget"
            label="Total budget (₹)"
            style={{ flex: '1 1 140px' }}
            rules={[{ required: true, message: 'A total budget is required.' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Flex>

        <Form.Item name="endsAt" label="Ends on">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="creditAfterReturnWindow" label="Hold credit until the return window closes" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Alert
          type="info"
          showIcon
          message="Why holding matters"
          description={
            <Typography.Text style={{ fontSize: 12 }}>
              Crediting immediately means cashback is paid on orders that are returned the next day,
              and recovering it from a wallet that has since been spent is not possible.
            </Typography.Text>
          }
        />
      </Form>
    </Modal>
  );
}
