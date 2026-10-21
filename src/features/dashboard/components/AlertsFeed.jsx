import { BellOutlined } from '@ant-design/icons';
import { Badge, Card, Empty, Flex, Skeleton, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import DateText from '@shared/components/DateText';

const SEVERITY_COLOR = {
  critical: 'var(--ant-color-error)',
  warning: 'var(--ant-color-warning)',
  info: 'var(--ant-color-info)',
};

/** System-level signals (a gateway success-rate drop, a cancellation spike) rather than per-record work items — that is the Action Center's job. */
export default function AlertsFeed({ alerts, unread, loading, onRead }) {
  if (loading) {
    return (
      <Card title="Alerts" size="small">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <BellOutlined />
          Alerts
          {Boolean(unread) && <Badge count={unread} size="small" />}
        </Flex>
      }
      size="small"
      styles={{ body: { padding: alerts?.length ? 0 : 16 } }}
    >
      {!alerts?.length ? (
        <Empty description="No alerts" />
      ) : (
        <Flex vertical>
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} onRead={onRead} />
          ))}
        </Flex>
      )}
    </Card>
  );
}

function AlertRow({ alert, onRead }) {
  const navigate = useNavigate();

  return (
    <Flex
      gap={10}
      align="flex-start"
      onClick={() => {
        if (!alert.read) onRead(alert.id);
        if (alert.link) navigate(alert.link);
      }}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--ant-color-border-secondary)',
        cursor: alert.link ? 'pointer' : 'default',
        background: alert.read ? undefined : 'var(--ant-color-fill-quaternary)',
      }}
    >
      <div
        style={{
          width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
          background: SEVERITY_COLOR[alert.severity] ?? SEVERITY_COLOR.info,
        }}
      />
      <Flex vertical gap={1} style={{ minWidth: 0 }}>
        <Typography.Text strong={!alert.read} style={{ fontSize: 13 }}>{alert.title}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{alert.body}</Typography.Text>
        <DateText value={alert.at} type="secondary" />
      </Flex>
    </Flex>
  );
}
