import { App, Button, DatePicker, Drawer, Flex, Form, Input, InputNumber, Select, Switch, Tabs } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@core/api/errors';
import { dayjs } from '@core/utils/date';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import AudiencePicker from './AudiencePicker';
import CouponPerformancePanel from './CouponPerformancePanel';
import CouponTestTool from './CouponTestTool';

const TYPES = [
  { value: 'FLAT', label: 'Flat amount off' },
  { value: 'PERCENT', label: 'Percentage off' },
  { value: 'FREE_DELIVERY', label: 'Free delivery' },
  { value: 'BXGY', label: 'Buy X, get Y free' },
];

/** Create or edit a coupon, with its performance and test tool alongside once it exists. */
export default function CouponFormDrawer({ coupon, open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const type = Form.useWatch('type', form);

  const segments = useQuery({
    queryKey: marketingKeys.segments({}),
    queryFn: () => marketingApi.segments({ pageSize: 100 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (coupon) {
      form.setFieldsValue({
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        terms: coupon.terms,
        type: coupon.type,
        valuePct: coupon.valuePct,
        valueRupees: coupon.valuePaise ? coupon.valuePaise / 100 : undefined,
        maxDiscountRupees: coupon.maxDiscountPaise ? coupon.maxDiscountPaise / 100 : undefined,
        buyQty: coupon.buyQty,
        getQty: coupon.getQty,
        minCartRupees: (coupon.minCartPaise ?? 0) / 100,
        audience: coupon.audience,
        totalLimit: coupon.totalLimit,
        perUserLimit: coupon.perUserLimit,
        budgetRupees: coupon.budgetPaise / 100,
        validity: [dayjs(coupon.startsAt), dayjs(coupon.endsAt)],
        stackable: coupon.stackable,
        visibility: coupon.visibility === 'PUBLIC',
      });
    } else {
      form.setFieldsValue({ type: 'PERCENT', audience: { type: 'ALL' }, visibility: true, validity: [dayjs(), dayjs().add(30, 'day')] });
    }
  }, [open, coupon, form]);

  const create = useMutation({
    mutationFn: (payload) => marketingApi.createCoupon(payload),
    onSuccess: () => { message.success('Coupon created'); onSaved(); },
    onError: (e) => handleError(e),
  });
  const update = useMutation({
    mutationFn: (payload) => marketingApi.updateCoupon(coupon.id, payload),
    onSuccess: () => { message.success('Saved'); onSaved(); },
    onError: (e) => handleError(e),
  });

  function handleError(e) {
    if (e instanceof ApiError && e.fieldErrors) {
      form.setFields(Object.entries(e.fieldErrors).map(([name, errors]) => ({ name, errors: [errors] })));
      return;
    }
    message.error(e.message);
  }

  const submit = async () => {
    const v = await form.validateFields();
    const payload = {
      code: v.code, name: v.name, description: v.description, terms: v.terms,
      type: v.type,
      valuePct: v.type === 'PERCENT' ? v.valuePct : undefined,
      valuePaise: v.type === 'FLAT' ? Math.round(v.valueRupees * 100) : undefined,
      maxDiscountPaise: v.maxDiscountRupees ? Math.round(v.maxDiscountRupees * 100) : undefined,
      buyQty: v.type === 'BXGY' ? v.buyQty : undefined,
      getQty: v.type === 'BXGY' ? v.getQty : undefined,
      minCartPaise: Math.round((v.minCartRupees ?? 0) * 100),
      audience: v.audience,
      totalLimit: v.totalLimit,
      perUserLimit: v.perUserLimit,
      budgetPaise: Math.round(v.budgetRupees * 100),
      startsAt: v.validity[0].startOf('day').toISOString(),
      endsAt: v.validity[1].endOf('day').toISOString(),
      stackable: v.stackable,
      visibility: v.visibility ? 'PUBLIC' : 'HIDDEN',
    };
    if (coupon) update.mutate(payload);
    else create.mutate(payload);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={620}
      title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
      extra={<Button type="primary" onClick={submit} loading={create.isPending || update.isPending}>Save</Button>}
    >
      <Tabs
        items={[
          {
            key: 'details',
            label: 'Details',
            children: (
              <Form form={form} layout="vertical">
                <Flex gap={8}>
                  <Form.Item name="code" label="Code" style={{ flex: '1 1 160px' }} rules={[{ required: true, message: 'Required' }]}>
                    <Input className="mono" style={{ textTransform: 'uppercase' }} disabled={Boolean(coupon)} />
                  </Form.Item>
                  <Form.Item name="type" label="Discount type" style={{ flex: '1 1 200px' }} rules={[{ required: true }]}>
                    <Select options={TYPES} disabled={Boolean(coupon)} />
                  </Form.Item>
                </Flex>

                <Form.Item name="name" label="Name shown to customers" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="50% off your first order" />
                </Form.Item>
                <Form.Item name="description" label="Description">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="terms" label="Terms">
                  <Input.TextArea rows={2} />
                </Form.Item>

                {type === 'PERCENT' && (
                  <Flex gap={8}>
                    <Form.Item name="valuePct" label="Percentage off" style={{ flex: 1 }} rules={[{ required: true }]}>
                      <InputNumber min={1} max={100} addonAfter="%" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="maxDiscountRupees" label="Max discount (₹)" style={{ flex: 1 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Flex>
                )}
                {type === 'FLAT' && (
                  <Form.Item name="valueRupees" label="Amount off (₹)" rules={[{ required: true }]}>
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                )}
                {type === 'BXGY' && (
                  <Flex gap={8}>
                    <Form.Item name="buyQty" label="Buy" style={{ flex: 1 }} rules={[{ required: true }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="getQty" label="Get free" style={{ flex: 1 }} rules={[{ required: true }]}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </Flex>
                )}

                <Form.Item name="minCartRupees" label="Minimum cart value (₹)">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item name="audience" label="Audience">
                  <AudiencePicker segments={segments.data?.data} />
                </Form.Item>

                <Flex gap={8}>
                  <Form.Item name="totalLimit" label="Total redemptions" style={{ flex: 1 }} rules={[{ required: true }]}>
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="perUserLimit" label="Per customer" style={{ flex: 1 }} rules={[{ required: true }]}>
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="budgetRupees" label="Budget cap (₹)" style={{ flex: 1 }} rules={[{ required: true }]}>
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Flex>

                <Form.Item name="validity" label="Validity" rules={[{ required: true }]}>
                  <DatePicker.RangePicker style={{ width: '100%' }} />
                </Form.Item>

                <Flex gap={24}>
                  <Form.Item name="visibility" label="Listed in the app" valuePropName="checked" extra="Off keeps it code-only — not shown in the coupon list.">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="stackable" label="Stacks with other coupons" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Flex>
              </Form>
            ),
          },
          ...(coupon ? [
            { key: 'performance', label: 'Performance', children: <CouponPerformancePanel coupon={coupon} /> },
            { key: 'test', label: 'Test against a cart', children: <CouponTestTool coupon={coupon} /> },
          ] : []),
        ]}
      />
    </Drawer>
  );
}
