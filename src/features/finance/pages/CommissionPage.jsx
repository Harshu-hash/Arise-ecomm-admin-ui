import { App, Button, Card, Col, Flex, InputNumber, Row, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import { financeApi, financeKeys } from '../api/finance.api';
import FeePreviewCard from '../components/FeePreviewCard';

/**
 * The rate card.
 *
 * Changing a rate here changes what every seller in that category earns, so
 * no edit applies directly — each one becomes an approval request. The
 * preview panel alongside is how finance checks the effect on a real price
 * before raising that request.
 */
export default function CommissionPage() {
  const { message } = App.useApp();
  const [editing, setEditing] = useState(null);
  const [draftPct, setDraftPct] = useState(0);

  const query = useQuery({
    queryKey: financeKeys.commission({ pageSize: 100 }),
    queryFn: () => financeApi.commissionRules({ pageSize: 100, sort: 'rootName' }),
  });

  const save = useMutation({
    mutationFn: ({ id, payload }) => financeApi.updateCommissionRule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setEditing(null);
      message.success('Rate updated');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        setEditing(null);
        message.info('Sent for approval. The rate changes once another approver agrees.');
        return;
      }
      if (e instanceof ApiError && e.isVersionConflict) {
        query.refetch();
        message.warning('Someone else changed this rate. Reloaded the current one.');
        return;
      }
      message.error(e.message);
    },
  });

  if (query.isLoading) return <FullPageSpinner label="Loading the rate card…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const rules = query.data.data;
  const { plans, fees } = query.data.meta;

  const columns = [
    { key: 'rootName', title: 'Category', dataIndex: 'rootName' },
    {
      key: 'band', title: 'Price band', dataIndex: 'band',
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag>,
    },
    {
      key: 'commissionPct', title: 'Commission', dataIndex: 'commissionPct', align: 'right',
      sorter: (a, b) => a.commissionPct - b.commissionPct,
      render: (v) => <Typography.Text strong className="tabular">{v}%</Typography.Text>,
    },
    {
      key: 'actions', title: '', align: 'right',
      render: (_v, row) => (
        <Can perm="finance.commission.edit">
          <Button
            size="small"
            onClick={() => {
              setEditing(row);
              setDraftPct(row.commissionPct);
            }}
          >
            Change
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Commission & fees"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Commission & fees' }]}
        subtitle="Rates are versioned and every change needs a second approver. Cheaper items carry a higher rate because the cost of handling them does not shrink with the price."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="Commission by category and price band" styles={{ body: { padding: 0 } }}>
            <Table
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={rules}
              pagination={{ pageSize: 12, size: 'small' }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Flex vertical gap={12}>
            <FeePreviewCard />

            <Card size="small" title="Platform fees">
              <Flex vertical gap={6}>
                <FeeLine label="Payment collection, prepaid" value={`${fees.collectionFeePrepaidPct}%`} />
                <FeeLine label="Payment collection, cash on delivery" value={`${fees.collectionFeeCodPct}%`} />
                <FeeLine label="Pick and pack (Fulfilled by Arise)" value={<MoneyText paise={fees.pickPackFeePaise} />} />
                <FeeLine label="GST on our fees" value={`${fees.gstOnFeesPct}%`} />
                <FeeLine label="TCS under GST s.52" value={`${fees.tcsPct}%`} />
                <FeeLine label="TDS under s.194-O" value={`${fees.tdsPct}%`} />
                <FeeLine label="Payout cycle" value={`${fees.payoutCycle.toLowerCase()}, ${fees.payoutDay.toLowerCase()}`} />
              </Flex>
              <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>
                Closing fees step up by item price: ₹5 under ₹300, ₹15 to ₹500, ₹30 to ₹1,000, ₹65 above.
              </Typography.Paragraph>
            </Card>

            <Card size="small" title="Rate plans">
              <Flex vertical gap={8}>
                {plans.map((plan) => (
                  <Flex key={plan.id} justify="space-between" align="baseline" gap={8}>
                    <Flex vertical gap={0} style={{ minWidth: 0 }}>
                      <Typography.Text strong style={{ fontSize: 13 }}>{plan.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>{plan.description}</Typography.Text>
                    </Flex>
                    <Tag color={plan.adjustmentPct ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
                      {plan.adjustmentPct ? `${plan.adjustmentPct}%` : 'standard'}
                    </Tag>
                  </Flex>
                ))}
              </Flex>
            </Card>
          </Flex>
        </Col>
      </Row>

      <ConfirmActionModal
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onConfirm={(values) =>
          save.mutate({
            id: editing.id,
            payload: { commissionPct: draftPct, reason: values.reason, version: editing.version },
          })
        }
        loading={save.isPending}
        needsApproval
        title={`Change commission for ${editing?.rootName}`}
        description={editing ? `${editing.band} · currently ${editing.commissionPct}%` : ''}
        impact={
          <span>
            Every live listing in {editing?.rootName} within this price band settles at the new rate
            from the moment it is approved. Settlements already calculated are not recomputed.
          </span>
        }
        reasonRequired
        reasonLabel="Why is the rate changing?"
        showNote={false}
        extraFields={
          <Flex vertical gap={4} style={{ marginBottom: 16 }}>
            <Typography.Text style={{ fontSize: 13 }}>New commission</Typography.Text>
            <InputNumber
              value={draftPct}
              onChange={(v) => setDraftPct(v ?? 0)}
              min={0}
              max={40}
              step={0.5}
              addonAfter="%"
              style={{ width: 160 }}
            />
          </Flex>
        }
      />
    </Flex>
  );
}

function FeeLine({ label, value }) {
  return (
    <Flex justify="space-between" align="baseline" gap={12}>
      <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
      <Typography.Text strong className="tabular" style={{ fontSize: 13 }}>{value}</Typography.Text>
    </Flex>
  );
}
