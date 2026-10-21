import { App, Button, Card, Flex, Space, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import FlashSaleLiveMonitor from '../components/FlashSaleLiveMonitor';
import NominationsTable from '../components/NominationsTable';

const NEXT_ACTION = {
  DRAFT: ['open_nominations', 'Open nominations'],
  NOMINATIONS_OPEN: ['close', 'Close nominations'],
  CURATION: ['publish', 'Publish — schedule the sale'],
  SCHEDULED: ['start', 'Start now'],
  LIVE: ['end', 'End sale'],
};

/** One flash sale: nominate → curate → publish → go live → end, with a live monitor once it runs. */
export default function FlashSaleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [cancelling, setCancelling] = useState(false);

  const query = useQuery({
    queryKey: marketingKeys.flashSale(id),
    queryFn: () => marketingApi.flashSale(id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: marketingKeys.flashSale(id) });

  const transition = useMutation({
    mutationFn: ({ action, reason }) => marketingApi.transitionFlashSale(id, action, reason),
    onSuccess: () => { invalidate(); setCancelling(false); message.success('Done'); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'NOTHING_CURATED') {
        message.error('Accept at least one nomination before publishing.');
        return;
      }
      message.error(e.message);
    },
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const sale = query.data.data;
  const [action, label] = NEXT_ACTION[sale.status] ?? [];
  const canCancel = ['DRAFT', 'NOMINATIONS_OPEN', 'CURATION', 'SCHEDULED'].includes(sale.status);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={sale.name}
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Flash sales', to: '/marketing/flash-sales' }, { label: sale.name }]}
        onBack={() => navigate('/marketing/flash-sales')}
        tags={<StatusTag domain="flashSale" code={sale.status} />}
        meta={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {sale.categoryRootNames.join(', ')} · min {sale.minDiscountPct}% off · max {sale.maxUnitsPerCustomer}/customer
          </Typography.Text>
        }
        actions={
          <Space>
            {canCancel && (
              <Can perm="marketing.flashsale.edit">
                <Button danger onClick={() => setCancelling(true)}>Cancel</Button>
              </Can>
            )}
            {action && (
              <Can perm="marketing.flashsale.publish">
                <Button type="primary" onClick={() => transition.mutate({ action })} loading={transition.isPending}>
                  {label}
                </Button>
              </Can>
            )}
          </Space>
        }
      />

      {sale.status === 'LIVE' ? (
        <FlashSaleLiveMonitor saleId={sale.id} />
      ) : (
        <Card size="small" title="Nominations">
          <NominationsTable sale={sale} onChanged={invalidate} />
        </Card>
      )}

      <ConfirmActionModal
        open={cancelling}
        onCancel={() => setCancelling(false)}
        onConfirm={(values) => transition.mutate({ action: 'cancel', reason: values.reason })}
        loading={transition.isPending}
        danger
        title="Cancel this flash sale"
        description={sale.name}
        impact="All nominations are released. Sellers who committed stock are notified."
        reasonRequired
        reasonLabel="Why is it being cancelled?"
        showNote={false}
        confirmLabel="Cancel sale"
      />
    </Flex>
  );
}
