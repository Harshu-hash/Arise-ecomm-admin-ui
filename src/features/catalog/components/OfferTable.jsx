import { CrownFilled } from '@ant-design/icons';
import { App, Button, Table, Tag, Tooltip, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { discountPct } from '@core/utils/money';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import { catalogApi } from '../api/catalog.api';

/**
 * Every seller's offer on this product. The buy-box winner is marked because
 * that is the one customers actually see and buy.
 */
export default function OfferTable({ offers, productId }) {
  const { message, modal } = App.useApp();

  const deactivate = useMutation({
    mutationFn: ({ id, reason }) => catalogApi.deactivateOffer(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'product', productId] });
      message.success('Offer deactivated');
    },
    onError: (e) => message.error(e.message),
  });

  const confirmDeactivate = (offer) => {
    let reason = '';
    modal.confirm({
      title: `Deactivate ${offer.sellerName}'s offer?`,
      content: (
        <div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            Their offer stops being buyable. The buy box moves to the next eligible seller.
          </Typography.Paragraph>
          <textarea
            rows={2}
            placeholder="Reason — recorded in the audit log"
            style={{ width: '100%', padding: 8, borderRadius: 6 }}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      okText: 'Deactivate offer',
      okButtonProps: { danger: true },
      onOk: () => {
        if (!reason.trim()) {
          message.error('Give a reason.');
          return Promise.reject(new Error('reason required'));
        }
        return deactivate.mutateAsync({ id: offer.id, reason });
      },
    });
  };

  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={offers}
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: 'No seller offers on this product' }}
      columns={[
        {
          title: 'Seller',
          dataIndex: 'sellerName',
          render: (name, row) => (
            <div style={{ minWidth: 0 }}>
              <Link to={`/sellers/${row.sellerId}`}>
                <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
              </Link>
              {row.buyBoxWinner && (
                <Tooltip title="Wins the buy box — this is the offer customers see by default">
                  <CrownFilled style={{ color: 'var(--ant-color-warning)', marginLeft: 6 }} />
                </Tooltip>
              )}
              {row.sellerStatus && row.sellerStatus !== 'ACTIVE' && (
                <div>
                  <Tag color="red" style={{ marginInlineEnd: 0 }}>Seller {row.sellerStatus.toLowerCase()}</Tag>
                </div>
              )}
            </div>
          ),
        },
        { title: 'Variant', dataIndex: 'variantLabel' },
        {
          title: 'Price',
          dataIndex: 'sellingPricePaise',
          align: 'right',
          render: (v, row) => (
            <div>
              <MoneyText paise={v} strong type={row.priceAboveMrp ? 'danger' : undefined} />
              {row.priceAboveMrp && (
                <div>
                  <Typography.Text type="danger" style={{ fontSize: 11 }}>above MRP</Typography.Text>
                </div>
              )}
            </div>
          ),
        },
        {
          title: 'MRP',
          dataIndex: 'mrpPaise',
          align: 'right',
          render: (v, row) => (
            <div>
              <MoneyText paise={v} type="secondary" />
              {!row.priceAboveMrp && (
                <div>
                  <Typography.Text type="success" style={{ fontSize: 11 }}>
                    {discountPct(row.sellingPricePaise, v)}% off
                  </Typography.Text>
                </div>
              )}
            </div>
          ),
        },
        {
          title: 'Stock',
          dataIndex: 'stock',
          align: 'right',
          render: (v) => (
            <Typography.Text className="tabular" type={v === 0 ? 'danger' : v < 20 ? 'warning' : undefined}>
              {v}
            </Typography.Text>
          ),
        },
        {
          title: 'Fulfilment',
          dataIndex: 'fulfillmentType',
          render: (v) => (
            <Tag color={v === 'ARISE' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
              {v === 'ARISE' ? 'By Arise' : 'Seller'}
            </Tag>
          ),
        },
        {
          title: 'Dispatch',
          dataIndex: 'dispatchSlaHours',
          align: 'right',
          render: (v) => <span className="tabular">{v}h</span>,
        },
        { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="listing" code={v} /> },
        {
          title: '',
          align: 'right',
          render: (_v, row) =>
            row.status === 'LIVE' ? (
              <Can perm="catalog.product.activate">
                <Button size="small" onClick={() => confirmDeactivate(row)}>
                  Deactivate
                </Button>
              </Can>
            ) : null,
        },
      ]}
    />
  );
}
