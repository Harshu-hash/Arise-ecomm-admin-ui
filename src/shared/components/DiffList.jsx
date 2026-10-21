import { ArrowRightOutlined } from '@ant-design/icons';
import { Space, Typography } from 'antd';

/** Field-level before → after, used by the audit log and approval requests. */
export default function DiffList({ changes = [], compact = false }) {
  if (!changes.length) return null;

  return (
    <Space direction="vertical" size={compact ? 2 : 6} style={{ width: '100%' }}>
      {changes.map((c) => (
        <Space key={c.field} size={6} wrap style={{ fontSize: compact ? 12 : 13 }}>
          <Typography.Text type="secondary">{humanField(c.field)}:</Typography.Text>
          <Typography.Text delete type="secondary">
            {render(c.from)}
          </Typography.Text>
          <ArrowRightOutlined style={{ fontSize: 10, opacity: 0.5 }} />
          <Typography.Text strong>{render(c.to)}</Typography.Text>
        </Space>
      ))}
    </Space>
  );
}

function humanField(field) {
  return String(field)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[._]/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function render(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'none';
    // Permission arrays are long; a count is more useful than 400 keys.
    return value.length > 4 ? `${value.length} items` : value.join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
