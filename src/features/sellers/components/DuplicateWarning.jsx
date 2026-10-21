import { Alert, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import StatusTag from '@shared/components/StatusTag';

/**
 * A match on PAN, GSTIN or bank account against another seller.
 *
 * A match on a blacklisted account is the single strongest signal that someone
 * removed for fraud is trying to come back, so it blocks approval outright
 * rather than merely warning.
 */
export default function DuplicateWarning({ duplicates = [] }) {
  if (!duplicates.length) return null;
  const blocking = duplicates.filter((d) => d.blocking);

  return (
    <Alert
      type={blocking.length ? 'error' : 'warning'}
      showIcon
      message={
        blocking.length
          ? 'Matches a blacklisted seller — approval is blocked'
          : `Shares details with ${duplicates.length} other seller${duplicates.length === 1 ? '' : 's'}`
      }
      description={
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {blocking.length > 0 && (
            <Typography.Text style={{ fontSize: 12 }}>
              The same identity was removed from the platform before. Escalate rather than approving.
            </Typography.Text>
          )}
          {duplicates.map((d) => (
            <Space key={d.sellerId} size={8} wrap>
              <Link to={`/sellers/${d.sellerId}`}>
                <Typography.Text strong style={{ fontSize: 12 }}>{d.storeName}</Typography.Text>
              </Link>
              <StatusTag domain="seller" code={d.status} showIcon={false} />
              {d.reasons.map((r) => (
                <Tag key={r} style={{ marginInlineEnd: 0 }}>same {r}</Tag>
              ))}
            </Space>
          ))}
        </Space>
      }
    />
  );
}
