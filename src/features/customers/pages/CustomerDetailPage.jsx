import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Flex, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { formatINRCompact } from '@core/utils/money';
import AuditDrawer from '@shared/components/AuditDrawer';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { customerKeys, customersApi } from '@features/orders/api/orders.api';
import CustomerTabs from '../components/CustomerTabs';

const ACTIONS = {
  BLOCK: ['block', 'Block customer', true],
  UNBLOCK: ['unblock', 'Unblock', true],
  DISABLE_COD: ['disable-cod', 'Disable COD', true],
  ENABLE_COD: ['enable-cod', 'Enable COD', false],
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [action, setAction] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => customersApi.detail(id),
  });

  const run = useMutation({
    mutationFn: ({ verb, values }) => customersApi.action(id, verb, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setAction(null);
      message.success('Done');
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading customer…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this customer" />;

  const customer = data.data;
  const { allowedActions, linkedAccounts, stats } = data.meta;
  const [verb, label, needsReason] = ACTIONS[action] ?? [];

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={<Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to customers" onClick={() => navigate('/customers')} />}
        breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: customer.name }]}
        title={customer.name}
        tags={
          <Space size={6}>
            {customer.status === 'BLOCKED' && <Tag color="red" style={{ marginInlineEnd: 0 }}>Blocked</Tag>}
            {customer.status === 'DELETED' && <Tag style={{ marginInlineEnd: 0 }}>Deleted</Tag>}
            {customer.codDisabled && <Tag color="gold" style={{ marginInlineEnd: 0 }}>COD disabled</Tag>}
            {customer.riskLevel === 'HIGH' && <Tag color="red" style={{ marginInlineEnd: 0 }}>High risk</Tag>}
          </Space>
        }
        meta={
          <>
            <Typography.Text className="mono" type="secondary" style={{ fontSize: 12 }}>{customer.id}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Customer since <DateText value={customer.joinedAt} variant="date" />
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {customer.city}, {customer.state}
            </Typography.Text>
          </>
        }
        actions={
          <Space wrap>
            {Object.entries(ACTIONS)
              .filter(([key]) => allowedActions.includes(key))
              .map(([key, [, text]]) => (
                <Button key={key} danger={key === 'BLOCK'} onClick={() => setAction(key)}>
                  {text}
                </Button>
              ))}
            <AuditDrawer entityType="customer" entityId={customer.id} entityLabel={customer.name} />
          </Space>
        }
      />

      {customer.status === 'BLOCKED' && (
        <Alert type="error" showIcon message="This customer is blocked" description={customer.blockedReason} />
      )}
      {linkedAccounts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`Shares a device or network with ${linkedAccounts.length} other account${linkedAccounts.length === 1 ? '' : 's'}`}
          description={
            <Space size={[6, 6]} wrap>
              {linkedAccounts.map((a) => (
                <Link key={a.id} to={`/customers/${a.id}`}>
                  <Tag color={a.status === 'BLOCKED' ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>
                    {a.name} ({a.reason})
                  </Tag>
                </Link>
              ))}
            </Space>
          }
        />
      )}

      <Row gutter={[12, 12]}>
        {[
          ['Orders', stats.orders],
          ['Lifetime value', formatINRCompact(stats.gmvPaise)],
          ['Average order', formatINRCompact(stats.aovPaise)],
          ['Cancelled items', stats.cancelled],
          ['Returns', stats.returns],
          ['Refunded', formatINRCompact(stats.refundedPaise)],
        ].map(([title, value]) => (
          <Col key={title} xs={12} md={8} xl={4}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{title}</Typography.Text>}
                value={value}
                valueStyle={{ fontSize: 19 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card size="small">
        <CustomerTabs customer={customer} meta={data.meta} />
      </Card>

      <ConfirmActionModal
        open={Boolean(action)}
        onCancel={() => setAction(null)}
        onConfirm={(values) => run.mutate({ verb, values })}
        loading={run.isPending}
        danger={action === 'BLOCK'}
        title={`${label}?`}
        description={customer.name}
        impact={
          action === 'BLOCK'
            ? 'They cannot sign in or place orders. Orders already in flight continue.'
            : action === 'DISABLE_COD'
              ? 'They can still order, but must pay up front. Used when RTO history is poor.'
              : undefined
        }
        reasons={
          action === 'BLOCK'
            ? ['Refund abuse', 'Coupon abuse', 'Multiple fraudulent accounts', 'Abusive behaviour towards staff', 'Other']
            : action === 'DISABLE_COD'
              ? ['High RTO history', 'Repeated refusal at the door', 'Fraud review', 'Other']
              : undefined
        }
        reasonRequired={needsReason}
        confirmLabel={label}
      />
    </Flex>
  );
}
