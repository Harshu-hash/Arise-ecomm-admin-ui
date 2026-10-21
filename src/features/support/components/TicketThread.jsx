import { Card, Empty, Flex, Tag, Typography } from 'antd';
import DateText from '@shared/components/DateText';

const BUBBLE = {
  MESSAGE_CUSTOMER: { align: 'flex-start', bg: 'var(--ant-color-fill-tertiary)', label: null },
  MESSAGE_AGENT: { align: 'flex-end', bg: 'var(--ant-color-primary-bg)', label: null },
  NOTE: { align: 'flex-start', bg: 'var(--ant-color-warning-bg)', label: 'Internal note' },
  SYSTEM: { align: 'center', bg: 'transparent', label: null },
  STATUS_CHANGE: { align: 'center', bg: 'transparent', label: null },
};

/**
 * The conversation thread: customer messages, agent replies, internal notes
 * and system events in one timeline, each styled distinctly so a note can
 * never be mistaken for something the customer can see.
 */
export default function TicketThread({ events = [] }) {
  if (!events.length) return <Card size="small"><Empty description="No messages yet" /></Card>;

  return (
    <Card size="small" title="Conversation" styles={{ body: { maxHeight: 520, overflowY: 'auto' } }}>
      <Flex vertical gap={10}>
        {events.map((e) => {
          const style = BUBBLE[e.type] ?? BUBBLE.SYSTEM;
          if (['SYSTEM', 'STATUS_CHANGE'].includes(e.type)) {
            return (
              <Flex key={e.id} justify="center">
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {e.body} · <DateText value={e.createdAt} variant="datetime" />
                </Typography.Text>
              </Flex>
            );
          }
          return (
            <Flex key={e.id} justify={style.align} style={{ width: '100%' }}>
              <Flex
                vertical
                gap={2}
                style={{ maxWidth: '80%', background: style.bg, borderRadius: 8, padding: '8px 12px' }}
              >
                <Flex gap={6} align="center">
                  <Typography.Text strong style={{ fontSize: 12 }}>{e.authorName}</Typography.Text>
                  {style.label && <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: 10 }}>{style.label}</Tag>}
                </Flex>
                <Typography.Text style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.body}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  <DateText value={e.createdAt} variant="datetime" />
                </Typography.Text>
              </Flex>
            </Flex>
          );
        })}
      </Flex>
    </Card>
  );
}
