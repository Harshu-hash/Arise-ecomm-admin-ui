import { Alert, App, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { authApi } from '@core/auth/authApi';
import { useSessionStore } from '@core/auth/sessionStore';
import PasswordFields from '../components/PasswordFields';

/**
 * Serves two cases: a forced change on first sign-in (status
 * `pending_password_change`, which the route guard sends here), and a
 * voluntary change from the user menu.
 */
export default function ChangePasswordPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const patchUser = useSessionStore((s) => s.patchUser);
  const forced = Boolean(user?.mustChangePassword);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form] = Form.useForm();

  const submit = async (values) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.password,
      });
      patchUser({ ...result, mustChangePassword: false });
      message.success(
        result.otherSessionsRevoked
          ? `Password updated. ${result.otherSessionsRevoked} other session${result.otherSessionsRevoked === 1 ? '' : 's'} signed out.`
          : 'Password updated.',
      );
      navigate(user?.defaultLanding ?? '/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not change your password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const body = (
    <>
      {forced && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Choose a new password to continue"
          description="Your account was set up with a temporary password, so you need to replace it before using the panel."
        />
      )}

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} disabled={loading}>
        <Form.Item
          name="currentPassword"
          label="Current password"
          rules={[{ required: true, message: 'Enter your current password.' }]}
        >
          <Input.Password size="large" autoComplete="current-password" autoFocus />
        </Form.Item>

        <PasswordFields />

        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Changing your password signs out every other device.
        </Typography.Paragraph>

        <Space style={{ width: '100%' }} direction="vertical">
          <Button type="primary" size="large" htmlType="submit" block loading={loading}>
            Update password
          </Button>
          {!forced && (
            <Button block onClick={() => navigate(-1)} disabled={loading}>
              Cancel
            </Button>
          )}
        </Space>
      </Form>
    </>
  );

  // This page always renders inside the app shell (the guard routes a forced
  // change here while the session is otherwise authenticated).
  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Typography.Title level={3} style={{ fontSize: 20 }}>
        Change your password
      </Typography.Title>
      <Card>{body}</Card>
    </div>
  );
}
