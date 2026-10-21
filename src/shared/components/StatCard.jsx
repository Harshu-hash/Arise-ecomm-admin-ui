import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { Card, Flex, Skeleton, Space, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { formatINRCompact, formatNumber, formatPercent } from '@core/utils/money';
import { glossify } from '@shared/utils/glossify';

/**
 * KPI tile with a delta against the comparison period.
 *
 * `invertDelta` matters: a rising cancellation rate is bad news, so the arrow
 * stays red even though the number went up.
 */
export default function StatCard({
  label,
  value,
  valuePaise,
  format = 'number',
  deltaPct,
  invertDelta = false,
  comparisonLabel = 'vs previous period',
  to,
  loading,
  extra,
}) {
  if (loading) {
    return (
      <Card size="small" styles={{ body: { padding: 14 } }}>
        <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={{ width: '40%' }} />
      </Card>
    );
  }

  const display =
    format === 'money'
      ? formatINRCompact(valuePaise)
      : format === 'percent'
        ? formatPercent(value)
        : formatNumber(value);

  const up = (deltaPct ?? 0) > 0;
  const flat = !deltaPct;
  const good = invertDelta ? !up : up;
  // A thin accent on top of an otherwise plain tile, carrying the same
  // good/bad/flat signal as the arrow below it — reinforcement, not the only
  // signal, since status is never colour-alone in this panel.
  const accent = flat ? 'var(--ant-color-primary)' : good ? 'var(--ant-color-success)' : 'var(--ant-color-error)';

  const body = (
    <Card
      size="small"
      hoverable={Boolean(to)}
      styles={{ body: { padding: 14 } }}
      style={{ height: '100%', borderTop: `3px solid ${accent}` }}
    >
      <Flex vertical gap={6}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {glossify(label)}
        </Typography.Text>

        <Typography.Text strong className="tabular" style={{ fontSize: 24, lineHeight: 1.15 }}>
          {display}
        </Typography.Text>

        {deltaPct !== null && deltaPct !== undefined && (
          <Tooltip title={comparisonLabel}>
            <Space size={4}>
              <Typography.Text
                style={{ fontSize: 12 }}
                type={flat ? 'secondary' : good ? 'success' : 'danger'}
              >
                {flat ? <MinusOutlined /> : up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{' '}
                {formatPercent(Math.abs(deltaPct))}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {comparisonLabel}
              </Typography.Text>
            </Space>
          </Tooltip>
        )}

        {extra}
      </Flex>
    </Card>
  );

  return to ? (
    <Link to={to} style={{ display: 'block', height: '100%' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
