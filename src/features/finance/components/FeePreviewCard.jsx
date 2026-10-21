import { Button, Card, Divider, Flex, Form, InputNumber, Select, Switch, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import MoneyText from '@shared/components/MoneyText';
import { financeApi } from '../api/finance.api';

const CATEGORIES = ['Fashion', 'Mobiles', 'Electronics', 'Beauty', 'Home', 'Grocery', 'Sports', 'Toys & Baby'];

/**
 * "What does a ₹499 kurta actually net the seller?"
 *
 * The answer comes from the same calculation the payout runs, not a separate
 * estimate — so it can never disagree with what the seller is eventually
 * paid. That is the whole point of having it here.
 */
export default function FeePreviewCard() {
  const [form] = Form.useForm();

  const preview = useMutation({
    mutationFn: (payload) => financeApi.previewFees(payload),
  });

  const r = preview.data?.data;

  return (
    <Card size="small" title="What would a seller receive?">
      <Form
        form={form}
        layout="vertical"
        size="small"
        initialValues={{ rootName: 'Fashion', salePaise: 499, paymentMethod: 'UPI', fulfilledByArise: false }}
        onFinish={(values) =>
          preview.mutate({
            rootName: values.rootName,
            // The form is in rupees because that is how a price is quoted;
            // the API is in paise because that is how money is stored.
            salePaise: Math.round(values.salePaise * 100),
            paymentMethod: values.paymentMethod,
            fulfilledByArise: values.fulfilledByArise,
          })
        }
      >
        <Flex gap={8} wrap>
          <Form.Item name="rootName" label="Category" style={{ flex: '1 1 140px', marginBottom: 8 }}>
            <Select options={CATEGORIES.map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="salePaise" label="Selling price (₹)" style={{ flex: '1 1 110px', marginBottom: 8 }}>
            <InputNumber min={1} max={500000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paymentMethod" label="Paid by" style={{ flex: '1 1 110px', marginBottom: 8 }}>
            <Select
              options={['UPI', 'CARD', 'NETBANKING', 'COD'].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
        </Flex>

        <Form.Item
          name="fulfilledByArise"
          label="Fulfilled by Arise"
          valuePropName="checked"
          style={{ marginBottom: 8 }}
        >
          <Switch size="small" />
        </Form.Item>

        <Button type="primary" size="small" htmlType="submit" loading={preview.isPending} block>
          Calculate
        </Button>
      </Form>

      {r ? (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Flex vertical gap={5}>
            <Row label={`Commission (${r.commissionPct}%)`} paise={-r.commissionPaise} />
            <Row label="Closing fee" paise={-r.closingFeePaise} />
            <Row label={`Collection (${r.explain.collectionFeePct}%)`} paise={-r.collectionFeePaise} />
            <Row label="Shipping" paise={-r.shippingFeePaise} />
            {r.pickPackFeePaise ? <Row label="Pick and pack" paise={-r.pickPackFeePaise} /> : null}
            <Row label="GST on fees" paise={-r.gstOnFeesPaise} />
            <Row label="TCS + TDS" paise={-(r.tcsPaise + r.tdsPaise)} />
            <Divider style={{ margin: '4px 0' }} />
            <Row label="Seller receives" paise={r.netPaise} strong danger={r.negative} />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Arise keeps {r.explain.takeRatePct}% of the sale value.
            </Typography.Text>
          </Flex>
        </>
      ) : null}
    </Card>
  );
}

function Row({ label, paise, strong = false, danger = false }) {
  return (
    <Flex justify="space-between" align="baseline" gap={8}>
      <Typography.Text style={{ fontSize: 12 }} strong={strong}>{label}</Typography.Text>
      <MoneyText paise={paise} strong={strong} signed={paise < 0} type={danger ? 'danger' : undefined} />
    </Flex>
  );
}
