import { App, Button, Flex, Form, Select, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { logisticsApi, logisticsKeys } from '../api/logistics.api';
import { SHIPMENT_TABS, shipmentColumns } from '../shipmentColumns';

export default function ShipmentsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-promisedDate' });
  const [acting, setActing] = useState(null);
  const [courierId, setCourierId] = useState(null);

  const tabCodes = SHIPMENT_TABS.find((t) => t.key === state.tab)?.codes;
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: logisticsKeys.shipments({ ...state.queryParams, tab: state.tab }),
    url: '/shipments',
    params: {
      ...state.queryParams,
      ...(state.tab ? { status: (tabCodes ?? [state.tab]).join(',') } : {}),
    },
  });

  const couriers = useQuery({
    queryKey: logisticsKeys.couriers,
    queryFn: () => logisticsApi.couriers(),
  });

  const run = useMutation({
    mutationFn: ({ id, action, payload }) => logisticsApi.shipmentAction(id, action, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['logistics'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setActing(null);
      setCourierId(null);
      message.success(res.meta?.note ?? 'Shipment updated');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    ...shipmentColumns,
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Space size={4}>
          {!row.lastScanAt && row.awb && (
            <Button size="small" onClick={(e) => { e.stopPropagation(); setActing({ row, kind: 'reallocate' }); }}>
              Re-allocate
            </Button>
          )}
          {['SHIPPED', 'IN_TRANSIT'].includes(row.status) && (row.daysSinceScan ?? 0) >= 5 && (
            <Button size="small" danger onClick={(e) => { e.stopPropagation(); setActing({ row, kind: 'mark-lost' }); }}>
              Mark lost
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Shipments"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'Shipments' }]}
        subtitle="One parcel per seller per order. A parcel with no scan for five days is almost always lost."
      />

      <FilterBar
        schema={[
          { key: 'courierId', label: 'Courier', kind: 'entity', entity: 'courier', width: 180 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          {
            key: 'fulfillmentType', label: 'Fulfilment', kind: 'select', width: 160,
            options: [{ value: 'ARISE', label: 'By Arise' }, { value: 'SELLER', label: 'Seller' }],
          },
          { key: 'promisedBreached', label: 'Past promised date', kind: 'boolean' },
          { key: 'stuck', label: 'No scan for 5+ days', kind: 'boolean' },
        ]}
        tableState={state}
        searchPlaceholder="Search AWB, order, customer or seller"
      />

      <DataTable
        tableId="shipments"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={SHIPMENT_TABS}
        onExport={() => {}}
        exportPerm="logistics.shipment.export"
        emptyProps={{ title: 'No shipments match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.awb ?? row.id}</Typography.Text>
              <StatusTag domain="orderItem" code={row.status} />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sellerName} → {row.destinationCity}
            </Typography.Text>
            {row.courierName && <Tag style={{ marginInlineEnd: 0, width: 'fit-content' }}>{row.courierName}</Tag>}
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(acting)}
        onCancel={() => { setActing(null); setCourierId(null); }}
        onConfirm={(values) =>
          run.mutate({
            id: acting.row.id,
            action: acting.kind,
            payload: { reason: values.reason, courierId },
          })
        }
        loading={run.isPending}
        danger={acting?.kind === 'mark-lost'}
        title={
          acting?.kind === 'reallocate'
            ? 'Give this parcel to a different courier'
            : `Mark ${acting?.row?.awb} as lost?`
        }
        description={acting?.row?.firstItemName}
        impact={
          acting?.kind === 'reallocate'
            ? 'Only possible before pickup. A new AWB is issued with the new courier.'
            : 'The items are marked lost, a claim should be raised against the courier, and the seller reimbursed.'
        }
        reasonRequired={acting?.kind === 'mark-lost'}
        showNote={false}
        confirmLabel={acting?.kind === 'reallocate' ? 'Re-allocate' : 'Mark as lost'}
        extraFields={
          acting?.kind === 'reallocate' ? (
            <Form.Item label="New courier" required>
              <Select
                value={courierId}
                onChange={setCourierId}
                placeholder="Choose a courier"
                options={(couriers.data?.data ?? [])
                  .filter((c) => c.status === 'ACTIVE' && c.id !== acting?.row?.courierId)
                  .map((c) => ({ value: c.id, label: `${c.name} — ${c.onTimePct}% on time` }))}
              />
            </Form.Item>
          ) : null
        }
      />
    </Flex>
  );
}
