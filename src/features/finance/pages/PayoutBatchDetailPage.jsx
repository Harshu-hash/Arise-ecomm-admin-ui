import { App, Alert, Button, Card, Col, Descriptions, Flex, Row, Space, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import BatchPayoutsTable from '../components/BatchPayoutsTable';
import { financeApi, financeKeys } from '../api/finance.api';

/**
 * One payout batch.
 *
 * The two actions here are the ones that move money: releasing the batch,
 * which goes through a second approver, and retrying the transfers the bank
 * sent back.
 */
export default function PayoutBatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [releasing, setReleasing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const query = useQuery({
    queryKey: financeKeys.batch(id),
    queryFn: () => financeApi.batch(id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance'] });

  const release = useMutation({
    mutationFn: () => financeApi.releaseBatch(id),
    onSuccess: () => {
      invalidate();
      setReleasing(false);
      message.success('Batch released');
    },
    onError: (e) => {
      // 202 arrives as an error but is a success: the release is waiting in
      // the approvals inbox. Anything else is a real failure.
      if (e instanceof ApiError && e.needsApproval) {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        setReleasing(false);
        message.info('Sent for approval. The transfers go out once another approver agrees.');
        return;
      }
      message.error(e.message);
    },
  });

  const retry = useMutation({
    mutationFn: () => financeApi.retryBatch(id),
    onSuccess: () => {
      invalidate();
      setRetrying(false);
      message.success('Failed transfers re-submitted');
    },
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const batch = query.data.data;
  const t = batch.totals;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={`Payout batch ${batch.id}`}
        breadcrumbs={[
          { label: 'Finance' },
          { label: 'Seller payouts', to: '/finance/payouts' },
          { label: batch.id },
        ]}
        onBack={() => navigate('/finance/payouts')}
        tags={<StatusTag domain="payoutBatch" code={batch.status} />}
        actions={
          <Space>
            {batch.status === 'PENDING_APPROVAL' ? (
              <Can perm="finance.payout.release">
                <Button
                  type="primary"
                  disabled={!batch.releasableByCaller}
                  onClick={() => setReleasing(true)}
                >
                  Release payouts
                </Button>
              </Can>
            ) : null}
            {batch.status === 'PARTIALLY_FAILED' ? (
              <Can perm="finance.payout.release">
                <Button type="primary" danger onClick={() => setRetrying(true)}>
                  Retry {batch.failedCount} failed transfers
                </Button>
              </Can>
            ) : null}
          </Space>
        }
      />

      {batch.status === 'PENDING_APPROVAL' && !batch.releasableByCaller ? (
        <Alert
          type="info"
          showIcon
          message="Someone else has to release this batch"
          description={`${batch.createdByName} built it. The person who builds a batch cannot be the person who releases it.`}
        />
      ) : null}

      {batch.status === 'PARTIALLY_FAILED' ? (
        <Alert
          type="error"
          showIcon
          message={`${batch.failedCount} transfers were returned by the bank`}
          description="These sellers have not been paid. Check the bank details on each account before retrying, or the same transfers will bounce again."
        />
      ) : null}

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="Money in this batch">
            <Flex vertical gap={6}>
              <Line label="Gross sales settled" paise={t.grossPaise} />
              <Line label="Our fees" paise={-t.feesPaise} />
              <Line label="TCS collected" paise={-t.tcsPaise} />
              <Line label="TDS withheld" paise={-t.tdsPaise} />
              <Line label="Adjustments" paise={t.adjustmentsPaise} />
              <Line label="Net to sellers" paise={t.netPaise} strong />
            </Flex>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="Audit trail">
            <Descriptions size="small" column={1} colon={false}>
              <Descriptions.Item label="Period">
                <Flex gap={4}>
                  <DateText value={batch.periodStart} variant="date" />
                  <Typography.Text type="secondary">→</Typography.Text>
                  <DateText value={batch.periodEnd} variant="date" />
                </Flex>
              </Descriptions.Item>
              <Descriptions.Item label="Built by">
                {batch.createdByName} · <DateText value={batch.createdAt} variant="datetime" />
              </Descriptions.Item>
              <Descriptions.Item label="Released by">
                {batch.approvedByName
                  ? <>{batch.approvedByName} · <DateText value={batch.releasedAt} variant="datetime" /></>
                  : <Typography.Text type="secondary">Not released yet</Typography.Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Sellers">
                {batch.sellerCount} · {batch.lineCount} settlement lines
              </Descriptions.Item>
              <Descriptions.Item label="Paid">
                {batch.paidCount} of {batch.sellerCount}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <BatchPayoutsTable batchId={batch.id} payouts={batch.payouts} />

      <ConfirmActionModal
        open={releasing}
        onCancel={() => setReleasing(false)}
        onConfirm={() => release.mutate()}
        loading={release.isPending}
        needsApproval
        title="Release this batch to the banks"
        description={`${batch.sellerCount} sellers · ${batch.lineCount} settlement lines`}
        impact={
          <span>
            <MoneyText paise={t.netPaise} strong /> will be transferred once a second approver agrees.
            Transfers cannot be recalled after they leave.
          </span>
        }
        reasonRequired={false}
        showNote={false}
        typeToConfirm="RELEASE"
      />

      <ConfirmActionModal
        open={retrying}
        onCancel={() => setRetrying(false)}
        onConfirm={() => retry.mutate()}
        loading={retry.isPending}
        title={`Retry ${batch.failedCount} failed transfers`}
        description="Only the payouts the bank returned are re-sent."
        impact="Sellers whose bank details are still wrong will fail again, and the batch will stay partly failed."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Retry transfers"
      />
    </Flex>
  );
}

function Line({ label, paise, strong = false }) {
  return (
    <Flex justify="space-between" align="baseline" gap={12}>
      <Typography.Text style={{ fontSize: 13 }} strong={strong}>{label}</Typography.Text>
      <MoneyText paise={paise} strong={strong} signed={paise < 0} />
    </Flex>
  );
}
