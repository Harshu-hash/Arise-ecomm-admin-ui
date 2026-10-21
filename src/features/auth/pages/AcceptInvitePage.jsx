import { Alert, Button, Form, Input, Space, Spin, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { authApi } from '@core/auth/authApi';
import { useSessionStore } from '@core/auth/sessionStore';
import BackupCodesStep from '../components/BackupCodesStep';
import EnrolTwoFactorStep from '../components/EnrolTwoFactorStep';
import PasswordFields from '../components/PasswordFields';

/**
 * Invite acceptance: set a password, then enrol a second factor, then save
 * backup codes — the same enrolment components the login flow uses.
 */
export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);

  const [stage, setStage] = useState('password');
  const [challenge, setChallenge] = useState(null);
  const [backupCodes, setBackupCodes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form] = Form.useForm();

  const { data: invite, isLoading, error: inviteError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => authApi.getInvite(token),
    enabled: Boolean(token),
    retry: false,
  });

  const submitPassword = async (values) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.acceptInvite({
        token,
        name: values.name,
        password: values.password,
      });
      setChallenge(result);
      setStage('enrol_2fa');
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not accept this invitation.');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitEnrolment = async ({ code }) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await authApi.enrol2fa({ challengeId: challenge.challengeId, code });
      if (payload.backupCodes?.length) {
        setBackupCodes({ codes: payload.backupCodes, payload });
        setStage('backup_codes');
      } else {
        setAuthenticated(payload);
        navigate(payload.user.defaultLanding ?? '/', { replace: true });
      }
    } catch (e) {
      setError(e instanceof ApiError ? (e.fieldErrors?.code ?? e.message) : 'That did not work.');
    } finally {
      setLoading(false);
    }
  };

  if (!token || inviteError) {
    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="error"
          showIcon
          message="This invitation is no longer valid"
          description="It may have been used, revoked or replaced. Ask whoever invited you to send a new one."
        />
        <Link to="/login">
          <Button block>Go to sign in</Button>
        </Link>
      </Space>
    );
  }

  if (isLoading) return <Spin />;

  if (stage === 'enrol_2fa') {
    return (
      <EnrolTwoFactorStep challenge={challenge} loading={loading} error={error} onSubmit={submitEnrolment} />
    );
  }

  if (stage === 'backup_codes') {
    return (
      <BackupCodesStep
        codes={backupCodes.codes}
        onContinue={() => {
          setAuthenticated(backupCodes.payload);
          navigate(backupCodes.payload.user.defaultLanding ?? '/', { replace: true });
        }}
      />
    );
  }

  return (
    <div>
      <Space direction="vertical" size={4} style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Welcome to Arise Admin
        </Typography.Title>
        <Typography.Text type="secondary">
          You have been invited as{' '}
          {invite.roleNames.map((r) => (
            <Tag key={r} style={{ marginInlineEnd: 4 }}>
              {r}
            </Tag>
          ))}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {invite.email}
        </Typography.Text>
      </Space>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ name: invite.name }}
        onFinish={submitPassword}
        disabled={loading}
      >
        <Form.Item name="name" label="Your name" rules={[{ required: true, message: 'Enter your name.' }]}>
          <Input size="large" autoFocus />
        </Form.Item>

        <PasswordFields label="Create a password" />

        <Button type="primary" size="large" htmlType="submit" block loading={loading}>
          Continue
        </Button>
      </Form>
    </div>
  );
}
