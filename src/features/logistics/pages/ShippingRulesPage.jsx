import { App, Alert, Button, Card, Col, Descriptions, Flex, Form, InputNumber, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { formatINR } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { logisticsApi, logisticsKeys } from '../api/logistics.api';

/**
 * Two different things live here, and conflating them is a common mistake:
 * allocation rules decide which courier carries a parcel (our cost), while
 * the fee rules decide what the customer pays for delivery.
 */
export default function ShippingRulesPage() {
  const { message } = App.useApp();
  const [sim, setSim] = useState({ pincode: '', weightG: 500, paymentMode: 'PREPAID' });
  const [simResult, setSimResult] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: logisticsKeys.rules,
    queryFn: () => logisticsApi.rules(),
  });

  const simulate = useMutation({
    mutationFn: (payload) => logisticsApi.simulate(payload),
    onSuccess: (res) => setSimResult(res.data),
    onError: (e) => message.error(e.message),
  });

  const saveFee = useMutation({
    mutationFn: ({ id, payload }) => logisticsApi.updateFeeRule(id, payload),
    onSuccess: () => {
      setEditing(null);
      message.info('Sent for approval — customer-facing fees need a second approver.');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        setEditing(null);
        message.info('Sent for approval — customer-facing fees need a second approver.');
        return;
      }
      message.error(e.message);
    },
  });

  if (isLoading) return <FullPageSpinner label="Loading rules…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load shipping rules" />;

  const { allocation, customerFees } = data.data;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Shipping rules"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'Shipping rules' }]}
        subtitle="Allocation decides which courier we use. Fee rules decide what the customer pays."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={14}>
          <Card size="small" title="Courier allocation">
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              The first matching rule wins, in priority order. Splitting across two couriers means a
              single outage does not stop dispatch.
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={allocation}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '#', dataIndex: 'priority', width: 50 },
                { title: 'Rule', dataIndex: 'name' },
                {
                  title: 'When',
                  dataIndex: 'conditions',
                  render: (c) => {
                    const parts = [];
                    if (c.zone) parts.push(`zone ${c.zone.toLowerCase()}`);
                    if (c.paymentMode) parts.push(c.paymentMode.toLowerCase());
                    if (c.maxWeightG) parts.push(`under ${c.maxWeightG} g`);
                    if (c.minWeightG) parts.push(`over ${c.minWeightG} g`);
                    return (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {parts.length ? parts.join(' · ') : 'anything not matched above'}
                      </Typography.Text>
                    );
                  },
                },
                {
                  title: 'Split',
                  dataIndex: 'courierSplit',
                  render: (split) => (
                    <Space size={4} wrap>
                      {split.map((s) => (
                        <Tag key={s.courierId} style={{ marginInlineEnd: 0 }}>
                          {s.courierName} {s.sharePct}%
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>

          <Card size="small" title="What the customer pays" style={{ marginTop: 12 }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={customerFees}
              columns={[
                { title: 'Rule', dataIndex: 'name' },
                {
                  title: 'Free above', dataIndex: 'freeAbovePaise', align: 'right',
                  render: (v) => <span className="tabular">{formatINR(v)}</span>,
                },
                {
                  title: 'Otherwise', dataIndex: 'feePaise', align: 'right',
                  render: (v) => <span className="tabular">{formatINR(v)}</span>,
                },
                {
                  title: '', align: 'right',
                  render: (_v, row) => (
                    <Button
                      size="small"
                      onClick={() => {
                        setEditing(row);
                        setDraft({ freeAbovePaise: row.freeAbovePaise / 100, feePaise: row.feePaise / 100 });
                      }}
                    >
                      Edit
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card size="small" title="Which courier would carry this?">
            <Flex vertical gap={10}>
              <Form.Item label="Destination pincode" style={{ marginBottom: 0 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  controls={false}
                  maxLength={6}
                  value={sim.pincode}
                  onChange={(v) => setSim((s) => ({ ...s, pincode: v }))}
                  placeholder="400072"
                />
              </Form.Item>
              <Form.Item label="Weight" style={{ marginBottom: 0 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  addonAfter="g"
                  min={1}
                  value={sim.weightG}
                  onChange={(v) => setSim((s) => ({ ...s, weightG: v }))}
                />
              </Form.Item>
              <Form.Item label="Payment" style={{ marginBottom: 0 }}>
                <Select
                  value={sim.paymentMode}
                  onChange={(v) => setSim((s) => ({ ...s, paymentMode: v }))}
                  options={[{ value: 'PREPAID', label: 'Prepaid' }, { value: 'COD', label: 'Cash on delivery' }]}
                />
              </Form.Item>
              <Button
                type="primary"
                loading={simulate.isPending}
                onClick={() => simulate.mutate({ ...sim, pincode: String(sim.pincode ?? '') })}
              >
                Simulate
              </Button>

              {simResult && (
                <Descriptions column={1} size="small" bordered style={{ marginTop: 6 }}>
                  <Descriptions.Item label="Zone">{simResult.zone}</Descriptions.Item>
                  <Descriptions.Item label="Rule that wins">
                    {simResult.matchedRule?.name ?? 'None matched'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Couriers">
                    <Space size={4} wrap>
                      {simResult.courierSplit.map((s) => (
                        <Tag key={s.courierId} style={{ marginInlineEnd: 0 }}>
                          {s.courierName} {s.sharePct}%
                        </Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="Delivery promise">{simResult.tatDays} days</Descriptions.Item>
                  <Descriptions.Item label="COD">
                    {simResult.codAvailable ? 'Available' : 'Not available here'}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Flex>
          </Card>
        </Col>
      </Row>

      <ConfirmActionModal
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onConfirm={(values) =>
          saveFee.mutate({
            id: editing.id,
            payload: {
              freeAbovePaise: Math.round((draft.freeAbovePaise ?? 0) * 100),
              feePaise: Math.round((draft.feePaise ?? 0) * 100),
              reason: values.reason,
            },
          })
        }
        loading={saveFee.isPending}
        needsApproval
        title={`Change "${editing?.name}"`}
        impact="This changes what every customer pays for delivery, so it needs a second approver before it takes effect."
        reasonRequired
        reasonLabel="Why is this changing?"
        showNote={false}
        confirmLabel="Send for approval"
        extraFields={
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="Raising the free-delivery threshold reliably increases cart abandonment"
            />
            <Form.Item label="Free delivery above">
              <InputNumber
                style={{ width: '100%' }}
                prefix="₹"
                min={0}
                value={draft.freeAbovePaise}
                onChange={(v) => setDraft((d) => ({ ...d, freeAbovePaise: v }))}
              />
            </Form.Item>
            <Form.Item label="Otherwise charge">
              <InputNumber
                style={{ width: '100%' }}
                prefix="₹"
                min={0}
                value={draft.feePaise}
                onChange={(v) => setDraft((d) => ({ ...d, feePaise: v }))}
              />
            </Form.Item>
          </>
        }
      />
    </Flex>
  );
}
