import { Card, Col, Flex, Row, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatINRCompact } from '@core/utils/money';
import { financeApi, financeKeys } from '@features/finance/api/finance.api';

/**
 * Where the platform's money is right now.
 *
 * Deliberately split into what we owe and what is owed to us, rather than
 * netted into one number: a healthy-looking net can hide ₹40 lakh sitting
 * with a courier and ₹40 lakh of refunds we have not paid.
 */
export default function MoneyPositionCard() {
  const { data, isLoading } = useQuery({
    queryKey: financeKeys.overview,
    queryFn: () => financeApi.overview(),
    staleTime: 30_000,
  });

  const d = data?.data;

  const owed = [
    ['Payable to sellers now', d?.payableNowPaise, '/finance/payouts'],
    ['Refunds not yet paid', d?.refundsPendingPaise, '/finance/refunds'],
    ['Wallet balances outstanding', d?.walletLiabilityPaise, '/wallet/accounts'],
    ['Unspent gift cards', d?.giftCardLiabilityPaise, '/wallet/gift-cards'],
  ];

  const due = [
    ['Cash still with couriers', d?.codOutstandingPaise, '/finance/cod'],
    ['Held back from sellers', d?.heldPaise, '/finance/payouts'],
    ['Commission earned', d?.commissionPaise, '/finance/commission'],
    ['TCS + TDS collected', (d?.tcsPaise ?? 0) + (d?.tdsPaise ?? 0), '/finance/tax'],
  ];

  return (
    <Card
      size="small"
      title="Money position"
      loading={isLoading}
      extra={
        d?.refundsFailedCount ? (
          <Link to="/finance/refunds?tab=FAILED">
            <Tag color="red" style={{ marginInlineEnd: 0 }}>
              {d.refundsFailedCount} refunds failed
            </Tag>
          </Link>
        ) : null
      }
    >
      <Row gutter={[16, 8]}>
        <Col xs={24} md={12}>
          <Section title="We owe" rows={owed} />
        </Col>
        <Col xs={24} md={12}>
          <Section title="Owed to us, or already ours" rows={due} />
        </Col>
      </Row>

      {d?.pendingBatch ? (
        <Flex justify="space-between" align="baseline" gap={8} style={{ marginTop: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            A payout batch is waiting for release
          </Typography.Text>
          <Link to={`/finance/payouts/${d.pendingBatch.id}`}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              {formatINRCompact(d.pendingBatch.netPaise)} · {d.pendingBatch.sellerCount} sellers
            </Typography.Text>
          </Link>
        </Flex>
      ) : null}
    </Card>
  );
}

function Section({ title, rows }) {
  return (
    <Flex vertical gap={6}>
      <Typography.Text
        type="secondary"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}
      >
        {title}
      </Typography.Text>
      {rows.map(([label, paise, to]) => (
        <Flex key={label} justify="space-between" align="baseline" gap={8}>
          <Link to={to}>
            <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
          </Link>
          <Typography.Text strong className="tabular" style={{ fontSize: 13 }}>
            {formatINRCompact(paise ?? 0)}
          </Typography.Text>
        </Flex>
      ))}
    </Flex>
  );
}
