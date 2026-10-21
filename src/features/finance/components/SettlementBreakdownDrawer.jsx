import { Alert, Descriptions, Divider, Drawer, Flex, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';

/**
 * The line-by-line arithmetic behind one settlement.
 *
 * Sellers dispute deductions constantly, and the only answer that ends the
 * conversation is the full working — every fee named, with the rate it was
 * charged at. So nothing here is rolled up.
 */
export default function SettlementBreakdownDrawer({ line, onClose }) {
  if (!line) return <Drawer open={false} onClose={onClose} />;

  const deductions = [
    [`Commission (${line.commissionPct}%)`, line.commissionPaise],
    ['Fixed closing fee', line.closingFeePaise],
    [`Payment collection (${line.paymentMethod})`, line.collectionFeePaise],
    ['Shipping', line.shippingFeePaise],
    ...(line.pickPackFeePaise ? [['Pick and pack (Fulfilled by Arise)', line.pickPackFeePaise]] : []),
    ...(line.storageFeePaise ? [['Storage', line.storageFeePaise]] : []),
  ];

  const taxes = [
    ['GST on our fees (18%)', line.gstOnFeesPaise],
    ['TCS under GST s.52 (0.5%)', line.tcsPaise],
    ['TDS under s.194-O (0.1%)', line.tdsPaise],
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title="Settlement breakdown"
      extra={line.eligible ? <Tag color="green">Payable</Tag> : <Tag color="gold">On hold</Tag>}
    >
      <Flex vertical gap={12}>
        <Descriptions size="small" column={1} colon={false}>
          <Descriptions.Item label="Item">{line.productTitle}</Descriptions.Item>
          <Descriptions.Item label="SKU">
            <Typography.Text className="mono" style={{ fontSize: 12 }}>{line.sku ?? '—'}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Order">
            <Link to={`/orders/${line.orderId}`}>
              <Typography.Text className="mono" style={{ fontSize: 12 }}>{line.orderId}</Typography.Text>
            </Link>
          </Descriptions.Item>
          <Descriptions.Item label="Seller">
            <Link to={`/sellers/${line.sellerId}`}>{line.sellerName}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="Delivered">
            <DateText value={line.deliveredAt} variant="datetime" />
          </Descriptions.Item>
        </Descriptions>

        {!line.eligible ? (
          <Alert type="warning" showIcon message="Held back" description={line.holdReason} />
        ) : null}

        <Divider style={{ margin: '4px 0' }} />

        <Row label="Item sold for" paise={line.salePaise} strong />

        <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Fees
        </Typography.Text>
        {deductions.map(([label, paise]) => (
          <Row key={label} label={label} paise={-paise} />
        ))}

        <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Tax
        </Typography.Text>
        {taxes.map(([label, paise]) => (
          <Row key={label} label={label} paise={-paise} />
        ))}

        {line.adjustmentsPaise ? (
          <Row label="Adjustments" paise={line.adjustmentsPaise} />
        ) : null}

        <Divider style={{ margin: '4px 0' }} />

        <Row label="Seller receives" paise={line.netPaise} strong danger={line.negative} />

        {line.negative ? (
          <Alert
            type="error"
            showIcon
            message="This line costs the seller money"
            description="Our fees exceed what the item sold for. It is usually a cheap, heavy item on a free-shipping offer. The negative amount is carried against the seller's next payout rather than collected."
          />
        ) : null}

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Take rate:{' '}
          <strong className="tabular">
            {(((line.salePaise - line.netPaise) / line.salePaise) * 100).toFixed(1)}%
          </strong>{' '}
          of the sale value.
        </Typography.Text>
      </Flex>
    </Drawer>
  );
}

function Row({ label, paise, strong = false, danger = false }) {
  return (
    <Flex justify="space-between" align="baseline" gap={12}>
      <Typography.Text style={{ fontSize: 13 }} strong={strong}>{label}</Typography.Text>
      <MoneyText paise={paise} strong={strong} signed={paise < 0} type={danger ? 'danger' : undefined} />
    </Flex>
  );
}
