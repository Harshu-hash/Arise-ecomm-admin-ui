import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Flex, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { formatINRCompact } from '@core/utils/money';
import AuditDrawer from '@shared/components/AuditDrawer';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { sellerKeys, sellersApi } from '../api/sellers.api';
import SellerLifecycleModals from '../components/SellerLifecycleModals';
import SellerTabs from '../components/SellerTabs';
import { TIER_COLOR } from '../sellerColumns';

const ACTION_LABELS = {
  HOLD: ['hold', 'Put on hold'],
  RELEASE_HOLD: ['release-hold', 'Release hold'],
  SUSPEND: ['suspend', 'Suspend'],
  REACTIVATE: ['reactivate', 'Reinstate'],
  DEACTIVATE: ['deactivate', 'Deactivate'],
  BLACKLIST: ['blacklist', 'Blacklist'],
};

export default function SellerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [modalAction, setModalAction] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: sellerKeys.detail(id),
    queryFn: () => sellersApi.detail(id),
  });

  const lifecycle = useMutation({
    mutationFn: ({ action, values }) => sellersApi.lifecycle(id, action, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sellerKeys.all });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setModalAction(null);
      message.success('Done');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        setModalAction(null);
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        message.info('Sent for approval. It takes effect once another admin approves it.');
        return;
      }
      message.error(e.message);
    },
  });

  const addNote = useMutation({
    mutationFn: (text) => sellersApi.addNote(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sellerKeys.detail(id) });
      message.success('Note added');
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading seller…" />;
  if (error) {
    const scoped = error instanceof ApiError && error.code === 'OUT_OF_SCOPE';
    return (
      <ErrorState
        error={error}
        onRetry={scoped ? undefined : refetch}
        title={scoped ? 'This seller is not in your portfolio' : 'Could not load this seller'}
      />
    );
  }

  const seller = data.data;
  const { allowedActions, counts, blockers } = data.meta;
  const isApplication = ['APPLIED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(seller.status);

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={
          <Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to sellers" onClick={() => navigate('/sellers')} />
        }
        breadcrumbs={[{ label: 'Sellers', to: '/sellers' }, { label: seller.storeName }]}
        title={seller.storeName}
        tags={
          <Space size={6}>
            <StatusTag domain="seller" code={seller.status} />
            <Tag color={TIER_COLOR[seller.tier]} style={{ marginInlineEnd: 0 }}>{seller.tier}</Tag>
            {seller.payoutOnHold && <Tag color="gold" style={{ marginInlineEnd: 0 }}>Payouts held</Tag>}
          </Space>
        }
        subtitle={seller.legalName}
        meta={
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {seller.id} · {seller.city}, {seller.state}
            </Typography.Text>
            {seller.joinedAt && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Joined <DateText value={seller.joinedAt} variant="date" />
              </Typography.Text>
            )}
            {seller.accountManagerName && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Managed by {seller.accountManagerName}
              </Typography.Text>
            )}
          </>
        }
        actions={
          <Space wrap>
            {isApplication && (
              <Button type="primary" onClick={() => navigate(`/sellers/${id}/review`)}>
                Review application
              </Button>
            )}
            {Object.entries(ACTION_LABELS)
              .filter(([key]) => allowedActions.includes(key))
              .map(([key, [action, label]]) => (
                <Button
                  key={key}
                  danger={['SUSPEND', 'BLACKLIST', 'DEACTIVATE'].includes(key)}
                  onClick={() => setModalAction(action)}
                >
                  {label}
                </Button>
              ))}
            <AuditDrawer entityType="seller" entityId={seller.id} entityLabel={seller.storeName} />
          </Space>
        }
      />

      {seller.status === 'SUSPENDED' && seller.suspensionReason && (
        <Alert type="error" showIcon message="Suspended" description={seller.suspensionReason} />
      )}
      {isApplication && blockers.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${blockers.length} item${blockers.length === 1 ? '' : 's'} outstanding before this application can be approved`}
          description={blockers.join(' · ')}
          action={
            <Button size="small" onClick={() => navigate(`/sellers/${id}/review`)}>
              Open review
            </Button>
          }
        />
      )}

      <Row gutter={[12, 12]}>
        {[
          ['GMV (30 days)', formatINRCompact(seller.gmv30dPaise)],
          ['Orders (30 days)', seller.orders30d],
          ['Live listings', counts.liveOffers],
          ['Open penalties', counts.openPenalties],
          ['Open claims', counts.openClaims],
        ].map(([label, value]) => (
          <Col key={label} xs={12} md={8} xl={4}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>}
                value={value}
                valueStyle={{ fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card size="small">
        <SellerTabs
          seller={seller}
          meta={data.meta}
          onAddNote={(text) => addNote.mutateAsync(text)}
          addingNote={addNote.isPending}
        />
      </Card>

      <SellerLifecycleModals
        which={modalAction}
        seller={seller}
        counts={counts}
        loading={lifecycle.isPending}
        onCancel={() => setModalAction(null)}
        onConfirm={(action, values) => lifecycle.mutate({ action, values })}
      />
    </Flex>
  );
}
