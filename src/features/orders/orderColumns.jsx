import { Image, Space, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { slaCountdown } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import { statusOptions } from '@shared/constants/statusMaps';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

export const PAYMENT_METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'COD', label: 'Cash on delivery' },
  { value: 'NETBANKING', label: 'Net banking' },
  { value: 'WALLET', label: 'Wallet' },
  { value: 'EMI', label: 'EMI' },
];

export const orderColumns = [
  {
    key: 'id', title: 'Order', dataIndex: 'id', sorter: false, alwaysVisible: true, width: 150,
    render: (id, row) => (
      <div style={{ minWidth: 0 }}>
        <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{id}</Typography.Text>
        <div>
          <DateText value={row.placedAt} />
        </div>
      </div>
    ),
  },
  {
    key: 'customerName', title: 'Customer', dataIndex: 'customerName', sorter: true, priority: 1, width: 180,
    render: (name, row) => (
      <div style={{ minWidth: 0 }}>
        <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
        <div>
          <MaskedValue value={row.customerPhone} kind="phone" entityType="order" entityId={row.id} />
        </div>
      </div>
    ),
  },
  {
    key: 'items', title: 'Items', priority: 1, width: 240,
    render: (_v, row) => (
      <Space size={8}>
        <Image
          src={row.firstItemImage}
          alt=""
          width={30}
          height={30}
          preview={false}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          fallback={BLANK}
        />
        <div style={{ minWidth: 0, maxWidth: 180 }}>
          <Typography.Text style={{ fontSize: 12 }} ellipsis>
            {row.firstItemName}
          </Typography.Text>
          {row.itemCount > 1 && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                +{row.itemCount - 1} more
              </Typography.Text>
            </div>
          )}
        </div>
      </Space>
    ),
  },
  {
    key: 'sellerNames', title: 'Seller', dataIndex: 'sellerNames', priority: 2, width: 160,
    render: (names) =>
      names.length === 1 ? (
        <Typography.Text style={{ fontSize: 12 }}>{names[0]}</Typography.Text>
      ) : (
        <Tooltip title={names.join(', ')}>
          <Typography.Text style={{ fontSize: 12 }}>{names.length} sellers</Typography.Text>
        </Tooltip>
      ),
  },
  {
    key: 'grandTotalPaise', title: 'Amount', dataIndex: 'grandTotalPaise', sorter: true, align: 'right', priority: 1, width: 110,
    render: (v) => <MoneyText paise={v} strong />,
  },
  {
    key: 'paymentMethod', title: 'Payment', dataIndex: 'paymentMethod', priority: 2, width: 130,
    render: (m, row) => (
      <Space direction="vertical" size={0}>
        <Tag style={{ marginInlineEnd: 0, width: 'fit-content' }}>{m}</Tag>
        <StatusTag domain="payment" code={row.paymentStatus} showIcon={false} />
      </Space>
    ),
  },
  {
    key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1, width: 140,
    render: (code, row) => (
      <Space direction="vertical" size={2}>
        <StatusTag domain="orderItem" code={code} />
        {row.onHold && <Tag color="gold" style={{ marginInlineEnd: 0 }}>On hold</Tag>}
      </Space>
    ),
  },
  {
    key: 'fulfillmentType', title: 'Fulfilment', dataIndex: 'fulfillmentType', priority: 3, width: 110,
    render: (v) =>
      v ? (
        <Tag color={v === 'ARISE' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
          {v === 'ARISE' ? 'By Arise' : v === 'MIXED' ? 'Mixed' : 'Seller'}
        </Tag>
      ) : null,
  },
  {
    key: 'shipTo', title: 'Ship to', priority: 3, width: 160,
    render: (_v, row) => (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {row.address?.city}, {row.address?.state}
      </Typography.Text>
    ),
  },
  {
    key: 'slaDueAt', title: 'SLA', dataIndex: 'slaDueAt', sorter: true, priority: 1, width: 110,
    render: (v, row) => {
      if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
      const { label, overdue } = slaCountdown(v);
      return (
        <Tooltip title={`${row.slaLabel} by`}>
          <Typography.Text type={overdue ? 'danger' : undefined} strong={overdue} style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
        </Tooltip>
      );
    },
  },
  {
    key: 'riskScore', title: 'Risk', dataIndex: 'riskScore', priority: 3, defaultHidden: true, width: 90,
    render: (v) =>
      v >= 60 ? <Tag color="red" style={{ marginInlineEnd: 0 }}>High</Tag>
        : v >= 35 ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>Medium</Tag>
          : <Typography.Text type="secondary" style={{ fontSize: 12 }}>Low</Typography.Text>,
  },
  { key: 'channel', title: 'Channel', dataIndex: 'channel', priority: 3, defaultHidden: true, width: 100 },
];

export const orderFilterSchema = [
  { key: 'status', label: 'Status', kind: 'multiSelect', options: statusOptions('orderItem'), width: 210 },
  { key: 'paymentMethod', label: 'Payment', kind: 'multiSelect', options: PAYMENT_METHODS, width: 180 },
  { key: 'placedAt', label: 'Placed', kind: 'dateRange' },
  { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
  { key: 'state', label: 'State', kind: 'text', width: 140 },
  {
    key: 'riskLevel', label: 'Risk', kind: 'select', width: 130,
    options: [
      { value: 'HIGH', label: 'High' },
      { value: 'MEDIUM', label: 'Medium' },
      { value: 'LOW', label: 'Low' },
    ],
  },
  { key: 'slaBreached', label: 'Past SLA', kind: 'boolean' },
  { key: 'hasReturn', label: 'Has a return', kind: 'boolean' },
];

export const ORDER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'PLACED', label: 'To accept', codes: ['PLACED', 'ON_HOLD'] },
  { key: 'PACKED', label: 'To ship', codes: ['ACCEPTED', 'PACKED', 'MANIFESTED'] },
  { key: 'IN_TRANSIT', label: 'In transit', codes: ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'UNDELIVERED', label: 'NDR' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'RTO_IN_TRANSIT', label: 'RTO', codes: ['RTO_INITIATED', 'RTO_IN_TRANSIT', 'RTO_DELIVERED'] },
];

export { Link };
