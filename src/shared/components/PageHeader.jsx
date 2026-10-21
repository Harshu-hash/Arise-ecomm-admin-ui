import { Breadcrumb, Divider, Flex, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import useBreakpoint from '@shared/hooks/useBreakpoint';

/**
 * Standard page anatomy: breadcrumbs → title row (status, meta, actions) →
 * optional tabs. Every page uses this so headers do not drift apart.
 */
export default function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  tags,
  meta,
  actions,
  tabs,
  onBack,
  sticky = false,
}) {
  const { isMobile } = useBreakpoint();

  return (
    <div
      style={
        sticky
          ? { position: 'sticky', top: 0, zIndex: 5, background: 'var(--ant-color-bg-layout)', paddingTop: 4 }
          : undefined
      }
    >
      {breadcrumbs.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 6, fontSize: 12 }}
          items={breadcrumbs.map((b) => ({
            title: b.to ? <Link to={b.to}>{b.label}</Link> : b.label,
          }))}
        />
      )}

      <Flex
        justify="space-between"
        align={isMobile ? 'stretch' : 'flex-start'}
        gap={12}
        vertical={isMobile}
        wrap
      >
        <div style={{ minWidth: 0 }}>
          <Space size={10} align="center" wrap>
            {onBack}
            <Typography.Title level={3} style={{ margin: 0, fontSize: 20, lineHeight: 1.3 }}>
              {title}
            </Typography.Title>
            {tags}
          </Space>

          {subtitle && (
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {subtitle}
            </Typography.Paragraph>
          )}

          {meta && (
            <Space size={0} wrap split={<Divider type="vertical" />} style={{ marginTop: 6 }}>
              {meta}
            </Space>
          )}
        </div>

        {actions && (
          <Space wrap size={8} style={{ flexShrink: 0 }}>
            {actions}
          </Space>
        )}
      </Flex>

      {tabs && <div style={{ marginTop: 8 }}>{tabs}</div>}
    </div>
  );
}
