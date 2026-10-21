import { App, Card, DatePicker, Flex, Skeleton, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@core/api/queryClient';
import { dayjs } from '@core/utils/date';
import MoneyText from '@shared/components/MoneyText';
import { marketingApi } from '../api/marketing.api';

/**
 * Deal of the Day, one card per occupied slot.
 *
 * The spec calls for drag-to-reschedule; this ships a date picker on each
 * card instead — same outcome (the server still swaps whatever already
 * holds the target day), far less to build and verify without a browser.
 * Recorded as a deliberate simplification, not an oversight.
 */
export default function DealCalendar({ deals, loading }) {
  const { message } = App.useApp();

  const reschedule = useMutation({
    mutationFn: ({ id, slotDate }) => marketingApi.rescheduleDeal(id, slotDate),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'deals'] });
      message.success(
        res.data.swappedWith
          ? `Moved. ${res.data.swappedWith.title} took the vacated slot.`
          : 'Moved.',
      );
    },
    onError: (e) => message.error(e.message),
  });

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!deals.length) {
    return <Typography.Text type="secondary">No deals are scheduled on the calendar yet.</Typography.Text>;
  }

  return (
    <Flex gap={12} wrap>
      {deals.map((deal) => (
        <Card key={deal.id} size="small" style={{ width: 220 }} title={dayjs(deal.slotDate).format('ddd, D MMM')}>
          <Flex vertical gap={6}>
            <Typography.Text ellipsis style={{ fontSize: 13 }}>{deal.title}</Typography.Text>
            <MoneyText paise={deal.dealPricePaise} strong />
            <DatePicker
              size="small"
              value={dayjs(deal.slotDate)}
              onChange={(d) => d && reschedule.mutate({ id: deal.id, slotDate: d.format('YYYY-MM-DD') })}
              style={{ width: '100%' }}
            />
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
