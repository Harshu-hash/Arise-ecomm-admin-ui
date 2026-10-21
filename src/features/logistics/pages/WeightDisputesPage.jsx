import { App, Button, Checkbox, Flex, Form, Select, Space, Tag, Typography } from 'antd';
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
import { logisticsApi, logisticsKeys } from '../api/logistics.api';

const STATUS_COLOR = {
  RAISED_BY_COURIER: 'gold', SELLER_NOTIFIED: 'blue', DISPUTED_BY_SELLER: 'purple',
  ACCEPTED: 'red', REJECTED: 'green', AUTO_ACCEPTED: 'default',
};

/**
 * Couriers bill on the weight they measure, not the weight the seller
 * declared. Each dispute is a small amount, but they recur on every shipment
 * of the same SKU until the master data is corrected.
 */
export default function WeightDisputesPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-raisedAt' });
  const [deciding, setDeciding] = useState(null);
  const [decision, setDecision] = useState('ACCEPTED');
  const [updateSku, setUpdateSku] = useState(true);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: logisticsKeys.weight({ ...state.queryParams, tab: state.tab }),
    url: '/weight-disputes',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const decide = useMutation({
    mutationFn: ({ id, payload }) => logisticsApi.decideWeightDispute(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      setDeciding(null);
      message.success('Dispute decided');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'awb', title: 'Shipment', dataIndex: 'awb', alwaysVisible: true,
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
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', priority: 1,
      render: (name, row) => (
        <Link to={`/sellers/${row.sellerId}`}>
          <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
        </Link>
      ),
    },
    {
      key: 'sku', title: 'SKU', dataIndex: 'sku', priority: 2,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v ?? '—'}</Typography.Text>,
    },
    {
      key: 'weights', title: 'Declared vs charged', priority: 1,
      render: (_v, row) => (
        <Space size={6}>
          <Typography.Text className="tabular" style={{ fontSize: 12 }}>{row.declaredWeightG} g</Typography.Text>
          <Typography.Text type="secondary">→</Typography.Text>
          <Typography.Text className="tabular" strong type="danger" style={{ fontSize: 12 }}>
            {row.chargedWeightG} g
          </Typography.Text>
          <Tag color="red" style={{ marginInlineEnd: 0 }}>+{row.differenceG} g</Tag>
        </Space>
      ),
    },
    {
      key: 'extraChargePaise', title: 'Extra charge', dataIndex: 'extraChargePaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    { key: 'courierName', title: 'Courier', dataIndex: 'courierName', priority: 2 },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 1,
      render: (v) => (
        <Tag color={STATUS_COLOR[v]} style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ').toLowerCase()}</Tag>
      ),
    },
    {
      key: 'respondByAt', title: 'Respond by', dataIndex: 'respondByAt', sorter: true, priority: 2,
      render: (v, row) =>
        ['ACCEPTED', 'REJECTED', 'AUTO_ACCEPTED'].includes(row.status)
          ? <Typography.Text type="secondary">—</Typography.Text>
          : <DateText value={v} variant="date" />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['ACCEPTED', 'REJECTED', 'AUTO_ACCEPTED'].includes(row.status) ? null : (
          <Button size="small" onClick={(e) => { e.stopPropagation(); setDeciding(row); setDecision('ACCEPTED'); setUpdateSku(true); }}>
            Decide
          </Button>
        ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Weight disputes"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'Weight disputes' }]}
        subtitle="Accepting a dispute usually means the SKU's recorded weight is wrong. Correcting it stops the charge recurring."
      />

      <FilterBar
        schema={[
          { key: 'courierId', label: 'Courier', kind: 'entity', entity: 'courier', width: 180 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
        ]}
        tableState={state}
        searchPlaceholder="Search AWB, order, seller or SKU"
      />

      <DataTable
        tableId="weightDisputes"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'RAISED_BY_COURIER', label: 'New' },
          { key: 'SELLER_NOTIFIED', label: 'Seller notified' },
          { key: 'DISPUTED_BY_SELLER', label: 'Seller disputes' },
          { key: 'ACCEPTED', label: 'Accepted' },
          { key: 'REJECTED', label: 'Rejected' },
        ]}
        emptyProps={{ title: 'No weight disputes' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.awb}</Typography.Text>
              <MoneyText paise={row.extraChargePaise} strong />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.declaredWeightG} g → {row.chargedWeightG} g · {row.sellerName}
            </Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(deciding)}
        onCancel={() => setDeciding(null)}
        onConfirm={(values) =>
          decide.mutate({
            id: deciding.id,
            payload: { decision, reason: values.reason, updateSkuWeight: decision === 'ACCEPTED' && updateSku },
          })
        }
        loading={decide.isPending}
        danger={decision === 'ACCEPTED'}
        title={`Decide this ${deciding?.differenceG} g dispute`}
        description={`${deciding?.sellerName} · ${deciding?.sku ?? deciding?.awb}`}
        impact={
          decision === 'ACCEPTED' ? (
            <span>
              The seller is charged <MoneyText paise={deciding?.extraChargePaise ?? 0} strong /> on
              their next payout.
            </span>
          ) : (
            'The courier’s charge is reversed and the seller pays nothing.'
          )
        }
        reasonRequired
        reasonLabel="What does the evidence show?"
        showNote={false}
        confirmLabel="Record decision"
        extraFields={
          <>
            <Form.Item label="Decision" required>
              <Select
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'ACCEPTED', label: 'Accept — the courier’s weight is right' },
                  { value: 'REJECTED', label: 'Reject — the seller’s declared weight is right' },
                ]}
              />
            </Form.Item>
            {decision === 'ACCEPTED' && (
              <Form.Item extra="Without this, the same dispute recurs on every future shipment of this SKU.">
                <Checkbox checked={updateSku} onChange={(e) => setUpdateSku(e.target.checked)}>
                  Correct the SKU&apos;s recorded weight to {deciding?.chargedWeightG} g
                </Checkbox>
              </Form.Item>
            )}
          </>
        }
      />
    </Flex>
  );
}
