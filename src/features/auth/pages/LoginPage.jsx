import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { authApi } from '@core/auth/authApi';
import { useSessionStore } from '@core/auth/sessionStore';
import { IS_MOCK } from '@core/config/env';
import BackupCodesStep from '../components/BackupCodesStep';
import EnrolTwoFactorStep from '../components/EnrolTwoFactorStep';
import ResetDemoDataLink from '../components/ResetDemoDataLink';
import TwoFactorStep from '../components/TwoFactorStep';

/**
 * Sign-in flow: credentials → second factor (verify, or first-time enrolment)
 * → optionally the one-time backup codes.
 *
 * The stage lives in local state rather than the URL because a half-finished
 * challenge is not something anyone should be able to bookmark or share.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);

  const [stage, setStage] = useState('credentials');
  const [challenge, setChallenge] = useState(null);
  const [backupCodes, setBackupCodes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [codeError, setCodeError] = useState(null);

  const landing = () => location.state?.from?.pathname ?? null;

  const finish = (payload) => {
    setAuthenticated(payload);
    const target = landing() ?? payload.user.defaultLanding ?? '/';
    if (payload.user.mustChangePassword) navigate('/change-password', { replace: true });
    else navigate(target, { replace: true });
  };

  const submitCredentials = async (values) => {
    setLoading(true);
    setFormError(null);
    try {
      const result = await authApi.login({ email: values.email.trim(), password: values.password });
      setChallenge(result);
      setStage(result.stage);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not sign you in.');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async ({ code, trustDevice }) => {
    setLoading(true);
    setCodeError(null);
    try {
      const payload = await authApi.verify2fa({ challengeId: challenge.challengeId, code, trustDevice });
      finish(payload);
    } catch (e) {
      const fieldMsg = e instanceof ApiError ? (e.fieldErrors?.code ?? e.message) : 'That did not work.';
      setCodeError(fieldMsg);
      // An expired or burnt-out challenge cannot be retried; send them back.
      if (e instanceof ApiError && e.code === 'SESSION_EXPIRED') {
        setStage('credentials');
        setFormError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitEnrolment = async ({ code }) => {
    setLoading(true);
    setCodeError(null);
    try {
      const payload = await authApi.enrol2fa({ challengeId: challenge.challengeId, code });
      if (payload.backupCodes?.length) {
        setBackupCodes({ codes: payload.backupCodes, payload });
        setStage('backup_codes');
      } else {
        finish(payload);
      }
    } catch (e) {
      setCodeError(e instanceof ApiError ? (e.fieldErrors?.code ?? e.message) : 'That did not work.');
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'verify_2fa') {
    return (
      <TwoFactorStep
        challenge={challenge}
        loading={loading}
        error={codeError}
        onSubmit={submitCode}
        onBack={() => {
          setStage('credentials');
          setChallenge(null);
          setCodeError(null);
        }}
      />
    );
  }

  if (stage === 'enrol_2fa') {
    return (
      <EnrolTwoFactorStep
        challenge={challenge}
        loading={loading}
        error={codeError}
        onSubmit={submitEnrolment}
      />
    );
  }

  if (stage === 'backup_codes') {
    return <BackupCodesStep codes={backupCodes.codes} onContinue={() => finish(backupCodes.payload)} />;
  }

  return (
    <div>
      <Space direction="vertical" size={2} style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sign in
        </Typography.Title>
        <Typography.Text type="secondary">Use your Arise admin account.</Typography.Text>
      </Space>

      {formError && (
        <Alert type="error" showIcon message={formError} style={{ marginBottom: 16 }} closable onClose={() => setFormError(null)} />
      )}

      <Form layout="vertical" requiredMark={false} onFinish={submitCredentials} disabled={loading}>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter your email.' },
            { type: 'email', message: 'That does not look like an email address.' },
          ]}
        >
          <Input
            autoFocus
            size="large"
            prefix={<MailOutlined style={{ opacity: 0.45 }} />}
            placeholder="you@arise.test"
            autoComplete="username"
          />
        </Form.Item>

        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password.' }]}>
          <Input.Password
            size="large"
            prefix={<LockOutlined style={{ opacity: 0.45 }} />}
            placeholder="••••••••••••"
            autoComplete="current-password"
          />
        </Form.Item>

        <Button type="primary" size="large" htmlType="submit" block loading={loading}>
          Continue
        </Button>
      </Form>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Link to="/forgot-password">Forgot your password?</Link>
      </div>

      {IS_MOCK && (
        <Alert
          type="info"
          style={{ marginTop: 18 }}
          message="Demo accounts"
          description={
            <Space direction="vertical" size={6}>
              <Typography.Text style={{ fontSize: 12 }}>
                Sign in as <Typography.Text code>super@arise.test</Typography.Text> with{' '}
                <Typography.Text code>Arise@123456</Typography.Text>. Other roles use the same
                password: ops, catalog, finance, approver, agent, supportlead, marketing,
                onboarding, sam, ads, warehouse, logistics, auditor, category — each @arise.test.
              </Typography.Text>
              <ResetDemoDataLink />
            </Space>
          }
        />
      )}
    </div>
  );
}
