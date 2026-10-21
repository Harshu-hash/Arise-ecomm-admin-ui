import { App, Card, Col, DatePicker, Flex, Form, Row, Statistic, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { dayjs, slaCountdown } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { logisticsApi, logisticsKeys } from '../api/logistics.api';

const REASONS = [
  'Customer unavailable', 'Address incomplete', 'Customer refused',
  'COD amount not ready', 'Rescheduled by customer', 'Phone unreachable',
  'Out of delivery area',
];

/**
 * The daily NDR queue. This is high-volume work, so the bulk action bar is the
 * primary interface and the per-row buttons are the exception.
 */
export default function NdrPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'actionDueAt' });
  const [action, setAction] = useState(null);
  const [reattemptDate, setReattemptDate] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: logisticsKeys.ndr({ ...state.queryParams, tab: state.tab }),
    url: '/ndr',
    params: { ...state.queryParams, ...(state.tab === 'overdue' ? { overdue: 'true' } : state.tab ? { status: state.tab } : {}) },
  });

  const run = useMutation({
    mutationFn: (payload) => logisticsApi.ndrAction(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['logistics'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setAction(null);
      setReattemptDate(null);
      const failed = res.data.results.filter((r) => !r.ok);
      if (failed.length) {
        message.warning(`${res.data.succeeded} done, ${failed.length} could not be actioned: ${failed[0].error}`);
      } else {
        message.success(`${res.data.succeeded} NDR${res.data.succeeded === 1 ? '' : 's'} actioned`);
      }
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'awb', title: 'AWB', dataIndex: 'awb', alwaysVisible: true,
      render: (awb, row) => (
        <div style={{ minWidth: 0 }}>
          <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{awb}</Typography.Text>
          <div>
            <Link to={`/orders/${row.orderId}`}>
              <Typography.Text className="mono" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
            </Link>
          </div>
        </div>
      ),
    },
    {
      key: 'customerName', title: 'Customer', dataIndex: 'customerName', priority: 1,
      render: (name, row) => (
        <div style={{ minWidth: 0 }}>
          <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
          <div>
            <MaskedValue value={row.customerPhone} kind="phone" entityType="order" entityId={row.orderId} />
          </div>
        </div>
      ),
    },
    {
      key: 'city', title: 'Destination', dataIndex: 'city', priority: 2,
      render: (city, row) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{city} · {row.pincode}</Typography.Text>
      ),
    },
    { key: 'reason', title: 'Why it failed', dataIndex: 'reason', priority: 1 },
    {
      key: 'attempt', title: 'Attempt', dataIndex: 'attempt', sorter: true, align: 'right', priority: 1,
      render: (v) => (
        <Tag color={v >= 3 ? 'red' : v === 2 ? 'gold' : undefined} style={{ marginInlineEnd: 0 }}>
          {v} of 3
        </Tag>
      ),
    },
    {
      key: 'codAmountPaise', title: 'COD', dataIndex: 'codAmountPaise', sorter: true, align: 'right', priority: 2,
      render: (v) => (v ? <MoneyText paise={v} strong /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'customerResponse', title: 'Customer said', dataIndex: 'customerResponse', priority: 3,
      render: (v) => v ?? <Typography.Text type="secondary" style={{ fontSize: 12 }}>No response</Typography.Text>,
    },
    { key: 'courierName', title: 'Courier', dataIndex: 'courierName', priority: 3 },
    {
      key: 'actionDueAt', title: 'Action due', dataIndex: 'actionDueAt', sorter: true, priority: 1,
      render: (v, row) => {
        if (row.status !== 'OPEN') return <Typography.Text type="secondary">—</Typography.Text>;
        const { label, overdue } = slaCountdown(v);
        return (
          <Typography.Text type={overdue ? 'danger' : undefined} strong={overdue} style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
        );
      },
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 2,
      render: (v) => (
        <Tag color={v === 'OPEN' ? 'gold' : v === 'RTO' ? 'red' : 'blue'} style={{ marginInlineEnd: 0 }}>
          {v.replace(/_/g, ' ').toLowerCase()}
        </Tag>
      ),
    },
  ];

  const byReason = meta?.byReason ?? {};
  const topReasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="NDR — failed deliveries"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'NDR' }]}
        subtitle="Every row is a customer who did not get their parcel. Couriers hold it 24 hours before they need an answer."
      />

      <Row gutter={[12, 12]}>
        {topReasons.map(([reason, count]) => (
          <Col key={reason} xs={12} md={6}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{reason}</Typography.Text>}
                value={count}
                valueStyle={{ fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <FilterBar
        schema={[
          { key: 'reason', label: 'Reason', kind: 'multiSelect', options: REASONS.map((r) => ({ value: r, label: r })), width: 230 },
          { key: 'courierId', label: 'Courier', kind: 'entity', entity: 'courier', width: 180 },
          {
            key: 'attempt', label: 'Attempt', kind: 'select', width: 140,
            options: [1, 2, 3].map((n) => ({ value: String(n), label: `Attempt ${n}` })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search AWB, order, customer or pincode"
      />

      <DataTable
        tableId="ndr"
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
          { key: 'overdue', label: 'Past deadline' },
          { key: 'REATTEMPT_SCHEDULED', label: 'Reattempting' },
          { key: 'RTO', label: 'Returned' },
        ]}
        selection={{ getCheckboxProps: (row) => ({ disabled: row.status !== 'OPEN' }) }}
        bulkActions={[
          {
            key: 'reattempt',
            label: 'Reattempt delivery',
            perm: 'logistics.ndr.action',
            onClick: ({ selectedKeys }) => setAction({ kind: 'REATTEMPT', ids: selectedKeys }),
          },
          {
            key: 'rto',
            label: 'Send back to origin',
            danger: true,
            perm: 'logistics.ndr.action',
            onClick: ({ selectedKeys }) => setAction({ kind: 'RTO', ids: selectedKeys }),
          },
        ]}
        onExport={() => {}}
        exportPerm="logistics.ndr.export"
        emptyProps={{ title: 'No failed deliveries', description: 'Parcels the courier could not deliver appear here.' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.awb}</Typography.Text>
              <Tag color={row.attempt >= 3 ? 'red' : 'gold'} style={{ marginInlineEnd: 0 }}>Attempt {row.attempt}</Tag>
            </Flex>
            <Typography.Text style={{ fontSize: 13 }}>{row.reason}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.customerName} · {row.city}
            </Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(action)}
        onCancel={() => { setAction(null); setReattemptDate(null); }}
        onConfirm={(values) =>
          run.mutate({
            ids: action.ids,
            action: action.kind,
            reason: values.reason,
            reattemptDate: reattemptDate ? reattemptDate.format('YYYY-MM-DD') : null,
          })
        }
        loading={run.isPending}
        danger={action?.kind === 'RTO'}
        title={
          action?.kind === 'REATTEMPT'
            ? `Reattempt delivery for ${action?.ids?.length} parcel${action?.ids?.length === 1 ? '' : 's'}?`
            : `Send ${action?.ids?.length} parcel${action?.ids?.length === 1 ? '' : 's'} back to origin?`
        }
        impact={
          action?.kind === 'REATTEMPT'
            ? 'The courier tries again. Parcels already on their third attempt are skipped and reported back to you.'
            : 'Delivery is abandoned. The parcel returns to the seller, who pays the return freight, and any prepaid amount is refunded.'
        }
        reasonRequired={action?.kind === 'RTO'}
        reasonLabel={action?.kind === 'RTO' ? 'Why are you giving up on delivery?' : 'Note (optional)'}
        showNote={false}
        confirmLabel={action?.kind === 'REATTEMPT' ? 'Schedule reattempt' : 'Return to origin'}
        extraFields={
          action?.kind === 'REATTEMPT' ? (
            <Form.Item label="Reattempt on" extra="Leave empty for the courier's next available run.">
              <DatePicker
                style={{ width: '100%' }}
                value={reattemptDate}
                onChange={setReattemptDate}
                disabledDate={(d) => d && d < dayjs().startOf('day')}
              />
            </Form.Item>
          ) : null
        }
      />
    </Flex>
  );
}
