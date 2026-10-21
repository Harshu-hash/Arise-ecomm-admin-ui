import { App, Button, Flex, Progress, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import FlashSaleFormModal from '../components/FlashSaleFormModal';

export default function FlashSalesListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-startsAt' });
  const [creating, setCreating] = useState(false);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.flashSales({ ...state.queryParams, tab: state.tab }),
    url: '/flash-sales',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const create = useMutation({
    mutationFn: (payload) => marketingApi.createFlashSale(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'flashSales'] });
      setCreating(false);
      navigate(`/marketing/flash-sales/${res.data.id}`);
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'name', title: 'Flash sale', dataIndex: 'name', alwaysVisible: true },
    {
      key: 'window', title: 'Window', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} align="center" style={{ whiteSpace: 'nowrap' }}>
          <DateText value={row.startsAt} variant="datetime" />
          <Typography.Text type="secondary">→</Typography.Text>
          <DateText value={row.endsAt} variant="datetime" />
        </Flex>
      ),
    },
    {
      key: 'minDiscountPct', title: 'Min discount', dataIndex: 'minDiscountPct', priority: 3,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}%+</Tag>,
    },
    {
      key: 'nominationCount', title: 'Nominations', priority: 1,
      render: (_v, row) => (
        <Typography.Text className="tabular" style={{ fontSize: 12 }}>
          {row.acceptedCount} accepted · {row.pendingCount} pending
        </Typography.Text>
      ),
    },
    {
      key: 'gmvPaise', title: 'GMV', dataIndex: 'gmvPaise', align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} compact />,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="flashSale" code={v} />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Flash sales"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Flash sales' }]}
        subtitle="Nominations below the minimum discount, or priced higher than 30 days ago, are rejected automatically."
        actions={
          <Can perm="marketing.flashsale.create">
            <Button type="primary" onClick={() => setCreating(true)}>New flash sale</Button>
          </Can>
        }
      />

      <DataTable
        tableId="flashSales"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => navigate(`/marketing/flash-sales/${row.id}`)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'NOMINATIONS_OPEN', label: 'Nominations open' },
          { key: 'CURATION', label: 'Curation' },
          { key: 'SCHEDULED', label: 'Scheduled' },
          { key: 'LIVE', label: 'Live' },
          { key: 'ENDED', label: 'Ended' },
        ]}
        emptyProps={{ title: 'No flash sales yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
              <StatusTag domain="flashSale" code={row.status} showIcon={false} />
            </Flex>
            <Progress percent={row.acceptedCount ? Math.round((row.unitsSold ?? 0) / 10) : 0} size="small" showInfo={false} />
          </Flex>
        )}
      />

      <FlashSaleFormModal open={creating} onClose={() => setCreating(false)} onSubmit={(v) => create.mutate(v)} loading={create.isPending} />
    </Flex>
  );
}
