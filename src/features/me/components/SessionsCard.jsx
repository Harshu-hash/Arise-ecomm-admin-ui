import { LaptopOutlined } from '@ant-design/icons';
import { Button, Card, Space, Table, Tag, Typography } from 'antd';
import DateText from '@shared/components/DateText';

/** Every device currently signed in as you, with a way to cut each one off. */
export default function SessionsCard({ sessions, loading, onRevoke, revoking, revokingId }) {
  return (
    <Card
      size="small"
      title={
        <Space>
          <LaptopOutlined />
          Active sessions
        </Space>
      }
      style={{ marginTop: 12 }}
    >
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={sessions ?? []}
        locale={{ emptyText: 'No other active sessions' }}
        columns={[
          {
            title: 'Device',
            dataIndex: 'device',
            render: (v, row) => (
              <Space size={6} wrap>
                <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
                {row.current && <Tag color="blue">This device</Tag>}
                {row.trustedDevice && <Tag>Trusted</Tag>}
              </Space>
            ),
          },
          { title: 'Location', dataIndex: 'city', responsive: ['md'] },
          { title: 'Last active', dataIndex: 'lastActiveAt', render: (v) => <DateText value={v} /> },
          {
            title: '',
            align: 'right',
            render: (_v, row) =>
              row.current ? null : (
                <Button
                  size="small"
                  danger
                  loading={revoking && revokingId === row.id}
                  onClick={() => onRevoke(row.id)}
                >
                  Sign out
                </Button>
              ),
          },
        ]}
      />
    </Card>
  );
}
