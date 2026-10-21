import { App, Flex, Rate, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { reviewsApi, reviewsKeys } from '../api/reviews.api';
import ReviewModerationDrawer from '../components/ReviewModerationDrawer';

const MODERATION_LABEL = {
  CLEAN: 'Clean', PROFANITY: 'Profanity', PII: 'Contains PII', SPAM: 'Spam', INCENTIVISED: 'Incentivised', OFF_TOPIC: 'Off-topic',
};

/** Reviews (M13.1): auto-moderation clears a clean, certified-buyer review with no media automatically; everything else queues here. */
export default function ReviewsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-submittedAt', defaultTab: 'PENDING' });
  const [viewing, setViewing] = useState(null);
  const [bulkRejecting, setBulkRejecting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: reviewsKeys.reviews({ ...state.queryParams, tab: state.tab }),
    url: '/reviews',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { status: state.tab } : {}) },
  });

  const bulk = useMutation({
    mutationFn: (payload) => reviewsApi.bulkReviews(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      setBulkRejecting(null);
      message.success(`${res.data.affected} review(s) updated`);
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'productTitle', title: 'Product', dataIndex: 'productTitle', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 220 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.customerName}{row.certifiedBuyer ? ' · certified buyer' : ''}</Typography.Text>
        </Flex>
      ),
    },
    { key: 'rating', title: 'Rating', dataIndex: 'rating', sorter: true, priority: 1, render: (v) => <Rate disabled value={v} style={{ fontSize: 12 }} /> },
    {
      key: 'text', title: 'Review', dataIndex: 'text', priority: 2,
      render: (v, row) => (
        <Typography.Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
          {v} {row.mediaCount > 0 && <Tag style={{ marginInlineStart: 4 }}>{row.mediaCount} photo(s)</Tag>}
        </Typography.Text>
      ),
    },
    {
      key: 'autoModeration', title: 'Auto-check', dataIndex: 'autoModeration', priority: 1,
      render: (v) => <Tag color={v === 'CLEAN' ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{MODERATION_LABEL[v]}</Tag>,
    },
    { key: 'status', title: 'Status', dataIndex: 'status', priority: 1, render: (v) => <StatusTag domain="review" code={v} /> },
    { key: 'submittedAt', title: 'Submitted', dataIndex: 'submittedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} variant="date" /> },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Reviews"
        breadcrumbs={[{ label: 'Reviews & Q&A' }, { label: 'Reviews' }]}
        subtitle="A clean review from a certified buyer with no media publishes itself. Media reviews and anything flagged wait here."
      />

      <FilterBar
        schema={[
          { key: 'autoModeration', label: 'Auto-check', kind: 'select', width: 160, options: Object.entries(MODERATION_LABEL).map(([value, label]) => ({ value, label })) },
          { key: 'hasMedia', label: 'Has photos', kind: 'boolean' },
          { key: 'certifiedBuyer', label: 'Certified buyer', kind: 'boolean' },
        ]}
        tableState={state}
        searchPlaceholder="Search product, customer or review text"
      />

      <DataTable
        tableId="reviews"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setViewing(row.id)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'PENDING', label: 'Pending moderation' },
          { key: 'PUBLISHED', label: 'Published' },
          { key: 'REJECTED', label: 'Rejected' },
          { key: 'FLAGGED', label: 'Flagged by users' },
        ]}
        selection={{}}
        bulkActions={[
          {
            key: 'publish', label: 'Publish clean', perm: 'reviews.review.moderate',
            onClick: ({ selectedKeys }) => bulk.mutate({ action: 'PUBLISH_CLEAN', reviewIds: selectedKeys }),
          },
          {
            key: 'reject', label: 'Reject', danger: true, perm: 'reviews.review.moderate',
            onClick: ({ selectedKeys }) => setBulkRejecting(selectedKeys),
          },
        ]}
        emptyProps={{ title: 'No reviews match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text ellipsis style={{ fontSize: 13 }}>{row.productTitle}</Typography.Text>
              <Rate disabled value={row.rating} style={{ fontSize: 11 }} />
            </Flex>
            <StatusTag domain="review" code={row.status} showIcon={false} />
          </Flex>
        )}
      />

      <ReviewModerationDrawer
        reviewId={viewing}
        onClose={() => setViewing(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['reviews'] })}
      />

      <ConfirmActionModal
        open={Boolean(bulkRejecting)}
        onCancel={() => setBulkRejecting(null)}
        onConfirm={(v) => bulk.mutate({ action: 'REJECT', reviewIds: bulkRejecting, reason: v.reason })}
        loading={bulk.isPending}
        danger
        title={`Reject ${bulkRejecting?.length ?? 0} review(s)`}
        impact="Each author is notified with this reason."
        reasonRequired
        reasonLabel="Reason"
        showNote={false}
        confirmLabel="Reject"
      />
    </Flex>
  );
}
