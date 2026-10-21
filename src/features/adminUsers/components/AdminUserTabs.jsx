import { Descriptions, Space, Table, Tabs, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import DateText from '@shared/components/DateText';
import ScopeSummary from './ScopeSummary';

/** Access, sessions and sign-in history for one admin. */
export default function AdminUserTabs({ user, sessions = [], loginHistory = [] }) {
  return (
    <Tabs
      items={[
        {
          key: 'access',
          label: 'Access',
          children: (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Roles">
                <Space size={[4, 4]} wrap>
                  {user.roleNames.map((n, i) => (
                    <Link key={n} to={`/admin/roles/${user.roleIds[i]}`}>
                      <Tag style={{ marginInlineEnd: 0 }}>{n}</Tag>
                    </Link>
                  ))}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Effective permissions">
                {user.effectivePermissionCount === 'ALL'
                  ? 'All permissions (Super Admin)'
                  : `${user.effectivePermissionCount} permissions`}
              </Descriptions.Item>
              <Descriptions.Item label="Data scope">
                <ScopeSummary scope={user.scope} scopedBy={user.scopedBy} />
              </Descriptions.Item>
              <Descriptions.Item label="Two-step verification">
                {user.twoFactorEnrolled ? (
                  <Tag color="green">Enrolled</Tag>
                ) : (
                  <Tag color="gold">Not set up — will enrol at next sign-in</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Default landing page">
                <Typography.Text code>{user.defaultLanding}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Failed sign-in attempts">
                {user.failedLoginCount ?? 0}
                {user.lockedUntil && (
                  <Typography.Text type="danger" style={{ marginLeft: 8 }}>
                    Locked until <DateText value={user.lockedUntil} variant="datetime" />
                  </Typography.Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          ),
        },
        {
          key: 'sessions',
          label: `Sessions (${sessions.length})`,
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={sessions}
              locale={{ emptyText: 'No active sessions' }}
              columns={[
                { title: 'Device', dataIndex: 'device' },
                { title: 'Location', dataIndex: 'city', responsive: ['md'] },
                { title: 'IP', dataIndex: 'ip', render: (v) => <span className="mono">{v}</span> },
                { title: 'Last active', dataIndex: 'lastActiveAt', render: (v) => <DateText value={v} /> },
              ]}
            />
          ),
        },
        {
          key: 'logins',
          label: 'Sign-in history',
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={{ pageSize: 10, size: 'small' }}
              dataSource={loginHistory}
              locale={{ emptyText: 'No sign-in activity recorded' }}
              columns={[
                { title: 'When', dataIndex: 'at', render: (v) => <DateText value={v} /> },
                {
                  title: 'Event',
                  dataIndex: 'action',
                  render: (a) => (
                    <Tag color={a.includes('failed') ? 'red' : 'default'} style={{ marginInlineEnd: 0 }}>
                      {a.replace('auth.', '').replace(/_/g, ' ')}
                    </Tag>
                  ),
                },
                { title: 'IP', dataIndex: 'ip', render: (v) => <span className="mono">{v}</span> },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
