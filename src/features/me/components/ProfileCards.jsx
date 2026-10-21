import { KeyOutlined, SafetyOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Descriptions, Flex, Space, Switch, Tag, Typography } from 'antd';
import { avatarColor, initials } from '@core/utils/misc';
import DateText from '@shared/components/DateText';

export function ProfileCard({ user }) {
  return (
    <Card size="small" title="Profile">
      <Flex align="center" gap={12} style={{ marginBottom: 14 }}>
        <Avatar size={44} style={{ backgroundColor: avatarColor(user?.email), fontSize: 17 }}>
          {initials(user?.name)}
        </Avatar>
        <div>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {user?.name}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.email}
            </Typography.Text>
          </div>
        </div>
      </Flex>

      <Descriptions column={1} size="small">
        <Descriptions.Item label="Roles">
          <Space size={[4, 4]} wrap>
            {(user?.roleNames ?? []).map((r) => (
              <Tag key={r} style={{ marginInlineEnd: 0 }}>
                {r}
              </Tag>
            ))}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Permissions">
          {user?.permissions?.includes('*')
            ? 'All permissions (Super Admin)'
            : `${user?.permissions?.length ?? 0} permissions`}
        </Descriptions.Item>
        <Descriptions.Item label="Last sign-in">
          <DateText value={user?.lastLoginAt} />
        </Descriptions.Item>
      </Descriptions>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        Your name, roles and scope are managed by a Super Admin. Ask them if something needs to change.
      </Typography.Paragraph>
    </Card>
  );
}

export function NotificationsCard({ user, onChange, saving }) {
  const rows = [
    ['notifyInPanel', 'In-panel alerts', 'Show system alerts in the header bell.'],
    ['notifyEmail', 'Email alerts', 'Email me when something needs my approval.'],
  ];

  return (
    <Card size="small" title="Notifications" style={{ marginTop: 12 }}>
      {rows.map(([key, label, help], i) => (
        <Flex
          key={key}
          justify="space-between"
          align="center"
          gap={12}
          style={{ marginBottom: i === rows.length - 1 ? 0 : 10 }}
        >
          <div>
            <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {help}
              </Typography.Text>
            </div>
          </div>
          <Switch
            checked={user?.[key] !== false}
            loading={saving}
            onChange={(v) => onChange({ [key]: v })}
          />
        </Flex>
      ))}
    </Card>
  );
}

export function SecurityCard({ user, onChangePassword, onRegenerateCodes, regenerating }) {
  return (
    <Card
      size="small"
      title={
        <Space>
          <SafetyOutlined />
          Security
        </Space>
      }
    >
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 14 }}>
        <div>
          <Typography.Text style={{ fontSize: 13 }}>Password</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Changing it signs out every other device.
            </Typography.Text>
          </div>
        </div>
        <Button icon={<KeyOutlined />} onClick={onChangePassword}>
          Change password
        </Button>
      </Flex>

      <Flex justify="space-between" align="center" gap={12} wrap>
        <div>
          <Typography.Text style={{ fontSize: 13 }}>
            Two-step verification{' '}
            {user?.twoFactorEnrolled ? (
              <Tag color="green" style={{ marginLeft: 4 }}>
                On
              </Tag>
            ) : (
              <Tag color="gold" style={{ marginLeft: 4 }}>
                Not set up
              </Tag>
            )}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Generating new backup codes invalidates your old ones.
            </Typography.Text>
          </div>
        </div>
        <Button loading={regenerating} onClick={onRegenerateCodes}>
          New backup codes
        </Button>
      </Flex>
    </Card>
  );
}
