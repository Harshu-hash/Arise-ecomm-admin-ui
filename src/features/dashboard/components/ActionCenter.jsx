import { ArrowRightOutlined, WarningFilled } from '@ant-design/icons';
import { Card, Empty, Flex, Skeleton, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { formatNumber } from '@core/utils/money';

/**
 * The work queue, and the most-used widget on the page: each tile is a count
 * of things waiting on someone, linked to the pre-filtered list. Tiles turn
 * red when the queue is past its SLA, so a glance is enough.
 */
export default function ActionCenter({ tiles, loading }) {
  if (loading) {
    return (
      <Card title="Action center" size="small">
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (!tiles?.length) {
    return (
      <Card title="Action center" size="small">
        <Empty description="Nothing is waiting on your roles" />
      </Card>
    );
  }

  const sorted = [...tiles].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.count - a.count);

  return (
    <Card
      title="Action center"
      size="small"
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Queues your roles can act on
        </Typography.Text>
      }
      styles={{ body: { padding: 8 } }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))',
          gap: 8,
        }}
      >
        {sorted.map((tile) => (
          <Link key={tile.key} to={tile.link} style={{ display: 'block' }}>
            <Flex
              align="center"
              justify="space-between"
              gap={8}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--ant-color-border-secondary)',
                background: tile.urgent ? 'var(--ant-color-error-bg)' : 'var(--ant-color-fill-quaternary)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Flex align="center" gap={6}>
                  <Typography.Text
                    strong
                    className="tabular"
                    style={{
                      fontSize: 20,
                      lineHeight: 1.1,
                      color: tile.urgent ? 'var(--ant-color-error)' : undefined,
                    }}
                  >
                    {formatNumber(tile.count)}
                  </Typography.Text>
                  {tile.urgent && <WarningFilled style={{ color: 'var(--ant-color-error)', fontSize: 12 }} />}
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {tile.label}
                </Typography.Text>
              </div>
              <ArrowRightOutlined style={{ fontSize: 11, opacity: 0.4 }} />
            </Flex>
          </Link>
        ))}
      </div>
    </Card>
  );
}
