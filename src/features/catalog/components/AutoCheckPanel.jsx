import { CheckCircleFilled, CloseCircleFilled, WarningFilled } from '@ant-design/icons';
import { Alert, Flex, Space, Typography } from 'antd';

const ICON = {
  PASS: <CheckCircleFilled style={{ color: 'var(--ant-color-success)' }} />,
  WARN: <WarningFilled style={{ color: 'var(--ant-color-warning)' }} />,
  FAIL: <CloseCircleFilled style={{ color: 'var(--ant-color-error)' }} />,
};

/**
 * The automated pass over a listing. A reviewer reads this before reading the
 * listing itself, so the ordering puts failures first — those are what stop an
 * approval.
 */
export default function AutoCheckPanel({ checks = [] }) {
  if (!checks.length) {
    return <Typography.Text type="secondary">No automated checks ran for this submission.</Typography.Text>;
  }

  const rank = { FAIL: 0, WARN: 1, PASS: 2 };
  const sorted = [...checks].sort((a, b) => rank[a.result] - rank[b.result]);
  const failed = checks.filter((c) => c.result === 'FAIL');

  return (
    <Flex vertical gap={10}>
      {failed.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={`${failed.length} check${failed.length === 1 ? '' : 's'} failing`}
          description="Approving over a failing check needs an explicit override and is recorded against your name."
        />
      )}

      {sorted.map((check) => (
        <Flex key={check.key} gap={8} align="flex-start">
          <span style={{ marginTop: 1 }}>{ICON[check.result]}</span>
          <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
            <Typography.Text
              style={{ fontSize: 13 }}
              type={check.result === 'FAIL' ? 'danger' : undefined}
              strong={check.result !== 'PASS'}
            >
              {check.label}
            </Typography.Text>
            {check.detail && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {check.detail}
              </Typography.Text>
            )}
          </Space>
        </Flex>
      ))}
    </Flex>
  );
}
