import { App, Button, Col, Flex, Form, Input, Row, Select, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { customerKeys, customersApi } from '@features/orders/api/orders.api';
import RiskReferenceCards from '../components/RiskReferenceCards';

const BLOCK_KINDS = [
  { value: 'PHONE', label: 'Phone number' },
  { value: 'EMAIL', label: 'Email address' },
  { value: 'DEVICE', label: 'Device ID' },
  { value: 'PINCODE_COD', label: 'Pincode (COD only)' },
];

export default function FraudRiskPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-flaggedAt' });
  const [deciding, setDeciding] = useState(null);
  const [decision, setDecision] = useState('CLEARED');
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockForm] = Form.useForm();

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: customerKeys.risk({ ...state.queryParams, tab: state.tab }),
    url: '/customers/risk',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const decide = useMutation({
    mutationFn: ({ flagId, payload }) => customersApi.decideFlag(flagId, payload),
    onSuccess: (_r, variables) => {
      invalidate();
      setDeciding(null);
      message.success(
        variables.payload.decision === 'CONFIRMED_FRAUD'
          ? 'Confirmed as fraud — the account has been blocked.'
          : 'Flag cleared',
      );
    },
    onError: (e) => message.error(e.message),
  });

  const addBlock = useMutation({
    mutationFn: (values) => customersApi.addBlocklist(values),
    onSuccess: () => {
      invalidate();
      setBlockOpen(false);
      blockForm.resetFields();
      message.success('Added to the blocklist');
    },
    onError: (e) => {
      if (e.fieldErrors) {
        blockForm.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
        return;
      }
      message.error(e.message);
    },
  });

  const columns = [
    {
      key: 'entityLabel', title: 'Flagged', dataIndex: 'entityLabel', alwaysVisible: true,
      render: (name, row) => (
        <Link to={`/customers/${row.entityId}`}>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
        </Link>
      ),
    },
    { key: 'ruleName', title: 'Rule', dataIndex: 'ruleName', priority: 1 },
    {
      key: 'score', title: 'Score', dataIndex: 'score', sorter: true, align: 'right', priority: 1,
      render: (v) => (
        <Typography.Text className="tabular" type={v >= 80 ? 'danger' : undefined} strong={v >= 80}>{v}</Typography.Text>
      ),
    },
    { key: 'flaggedAt', title: 'Flagged', dataIndex: 'flaggedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} /> },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => (
        <Tag color={v === 'CONFIRMED_FRAUD' ? 'red' : v === 'CLEARED' ? 'green' : 'gold'} style={{ marginInlineEnd: 0 }}>
          {v.replace(/_/g, ' ').toLowerCase()}
        </Tag>
      ),
    },
    { key: 'reviewerName', title: 'Reviewed by', dataIndex: 'reviewerName', priority: 3, render: (v) => v ?? '—' },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        row.status === 'OPEN' ? (
          <Button size="small" onClick={(e) => { e.stopPropagation(); setDeciding(row); setDecision('CLEARED'); }}>
            Review
          </Button>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Fraud & risk"
        breadcrumbs={[{ label: 'Customers' }, { label: 'Fraud & risk' }]}
        subtitle="Accounts the risk rules have flagged, and the blocklists that stop them coming back."
        actions={<Button onClick={() => setBlockOpen(true)}>Add to blocklist</Button>}
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={14}>
          <FilterBar
            schema={[{ key: 'flaggedAt', label: 'Flagged', kind: 'dateRange' }]}
            tableState={state}
            searchPlaceholder="Search customer or rule"
          />
          <DataTable
            tableId="riskFlags"
            columns={columns}
            rows={rows}
            meta={meta}
            loading={loading || fetching}
            error={error}
            onRetry={refetch}
            tableState={state}
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'OPEN', label: 'Open' },
              { key: 'CLEARED', label: 'Cleared' },
              { key: 'CONFIRMED_FRAUD', label: 'Confirmed fraud' },
            ]}
            emptyProps={{ title: 'Nothing flagged' }}
            mobileCard={(row) => (
              <Flex vertical gap={4}>
                <Typography.Text strong>{row.entityLabel}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.ruleName}</Typography.Text>
              </Flex>
            )}
          />
        </Col>

        <Col xs={24} xl={10}>
          <Flex vertical gap={12}>
            <RiskReferenceCards rules={meta?.rules} blocklist={meta?.blocklist} />
          </Flex>
        </Col>
      </Row>

      <ConfirmActionModal
        open={Boolean(deciding)}
        onCancel={() => setDeciding(null)}
        onConfirm={(values) =>
          decide.mutate({ flagId: deciding.id, payload: { decision, reason: values.reason } })
        }
        loading={decide.isPending}
        danger={decision === 'CONFIRMED_FRAUD'}
        title={`Review: ${deciding?.ruleName}`}
        description={deciding?.entityLabel}
        impact={
          decision === 'CONFIRMED_FRAUD'
            ? 'The account is blocked immediately and cannot place further orders.'
            : 'The flag is closed and the customer carries on unaffected.'
        }
        reasonRequired
        reasonLabel="What did you find?"
        showNote={false}
        confirmLabel="Record decision"
        extraFields={
          <Form.Item label="Decision" required>
            <Select
              value={decision}
              onChange={setDecision}
              options={[
                { value: 'CLEARED', label: 'Clear — no fraud found' },
                { value: 'CONFIRMED_FRAUD', label: 'Confirm fraud and block the account' },
              ]}
            />
          </Form.Item>
        }
      />

      <ConfirmActionModal
        open={blockOpen}
        onCancel={() => setBlockOpen(false)}
        onConfirm={(values) =>
          addBlock.mutate({
            kind: blockForm.getFieldValue('kind'),
            value: blockForm.getFieldValue('value'),
            reason: values.reason,
          })
        }
        loading={addBlock.isPending}
        danger
        title="Add to the blocklist"
        impact="Anyone using this detail is stopped at checkout or sign-up. Keep it specific — blocking a whole pincode affects every customer there."
        reasonRequired
        reasonLabel="Why is this being blocked?"
        showNote={false}
        confirmLabel="Add to blocklist"
        extraFields={
          <Form form={blockForm} layout="vertical" requiredMark={false}>
            <Form.Item name="kind" label="Type" rules={[{ required: true, message: 'Pick a type.' }]}>
              <Select options={BLOCK_KINDS} placeholder="Choose" />
            </Form.Item>
            <Form.Item name="value" label="Value" rules={[{ required: true, message: 'Enter the value.' }]}>
              <Input placeholder="e.g. 9876500001" />
            </Form.Item>
          </Form>
        }
      />
    </Flex>
  );
}
