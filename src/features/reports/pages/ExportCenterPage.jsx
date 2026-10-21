import { App, Button, Flex, Progress, Tag, Typography } from 'antd';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';

const STATUS_COLOR = { PROCESSING: 'blue', COMPLETED: 'green', COMPLETED_WITH_ERRORS: 'orange', FAILED: 'red' };

/** Export Center (M15.3): every export job, from any list's "Export" button or the Report Library's "Run". */
export default function ExportCenterPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: ['reports', 'exports', state.queryParams],
    url: '/jobs',
    params: { ...state.queryParams, type: 'EXPORT' },
  });

  const columns = [
    {
      key: 'label', title: 'Export', dataIndex: 'label', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>by {row.createdByName}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'metadata.containsPii', title: '', priority: 2,
      render: (_v, row) => (row.metadata?.containsPii ? <Tag color="red" style={{ marginInlineEnd: 0 }}>PII</Tag> : null),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={2} style={{ minWidth: 120 }}>
          <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ marginInlineEnd: 0, width: 'fit-content' }}>{v.replace(/_/g, ' ')}</Tag>
          {v === 'PROCESSING' && <Progress percent={row.progressPct} size="small" showInfo={false} />}
        </Flex>
      ),
    },
    { key: 'totalRows', title: 'Rows', dataIndex: 'totalRows', align: 'right', priority: 2 },
    { key: 'createdAt', title: 'Created', dataIndex: 'createdAt', render: (v) => <DateText value={v} />, priority: 2 },
    { key: 'expiresAt', title: 'Expires', dataIndex: 'expiresAt', render: (v) => <DateText value={v} />, priority: 3 },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        ['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(row.status) && row.resultUrl
          ? <Button size="small" onClick={() => message.info(`Would download ${row.resultUrl} in a real backend.`)}>Download</Button>
          : null
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Export Center"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Export Center' }]}
        subtitle="Every export from any list or report, with PII exports flagged and audited."
      />

      <DataTable
        tableId="exportJobs"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No exports yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={2}>
            <Typography.Text strong style={{ fontSize: 13 }}>{row.label}</Typography.Text>
            <Tag color={STATUS_COLOR[row.status] ?? 'default'} style={{ marginInlineEnd: 0, width: 'fit-content' }}>{row.status.replace(/_/g, ' ')}</Tag>
          </Flex>
        )}
      />
    </Flex>
  );
}
