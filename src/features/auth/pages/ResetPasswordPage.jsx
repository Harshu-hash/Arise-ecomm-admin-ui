import { CheckCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Space, Typography } from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { authApi } from '@core/auth/authApi';
import PasswordFields from '../components/PasswordFields';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form] = Form.useForm();

  const submit = async (values) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword({ token, password: values.password });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(
          Object.entries(e.fieldErrors).map(([name, errors]) => ({ name, errors: [errors] })),
        );
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not reset your password.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="error"
          showIcon
          message="This link is incomplete"
          description="Request a new password reset link and open it directly from your email."
        />
        <Link to="/forgot-password">
          <Button block>Request a new link</Button>
        </Link>
      </Space>
    );
  }

  if (done) {
    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <CheckCircleOutlined style={{ color: 'var(--ant-color-success)', marginRight: 8 }} />
          Password updated
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          For security, every other session has been signed out. Sign in with your new password.
        </Typography.Paragraph>
        <Link to="/login">
          <Button type="primary" size="large" block>
            Go to sign in
          </Button>
        </Link>
      </Space>
    );
  }

  return (
    <div>
      <Space direction="vertical" size={2} style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Set a new password
        </Typography.Title>
        <Typography.Text type="secondary">
          Choose something you have not used on this account before.
        </Typography.Text>
      </Space>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={loading}>
        <PasswordFields />
        <Button type="primary" size="large" htmlType="submit" block loading={loading}>
          Update password
        </Button>
      </Form>
    </div>
  );
}
