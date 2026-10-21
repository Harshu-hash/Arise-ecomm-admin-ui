import { Space, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { slaCountdown } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

export const shipmentColumns = [
  {
    key: 'awb', title: 'AWB', dataIndex: 'awb', alwaysVisible: true,
    render: (awb, row) => (
      <div style={{ minWidth: 0 }}>
        <Typography.Text className="mono" strong style={{ fontSize: 12 }}>
          {awb ?? 'Not manifested'}
        </Typography.Text>
        <div>
          <Link to={`/orders/${row.orderId}`}>
            <Typography.Text className="mono" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
          </Link>
        </div>
      </div>
    ),
  },
  {
    key: 'sellerName', title: 'From', dataIndex: 'sellerName', priority: 2,
    render: (name, row) => (
      <div style={{ minWidth: 0 }}>
        <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
        <div>
          <Tag color={row.fulfillmentType === 'ARISE' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
            {row.fulfillmentType === 'ARISE' ? 'By Arise' : 'Seller'}
          </Tag>
        </div>
      </div>
    ),
  },
  {
    key: 'destinationCity', title: 'To', dataIndex: 'destinationCity', priority: 1,
    render: (city, row) => (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {city} · {row.destinationPincode}
      </Typography.Text>
    ),
  },
  { key: 'courierName', title: 'Courier', dataIndex: 'courierName', sorter: true, priority: 1 },
  {
    key: 'codAmountPaise', title: 'COD', dataIndex: 'codAmountPaise', align: 'right', priority: 2,
    render: (v) => (v ? <MoneyText paise={v} strong /> : <Typography.Text type="secondary">Prepaid</Typography.Text>),
  },
  {
    key: 'declaredWeightG', title: 'Weight', dataIndex: 'declaredWeightG', align: 'right', priority: 3,
    render: (v) => <span className="tabular">{v} g</span>,
  },
  {
    key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
    render: (code) => <StatusTag domain="orderItem" code={code} />,
  },
  {
    key: 'lastScanAt', title: 'Last scan', dataIndex: 'lastScanAt', sorter: true, priority: 1,
    render: (v, row) =>
      v ? (
        <Tooltip title={row.lastScanLocation}>
          <Space direction="vertical" size={0}>
            <DateText value={v} />
            {row.daysSinceScan >= 5 && (
              <Typography.Text type="danger" style={{ fontSize: 11 }}>
                No scan for {row.daysSinceScan} days
              </Typography.Text>
            )}
          </Space>
        </Tooltip>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Not picked up</Typography.Text>
      ),
  },
  {
    key: 'promisedDate', title: 'Promised', dataIndex: 'promisedDate', sorter: true, priority: 1,
    render: (v, row) => {
      if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
      if (['DELIVERED', 'RTO_DELIVERED'].includes(row.status)) {
        return <DateText value={v} variant="date" />;
      }
      const { label, overdue } = slaCountdown(v);
      return (
        <Typography.Text type={overdue ? 'danger' : undefined} strong={overdue} style={{ fontSize: 12 }}>
          {label}
        </Typography.Text>
      );
    },
  },
  {
    key: 'attempts', title: 'Attempts', dataIndex: 'attempts', align: 'right', priority: 3, defaultHidden: true,
    render: (v) => (v ? <span className="tabular">{v}</span> : '—'),
  },
];

export const SHIPMENT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'MANIFESTED', label: 'To be picked up', codes: ['PACKED', 'MANIFESTED'] },
  { key: 'IN_TRANSIT', label: 'In transit', codes: ['SHIPPED', 'IN_TRANSIT'] },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'UNDELIVERED', label: 'NDR' },
  { key: 'LOST_IN_TRANSIT', label: 'Lost' },
];
