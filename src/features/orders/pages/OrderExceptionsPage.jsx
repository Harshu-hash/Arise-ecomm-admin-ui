import { App, Button, Flex, Form, Select, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { orderKeys, ordersApi } from '../api/orders.api';

const TYPES = [
  { value: 'PAYMENT_NO_ORDER', label: 'Payment but no order' },
  { value: 'ORDER_PAYMENT_FAILED', label: 'Order but payment failed' },
  { value: 'NOT_ACCEPTED_SLA', label: 'Not accepted past SLA' },
  { value: 'NOT_DISPATCHED_SLA', label: 'Not dispatched past SLA' },
  { value: 'STUCK_IN_TRANSIT', label: 'Stuck in transit' },
  { value: 'LOST_IN_TRANSIT', label: 'Lost in transit' },
  { value: 'DELIVERED_DISPUTED', label: 'Delivery disputed' },
  { value: 'REFUND_FAILED', label: 'Refund failed' },
  { value: 'DUPLICATE_PAYMENT', label: 'Duplicate payment' },
];

/** What a resolution actually was — needed to spot recurring causes. */
const RESOLUTIONS = [
  { value: 'MANUAL_CORRECTION', label: 'Corrected manually' },
  { value: 'REFUNDED', label: 'Refunded the customer' },
  { value: 'REDELIVERED', label: 'Re-shipped or re-attempted' },
  { value: 'COURIER_CLAIM', label: 'Claimed from the courier' },
  { value: 'SELLER_PENALISED', label: 'Penalised the seller' },
  { value: 'NO_ACTION_NEEDED', label: 'No action needed' },
];

export default function OrderExceptionsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'openedAt' });
  const [resolving, setResolving] = useState(null);
  const [code, setCode] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: orderKeys.exceptions({ ...state.queryParams, tab: state.tab }),
    url: '/orders/exceptions',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['orders', 'exceptions'] });

  const assign = useMutation({
    mutationFn: (rowId) => ordersApi.assignException(rowId),
    onSuccess: () => {
      invalidate();
      message.success('Assigned to you');
    },
    onError: (e) => message.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: ({ rowId, payload }) => ordersApi.resolveException(rowId, payload),
    onSuccess: () => {
      invalidate();
      setResolving(null);
      setCode(null);
      message.success('Exception resolved');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'typeLabel', title: 'Problem', dataIndex: 'typeLabel', alwaysVisible: true,
      render: (label, row) => (
        <div style={{ minWidth: 0 }}>
          <Space size={6}>
            <Typography.Text strong style={{ fontSize: 13 }}>{label}</Typography.Text>
            {row.priority === 'HIGH' && <Tag color="red" style={{ marginInlineEnd: 0 }}>High</Tag>}
          </Space>
          <div>
            <Link to={`/orders/${row.orderId}`}>
              <Typography.Text className="mono" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
            </Link>
          </div>
        </div>
      ),
    },
    { key: 'customerName', title: 'Customer', dataIndex: 'customerName', priority: 2 },
    {
      key: 'amountPaise', title: 'At stake', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'ageHours', title: 'Open for', dataIndex: 'ageHours', sorter: true, align: 'right', priority: 1,
      render: (v) => (
        <Typography.Text className="tabular" type={v > 48 ? 'danger' : v > 24 ? 'warning' : undefined}>
          {v < 24 ? `${v}h` : `${Math.floor(v / 24)}d`}
        </Typography.Text>
      ),
    },
    {
      key: 'ownerName', title: 'Owner', dataIndex: 'ownerName', priority: 2,
      render: (v) => v ?? <Typography.Text type="secondary" style={{ fontSize: 12 }}>Unassigned</Typography.Text>,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => (
        <Tag color={v === 'RESOLVED' ? 'green' : v === 'IN_PROGRESS' ? 'blue' : 'gold'} style={{ marginInlineEnd: 0 }}>
          {v.replace(/_/g, ' ').toLowerCase()}
        </Tag>
      ),
    },
    { key: 'openedAt', title: 'Opened', dataIndex: 'openedAt', sorter: true, priority: 3, render: (v) => <DateText value={v} /> },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        row.status === 'RESOLVED' ? null : (
          <Space size={4}>
            {!row.ownerName && (
              <Button size="small" onClick={(e) => { e.stopPropagation(); assign.mutate(row.id); }}>
                Take
              </Button>
            )}
            <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); setResolving(row); }}>
              Resolve
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Order exceptions"
        breadcrumbs={[{ label: 'Orders' }, { label: 'Order exceptions' }]}
        subtitle="Orders that are stuck and will not resolve themselves. Every one has a customer waiting."
      />

      <FilterBar
        schema={[
          { key: 'type', label: 'Problem', kind: 'multiSelect', options: TYPES, width: 230 },
          {
            key: 'priority', label: 'Priority', kind: 'select', width: 140,
            options: [{ value: 'HIGH', label: 'High' }, { value: 'NORMAL', label: 'Normal' }],
          },
          { key: 'openedAt', label: 'Opened', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search order, customer or problem"
      />

      <DataTable
        tableId="orderExceptions"
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
          { key: 'IN_PROGRESS', label: 'In progress' },
          { key: 'RESOLVED', label: 'Resolved' },
        ]}
        emptyProps={{ title: 'Nothing stuck', description: 'Orders that fall out of the normal flow land here.' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text strong>{row.typeLabel}</Typography.Text>
            <Typography.Text className="mono" type="secondary" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
            <Space size={8}>
              <MoneyText paise={row.amountPaise} strong />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>open {row.ageHours}h</Typography.Text>
            </Space>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(resolving)}
        onCancel={() => { setResolving(null); setCode(null); }}
        onConfirm={(values) =>
          resolve.mutate({ rowId: resolving.id, payload: { resolutionCode: code, note: values.reason } })
        }
        loading={resolve.isPending}
        title={`Resolve: ${resolving?.typeLabel}`}
        description={resolving?.orderId}
        impact="Recording how it was resolved is what lets us spot recurring causes rather than firefighting each one."
        reasonRequired={false}
        reasonLabel="What did you do? (optional)"
        showNote={false}
        confirmLabel="Mark resolved"
        extraFields={
          <Form.Item
            label="How was it resolved?"
            required
            validateStatus={code ? undefined : 'error'}
            help={code ? undefined : 'Pick one.'}
          >
            <Select value={code} onChange={setCode} options={RESOLUTIONS} placeholder="Choose" />
          </Form.Item>
        }
      />
    </Flex>
  );
}
