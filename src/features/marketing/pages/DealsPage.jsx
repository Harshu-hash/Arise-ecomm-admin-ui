import { App, Button, Flex, Segmented, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import DealFormModal from '../components/DealFormModal';
import DealCalendar from '../components/DealCalendar';

/** Deals (M10.2): the app's Offers / Top Value Deals rails, plus the Deal of the Day calendar. */
export default function DealsPage() {
  const { message } = App.useApp();
  const [view, setView] = useState('list');
  const state = useUrlTableState({ defaultSort: '-startsAt' });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.deals(state.queryParams),
    url: '/deals',
    params: state.queryParams,
  });

  const calendar = useQuery({
    queryKey: marketingKeys.dealsCalendar,
    queryFn: () => marketingApi.dealsCalendar(),
    enabled: view === 'calendar',
  });

  const remove = useMutation({
    mutationFn: (id) => marketingApi.deleteDeal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'deals'] });
      setDeleting(null);
      message.success('Deal removed');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'title', title: 'Deal', dataIndex: 'title', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text style={{ fontSize: 13 }} ellipsis>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.label}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'tag', title: 'Tag', dataIndex: 'tag', priority: 2,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag>,
    },
    {
      key: 'dealPricePaise', title: 'Deal price', dataIndex: 'dealPricePaise', sorter: true, align: 'right', priority: 1,
      render: (v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <MoneyText paise={v} strong />
          <Typography.Text type="secondary" style={{ fontSize: 10, textDecoration: 'line-through' }}>
            <MoneyText paise={row.mrpPaise} />
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'placement', title: 'Placement', dataIndex: 'placement', priority: 2,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v === 'TOP_VALUE_DEALS' ? 'Top value deals' : 'Offers page'}</Tag>,
    },
    {
      key: 'slotDate', title: 'Deal-of-the-day slot', dataIndex: 'slotDate', sorter: true, priority: 2,
      render: (v) => (v ? <DateText value={v} variant="date" /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'endsAt', title: 'Ends', dataIndex: 'endsAt', sorter: true, priority: 3,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Can perm="marketing.deal.delete">
          <Button size="small" type="text" danger onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>
            Remove
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Deals"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Deals' }]}
        subtitle="Feeds the app's Offers and Top Value Deals rails. Deal of the Day holds one slot per placement per day."
        actions={
          <Can perm="marketing.deal.create">
            <Button type="primary" onClick={() => setCreating(true)}>New deal</Button>
          </Can>
        }
      />

      <Segmented
        value={view}
        onChange={setView}
        options={[{ value: 'list', label: 'All deals' }, { value: 'calendar', label: 'Deal of the Day calendar' }]}
      />

      {view === 'list' ? (
        <>
          <FilterBar
            schema={[
              {
                key: 'placement', label: 'Placement', kind: 'select', width: 170,
                options: [{ value: 'TOP_VALUE_DEALS', label: 'Top value deals' }, { value: 'OFFERS_PAGE', label: 'Offers page' }],
              },
              {
                key: 'tag', label: 'Tag', kind: 'multiSelect', width: 170,
                options: ['BESTSELLER', 'TRENDING', 'SUPER SAVER', 'HOT DEAL'].map((v) => ({ value: v, label: v })),
              },
            ]}
            tableState={state}
            searchPlaceholder="Search deal title or label"
          />

          <DataTable
            tableId="deals"
            columns={columns}
            rows={rows}
            meta={meta}
            loading={loading || fetching}
            error={error}
            onRetry={refetch}
            tableState={state}
            emptyProps={{ title: 'No deals match these filters' }}
            mobileCard={(row) => (
              <Flex vertical gap={4}>
                <Flex justify="space-between" gap={8}>
                  <Typography.Text style={{ fontSize: 13 }} ellipsis>{row.title}</Typography.Text>
                  <MoneyText paise={row.dealPricePaise} strong />
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.tag}</Typography.Text>
              </Flex>
            )}
          />
        </>
      ) : (
        <DealCalendar deals={calendar.data?.data ?? []} loading={calendar.isLoading} />
      )}

      <DealFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['marketing', 'deals'] });
          setCreating(false);
        }}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Remove this deal"
        description={deleting?.title}
        impact="It disappears from the app rail immediately."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}
