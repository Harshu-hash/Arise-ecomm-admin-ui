import { Card, Descriptions, Empty, Flex, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { formatPercent } from '@core/utils/money';
import DateText from '@shared/components/DateText';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

/** Profile, addresses, orders, returns, risk and devices for one customer. */
export default function CustomerTabs({ customer, meta }) {
  const navigate = useNavigate();
  const { addresses, devices, riskFlags, recentOrders, returns, refunds } = meta;

  return (
    <Tabs
      items={[
        {
          key: 'profile',
          label: 'Profile',
          children: (
            <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
              <Descriptions.Item label="Phone">
                <MaskedValue value={customer.phone} kind="phone" entityType="customer" entityId={customer.id} entityLabel={customer.name} copyable />
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                <MaskedValue value={customer.email} kind="email" entityType="customer" entityId={customer.id} entityLabel={customer.name} copyable />
              </Descriptions.Item>
              <Descriptions.Item label="Platform">{customer.platform}</Descriptions.Item>
              <Descriptions.Item label="Language">
                {customer.languagePreference === 'hi' ? 'Hindi' : 'English'}
              </Descriptions.Item>
              <Descriptions.Item label="Wallet balance">
                <MoneyText paise={customer.walletBalancePaise} />
              </Descriptions.Item>
              <Descriptions.Item label="RTO / return rate">
                {formatPercent(customer.rtoPct, 1)} / {formatPercent(customer.returnPct, 1)}
              </Descriptions.Item>
              <Descriptions.Item label="Segments">
                {customer.segments?.length
                  ? customer.segments.map((s) => <Tag key={s} style={{ marginInlineEnd: 4 }}>{s}</Tag>)
                  : <Typography.Text type="secondary">None</Typography.Text>}
              </Descriptions.Item>
            </Descriptions>
          ),
        },
        {
          key: 'addresses',
          label: `Addresses (${addresses.length})`,
          children: addresses.length ? (
            <Flex vertical gap={10}>
              {addresses.map((a) => (
                <Card key={a.id} size="small">
                  <Space size={6}>
                    <Typography.Text strong>{a.name}</Typography.Text>
                    <Tag style={{ marginInlineEnd: 0 }}>{a.label}</Tag>
                    {a.isDefault && <Tag color="blue" style={{ marginInlineEnd: 0 }}>Default</Tag>}
                  </Space>
                  <div><Typography.Text style={{ fontSize: 13 }}>{a.line}</Typography.Text></div>
                  <div><Typography.Text style={{ fontSize: 13 }}>{a.cityLine}</Typography.Text></div>
                  <MaskedValue value={a.phone} kind="phone" entityType="customer" entityId={customer.id} />
                </Card>
              ))}
            </Flex>
          ) : <Empty description="No saved addresses" />,
        },
        {
          key: 'orders',
          label: `Recent orders (${recentOrders.length})`,
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={recentOrders}
              onRow={(row) => ({ onClick: () => navigate(`/orders/${row.id}`), style: { cursor: 'pointer' } })}
              locale={{ emptyText: 'No orders yet' }}
              columns={[
                { title: 'Order', dataIndex: 'id', render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text> },
                { title: 'Placed', dataIndex: 'placedAt', render: (v) => <DateText value={v} /> },
                { title: 'Items', dataIndex: 'itemCount', align: 'right' },
                { title: 'Amount', dataIndex: 'grandTotalPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="orderItem" code={v} /> },
              ]}
            />
          ),
        },
        {
          key: 'returns',
          label: `Returns & refunds (${returns.length + refunds.length})`,
          children: (
            <Flex vertical gap={12}>
              <Table
                size="small" rowKey="id" pagination={false} dataSource={returns}
                title={() => 'Returns'} locale={{ emptyText: 'No returns' }}
                onRow={(row) => ({ onClick: () => navigate(`/returns/${row.id}`), style: { cursor: 'pointer' } })}
                columns={[
                  { title: 'Item', dataIndex: 'productName' },
                  { title: 'Reason', dataIndex: 'reason' },
                  { title: 'Value', dataIndex: 'amountPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="returnRequest" code={v} /> },
                ]}
              />
              <Table
                size="small" rowKey="id" pagination={false} dataSource={refunds}
                title={() => 'Refunds'} locale={{ emptyText: 'No refunds' }}
                columns={[
                  { title: 'Refund', dataIndex: 'id', render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text> },
                  { title: 'Type', dataIndex: 'type' },
                  { title: 'Amount', dataIndex: 'amountPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="refund" code={v} /> },
                ]}
              />
            </Flex>
          ),
        },
        {
          key: 'risk',
          label: `Risk (${riskFlags.length})`,
          children: (
            <Flex vertical gap={12}>
              <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
                <Descriptions.Item label="Risk score">{customer.riskScore}/100</Descriptions.Item>
                <Descriptions.Item label="Open flags">{customer.openFlags}</Descriptions.Item>
                <Descriptions.Item label="COD">{customer.codDisabled ? 'Disabled' : 'Allowed'}</Descriptions.Item>
              </Descriptions>
              <Table
                size="small" rowKey="id" pagination={false} dataSource={riskFlags}
                locale={{ emptyText: 'No risk flags' }}
                columns={[
                  { title: 'Rule', dataIndex: 'ruleName' },
                  { title: 'Score', dataIndex: 'score', align: 'right' },
                  { title: 'Flagged', dataIndex: 'flaggedAt', render: (v) => <DateText value={v} /> },
                  {
                    title: 'Status', dataIndex: 'status',
                    render: (v) => (
                      <Tag color={v === 'CONFIRMED_FRAUD' ? 'red' : v === 'CLEARED' ? 'green' : 'gold'} style={{ marginInlineEnd: 0 }}>
                        {v.replace(/_/g, ' ').toLowerCase()}
                      </Tag>
                    ),
                  },
                ]}
              />
            </Flex>
          ),
        },
        {
          key: 'devices',
          label: `Devices (${devices.length})`,
          children: (
            <Table
              size="small" rowKey="id" pagination={false} dataSource={devices}
              locale={{ emptyText: 'No devices recorded' }}
              columns={[
                { title: 'Device', dataIndex: 'model' },
                { title: 'OS', dataIndex: 'os' },
                { title: 'App version', dataIndex: 'appVersion' },
                { title: 'Last seen', dataIndex: 'lastSeenAt', render: (v) => <DateText value={v} /> },
                { title: 'Location', dataIndex: 'city' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
