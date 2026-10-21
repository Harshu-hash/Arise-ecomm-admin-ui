import { Button, Card, Checkbox, Flex, Image, Space, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { formatDate } from '@core/utils/date';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

/**
 * One shipment — the parcel from a single seller — and its items.
 *
 * Grouping by shipment rather than listing items flat is what makes a
 * multi-seller order legible: each parcel has its own courier, tracking and
 * promised date.
 */
export default function ShipmentCard({ shipment, selectable, selectedIds, onToggleItem, onReturn }) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Flex gap={8} wrap align="center">
          <Link to={`/sellers/${shipment.sellerId}`}>
            <Typography.Text strong style={{ fontSize: 13 }}>{shipment.sellerName}</Typography.Text>
          </Link>
          <StatusTag domain="orderItem" code={shipment.status} />
          <Tag color={shipment.fulfillmentType === 'ARISE' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
            {shipment.fulfillmentType === 'ARISE' ? 'By Arise' : 'Seller fulfilled'}
          </Tag>
        </Flex>
      }
      extra={
        <Space size={10} wrap>
          {shipment.awb && (
            <Tooltip title={`${shipment.courierName} · last scan ${shipment.lastScanLocation ?? '—'}`}>
              <Typography.Text className="mono" style={{ fontSize: 11 }}>{shipment.awb}</Typography.Text>
            </Tooltip>
          )}
          {shipment.promisedDate && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Promised {formatDate(shipment.promisedDate)}
            </Typography.Text>
          )}
        </Space>
      }
    >
      {shipment.ndrReason && (
        <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          Delivery failed ({shipment.attempts} attempt{shipment.attempts === 1 ? '' : 's'}): {shipment.ndrReason}
        </Typography.Text>
      )}

      <Flex vertical gap={10}>
        {shipment.items.map((item) => (
          <Flex key={item.id} gap={10} align="flex-start">
            {selectable && (
              <Checkbox
                checked={selectedIds.includes(item.id)}
                disabled={!item.cancellable}
                onChange={() => onToggleItem(item.id)}
                style={{ marginTop: 20 }}
              />
            )}

            <Image
              src={item.image}
              alt=""
              width={52}
              height={52}
              preview={false}
              style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
              fallback={BLANK}
            />

            <Flex vertical gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/catalog/products/${item.productId}`}>
                <Typography.Text style={{ fontSize: 13 }}>{item.name}</Typography.Text>
              </Link>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {item.variantLabel} · Qty {item.qty}
              </Typography.Text>
              <Space size={6} wrap>
                <StatusTag domain="orderItem" code={item.status} />
                {item.cancelledBy && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    by {item.cancelledBy.toLowerCase()} — {item.cancelReason}
                  </Typography.Text>
                )}
                {item.returnId && (
                  <Link to={`/returns/${item.returnId}`}>
                    <Tag color="purple" style={{ marginInlineEnd: 0 }}>Return open</Tag>
                  </Link>
                )}
              </Space>

              {item.returnEligibility?.eligible && onReturn && (
                <Button size="small" style={{ width: 'fit-content', marginTop: 4 }} onClick={() => onReturn(item)}>
                  Start a return
                </Button>
              )}
              {item.status === 'DELIVERED' && !item.returnEligibility?.eligible && !item.returnId && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {item.returnEligibility?.reason}
                </Typography.Text>
              )}
            </Flex>

            <Flex vertical align="flex-end" style={{ flexShrink: 0 }}>
              <MoneyText paise={item.linePaise} strong />
              {item.mrpPaise > item.pricePaise && (
                <Typography.Text delete type="secondary" style={{ fontSize: 11 }}>
                  <MoneyText paise={item.mrpPaise * item.qty} type="secondary" />
                </Typography.Text>
              )}
            </Flex>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}
