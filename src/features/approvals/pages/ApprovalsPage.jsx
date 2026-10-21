import { App, Flex, Segmented, Space, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { qk, queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { APPROVAL_FILTER_SCHEMA, APPROVAL_VIEWS, approvalColumns } from '../approvalColumns';
import ApprovalDetailDrawer from '../components/ApprovalDetailDrawer';

export default function ApprovalsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-requestedAt' });
  const view = state.filters.view ?? 'pending_mine';
  const [openId, setOpenId] = useState(null);
  const [decision, setDecision] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: qk.approvals.list(state.queryParams),
    url: '/approvals',
    params: state.queryParams,
  });

  const decide = useMutation({
    mutationFn: ({ id, approve, reason }) => api.post(`/approvals/${id}/decide`, { approve, reason }),
    onSuccess: (res, variables) => {
      // An approved request applies a change elsewhere, so the caches it could
      // have touched are all invalidated rather than guessing which one.
      queryClient.invalidateQueries({ queryKey: qk.approvals.all });
      queryClient.invalidateQueries({ queryKey: qk.audit.all });
      queryClient.invalidateQueries({ queryKey: qk.roles.all });
      queryClient.invalidateQueries({ queryKey: qk.adminUsers.all });
      setDecision(null);
      setOpenId(null);
      if (res.meta?.effectWarning) message.warning(res.meta.effectWarning, 8);
      else message.success(variables.approve ? 'Approved and applied' : 'Rejected');
    },
    onError: (e) => message.error(e.message),
  });

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Approvals"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Approvals' }]}
        subtitle="Sensitive actions need a second pair of eyes. You cannot approve your own requests."
        actions={
          <Segmented
            value={view}
            onChange={(v) => state.patchFilters({ view: v })}
            options={APPROVAL_VIEWS}
          />
        }
        meta={
          meta?.counts && (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {meta.counts.pendingMine} waiting on you
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {meta.counts.raisedByMe} raised by you
              </Typography.Text>
            </>
          )
        }
      />

      <FilterBar
        schema={APPROVAL_FILTER_SCHEMA}
        tableState={state}
        searchPlaceholder="Search action, entity or requester"
      />

      <DataTable
        tableId="approvals"
        columns={approvalColumns((row, approve) => setDecision({ row, approve }))}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setOpenId(row.id)}
        emptyProps={{
          title: view === 'pending_mine' ? 'Nothing waiting on you' : 'No approval requests',
          description:
            view === 'pending_mine'
              ? 'Requests appear here when another admin raises an action you are allowed to approve.'
              : undefined,
        }}
        mobileCard={(row) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.actionLabel}</Typography.Text>
              <StatusTag domain="approval" code={row.status} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.entityLabel}
            </Typography.Text>
            {row.amountPaise ? <MoneyText paise={row.amountPaise} strong /> : null}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.requestedByName} · <DateText value={row.requestedAt} />
            </Typography.Text>
          </Flex>
        )}
      />

      <ApprovalDetailDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        onDecide={(approve, row) => setDecision({ row, approve })}
      />

      <ConfirmActionModal
        open={Boolean(decision)}
        onCancel={() => setDecision(null)}
        onConfirm={(values) =>
          decide.mutate({ id: decision.row.id, approve: decision.approve, reason: values.reason })
        }
        loading={decide.isPending}
        danger={!decision?.approve}
        title={
          decision?.approve
            ? `Approve: ${decision?.row?.actionLabel}?`
            : `Reject: ${decision?.row?.actionLabel}?`
        }
        description={decision?.row?.entityLabel}
        impact={
          decision?.approve ? (
            <Space direction="vertical" size={2}>
              <span>{decision?.row?.summary ?? 'The requested change will be applied immediately.'}</span>
              {decision?.row?.amountPaise ? (
                <span>
                  Amount involved: <MoneyText paise={decision.row.amountPaise} strong />
                </span>
              ) : null}
            </Space>
          ) : (
            'Nothing changes. The requester is notified and can raise a corrected request.'
          )
        }
        reasonRequired={!decision?.approve}
        reasonLabel={decision?.approve ? 'Note for the record (optional)' : 'Why are you rejecting this?'}
        showNote={false}
        confirmLabel={decision?.approve ? 'Approve and apply' : 'Reject request'}
      />
    </Flex>
  );
}
