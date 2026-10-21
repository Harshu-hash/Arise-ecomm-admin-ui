import { Spin, Typography } from 'antd';

export default function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
      role="status"
      aria-live="polite"
    >
      <Spin size="large" />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </div>
  );
}
