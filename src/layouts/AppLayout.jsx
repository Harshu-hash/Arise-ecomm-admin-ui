import { App, Drawer, Layout } from 'antd';
import { Suspense, lazy, useCallback, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LAYOUT } from '@app/theme/tokens';
import { queryClient } from '@core/api/queryClient';
import { authApi } from '@core/auth/authApi';
import { useSessionStore } from '@core/auth/sessionStore';
import { useIdleTimeout } from '@core/auth/useIdleTimeout';
import { SHOW_DEV_TOOLS } from '@core/config/env';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import useBreakpoint from '@shared/hooks/useBreakpoint';
import AppHeader from './components/AppHeader';
import IdleWarningModal from './components/IdleWarningModal';
import Sidebar from './components/Sidebar';

// Lazy and conditional: the toolbar pulls in Form, Select, InputNumber and
// Segmented, none of which the shell otherwise needs, and it does not exist at
// all in a live build.
const DevToolbar = lazy(() => import('./components/DevToolbar'));

/**
 * The authenticated shell: a dark navigation rail, a sticky header and the
 * routed content. Below `lg` the rail collapses to icons; below `md` it
 * becomes an overlay drawer (plan §8.2).
 */
export default function AppLayout() {
  const { isMobile, isDesktop } = useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const setAnonymous = useSessionStore((s) => s.setAnonymous);

  const signOut = useCallback(
    async (reason) => {
      try {
        await authApi.logout();
      } catch {
        // Signing out locally matters more than the server acknowledging it.
      }
      setAnonymous();
      queryClient.clear();
      navigate('/login', { replace: true });
      if (reason) message.info(reason);
    },
    [setAnonymous, navigate, message],
  );

  const { warning, staySignedIn } = useIdleTimeout({
    onExpire: () => signOut('You were signed out after 30 minutes of inactivity.'),
  });

  const railCollapsed = isDesktop ? collapsed : true;

  return (
    <Layout style={{ minHeight: '100%' }}>
      {!isMobile && (
        <Layout.Sider
          theme="dark"
          collapsible={false}
          collapsed={railCollapsed}
          width={LAYOUT.siderWidth}
          collapsedWidth={LAYOUT.siderCollapsedWidth}
          style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}
        >
          <Sidebar collapsed={railCollapsed} />
        </Layout.Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={LAYOUT.siderWidth}
          closable={false}
          styles={{ body: { padding: 0, background: 'var(--ant-color-bg-container)' }, wrapper: { boxShadow: 'none' } }}
          className="arise-nav-drawer"
        >
          <div style={{ height: '100%', background: '#111418' }}>
            <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </Drawer>
      )}

      <Layout>
        <AppHeader
          onToggleSidebar={() => (isMobile ? setDrawerOpen(true) : setCollapsed((c) => !c))}
          onSignOut={() => signOut()}
        />

        <Layout.Content
          style={{
            padding: isMobile ? 12 : 20,
            maxWidth: LAYOUT.contentMaxWidth,
            width: '100%',
            margin: '0 auto',
          }}
        >
          <Suspense fallback={<FullPageSpinner label="Loading page…" />}>
            <Outlet />
          </Suspense>
        </Layout.Content>
      </Layout>

      <IdleWarningModal
        warning={warning}
        onStay={staySignedIn}
        onSignOut={() => signOut('Signed out.')}
      />
      {SHOW_DEV_TOOLS && (
        <Suspense fallback={null}>
          <DevToolbar />
        </Suspense>
      )}
    </Layout>
  );
}
