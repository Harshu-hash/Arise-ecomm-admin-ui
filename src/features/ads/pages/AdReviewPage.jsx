import { App, Button, Card, Flex, List, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import { adsApi, adsKeys } from '../api/ads.api';

const FINDING_LABEL = {
  PRODUCT_NOT_LIVE: 'Product is not live',
  PRODUCT_OUT_OF_STOCK: 'Product is out of stock',
  BLOCKED_KEYWORD: 'Blocked keyword',
};

/** Ad review queue (M11.2): every promoted product checked LIVE + in stock, every keyword checked against blocked terms. */
export default function AdReviewPage() {
  const { message } = App.useApp();
  const [rejecting, setRejecting] = useState(null);

  const query = useQuery({ queryKey: adsKeys.reviewQueue({}), queryFn: () => adsApi.reviewQueue({ pageSize: 50 }) });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }) => adsApi.decideReview(id, decision, reason),
    onSuccess: () => { query.refetch(); setRejecting(null); message.success('Done'); },
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const rows = query.data.data;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Ad review queue"
        breadcrumbs={[{ label: 'Sponsored Ads' }, { label: 'Review queue' }]}
        subtitle="Every promoted product must be live and in stock; every keyword is checked against blocked terms before a campaign can go live."
      />

      {rows.length === 0 && <Card size="small"><Typography.Text type="secondary">Nothing is waiting for review.</Typography.Text></Card>}

      {rows.map((c) => (
        <Card
          key={c.id}
          size="small"
          title={<Flex gap={8} align="center">{c.name} <Tag color={c.reviewPassed ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{c.reviewPassed ? 'Passes automated checks' : `${c.findings.length} issue(s)`}</Tag></Flex>}
          extra={
            <Flex gap={6}>
              <Can perm="ads.review.decide">
                <Button size="small" type="primary" onClick={() => decide.mutate({ id: c.id, decision: 'APPROVED' })} loading={decide.isPending}>Approve</Button>
              </Can>
              <Can perm="ads.review.decide">
                <Button size="small" danger onClick={() => setRejecting(c)}>Reject</Button>
              </Can>
            </Flex>
          }
        >
          <Flex vertical gap={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {c.sellerName} · {c.productCount} product(s) · daily budget <MoneyText paise={c.dailyBudgetPaise} />
            </Typography.Text>
            {c.findings.length > 0 && (
              <List
                size="small"
                dataSource={c.findings}
                renderItem={(f) => (
                  <List.Item style={{ padding: '2px 0', border: 'none' }}>
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>{FINDING_LABEL[f.type]}: {f.detail}</Typography.Text>
                  </List.Item>
                )}
              />
            )}
          </Flex>
        </Card>
      ))}

      <ConfirmActionModal
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        onConfirm={(v) => decide.mutate({ id: rejecting.id, decision: 'REJECTED', reason: v.reason })}
        loading={decide.isPending}
        danger
        title="Reject this campaign"
        description={rejecting?.name}
        impact="The advertiser is notified with this reason and can resubmit after fixing it."
        reasonRequired
        reasonLabel="Reason"
        showNote={false}
        confirmLabel="Reject"
      />
    </Flex>
  );
}
