import {
  DesktopOutlined,
  KeyOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Flex, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@app/theme/themeStore';
import { useCurrentUser } from '@core/rbac/useCan';
import { avatarColor, initials } from '@core/utils/misc';
import useBreakpoint from '@shared/hooks/useBreakpoint';

export default function UserMenu({ onSignOut }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  const items = [
    {
      key: 'header',
      type: 'group',
      label: (
        <div style={{ padding: '4px 0 2px' }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {user?.name}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.email}
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {user?.roleNames?.join(', ')}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: '/me', icon: <UserOutlined />, label: 'My profile & sessions' },
    { key: '/change-password', icon: <KeyOutlined />, label: 'Change password' },
    { type: 'divider' },
    {
      key: 'theme',
      icon: preference === 'dark' ? <MoonOutlined /> : preference === 'light' ? <SunOutlined /> : <DesktopOutlined />,
      label: 'Appearance',
      children: [
        { key: 'theme:system', icon: <DesktopOutlined />, label: 'Match system' },
        { key: 'theme:light', icon: <SunOutlined />, label: 'Light' },
        { key: 'theme:dark', icon: <MoonOutlined />, label: 'Dark' },
      ],
    },
    { type: 'divider' },
    { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', danger: true },
  ];

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items,
        selectedKeys: [`theme:${preference}`],
        onClick: ({ key }) => {
          if (key === 'signout') onSignOut();
          else if (key.startsWith('theme:')) setPreference(key.split(':')[1]);
          else navigate(key);
        },
      }}
    >
      <Flex align="center" gap={8} style={{ cursor: 'pointer', padding: '0 4px' }}>
        <Avatar size={28} style={{ backgroundColor: avatarColor(user?.email), fontSize: 12 }}>
          {initials(user?.name)}
        </Avatar>
        {!isMobile && (
          // `line-height: normal` here overrides the 56px line-height the header
          // imposes on its own text for vertical centring — without it, each
          // text line below inherits that 56px strut and the whole two-line
          // block renders roughly (112 - 56) / 2 px taller than the header,
          // pushing the name above the header's top edge.
          <Space direction="vertical" size={0} style={{ lineHeight: 'normal' }}>
            <Typography.Text style={{ fontSize: 13, lineHeight: 1.2 }}>{user?.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
              {user?.roleNames?.[0]}
            </Typography.Text>
          </Space>
        )}
      </Flex>
    </Dropdown>
  );
}
