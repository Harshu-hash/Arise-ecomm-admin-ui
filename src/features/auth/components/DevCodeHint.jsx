import { Alert, Typography } from 'antd';
import { IS_MOCK } from '@core/config/env';

/**
 * In the mock build there is no real authenticator app, so the server returns
 * the code it expects and we show it here. This is the only way to exercise the
 * genuine 2FA flow without stubbing it out.
 */
export default function DevCodeHint({ code, label = 'Mock environment' }) {
  if (!IS_MOCK || !code) return null;

  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      message={label}
      description={
        <Typography.Text>
          There is no real authenticator here. Use code{' '}
          <Typography.Text strong copyable code>
            {code}
          </Typography.Text>
        </Typography.Text>
      }
    />
  );
}
