import { Form, Input, Progress, Space, Typography } from 'antd';
import { useState } from 'react';
import { PASSWORD_RULES, passwordValidator } from '../passwordPolicy';

/** New-password + confirm pair with a live checklist. */
export default function PasswordFields({ nameNew = 'password', nameConfirm = 'confirm', label = 'New password' }) {
  const [value, setValue] = useState('');
  const met = PASSWORD_RULES.filter((r) => r.test(value)).length;

  return (
    <>
      <Form.Item name={nameNew} label={label} rules={[{ validator: passwordValidator }]} hasFeedback>
        <Input.Password
          size="large"
          autoComplete="new-password"
          onChange={(e) => setValue(e.target.value)}
          placeholder="••••••••••••"
        />
      </Form.Item>

      <div style={{ marginTop: -12, marginBottom: 16 }}>
        <Progress
          percent={(met / PASSWORD_RULES.length) * 100}
          showInfo={false}
          size="small"
          status={met === PASSWORD_RULES.length ? 'success' : 'active'}
        />
        <Space direction="vertical" size={0} style={{ marginTop: 4 }}>
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value);
            return (
              <Typography.Text
                key={r.label}
                type={ok ? 'success' : 'secondary'}
                style={{ fontSize: 11 }}
              >
                {ok ? '✓' : '○'} {r.label}
              </Typography.Text>
            );
          })}
        </Space>
      </div>

      <Form.Item
        name={nameConfirm}
        label="Confirm password"
        dependencies={[nameNew]}
        hasFeedback
        rules={[
          { required: true, message: 'Type the password again.' },
          ({ getFieldValue }) => ({
            validator: (_r, v) =>
              !v || getFieldValue(nameNew) === v
                ? Promise.resolve()
                : Promise.reject(new Error('The two passwords do not match.')),
          }),
        ]}
      >
        <Input.Password size="large" autoComplete="new-password" placeholder="••••••••••••" />
      </Form.Item>
    </>
  );
}
