import { CheckCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Flex, Space, Typography } from 'antd';
import { useState } from 'react';
import { downloadBlob } from '@core/utils/misc';

/**
 * Shown once, immediately after enrolment. The continue button is gated on an
 * explicit acknowledgement because these codes are the only way back in if
 * someone loses their phone, and they are never shown again.
 */
export default function BackupCodesStep({ codes = [], onContinue }) {
  const [acknowledged, setAcknowledged] = useState(false);

  const download = () => {
    const body = [
      'Arise Admin — two-step verification backup codes',
      'Each code works once. Keep them somewhere safe and private.',
      '',
      ...codes.map((c, i) => `${String(i + 1).padStart(2, '0')}.  ${c}`),
    ].join('\n');
    downloadBlob(new Blob([body], { type: 'text/plain' }), 'arise-admin-backup-codes.txt');
  };

  return (
    <div>
      <Space direction="vertical" size={2} style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <CheckCircleOutlined style={{ color: 'var(--ant-color-success)', marginRight: 8 }} />
          Two-step verification is on
        </Typography.Title>
        <Typography.Text type="secondary">Save your backup codes before you continue.</Typography.Text>
      </Space>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 14 }}
        message="These codes are shown only once"
        description="Each code can be used once to sign in if you lose access to your authenticator app."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          padding: 14,
          borderRadius: 8,
          border: '1px solid var(--ant-color-border)',
          marginBottom: 14,
        }}
      >
        {codes.map((code) => (
          <Typography.Text key={code} className="mono" style={{ fontSize: 13 }}>
            {code}
          </Typography.Text>
        ))}
      </div>

      <Flex gap={8} wrap style={{ marginBottom: 14 }}>
        <Button icon={<DownloadOutlined />} onClick={download}>
          Download
        </Button>
        <Typography.Text copyable={{ text: codes.join('\n') }} type="secondary" style={{ alignSelf: 'center' }}>
          Copy all
        </Typography.Text>
      </Flex>

      <Checkbox
        checked={acknowledged}
        onChange={(e) => setAcknowledged(e.target.checked)}
        style={{ marginBottom: 14 }}
      >
        I have saved these codes somewhere safe
      </Checkbox>

      <Button type="primary" size="large" block disabled={!acknowledged} onClick={onContinue}>
        Continue to the dashboard
      </Button>
    </div>
  );
}
