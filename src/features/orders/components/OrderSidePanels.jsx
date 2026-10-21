import { Alert, Card, Descriptions, Flex, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { formatPercent } from '@core/utils/money';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';

/** Price breakdown, matching the lines the mobile app shows the customer. */
export function PriceBreakdown({ order }) {
  const p = order.priceDetails ?? {};
  const rows = [
    ['Item total', p.itemTotalPaise],
    ['Delivery fee', p.deliveryFeePaise],
    ['Platform fee', p.platformFeePaise],
    ...(p.discountPaise ? [[`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, -p.discountPaise]] : []),
  ];

  return (
    <Card size="small" title="Payment">
      <Flex vertical gap={6}>
        {rows.map(([label, value]) => (
          <Flex key={label} justify="space-between">
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>{label}</Typography.Text>
            <MoneyText paise={value} type={value < 0 ? 'success' : undefined} />
          </Flex>
        ))}
        <Flex justify="space-between" style={{ paddingTop: 6, borderTop: '1px solid var(--ant-color-border-secondary)' }}>
          <Typography.Text strong>Total paid</Typography.Text>
          <MoneyText paise={p.grandTotalPaise} strong />
        </Flex>
        <Flex justify="space-between" style={{ marginTop: 4 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Method</Typography.Text>
          <Space size={6}>
            <Tag style={{ marginInlineEnd: 0 }}>{order.paymentMethod}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{order.paymentStatus}</Typography.Text>
          </Space>
        </Flex>
      </Flex>
    </Card>
  );
}

/** Who the customer is and whether they are a risk — the agent's context. */
export function CustomerPanel({ customer }) {
  if (!customer) return null;
  const risky = customer.riskScore >= 60 || customer.rtoPct > 25 || customer.returnPct > 25;

  return (
    <Card
      size="small"
      title="Customer"
      extra={<Link to={`/customers/${customer.id}`}>Open</Link>}
    >
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Name">
          {customer.name}
          {customer.status === 'BLOCKED' && <Tag color="red" style={{ marginLeft: 6 }}>Blocked</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Phone">
          <MaskedValue
            value={customer.phone}
            kind="phone"
            entityType="customer"
            entityId={customer.id}
            entityLabel={customer.name}
          />
        </Descriptions.Item>
        <Descriptions.Item label="Lifetime">
          {customer.ordersCount} orders · <MoneyText paise={customer.gmvPaise} compact />
        </Descriptions.Item>
        <Descriptions.Item label="RTO / returns">
          <Typography.Text type={risky ? 'danger' : undefined} className="tabular">
            {formatPercent(customer.rtoPct, 1)} / {formatPercent(customer.returnPct, 1)}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Wallet">
          <MoneyText paise={customer.walletBalancePaise} />
        </Descriptions.Item>
      </Descriptions>

      {risky && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8 }}
          message="Elevated risk"
          description="High return or RTO history. Check before approving goodwill on this order."
        />
      )}
    </Card>
  );
}

export function AddressPanel({ order }) {
  return (
    <Card size="small" title="Delivery address">
      <Space direction="vertical" size={2}>
        <Space size={6}>
          <Typography.Text strong style={{ fontSize: 13 }}>{order.address?.name}</Typography.Text>
          {order.address?.label && <Tag style={{ marginInlineEnd: 0 }}>{order.address.label}</Tag>}
        </Space>
        <Typography.Text style={{ fontSize: 13 }}>{order.address?.line}</Typography.Text>
        <Typography.Text style={{ fontSize: 13 }}>{order.address?.cityLine}</Typography.Text>
        <MaskedValue
          value={order.address?.phone}
          kind="phone"
          entityType="order"
          entityId={order.id}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 6 }}>
          Delivery code: generated, shown only to the courier at the door
        </Typography.Text>
      </Space>
    </Card>
  );
}
