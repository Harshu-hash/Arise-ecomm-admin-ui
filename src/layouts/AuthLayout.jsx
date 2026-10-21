import { Card, Flex, Space, Typography } from 'antd';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ARISE } from '@app/theme/tokens';
import { ENV } from '@core/config/env';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import useBreakpoint from '@shared/hooks/useBreakpoint';

/**
 * Shell for the unauthenticated screens. On wide viewports a brand panel sits
 * beside the form; on phones the form takes the whole screen.
 */
export default function AuthLayout() {
  const { isDesktop } = useBreakpoint();

  return (
    <Flex style={{ minHeight: '100vh' }}>
      {isDesktop && (
        <Flex
          vertical
          justify="space-between"
          style={{
            width: '42%',
            maxWidth: 560,
            padding: 40,
            color: '#fff',
            background: `linear-gradient(150deg, ${ARISE.campaignGradientStart}, ${ARISE.campaignGradientEnd})`,
          }}
        >
          <Space size={10} align="center">
            <div
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.22)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
              }}
            >
              A
            </div>
            <Typography.Text strong style={{ color: '#fff', fontSize: 17 }}>
              Arise Admin
            </Typography.Text>
          </Space>

          <div>
            <Typography.Title level={2} style={{ color: '#fff', marginBottom: 12, fontSize: 28 }}>
              The control room for the Arise marketplace
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, marginBottom: 0 }}>
              Sellers, catalog, orders, fulfilment, payouts and support — in one place.
            </Typography.Paragraph>
          </div>

          <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            Authorised access only. All activity in this panel is logged.
          </Typography.Text>
        </Flex>
      )}

      <Flex flex={1} align="center" justify="center" style={{ padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {!isDesktop && (
            <Flex justify="center" style={{ marginBottom: 20 }}>
              <Space size={10} align="center">
                <div
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: 'linear-gradient(135deg, #2874F0, #4C8DF6)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                  }}
                >
                  A
                </div>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  Arise Admin
                </Typography.Text>
              </Space>
            </Flex>
          )}

          <Card styles={{ body: { padding: 24 } }}>
            <Suspense fallback={<FullPageSpinner label="Loading…" />}>
              <Outlet />
            </Suspense>
          </Card>

          <Typography.Paragraph
            type="secondary"
            style={{ textAlign: 'center', fontSize: 11, marginTop: 14, marginBottom: 0 }}
          >
            {ENV.mode === 'mock'
              ? 'Mock environment — no real customer or seller data.'
              : 'Arise internal tool'}
          </Typography.Paragraph>
        </div>
      </Flex>
    </Flex>
  );
}
