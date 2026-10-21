import { Drawer, Flex, Space, Typography } from 'antd';
import DateText from '@shared/components/DateText';
import DiffList from '@shared/components/DiffList';

/** Everything recorded about one audit entry. */
export default function AuditEntryDrawer({ entry, onClose }) {
  return (
    <Drawer open={Boolean(entry)} onClose={onClose} width={520} title="Audit entry">
      {entry && (
        <Flex vertical gap={14}>
          <Space direction="vertical" size={2}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {entry.action}
            </Typography.Text>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {entry.entityLabel}
            </Typography.Title>
            <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
              {entry.entityType} · {entry.entityId}
            </Typography.Text>
          </Space>

          <Space direction="vertical" size={2}>
            <Typography.Text>
              {entry.actorName}{' '}
              <Typography.Text type="secondary">({entry.actorEmail ?? 'system'})</Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <DateText value={entry.at} variant="datetime" /> · IP{' '}
              <span className="mono">{entry.ip}</span>
            </Typography.Text>
          </Space>

          {entry.reason && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Reason
              </Typography.Text>
              <div>
                <Typography.Text>{entry.reason}</Typography.Text>
              </div>
            </div>
          )}

          {entry.changes?.length > 0 && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Field changes
              </Typography.Text>
              <div style={{ marginTop: 6 }}>
                <DiffList changes={entry.changes} />
              </div>
            </div>
          )}

          {entry.metadata && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Context
              </Typography.Text>
              <pre
                style={{
                  margin: '6px 0 0',
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--ant-color-fill-quaternary)',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </Flex>
      )}
    </Drawer>
  );
}
