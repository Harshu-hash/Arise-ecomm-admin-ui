import { Button, Form, Input, Space, Steps, Typography } from 'antd';
import { useState } from 'react';
import DevCodeHint from './DevCodeHint';

/**
 * First-time 2FA enrolment. The secret is shown as text rather than a QR
 * image: generating a real QR needs a dependency we do not otherwise use, and
 * every authenticator app accepts manual key entry.
 */
export default function EnrolTwoFactorStep({ challenge, onSubmit, loading, error }) {
  const [step, setStep] = useState(0);

  return (
    <div>
      <Space direction="vertical" size={2} style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Set up two-step verification
        </Typography.Title>
        <Typography.Text type="secondary">
          Every Arise admin account needs a second factor. This takes a minute.
        </Typography.Text>
      </Space>

      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 20 }}
        items={[{ title: 'Add account' }, { title: 'Confirm' }]}
      />

      {step === 0 ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            In your authenticator app (Google Authenticator, Authy, 1Password), add an account
            manually and paste this key:
          </Typography.Paragraph>

          <Input
            readOnly
            value={challenge?.secret ?? ''}
            size="large"
            style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: 1 }}
          />
          <Typography.Text copyable={{ text: challenge?.secret }} type="secondary" style={{ fontSize: 12 }}>
            Copy setup key
          </Typography.Text>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Account name: Arise Admin ({challenge?.maskedEmail}). Type: time-based (TOTP), 6 digits.
          </Typography.Text>

          <Button type="primary" size="large" block onClick={() => setStep(1)}>
            I have added it
          </Button>
        </Space>
      ) : (
        <>
          <DevCodeHint code={challenge?.devHint?.code} />
          <Form
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => onSubmit({ code: values.code.trim() })}
          >
            <Form.Item
              name="code"
              label="Enter the 6-digit code from your app"
              validateStatus={error ? 'error' : undefined}
              help={error}
              rules={[
                { required: true, message: 'Enter the 6-digit code.' },
                { pattern: /^\d{6}$/, message: 'The code is 6 digits.' },
              ]}
            >
              <Input
                autoFocus
                size="large"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }}
              />
            </Form.Item>

            <Button type="primary" size="large" htmlType="submit" block loading={loading}>
              Confirm and finish
            </Button>
            <Button type="link" block onClick={() => setStep(0)} style={{ marginTop: 8 }}>
              Back to the setup key
            </Button>
          </Form>
        </>
      )}
    </div>
  );
}
