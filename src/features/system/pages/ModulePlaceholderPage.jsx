import { CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import { Alert, Card, Flex, Space, Tag, Typography } from 'antd';
import { useLocation } from 'react-router-dom';
import { CURRENT_PHASE, navItemForPath } from '@shared/constants/navigation';
import PageHeader from '@shared/components/PageHeader';

const PHASE_SCOPE = {
  1: 'Sellers and catalog — onboarding, KYC, taxonomy, listings and the QC queue.',
  2: 'Orders and customers — the order lifecycle, cancellations, returns and customer 360.',
  3: 'Fulfilment — warehouses, inbound and inventory, couriers, shipments, NDR and RTO.',
  4: 'Money — payments, refunds, commission and fees, seller payouts, tax, wallet and gift cards.',
  5: 'Growth and content — coupons, deals, flash sales, campaigns, the home layout builder and the help centre.',
  6: 'Trust and care — review and Q&A moderation, the support desk and live chat.',
  7: 'Sponsored ads — campaigns, policy review, placements and advertiser billing.',
  8: 'Insight and hardening — analytics, the report library, platform settings, app config and integrations.',
};

/**
 * Stands in for screens that land in a later phase. A nav item that 404s looks
 * like a bug; this says plainly what is coming and when, which is what a
 * stakeholder clicking around actually needs.
 */
export default function ModulePlaceholderPage() {
  const { pathname } = useLocation();
  const item = navItemForPath(pathname);
  // A deferred screen was scheduled for a phase that has already shipped
  // without it, so the honest answer is the phase now carrying it.
  const phase = item?.deferred ?? item?.phase ?? null;
  const deferred = Boolean(item?.deferred);

  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={item?.label ?? 'Planned screen'}
        breadcrumbs={item ? [{ label: item.groupLabel ?? 'Arise Admin' }, { label: item.label }] : []}
        tags={
          phase !== null && (
            <Tag color={deferred ? 'gold' : 'blue'}>
              {deferred ? `Deferred to phase ${phase}` : `Phase ${phase}`}
            </Tag>
          )
        }
        subtitle="This screen is specified and scheduled, but not built yet."
      />

      <Card>
        <Space direction="vertical" size={16} style={{ maxWidth: 680 }}>
          <Alert
            type="info"
            showIcon
            icon={<CalendarOutlined />}
            message={
              deferred
                ? `Deferred — now arriving in phase ${phase}`
                : `Arriving in phase ${phase}`
            }
            description={PHASE_SCOPE[phase] ?? 'See the roadmap for scope and sequencing.'}
          />

          <div>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              <FileTextOutlined /> Already specified
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              Columns, filters, detail layouts, state machines and every action for this screen are
              written up in the module specifications. Phase {CURRENT_PHASE} delivered the
              foundation it builds on: the shell, permissions, approvals, the audit trail, the mock
              backend and the shared component library.
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              See <Typography.Text code>docs/MODULE_SPECS.md</Typography.Text> and{' '}
              <Typography.Text code>docs/ADMIN_PANEL_PLAN.md</Typography.Text> in the repository.
            </Typography.Paragraph>
          </div>

          {item?.perm && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Permission that will gate it: <Typography.Text code>{item.perm}</Typography.Text>
            </Typography.Text>
          )}
        </Space>
      </Card>
    </Flex>
  );
}
