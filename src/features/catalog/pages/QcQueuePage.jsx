import { App, Col, Flex, Row, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { catalogApi, catalogKeys } from '../api/catalog.api';
import QcDecisionModals from '../components/QcDecisionModals';
import QcReviewPane from '../components/QcReviewPane';
import { qcColumns } from '../qcColumns';

/**
 * The catalog team's daily workbench.
 *
 * Choosing a row opens a review pane rather than navigating away, so a
 * reviewer can work down the queue without losing their place. Keyboard
 * shortcuts (A / C / R, J / K) exist because this is high-volume work.
 */
export default function QcQueuePage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'submittedAt' });
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: catalogKeys.submissions({ ...state.queryParams, tab: state.tab }),
    url: '/listing-submissions',
    params: {
      ...state.queryParams,
      ...(state.tab === 'mine' ? { mine: 'true' } : {}),
      ...(state.tab === 'unassigned' ? { unassigned: 'true' } : {}),
      ...(state.tab === 'breaching' ? { slaBreached: 'true' } : {}),
    },
  });

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const index = rows.findIndex((r) => r.id === selectedId);

  // Keep a selection as the list refreshes, and default to the first row.
  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    if (!rows.some((r) => r.id === selectedId)) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const product = useQuery({
    queryKey: catalogKeys.product(selected?.productId),
    queryFn: () => catalogApi.product(selected.productId),
    enabled: Boolean(selected?.productId),
  });

  const claim = useMutation({
    mutationFn: (id) => catalogApi.claimSubmission(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog', 'submissions'] }),
    onError: (e) => message.warning(e.message),
  });

  const decide = useMutation({
    mutationFn: ({ id, payload }) => catalogApi.decideSubmission(id, payload),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setModal(null);
      message.success(
        variables.payload.decision === 'APPROVE'
          ? 'Listing approved and published'
          : variables.payload.decision === 'REJECT'
            ? 'Listing rejected'
            : 'Sent back to the seller',
      );
      // Move to the next item so the reviewer keeps flowing down the queue.
      const next = rows[index + 1] ?? rows[index - 1] ?? null;
      setSelectedId(next?.id ?? null);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'AUTO_CHECK_FAILED') {
        message.warning('This listing fails an automated check — confirm the override to continue.');
        setModal('APPROVE');
        return;
      }
      message.error(e.message);
    },
  });

  // Shortcuts, disabled while a dialog is open so typing never triggers them.
  useEffect(() => {
    const onKey = (e) => {
      if (modal || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (!selected) return;
      const key = e.key.toLowerCase();
      if (key === 'a') setModal('APPROVE');
      else if (key === 'c') setModal('REQUEST_CHANGES');
      else if (key === 'r') setModal('REJECT');
      else if (key === 'j') setSelectedId(rows[Math.min(index + 1, rows.length - 1)]?.id ?? selectedId);
      else if (key === 'k') setSelectedId(rows[Math.max(index - 1, 0)]?.id ?? selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, selected, rows, index, selectedId]);

  const failedChecks = (selected?.autoChecks ?? [])
    .filter((c) => c.result === 'FAIL')
    .map((c) => c.label);


  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Listing QC queue"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Listing QC queue' }]}
        subtitle="Approve, send back, or reject submitted listings. Shortcuts: A approve · C changes · R reject · J/K move."
        meta={
          meta?.counts && (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {meta.counts.unassigned} unassigned
              </Typography.Text>
              <Typography.Text type={meta.counts.breaching ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                {meta.counts.breaching} past the 24-hour SLA
              </Typography.Text>
            </>
          )
        }
      />

      <FilterBar
        schema={[
          {
            key: 'type', label: 'Type', kind: 'multiSelect', width: 190,
            options: [
              { value: 'NEW', label: 'New listing' },
              { value: 'REVISION', label: 'Revision' },
              { value: 'RESUBMISSION', label: 'Resubmission' },
            ],
          },
          {
            key: 'priority', label: 'Priority', kind: 'select', width: 150,
            options: [{ value: 'HIGH', label: 'High' }, { value: 'NORMAL', label: 'Normal' }],
          },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 200 },
          { key: 'categoryId', label: 'Category', kind: 'entity', entity: 'category', width: 200 },
        ]}
        tableState={state}
        searchPlaceholder="Search listing, seller or product ID"
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={13}>
          <DataTable
            tableId="qcQueue"
            columns={qcColumns}
            rows={rows}
            meta={meta}
            loading={loading || fetching}
            error={error}
            onRetry={refetch}
            tableState={state}
            facetField="status"
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'mine', label: 'Mine' },
              { key: 'unassigned', label: 'Unassigned' },
              { key: 'breaching', label: 'Past SLA' },
            ]}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyProps={{
              title: 'Queue is clear',
              description: 'New and revised listings appear here as sellers submit them.',
            }}
            mobileCard={(row) => (
              <Flex vertical gap={4}>
                <Typography.Text strong>{row.productTitle}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.sellerName}</Typography.Text>
                <Space size={4} wrap>
                  <Tag style={{ marginInlineEnd: 0 }}>{row.type}</Tag>
                  {row.failedChecks > 0 && <Tag color="red" style={{ marginInlineEnd: 0 }}>{row.failedChecks} failing</Tag>}
                </Space>
              </Flex>
            )}
          />
        </Col>

        <Col xs={24} xl={11}>
          <QcReviewPane
            submission={selected}
            detail={product.data}
            claiming={claim.isPending}
            onClaim={() => claim.mutate(selected.id)}
            onDecide={setModal}
          />
        </Col>
      </Row>

      <QcDecisionModals
        which={modal}
        submission={selected}
        failedChecks={failedChecks}
        loading={decide.isPending}
        onCancel={() => setModal(null)}
        onConfirm={(payload) => decide.mutate({ id: selected.id, payload })}
      />
    </Flex>
  );
}
