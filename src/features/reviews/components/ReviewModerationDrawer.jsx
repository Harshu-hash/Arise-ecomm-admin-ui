import { App, Alert, Button, Drawer, Flex, Image, Rate, Skeleton, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import { reviewsApi, reviewsKeys } from '../api/reviews.api';

/**
 * Full review, media, order context and other reviews by the same author —
 * the last of which is how a review-ring (several "verified" reviews from
 * accounts that only ever review each other's listings) actually gets
 * spotted, rather than by reading one review in isolation.
 */
export default function ReviewModerationDrawer({ reviewId, onClose, onChanged }) {
  const { message } = App.useApp();
  const [rejecting, setRejecting] = useState(false);

  const query = useQuery({
    queryKey: reviewsKeys.review(reviewId),
    queryFn: () => reviewsApi.review(reviewId),
    enabled: Boolean(reviewId),
  });

  const act = useMutation({
    mutationFn: (fn) => fn(),
    onSuccess: () => { onChanged(); query.refetch(); setRejecting(false); message.success('Done'); },
    onError: (e) => message.error(e.message),
  });

  const review = query.data?.data;

  return (
    <Drawer open={Boolean(reviewId)} onClose={onClose} width={480} title="Moderate review">
      {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      {review ? (
        <Flex vertical gap={12}>
          <Flex justify="space-between" align="center">
            <Link to={`/catalog/products/${review.productId}`}>{review.productTitle}</Link>
            <Rate disabled value={review.rating} style={{ fontSize: 14 }} />
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {review.customerName} · {review.certifiedBuyer ? 'certified buyer' : 'unverified'} · <DateText value={review.submittedAt} variant="date" />
          </Typography.Text>

          <Typography.Paragraph strong style={{ marginBottom: 0 }}>{review.title}</Typography.Paragraph>
          <Typography.Paragraph>{review.text}</Typography.Paragraph>

          {review.media?.length > 0 && (
            <Image.PreviewGroup>
              <Flex gap={8}>
                {review.media.map((m) => <Image key={m} src={`https://placehold.co/80x80?text=${m}`} width={80} height={80} />)}
              </Flex>
            </Image.PreviewGroup>
          )}

          <Tag color={review.autoModeration === 'CLEAN' ? 'green' : 'red'} style={{ width: 'fit-content' }}>
            Auto-check: {review.autoModeration}
          </Tag>

          {review.otherReviewsByAuthor.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${review.otherReviewsByAuthor.length} other review(s) by this customer`}
              description={
                <Flex vertical gap={2}>
                  {review.otherReviewsByAuthor.slice(0, 5).map((r) => (
                    <Typography.Text key={r.id} style={{ fontSize: 12 }}>{r.productTitle} — {r.rating}★</Typography.Text>
                  ))}
                </Flex>
              }
            />
          )}

          <Space wrap>
            <Can perm="reviews.review.moderate">
              <Button type="primary" disabled={review.status === 'PUBLISHED'} onClick={() => act.mutate(() => reviewsApi.publishReview(review.id))}>
                Publish
              </Button>
            </Can>
            <Can perm="reviews.review.moderate">
              <Button danger onClick={() => setRejecting(true)}>Reject</Button>
            </Can>
            {review.mediaCount > 0 && (
              <Can perm="reviews.review.moderate">
                <Button onClick={() => act.mutate(() => reviewsApi.hideMedia(review.id))}>Hide media only</Button>
              </Can>
            )}
            <Can perm="reviews.review.moderate">
              <Button onClick={() => act.mutate(() => reviewsApi.flagIncentivised(review.id))}>Mark seller-incentivised</Button>
            </Can>
          </Space>
        </Flex>
      ) : null}

      <ConfirmActionModal
        open={rejecting}
        onCancel={() => setRejecting(false)}
        onConfirm={(v) => act.mutate(() => reviewsApi.rejectReview(review.id, v.reason))}
        loading={act.isPending}
        danger
        title="Reject this review"
        impact="The customer is notified with this reason."
        reasonRequired
        reasonLabel="Reason"
        showNote={false}
        confirmLabel="Reject"
      />
    </Drawer>
  );
}
