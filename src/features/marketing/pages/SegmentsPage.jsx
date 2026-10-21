import { App, Button, Flex, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import SegmentFormModal from '../components/SegmentFormModal';

/**
 * Customer segments (M10.7). Dynamic segments are re-evaluated every time
 * they are used; a static one is frozen at creation, so a coupon aimed at
 * "this quarter's VIPs" keeps the same people even as orders keep changing
 * who would currently qualify.
 */
export default function SegmentsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: marketingKeys.segments(state.queryParams),
    url: '/segments',
    params: state.queryParams,
  });

  const remove = useMutation({
    mutationFn: (id) => marketingApi.deleteSegment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'segments'] });
      setDeleting(null);
      message.success('Segment deleted');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'name', title: 'Segment', dataIndex: 'name', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text strong style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>{row.description}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'kind', title: 'Type', dataIndex: 'kind', priority: 2,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v === 'STATIC' ? 'Static snapshot' : 'Dynamic'}</Tag>,
    },
    {
      key: 'memberCount', title: 'Members now', dataIndex: 'memberCount', sorter: true, align: 'right', priority: 1,
      render: (v) => <Typography.Text strong className="tabular">{v.toLocaleString('en-IN')}</Typography.Text>,
    },
    {
      key: 'usedBy', title: 'Used by', priority: 2,
      render: (_v, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {row.usedByCoupons} coupon(s) · {row.usedByCampaigns} campaign(s)
        </Typography.Text>
      ),
    },
    { key: 'createdByName', title: 'Created by', dataIndex: 'createdByName', priority: 3 },
    {
      key: 'createdAt', title: 'Created', dataIndex: 'createdAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Can perm="marketing.segment.delete">
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
        title="Customer segments"
        breadcrumbs={[{ label: 'Marketing' }, { label: 'Segments' }]}
        subtitle="Target coupons, campaigns and cashback at a rule rather than a guess. The member count shown here is live — the same count a coupon's audience check uses."
        actions={
          <Can perm="marketing.segment.create">
            <Button type="primary" onClick={() => setCreating(true)}>New segment</Button>
          </Can>
        }
      />

      <DataTable
        tableId="segments"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setEditing(row)}
        emptyProps={{ title: 'No segments yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
              <Typography.Text className="tabular">{row.memberCount}</Typography.Text>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{row.description}</Typography.Text>
          </Flex>
        )}
      />

      <SegmentFormModal
        segment={editing}
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['marketing', 'segments'] });
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
        title="Delete this segment"
        description={deleting?.name}
        impact="Any coupon or campaign currently targeting this segment is checked first — the delete is refused if one still depends on it."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Delete"
      />
    </Flex>
  );
}
