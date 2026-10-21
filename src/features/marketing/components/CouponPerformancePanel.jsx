import { Flex, Skeleton, Statistic, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import MoneyText from '@shared/components/MoneyText';
import { marketingApi, marketingKeys } from '../api/marketing.api';

/** Redemptions, discount given and GMV influenced — read straight off the coupon detail endpoint. */
export default function CouponPerformancePanel({ coupon }) {
  const query = useQuery({
    queryKey: marketingKeys.coupon(coupon.id),
    queryFn: () => marketingApi.coupon(coupon.id),
  });

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const { performance, redemptions } = query.data.data;

  return (
    <Flex vertical gap={16}>
      <Flex gap={24} wrap>
        <Statistic title="Redemptions" value={performance.redemptions} />
        <Flex vertical gap={2}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>Discount given</Typography.Text>
          <MoneyText paise={performance.discountGivenPaise} strong style={{ fontSize: 24 }} />
        </Flex>
        <Flex vertical gap={2}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>GMV influenced</Typography.Text>
          <MoneyText paise={performance.gmvInfluencedPaise} strong style={{ fontSize: 24 }} />
        </Flex>
        <Statistic title="New customers acquired" value={performance.newCustomersAcquired} />
      </Flex>

      <Table
        size="small"
        rowKey="id"
        dataSource={redemptions}
        pagination={redemptions.length > 10 ? { pageSize: 10, size: 'small' } : false}
        columns={[
          {
            key: 'orderId', title: 'Order', dataIndex: 'orderId',
            render: (v) => <Typography.Text className="mono" style={{ fontSize: 12 }}>{v}</Typography.Text>,
          },
          {
            key: 'discountPaise', title: 'Discount', dataIndex: 'discountPaise', align: 'right',
            render: (v) => <MoneyText paise={v} />,
          },
          {
            key: 'orderTotalPaise', title: 'Order total', dataIndex: 'orderTotalPaise', align: 'right',
            render: (v) => <MoneyText paise={v} />,
          },
          {
            key: 'redeemedAt', title: 'Redeemed', dataIndex: 'redeemedAt',
            render: (v) => <DateText value={v} variant="date" />,
          },
        ]}
      />
    </Flex>
  );
}
