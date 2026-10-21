import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Drawer, Flex, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';
import { slaCountdown } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import DiffList from '@shared/components/DiffList';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

/**
 * Full context for one request: who raised it, what exactly changes, and the
 * amount at stake. An approver who cannot see the diff is just rubber-stamping.
 */
export default function ApprovalDetailDrawer({ id, onClose, onDecide }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.approvals.detail(id),
    queryFn: () => api.get(`/approvals/${id}`),
    enabled: Boolean(id),
  });

  const approval = data?.data;
  const allowed = data?.meta?.allowedActions ?? [];
  const blockedReason = data?.meta?.blockedReason;
  const expiry = approval ? slaCountdown(approval.expiresAt) : null;

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width={560}
      title={approval ? approval.actionLabel : 'Approval request'}
      extra={
        allowed.length > 0 && (
          <Space>
            <Button danger icon={<CloseOutlined />} onClick={() => onDecide(false, approval)}>
              Reject
            </Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => onDecide(true, approval)}>
              Approve
            </Button>
          </Space>
        )
      }
    >
      {isLoading ? (
        <FullPageSpinner label="Loading request…" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !approval ? null : (
        <Flex vertical gap={16}>
          {blockedReason && <Alert type="info" showIcon message={blockedReason} />}

          {approval.status === 'PENDING' && expiry?.overdue && (
            <Alert type="warning" showIcon message="This request has passed its 72-hour window." />
          )}

          {approval.summary && (
            <Alert
              type={approval.amountPaise ? 'warning' : 'info'}
              showIcon
              message="What will happen if approved"
              description={approval.summary}
            />
          )}

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Status">
              <StatusTag domain="approval" code={approval.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Affects">
              <Space direction="vertical" size={0}>
                <Typography.Text>{approval.entityLabel}</Typography.Text>
                <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
                  {approval.entityType} · {approval.entityId}
                </Typography.Text>
              </Space>
            </Descriptions.Item>
            {approval.amountPaise ? (
              <Descriptions.Item label="Amount">
                <MoneyText paise={approval.amountPaise} strong />
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="Raised by">
              {approval.requestedByName} · <DateText value={approval.requestedAt} />
            </Descriptions.Item>
            {approval.reason && (
              <Descriptions.Item label="Requester's reason">{approval.reason}</Descriptions.Item>
            )}
            {approval.status === 'PENDING' ? (
              <Descriptions.Item label="Expires">
                <Typography.Text type={expiry?.overdue ? 'danger' : undefined}>
                  {expiry?.label} · <DateText value={approval.expiresAt} variant="datetime" />
                </Typography.Text>
              </Descriptions.Item>
            ) : (
              <Descriptions.Item label="Decided">
                {approval.decidedByName ?? '—'} · <DateText value={approval.decidedAt} />
              </Descriptions.Item>
            )}
            {approval.decisionReason && (
              <Descriptions.Item label="Decision reason">{approval.decisionReason}</Descriptions.Item>
            )}
            {approval.approverPermission && (
              <Descriptions.Item label="Approver must hold">
                <Typography.Text className="mono" style={{ fontSize: 11 }}>
                  {approval.approverPermission}
                </Typography.Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          {approval.diff?.length > 0 && (
            <div>
              <Typography.Title level={5} style={{ fontSize: 14 }}>
                Exact changes
              </Typography.Title>
              <DiffList changes={approval.diff} />
            </div>
          )}
        </Flex>
      )}
    </Drawer>
  );
}
