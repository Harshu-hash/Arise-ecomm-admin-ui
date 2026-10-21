import { Card, Flex, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

/**
 * Customer 360 mini, plus order context — read-only here, with links out to
 * the full order and customer pages for anything that needs an action
 * (cancel, refund, reschedule). Those flows already exist in full on the
 * order detail page; duplicating them inline risked a second, divergent
 * copy of logic that moves real money.
 */
export default function TicketCustomerPanel({ ticket }) {
  const c = ticket.customer360;
  if (!c) return null;

  return (
    <Flex vertical gap={12}>
      <Card size="small" title="Customer">
        <Flex vertical gap={6}>
          <Flex justify="space-between">
            <Link to={`/customers/${ticket.customerId}`}><Typography.Text strong>{c.name}</Typography.Text></Link>
            {c.riskScore > 60 && <Tag color="red">risk {c.riskScore}</Tag>}
          </Flex>
          <Typography.Text type="secondary" className="mono" style={{ fontSize: 12 }}>{c.phone}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.city}</Typography.Text>
          <Flex justify="space-between">
            <Typography.Text style={{ fontSize: 12 }}>Wallet balance</Typography.Text>
            <MoneyText paise={c.walletBalancePaise} />
          </Flex>
          <Flex justify="space-between">
            <Typography.Text style={{ fontSize: 12 }}>Prior tickets</Typography.Text>
            <Typography.Text className="tabular">{c.priorTicketCount}</Typography.Text>
          </Flex>
        </Flex>
      </Card>

      {ticket.orderId && (
        <Card size="small" title="Linked order" extra={<Link to={`/orders/${ticket.orderId}`}>Open order</Link>}>
          <Typography.Text className="mono" style={{ fontSize: 12 }}>{ticket.orderId}</Typography.Text>
        </Card>
      )}

      <Card size="small" title="Recent orders">
        <Flex vertical gap={8}>
          {c.recentOrders.length ? c.recentOrders.map((o) => (
            <Flex key={o.id} justify="space-between" align="center">
              <Link to={`/orders/${o.id}`}>
                <Typography.Text className="mono" style={{ fontSize: 11 }}>{o.id}</Typography.Text>
              </Link>
              <Flex gap={6} align="center">
                <MoneyText paise={o.grandTotalPaise} />
                <StatusTag domain="orderItem" code={o.status} showIcon={false} />
              </Flex>
            </Flex>
          )) : <Typography.Text type="secondary" style={{ fontSize: 12 }}>No orders yet</Typography.Text>}
        </Flex>
      </Card>

      {c.openReturns.length > 0 && (
        <Card size="small" title="Open returns">
          <Flex vertical gap={6}>
            {c.openReturns.map((r) => (
              <Flex key={r.id} justify="space-between">
                <Link to={`/returns/${r.id}`}>
                  <Typography.Text className="mono" style={{ fontSize: 11 }}>{r.id}</Typography.Text>
                </Link>
                <MoneyText paise={r.amountPaise} />
              </Flex>
            ))}
          </Flex>
        </Card>
      )}

      <Card size="small" title="SLA">
        <Flex vertical gap={4}>
          <Flex justify="space-between">
            <Typography.Text style={{ fontSize: 12 }}>First response due</Typography.Text>
            <DateText value={ticket.firstResponseDueAt} variant="datetime" />
          </Flex>
          <Flex justify="space-between">
            <Typography.Text style={{ fontSize: 12 }}>Resolution due</Typography.Text>
            <DateText value={ticket.resolutionDueAt} variant="datetime" />
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}
