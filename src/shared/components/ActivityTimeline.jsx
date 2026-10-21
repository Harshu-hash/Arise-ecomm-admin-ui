import { Avatar, Empty, Space, Timeline, Typography } from 'antd';
import { avatarColor, initials } from '@core/utils/misc';
import DateText from './DateText';
import DiffList from './DiffList';

/** Who did it matters as much as what happened, so the actor is always shown. */
const ACTOR_TONE = {
  system: 'var(--ant-color-text-tertiary)',
  customer: 'var(--ant-color-info)',
  seller: 'var(--ant-color-warning)',
  courier: 'var(--ant-color-primary)',
};

export default function ActivityTimeline({ events = [], emptyText = 'Nothing has happened yet' }) {
  if (!events.length) return <Empty description={emptyText} />;

  return (
    <Timeline
      mode="left"
      items={events.map((e) => ({
        key: e.id,
        color: e.severity === 'warning' ? 'orange' : e.severity === 'error' ? 'red' : 'blue',
        children: (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Space size={8} wrap>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {e.title ?? e.entityLabel ?? e.action}
              </Typography.Text>
              <DateText value={e.at} />
            </Space>

            <Space size={6} align="center">
              {e.actorName && e.actorId !== 'system' ? (
                <Avatar
                  size={18}
                  style={{ backgroundColor: avatarColor(e.actorEmail ?? e.actorName), fontSize: 9 }}
                >
                  {initials(e.actorName)}
                </Avatar>
              ) : null}
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, color: ACTOR_TONE[e.actorType] }}
              >
                {e.actorName ?? 'System'}
                {e.action ? ` · ${e.action}` : ''}
              </Typography.Text>
            </Space>

            {e.reason && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Reason: {e.reason}
              </Typography.Text>
            )}

            {e.changes?.length > 0 && <DiffList changes={e.changes} compact />}
          </Space>
        ),
      }))}
    />
  );
}
