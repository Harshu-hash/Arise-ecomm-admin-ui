import { Alert, Button, Flex, Form, List, Select, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import EntitySelect from '@shared/components/EntitySelect';
import MoneyText from '@shared/components/MoneyText';
import { marketingApi } from '../api/marketing.api';

/**
 * "Test against a cart": choose a real customer and real products, and see
 * exactly what the checkout would decide — through the same evaluator, so
 * this can never say yes when the real thing would say no.
 */
export default function CouponTestTool({ coupon }) {
  const [form] = Form.useForm();

  const test = useMutation({
    mutationFn: (payload) => marketingApi.testCoupon(coupon.id, payload),
  });

  const result = test.data?.data;

  return (
    <Flex vertical gap={12}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => test.mutate({ customerId: values.customerId, productIds: values.productIds, paymentMethod: values.paymentMethod })}
      >
        <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Choose a customer.' }]}>
          <EntitySelect entity="customer" placeholder="Search customers" />
        </Form.Item>
        <Form.Item name="productIds" label="Cart items" rules={[{ required: true, message: 'Add at least one product.' }]}>
          <EntitySelect entity="product" multiple placeholder="Search live products" />
        </Form.Item>
        <Form.Item name="paymentMethod" label="Payment method" initialValue="UPI">
          <Select options={['UPI', 'CARD', 'NETBANKING', 'COD'].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={test.isPending}>Check applicability</Button>
      </Form>

      {result && (
        result.applicable ? (
          <Alert
            type="success"
            showIcon
            message="Applies to this cart"
            description={<span>Discount: <MoneyText paise={result.discountPaise} strong /></span>}
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            message="Does not apply"
            description={
              <List
                size="small"
                dataSource={result.reasons}
                renderItem={(reason) => <List.Item style={{ padding: '2px 0', border: 'none' }}>{reason}</List.Item>}
              />
            }
          />
        )
      )}

      {result?.eligibleItemIds?.length ? (
        <Flex gap={4} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Eligible items:</Typography.Text>
          {result.eligibleItemIds.map((id) => <Tag key={id}>{id}</Tag>)}
        </Flex>
      ) : null}
    </Flex>
  );
}
