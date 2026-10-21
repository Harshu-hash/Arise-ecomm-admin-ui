import { Alert, Button, Col, Flex, Row, Segmented, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import { financeApi, financeKeys } from '../api/finance.api';
import CreateBatchModal from '../components/CreateBatchModal';
import PayoutAdjustmentsTable from '../components/PayoutAdjustmentsTable';
import PayoutBatchesTable from '../components/PayoutBatchesTable';
import SettlementLinesTable from '../components/SettlementLinesTable';

/**
 * Seller payouts.
 *
 * Two views of the same money: the settlement lines waiting to be paid, and
 * the batches that pay them. The held total is shown next to the payable one
 * because "why has my money not arrived" is the single most common seller
 * query, and the answer is always in the held bucket.
 */
export default function PayoutsPage() {
  const [view, setView] = useState('batches');
  const [creating, setCreating] = useState(false);

  const summary = useQuery({
    queryKey: financeKeys.settlementSummary,
    queryFn: () => financeApi.settlementSummary(),
    staleTime: 15_000,
  });

  const s = summary.data?.data;
  const heldReasons = Object.entries(s?.held?.byReason ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Seller payouts"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Seller payouts' }]}
        subtitle="Settlements are released weekly. One person builds the batch; a second releases it."
        actions={
          <Can perm="finance.payout.create">
            <Button type="primary" onClick={() => setCreating(true)}>
              Build a payout batch
            </Button>
          </Can>
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label="Payable now"
            valuePaise={s?.eligible?.netPaise}
            format="money"
            loading={summary.isLoading}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {s?.eligible?.count ?? 0} lines · {s?.eligible?.sellerCount ?? 0} sellers
              </Typography.Text>
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label="Held back"
            valuePaise={s?.held?.netPaise}
            format="money"
            loading={summary.isLoading}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {s?.held?.count ?? 0} lines on hold
              </Typography.Text>
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label="Commission earned"
            valuePaise={s?.eligible?.commissionPaise}
            format="money"
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            label="Oldest unpaid settlement"
            value={s?.unpaidAgeDays}
            loading={summary.isLoading}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                days since delivery
              </Typography.Text>
            }
          />
        </Col>
      </Row>

      {heldReasons.length ? (
        <Alert
          type="info"
          showIcon
          message="Why money is being held"
          description={
            <Flex vertical gap={2}>
              {heldReasons.map(([reason, count]) => (
                <Typography.Text key={reason} style={{ fontSize: 12 }}>
                  <strong className="tabular">{count}</strong> · {reason}
                </Typography.Text>
              ))}
            </Flex>
          }
        />
      ) : null}

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'batches', label: 'Payout batches' },
          { value: 'settlements', label: 'Settlement lines' },
          { value: 'adjustments', label: 'Adjustments' },
        ]}
      />

      {view === 'batches' ? <PayoutBatchesTable /> : null}
      {view === 'settlements' ? <SettlementLinesTable /> : null}
      {view === 'adjustments' ? <PayoutAdjustmentsTable /> : null}

      <CreateBatchModal
        open={creating}
        onClose={() => setCreating(false)}
        payablePaise={s?.eligible?.netPaise ?? 0}
        lineCount={s?.eligible?.count ?? 0}
        sellerCount={s?.eligible?.sellerCount ?? 0}
      />
    </Flex>
  );
}
