import { App, Button, Flex, Form, Select, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { reviewsApi, reviewsKeys } from '../api/reviews.api';

/** Abuse reports (M13.3): user-reported reviews and answers. */
export default function AbuseReportsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-reportedAt', defaultTab: 'OPEN' });
  const [deciding, setDeciding] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: reviewsKeys.abuseReports({ ...state.queryParams, tab: state.tab }),
    url: '/abuse-reports',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) => reviewsApi.decideAbuseReport(id, decision, reason),
    onSuccess: () => { refetch(); setDeciding(null); message.success('Done'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'targetExcerpt', title: 'Reported content', dataIndex: 'targetExcerpt', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 320 }}>“{v}”</Typography.Text>
          <Tag style={{ marginInlineEnd: 0, width: 'fit-content' }}>{row.targetType}</Tag>
        </Flex>
      ),
    },
    { key: 'reason', title: 'Reason', dataIndex: 'reason', priority: 1 },
    { key: 'reporterCount', title: 'Reports', dataIndex: 'reporterCount', align: 'right', sorter: true, priority: 1 },
    { key: 'status', title: 'Status', dataIndex: 'status', priority: 1, render: (v) => <StatusTag domain="abuseReport" code={v} /> },
    { key: 'reportedAt', title: 'Reported', dataIndex: 'reportedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} variant="date" /> },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        row.status === 'OPEN' ? (
          <Can perm="reviews.abuse.decide">
            <Button size="small" onClick={(e) => { e.stopPropagation(); setDeciding(row); }}>Decide</Button>
          </Can>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Abuse reports"
        breadcrumbs={[{ label: 'Reviews & Q&A' }, { label: 'Abuse reports' }]}
        subtitle="Removing a reported review also rejects it from the public listing."
      />

      <FilterBar
        schema={[{ key: 'targetType', label: 'Target', kind: 'select', width: 140, options: [{ value: 'REVIEW', label: 'Review' }, { value: 'ANSWER', label: 'Answer' }] }]}
        tableState={state}
        searchPlaceholder="Search reported text or reason"
      />

      <DataTable
        tableId="abuseReports"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[{ key: 'all', label: 'All' }, { key: 'OPEN', label: 'Open' }, { key: 'DISMISSED', label: 'Dismissed' }, { key: 'REMOVED', label: 'Removed' }]}
        emptyProps={{ title: 'No abuse reports match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text ellipsis style={{ fontSize: 13 }}>“{row.targetExcerpt}”</Typography.Text>
            <StatusTag domain="abuseReport" code={row.status} showIcon={false} />
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(deciding)}
        onCancel={() => setDeciding(null)}
        onConfirm={(v) => decide.mutate({ id: deciding.id, decision: v.decision, reason: v.reason })}
        loading={decide.isPending}
        title="Decide this report"
        description={deciding ? `“${deciding.targetExcerpt}” · ${deciding.reporterCount} report(s)` : ''}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Submit"
        extraFields={
          <Form.Item name="decision" label="Decision" initialValue="DISMISSED" rules={[{ required: true }]}>
            <Select options={[{ value: 'DISMISSED', label: 'Dismiss — content stays up' }, { value: 'REMOVED', label: 'Remove content' }]} />
          </Form.Item>
        }
      />
    </Flex>
  );
}
