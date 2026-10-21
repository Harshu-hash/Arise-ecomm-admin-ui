import { Alert, App, Button, Flex, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { slaCountdown } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { customerKeys, customersApi } from '@features/orders/api/orders.api';

const TYPES = [
  { value: 'ACCOUNT_DELETION', label: 'Delete account' },
  { value: 'DATA_EXPORT', label: 'Download data' },
  { value: 'CORRECTION', label: 'Correct details' },
  { value: 'CONSENT_WITHDRAWAL', label: 'Withdraw consent' },
];

export default function PrivacyRequestsPage() {
  const { message, modal } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'dueAt' });
  const [acting, setActing] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: customerKeys.privacy({ ...state.queryParams, tab: state.tab }),
    url: '/customers/privacy-requests',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const detail = useQuery({
    queryKey: customerKeys.privacyDetail(acting?.row?.id),
    queryFn: () => customersApi.privacyDetail(acting.row.id),
    enabled: Boolean(acting?.row?.id),
  });

  const run = useMutation({
    mutationFn: ({ rowId, action, payload }) => customersApi.privacyAction(rowId, action, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setActing(null);
      message.success('Request updated');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'PRIVACY_BLOCKED') {
        modal.confirm({
          title: 'This customer still has orders in progress',
          content: `${e.details?.openOrders ?? 'Some'} order(s) are still moving. Deleting the account now would strand them.`,
          okText: 'Delete anyway',
          okButtonProps: { danger: true },
          onOk: () =>
            run.mutateAsync({ rowId: acting.row.id, action: 'process', payload: { force: true } }),
        });
        return;
      }
      message.error(e.message);
    },
  });

  const columns = [
    {
      key: 'customerName', title: 'Customer', dataIndex: 'customerName', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <Link to={`/customers/${row.customerId}`}>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
        </Link>
      ),
    },
    {
      key: 'typeLabel', title: 'Request', dataIndex: 'typeLabel', priority: 1,
      render: (v, row) => (
        <Tag color={row.type === 'ACCOUNT_DELETION' ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>{v}</Tag>
      ),
    },
    { key: 'receivedAt', title: 'Received', dataIndex: 'receivedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} /> },
    {
      key: 'dueAt', title: 'Statutory due', dataIndex: 'dueAt', sorter: true, priority: 1,
      render: (v, row) => {
        if (['COMPLETED', 'REJECTED'].includes(row.status)) return <Typography.Text type="secondary">—</Typography.Text>;
        const { label, overdue } = slaCountdown(v);
        return (
          <Typography.Text type={overdue ? 'danger' : undefined} strong={overdue} style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
        );
      },
    },
    { key: 'status', title: 'Status', dataIndex: 'status', priority: 1, render: (v) => <StatusTag domain="privacyRequest" code={v} /> },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['COMPLETED', 'REJECTED'].includes(row.status) ? null : (
          <Space size={4}>
            <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); setActing({ row, kind: 'process' }); }}>
              Process
            </Button>
            <Button size="small" onClick={(e) => { e.stopPropagation(); setActing({ row, kind: 'reject' }); }}>
              Reject
            </Button>
          </Space>
        ),
    },
  ];

  const overdue = rows.filter((r) => r.overdue).length;
  const blockers = detail.data?.meta?.blockers ?? [];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Privacy requests"
        breadcrumbs={[{ label: 'Customers' }, { label: 'Privacy requests' }]}
        subtitle="Deletion and data-export requests from the app. The statutory clock is 30 days from receipt."
        meta={
          overdue > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {overdue} past the statutory deadline
            </Typography.Text>
          )
        }
      />

      <FilterBar
        schema={[
          { key: 'type', label: 'Request type', kind: 'multiSelect', options: TYPES, width: 220 },
          { key: 'dueAt', label: 'Due', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search customer or request"
      />

      <DataTable
        tableId="privacyRequests"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'RECEIVED', label: 'New' },
          { key: 'VERIFYING', label: 'Verifying' },
          { key: 'IN_PROGRESS', label: 'In progress' },
          { key: 'ON_HOLD', label: 'On hold' },
          { key: 'COMPLETED', label: 'Completed' },
        ]}
        emptyProps={{ title: 'No privacy requests' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.customerName}</Typography.Text>
              <StatusTag domain="privacyRequest" code={row.status} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.typeLabel}</Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(acting)}
        onCancel={() => setActing(null)}
        onConfirm={(values) =>
          run.mutate({ rowId: acting.row.id, action: acting.kind, payload: { reason: values.reason } })
        }
        loading={run.isPending || detail.isLoading}
        danger={acting?.kind === 'process' && acting?.row?.type === 'ACCOUNT_DELETION'}
        title={
          acting?.kind === 'process'
            ? `Process: ${acting?.row?.typeLabel}`
            : `Reject this request from ${acting?.row?.customerName}?`
        }
        description={acting?.row?.customerName}
        impact={
          acting?.kind !== 'process' ? (
            'The customer is told why. Rejecting without a lawful basis is a compliance risk.'
          ) : acting?.row?.type === 'ACCOUNT_DELETION' ? (
            <Space direction="vertical" size={4}>
              <span>
                Personal details are erased. Order records are kept in anonymised form because tax
                law requires it.
              </span>
              {blockers.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message="Outstanding before deletion"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {blockers.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                  }
                />
              )}
            </Space>
          ) : (
            'A data package is generated and a secure, expiring link is sent to the customer.'
          )
        }
        reasonRequired={acting?.kind === 'reject'}
        reasonLabel={acting?.kind === 'reject' ? 'Lawful basis for rejecting' : 'Note (optional)'}
        showNote={false}
        typeToConfirm={acting?.kind === 'process' && acting?.row?.type === 'ACCOUNT_DELETION' ? 'DELETE' : undefined}
        confirmLabel={acting?.kind === 'process' ? 'Process request' : 'Reject request'}
      />
    </Flex>
  );
}
