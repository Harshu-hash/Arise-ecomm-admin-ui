import { Alert, Button, Modal, Typography } from 'antd';
import { downloadBlob } from '@core/utils/misc';

/** Shown once after regenerating codes — the old ones stop working. */
export default function BackupCodesModal({ codes, onClose }) {
  return (
    <Modal
      open={Boolean(codes)}
      onCancel={onClose}
      onOk={onClose}
      okText="I have saved them"
      cancelButtonProps={{ style: { display: 'none' } }}
      title="Your new backup codes"
      width={440}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="Your previous codes no longer work"
        description="These are shown only once. Each code can be used a single time."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          padding: 12,
          borderRadius: 8,
          border: '1px solid var(--ant-color-border)',
        }}
      >
        {(codes ?? []).map((c) => (
          <Typography.Text key={c} className="mono" style={{ fontSize: 13 }}>
            {c}
          </Typography.Text>
        ))}
      </div>

      <Button
        style={{ marginTop: 12 }}
        block
        onClick={() =>
          downloadBlob(
            new Blob([(codes ?? []).join('\n')], { type: 'text/plain' }),
            'arise-admin-backup-codes.txt',
          )
        }
      >
        Download
      </Button>
    </Modal>
  );
}
