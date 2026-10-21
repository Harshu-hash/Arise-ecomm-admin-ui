import { ClockCircleOutlined } from '@ant-design/icons';
import { Modal, Progress, Space, Typography } from 'antd';

const WARN_WINDOW_SECONDS = 120;

/** Counts down to automatic sign-out and offers a way to stay. */
export default function IdleWarningModal({ warning, onStay, onSignOut }) {
  const seconds = warning?.secondsLeft ?? 0;

  return (
    <Modal
      open={Boolean(warning)}
      onOk={onStay}
      onCancel={onSignOut}
      okText="Stay signed in"
      cancelText="Sign out now"
      closable={false}
      maskClosable={false}
      keyboard={false}
      width={420}
      title={
        <Space>
          <ClockCircleOutlined />
          You will be signed out shortly
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text>
          You have been inactive for a while. For security, this session ends in{' '}
          <Typography.Text strong>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </Typography.Text>
          .
        </Typography.Text>
        <Progress
          percent={Math.round((seconds / WARN_WINDOW_SECONDS) * 100)}
          showInfo={false}
          status={seconds < 30 ? 'exception' : 'active'}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Anything you have typed but not saved will be lost.
        </Typography.Text>
      </Space>
    </Modal>
  );
}
