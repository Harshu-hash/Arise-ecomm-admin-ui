import { ArrowLeftOutlined, CheckCircleOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '@core/auth/authApi';
import { IS_MOCK } from '@core/config/env';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (values) => {
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(values.email.trim());
      setSent({ email: values.email.trim(), devHint: result.devHint });
    } catch {
      // The endpoint never reveals whether an account exists, so a failure
      // here is a transport problem; show the same confirmation regardless.
      setSent({ email: values.email.trim() });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <CheckCircleOutlined style={{ color: 'var(--ant-color-success)', marginRight: 8 }} />
            Check your email
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            If an Arise admin account exists for <Typography.Text strong>{sent.email}</Typography.Text>,
            we have sent a link to reset the password. The link expires in 30 minutes.
          </Typography.Paragraph>

          {IS_MOCK && sent.devHint?.resetUrl && (
            <Alert
              type="warning"
              showIcon
              message="Mock environment"
              description={
                <Typography.Text>
                  No email is actually sent. <Link to={sent.devHint.resetUrl}>Open the reset link</Link>
                </Typography.Text>
              }
            />
          )}

          <Link to="/login">
            <Button icon={<ArrowLeftOutlined />} block>
              Back to sign in
            </Button>
          </Link>
        </Space>
      </div>
    );
  }

  return (
    <div>
      <Space direction="vertical" size={2} style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Reset your password
        </Typography.Title>
        <Typography.Text type="secondary">
          We will email you a link to set a new one.
        </Typography.Text>
      </Space>

      <Form layout="vertical" requiredMark={false} onFinish={submit} disabled={loading}>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter your email.' },
            { type: 'email', message: 'That does not look like an email address.' },
          ]}
        >
          <Input autoFocus size="large" prefix={<MailOutlined style={{ opacity: 0.45 }} />} placeholder="you@arise.test" />
        </Form.Item>

        <Button type="primary" size="large" htmlType="submit" block loading={loading}>
          Send reset link
        </Button>
      </Form>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
