import { MenuOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Flex, Layout, Tag, Tooltip } from 'antd';
import { useThemeStore } from '@app/theme/themeStore';
import { ENV } from '@core/config/env';
import useBreakpoint from '@shared/hooks/useBreakpoint';
import AlertsBell from './AlertsBell';
import ApprovalsInboxBadge from './ApprovalsInboxBadge';
import GlobalSearch from './GlobalSearch';
import UserMenu from './UserMenu';

export default function AppHeader({ onToggleSidebar, onSignOut }) {
  const { isMobile } = useBreakpoint();
  const resolved = useThemeStore((s) => s.resolved);
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <Layout.Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        padding: '0 12px',
        borderBottom: '1px solid var(--ant-color-border-secondary)',
        background: 'var(--ant-color-bg-container)',
      }}
    >
      <Flex align="center" justify="space-between" gap={8} style={{ height: '100%' }}>
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onToggleSidebar}
            aria-label="Toggle navigation"
          />
          <GlobalSearch />
          {/* A clearly marked environment stops anyone mistaking mock data for
              production while demoing. */}
          {ENV.label && (
            <Tag
              bordered={false}
              color={ENV.mode === 'live' ? 'red' : 'blue'}
              style={{ margin: 0, fontSize: 10, fontWeight: 600 }}
            >
              {ENV.label}
            </Tag>
          )}
        </Flex>

        <Flex align="center" gap={isMobile ? 0 : 4}>
          <ApprovalsInboxBadge />
          <AlertsBell />
          <Tooltip title={resolved === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            <Button
              type="text"
              icon={resolved === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggle}
              aria-label="Toggle dark mode"
            />
          </Tooltip>
          <UserMenu onSignOut={onSignOut} />
        </Flex>
      </Flex>
    </Layout.Header>
  );
}
