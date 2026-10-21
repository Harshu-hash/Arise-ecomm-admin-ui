import { InboxOutlined } from '@ant-design/icons';
import { Button, Empty, Space, Typography } from 'antd';

/**
 * Two distinct empty cases, because they need different exits:
 * `variant="empty"` — nothing exists yet, so offer the create action.
 * `variant="filtered"` — records exist but none match, so offer to clear filters.
 */
export default function EmptyState({
  variant = 'empty',
  title,
  description,
  actionLabel,
  onAction,
  onClearFilters,
  icon,
}) {
  const filtered = variant === 'filtered';
  const heading = title ?? (filtered ? 'No results match these filters' : 'Nothing here yet');
  const body =
    description ??
    (filtered
      ? 'Try widening the date range or removing a filter.'
      : 'Records will appear here once they exist.');

  return (
    <Empty
      image={icon ?? <InboxOutlined style={{ fontSize: 44, opacity: 0.35 }} />}
      imageStyle={{ height: 'auto', marginBottom: 12 }}
      description={
        <Space direction="vertical" size={4} style={{ maxWidth: 420 }}>
          <Typography.Text strong>{heading}</Typography.Text>
          <Typography.Text type="secondary">{body}</Typography.Text>
        </Space>
      }
      style={{ padding: '32px 16px' }}
    >
      <Space>
        {filtered && onClearFilters && <Button onClick={onClearFilters}>Clear filters</Button>}
        {!filtered && actionLabel && onAction && (
          <Button type="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Space>
    </Empty>
  );
}
