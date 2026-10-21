import { App, Button, Flex, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { cmsApi, cmsKeys } from '../api/cms.api';
import BannerFormModal from '../components/BannerFormModal';

/** Banners (M12.2): hero carousel and ad tiles, with placement and schedule conflicts visible in the list. */
export default function BannersPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'priority' });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: cmsKeys.banners(state.queryParams),
    url: '/banners',
    params: state.queryParams,
  });

  const remove = useMutation({
    mutationFn: (id) => cmsApi.deleteBanner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms', 'banners'] });
      setDeleting(null);
      message.success('Banner removed');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'name', title: 'Banner', dataIndex: 'name', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.kind}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'placements', title: 'Placements', priority: 2,
      render: (_v, row) => <Flex gap={4} wrap>{row.placements.map((p) => <Tag key={p} style={{ marginInlineEnd: 0 }}>{p.replace(/_/g, ' ').toLowerCase()}</Tag>)}</Flex>,
    },
    {
      key: 'window', title: 'Schedule', priority: 1,
      render: (_v, row) => (
        <Flex gap={4}>
          <DateText value={row.startsAt} variant="date" />
          <Typography.Text type="secondary">→</Typography.Text>
          <DateText value={row.endsAt} variant="date" />
        </Flex>
      ),
    },
    {
      key: 'ctr', title: 'Impressions / CTR', priority: 2,
      render: (_v, row) => (
        <Typography.Text className="tabular" style={{ fontSize: 12 }}>
          {row.impressions.toLocaleString('en-IN')} / {row.ctr}%
        </Typography.Text>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => <StatusTag domain="banner" code={v} />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Can perm="cms.banner.delete">
          <Button size="small" type="text" danger onClick={(e) => { e.stopPropagation(); setDeleting(row); }}>Remove</Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Banners"
        breadcrumbs={[{ label: 'Content' }, { label: 'Banners' }]}
        subtitle="Hero carousel and ad tiles. Status is derived from the schedule, not set by hand."
        actions={
          <Can perm="cms.banner.create">
            <Button type="primary" onClick={() => setCreating(true)}>New banner</Button>
          </Can>
        }
      />

      <FilterBar
        schema={[
          { key: 'kind', label: 'Kind', kind: 'select', width: 140, options: [{ value: 'HERO', label: 'Hero' }, { value: 'TILE', label: 'Tile' }] },
        ]}
        tableState={state}
        searchPlaceholder="Search banner name"
      />

      <DataTable
        tableId="banners"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setEditing(row)}
        emptyProps={{ title: 'No banners yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
              <StatusTag domain="banner" code={row.status} showIcon={false} />
            </Flex>
          </Flex>
        )}
      />

      <BannerFormModal
        banner={editing}
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['cms', 'banners'] });
          setEditing(null);
          setCreating(false);
        }}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Remove this banner"
        description={deleting?.name}
        impact="It disappears from the app the moment this is confirmed."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}
