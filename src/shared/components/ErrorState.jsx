import { CopyOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { App, Button, Result, Space, Typography } from 'antd';
import { ApiError, friendlyMessage } from '@core/api/errors';
import { copyToClipboard } from '@core/utils/misc';

/**
 * Error surface for a failed query. The request ID is shown and copyable
 * because it is the only thing that lets support correlate a user's report
 * with a server log line.
 */
export default function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  const { message } = App.useApp();
  const apiError = error instanceof ApiError ? error : null;
  const requestId = apiError?.requestId;

  return (
    <Result
      icon={<WarningOutlined />}
      status="error"
      title={title}
      subTitle={
        <Space direction="vertical" size={8} style={{ maxWidth: 520 }}>
          <Typography.Text type="secondary">{friendlyMessage(error)}</Typography.Text>
          {requestId && (
            <Typography.Text type="secondary" className="mono">
              Request ID: {requestId}
            </Typography.Text>
          )}
        </Space>
      }
      extra={
        <Space>
          {onRetry && (
            <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
              Try again
            </Button>
          )}
          {requestId && (
            <Button
              icon={<CopyOutlined />}
              onClick={async () => {
                const done = await copyToClipboard(requestId);
                if (done) message.success('Request ID copied');
              }}
            >
              Copy request ID
            </Button>
          )}
        </Space>
      }
    />
  );
}
