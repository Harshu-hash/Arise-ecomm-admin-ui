import { App, Button, DatePicker, Flex, Form, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { dayjs } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { logisticsApi, logisticsKeys } from '../api/logistics.api';

const STATUS_COLOR = {
  SCHEDULED: 'blue', PICKED_UP: 'green', PARTIALLY_PICKED: 'gold', MISSED: 'red',
};

export default function PickupsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-date' });
  const [rescheduling, setRescheduling] = useState(null);
  const [date, setDate] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: logisticsKeys.manifests({ ...state.queryParams, tab: state.tab }),
    url: '/manifests',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const reschedule = useMutation({
    mutationFn: ({ id, payload }) => logisticsApi.rescheduleManifest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics', 'manifests'] });
      setRescheduling(null);
      setDate(null);
      message.success('Pickup rescheduled');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'originName', title: 'Pick up from', dataIndex: 'originName', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.originCity}</Typography.Text>
          </div>
        </div>
      ),
    },
    { key: 'courierName', title: 'Courier', dataIndex: 'courierName', priority: 1 },
    {
      key: 'date', title: 'Date & slot', dataIndex: 'date', sorter: true, priority: 1,
      render: (v, row) => (
        <div>
          <DateText value={v} variant="date" />
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.slot}</Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'shipmentCount', title: 'Parcels', dataIndex: 'shipmentCount', sorter: true, align: 'right', priority: 1,
      render: (total, row) => (
        <Typography.Text className="tabular" type={row.pickedUpCount < total ? 'danger' : undefined}>
          {row.pickedUpCount} / {total}
        </Typography.Text>
      ),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => (
        <Tag color={STATUS_COLOR[v]} style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ').toLowerCase()}</Tag>
      ),
    },
    {
      key: 'attempts', title: 'Attempts', dataIndex: 'attempts', align: 'right', priority: 2,
      render: (v) => (
        <Typography.Text className="tabular" type={v > 1 ? 'warning' : undefined}>{v}</Typography.Text>
      ),
    },
    { key: 'vehicleNo', title: 'Vehicle', dataIndex: 'vehicleNo', priority: 3, render: (v) => v ?? '—' },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        row.status === 'PICKED_UP' ? null : (
          <Button size="small" onClick={(e) => { e.stopPropagation(); setRescheduling(row); }}>
            Reschedule
          </Button>
        ),
    },
  ];

  const missed = rows.filter((r) => r.status === 'MISSED').length;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Pickups & manifests"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'Pickups & manifests' }]}
        subtitle="A manifest is one courier collecting from one origin on one day. A missed pickup delays every parcel on it."
        meta={
          missed > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {missed} missed on this page
            </Typography.Text>
          )
        }
      />

      <FilterBar
        schema={[
          { key: 'courierId', label: 'Courier', kind: 'entity', entity: 'courier', width: 180 },
          { key: 'date', label: 'Date', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search origin, courier or manifest"
      />

      <DataTable
        tableId="manifests"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'SCHEDULED', label: 'Scheduled' },
          { key: 'PARTIALLY_PICKED', label: 'Partly collected' },
          { key: 'MISSED', label: 'Missed' },
          { key: 'PICKED_UP', label: 'Collected' },
        ]}
        emptyProps={{ title: 'No pickups scheduled' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.originName}</Typography.Text>
              <Tag color={STATUS_COLOR[row.status]} style={{ marginInlineEnd: 0 }}>
                {row.status.replace(/_/g, ' ').toLowerCase()}
              </Tag>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.courierName} · {row.pickedUpCount}/{row.shipmentCount} parcels
            </Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(rescheduling)}
        onCancel={() => { setRescheduling(null); setDate(null); }}
        onConfirm={(values) =>
          reschedule.mutate({
            id: rescheduling.id,
            payload: { date: date ? date.format('YYYY-MM-DD') : null, reason: values.reason },
          })
        }
        loading={reschedule.isPending}
        title={`Reschedule the pickup from ${rescheduling?.originName}?`}
        impact={
          <span>
            {rescheduling?.shipmentCount} parcel{rescheduling?.shipmentCount === 1 ? '' : 's'} are
            waiting. Each repeat attempt counts against the courier&apos;s pickup success rate.
          </span>
        }
        reasonRequired={false}
        reasonLabel="Note (optional)"
        showNote={false}
        confirmLabel="Reschedule"
        extraFields={
          <Form.Item
            label="New date"
            required
            validateStatus={date ? undefined : 'error'}
            help={date ? undefined : 'Pick a date.'}
          >
            <DatePicker
              style={{ width: '100%' }}
              value={date}
              onChange={setDate}
              disabledDate={(d) => d && d < dayjs().startOf('day')}
            />
          </Form.Item>
        }
      />
    </Flex>
  );
}
