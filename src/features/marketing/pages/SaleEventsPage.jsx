import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { App, Button, Flex, Progress, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import SaleEventFormModal from '../components/SaleEventFormModal';

/** Sale events (M10.4): the calendar tying coupons, flash sales, deals and banners together. */
export default function SaleEventsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-startsAt' });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.saleEvents(state.queryParams),
    url: '/sale-events',
    params: state.queryParams,
  });

  const remove = useMutation({
    mutationFn: (id) => marketingApi.deleteSaleEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'saleEvents'] });
      setDeleting(null);
      message.success('Event deleted');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'name', title: 'Event', dataIndex: 'name', alwaysVisible: true },
    {
      key: 'window', title: 'Dates', priority: 1,
      render: (_v, row) => (
        <Flex gap={4}>
          <DateText value={row.startsAt} variant="date" />
          <Typography.Text type="secondary">→</Typography.Text>
          <DateText value={row.endsAt} variant="date" />
        </Flex>
      ),
    },
    {
      key: 'ready', title: 'Readiness', priority: 1,
      render: (_v, row) => (
        <Flex align="center" gap={6} style={{ minWidth: 120 }}>
          <Progress
            percent={Math.round((Object.values(row.checklist).filter(Boolean).length / 4) * 100)}
            size="small"
            showInfo={false}
            status={row.ready ? 'success' : 'active'}
          />
          {row.ready ? <CheckCircleFilled style={{ color: 'var(--ant-color-success)' }} /> : <CloseCircleFilled style={{ color: 'var(--ant-color-warning)' }} />}
        </Flex>
      ),
    },
    {
      key: 'linked', title: 'Linked', priority: 2,
      render: (_v, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {row.linkedCouponIds.length} coupons · {row.linkedFlashSaleIds.length} flash sales · {row.linkedDealIds.length} deals
        </Typography.Text>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="saleEvent" code={v} />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Can perm="marketing.event.delete">
          <Button size="small" type="text" danger onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>
            Delete
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Sale events"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Sale events' }]}
        subtitle="One calendar entry tying together the coupons, flash sales, deals and banners running for a sale window."
        actions={
          <Can perm="marketing.event.create">
            <Button type="primary" onClick={() => setCreating(true)}>New event</Button>
          </Can>
        }
      />

      <DataTable
        tableId="saleEvents"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No sale events yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
              <StatusTag domain="saleEvent" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <SaleEventFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['marketing', 'saleEvents'] });
          setCreating(false);
        }}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Delete this sale event"
        description={deleting?.name}
        impact="The linked coupons, flash sales and deals are not affected — only this calendar entry is removed."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Delete"
      />
    </Flex>
  );
}
