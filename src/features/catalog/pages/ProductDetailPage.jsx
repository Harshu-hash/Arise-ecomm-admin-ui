import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Flex, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import AuditDrawer from '@shared/components/AuditDrawer';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { catalogApi, catalogKeys } from '../api/catalog.api';
import ProductTabs from '../components/ProductTabs';

const ACTIONS = {
  ACTIVATE: ['activate', 'Activate', false],
  DEACTIVATE: ['deactivate', 'Deactivate', false],
  BLOCK: ['block', 'Block', true],
  UNBLOCK: ['unblock', 'Unblock', true],
  ARCHIVE: ['archive', 'Archive', false],
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [action, setAction] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: catalogKeys.product(id),
    queryFn: () => catalogApi.product(id),
  });

  const run = useMutation({
    mutationFn: ({ verb, values }) => catalogApi.productAction(id, verb, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setAction(null);
      message.success('Done');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        setAction(null);
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        message.info('Sent for approval. It takes effect once another admin approves it.');
        return;
      }
      message.error(e.message);
    },
  });

  if (isLoading) return <FullPageSpinner label="Loading product…" />;
  if (error) {
    const scoped = error instanceof ApiError && error.code === 'OUT_OF_SCOPE';
    return (
      <ErrorState
        error={error}
        onRetry={scoped ? undefined : refetch}
        title={scoped ? 'This product is outside your categories' : 'Could not load this product'}
      />
    );
  }

  const product = data.data;
  const { variants, offers, attributes, sizeChart, submission, allowedActions } = data.meta;
  const [verb, label, needsApproval] = ACTIONS[action] ?? [];

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={
          <Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to products" onClick={() => navigate('/catalog/products')} />
        }
        breadcrumbs={[
          { label: 'Catalog' },
          { label: 'Products', to: '/catalog/products' },
          { label: product.title },
        ]}
        title={product.title}
        tags={
          <Space size={6}>
            <StatusTag domain="listing" code={product.status} />
            {product.assured && <Tag color="blue" style={{ marginInlineEnd: 0 }}>Assured</Tag>}
          </Space>
        }
        meta={
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {product.id} · {product.brandName}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{product.categoryPath}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Updated <DateText value={product.updatedAt} />
            </Typography.Text>
          </>
        }
        actions={
          <Space wrap>
            {Object.entries(ACTIONS)
              .filter(([key]) => allowedActions.includes(key))
              .map(([key, [, text]]) => (
                <Button key={key} danger={['BLOCK', 'ARCHIVE'].includes(key)} onClick={() => setAction(key)}>
                  {text}
                </Button>
              ))}
            <AuditDrawer entityType="product" entityId={product.id} entityLabel={product.title} />
          </Space>
        }
      />

      {product.status === 'BLOCKED' && product.blockedReason && (
        <Alert type="error" showIcon message="Blocked" description={product.blockedReason} />
      )}
      {submission && (
        <Alert
          type="warning"
          showIcon
          message={`A ${submission.type.toLowerCase()} is waiting in the QC queue`}
          description="Changes are not visible to customers until that submission is approved."
          action={<Button size="small" onClick={() => navigate('/catalog/qc')}>Open QC queue</Button>}
        />
      )}
      {offers.some((o) => o.priceAboveMrp) && (
        <Alert
          type="error"
          showIcon
          message="An offer is priced above its MRP"
          description="Displaying a price above MRP is not permitted. Deactivate the offer or have the seller correct it."
        />
      )}

      <Card size="small">
        <ProductTabs
          product={product}
          variants={variants}
          offers={offers}
          attributes={attributes}
          sizeChart={sizeChart}
        />
      </Card>

      <ConfirmActionModal
        open={Boolean(action)}
        onCancel={() => setAction(null)}
        onConfirm={(values) => run.mutate({ verb, values })}
        loading={run.isPending}
        danger={['BLOCK', 'ARCHIVE'].includes(action)}
        needsApproval={needsApproval}
        title={`${label} "${product.title}"?`}
        impact={
          action === 'BLOCK'
            ? `All ${offers.length} seller offers on this product stop being buyable.`
            : action === 'DEACTIVATE'
              ? 'The product is hidden from customers but keeps its content and offers.'
              : action === 'ARCHIVE'
                ? 'Archiving is final — the product cannot be brought back.'
                : 'Offers with stock become buyable again.'
        }
        reasonRequired={['BLOCK', 'UNBLOCK', 'DEACTIVATE'].includes(action)}
        confirmLabel={needsApproval ? 'Send for approval' : label}
      />
    </Flex>
  );
}
