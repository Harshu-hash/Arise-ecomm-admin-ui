import { Alert, App, Button, Flex, Form, InputNumber, Select, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import EntitySelect from '@shared/components/EntitySelect';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { warehouseApi, warehouseKeys } from '@features/logistics/api/logistics.api';

const REASONS = [
  { value: 'CYCLE_COUNT', label: 'Cycle count variance', from: 'sellable', to: null },
  { value: 'DAMAGED_IN_WAREHOUSE', label: 'Damaged in the warehouse', from: 'sellable', to: 'unsellable' },
  { value: 'FOUND', label: 'Found during a count', from: null, to: 'sellable' },
  { value: 'EXPIRED', label: 'Past its expiry date', from: 'sellable', to: 'unsellable' },
  { value: 'MISPICK', label: 'Picked against the wrong order', from: 'sellable', to: null },
];

export default function StockAdjustmentsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ reasonCode: 'DAMAGED_IN_WAREHOUSE' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: warehouseKeys.adjustments({ ...state.queryParams, tab: state.tab }),
    url: '/stock-adjustments',
    params: { ...state.queryParams, ...(state.tab ? { reasonCode: state.tab } : {}) },
  });

  const create = useMutation({
    mutationFn: (payload) => warehouseApi.createAdjustment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      setOpen(false);
      setDraft({ reasonCode: 'DAMAGED_IN_WAREHOUSE' });
      message.success('Adjustment applied and a claim raised for the seller');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        setOpen(false);
        message.info('Sent for approval — write-offs above 25 units need a second approver.');
        return;
      }
      if (e.fieldErrors) {
        message.error(Object.values(e.fieldErrors)[0]);
        return;
      }
      message.error(e.message);
    },
  });

  const columns = [
    {
      key: 'sku', title: 'SKU', dataIndex: 'sku', alwaysVisible: true,
      render: (sku, row) => (
        <div style={{ minWidth: 0, maxWidth: 220 }}>
          <Typography.Text className="mono" style={{ fontSize: 11 }}>{sku}</Typography.Text>
          <div>
            <Typography.Text style={{ fontSize: 12 }} ellipsis>{row.productTitle}</Typography.Text>
          </div>
        </div>
      ),
    },
    { key: 'warehouseCode', title: 'Site', dataIndex: 'warehouseCode', priority: 1 },
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', priority: 2,
      render: (name, row) => <Link to={`/sellers/${row.sellerId}`}>{name}</Link>,
    },
    {
      key: 'movement', title: 'Movement', priority: 1,
      render: (_v, row) => (
        <Space size={4}>
          {row.fromBucket && <Tag style={{ marginInlineEnd: 0 }}>{row.fromBucket}</Tag>}
          {row.fromBucket && row.toBucket && <Typography.Text type="secondary">→</Typography.Text>}
          {row.toBucket && <Tag color="red" style={{ marginInlineEnd: 0 }}>{row.toBucket}</Tag>}
        </Space>
      ),
    },
    {
      key: 'qty', title: 'Units', dataIndex: 'qty', sorter: true, align: 'right', priority: 1,
      render: (v) => <Typography.Text strong className="tabular">{v}</Typography.Text>,
    },
    { key: 'reasonLabel', title: 'Reason', dataIndex: 'reasonLabel', priority: 1 },
    {
      key: 'claimRaised', title: 'Seller claim', dataIndex: 'claimRaised', priority: 2,
      render: (v) => (v ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>Raised</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', priority: 2,
      render: (v) => (
        <Tag color={v === 'APPLIED' ? 'green' : 'gold'} style={{ marginInlineEnd: 0 }}>
          {v.replace(/_/g, ' ').toLowerCase()}
        </Tag>
      ),
    },
    {
      key: 'createdAt', title: 'When', dataIndex: 'createdAt', sorter: true, priority: 2,
      render: (v, row) => (
        <Space direction="vertical" size={0}>
          <DateText value={v} />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.createdByName}</Typography.Text>
        </Space>
      ),
    },
  ];

  const reason = REASONS.find((r) => r.value === draft.reasonCode);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Stock adjustments"
        breadcrumbs={[{ label: 'Inventory & warehouses' }, { label: 'Stock adjustments' }]}
        subtitle="Every correction to a stock count, and why. Losses in our care raise a reimbursement claim for the seller."
        actions={
          <Can perm="warehouse.adjustment.create" disable reason="You cannot adjust stock">
            <Button type="primary" onClick={() => setOpen(true)}>
              New adjustment
            </Button>
          </Can>
        }
      />

      <FilterBar
        schema={[
          { key: 'warehouseId', label: 'Warehouse', kind: 'entity', entity: 'warehouse', width: 200 },
          { key: 'createdAt', label: 'When', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search SKU, product or seller"
      />

      <DataTable
        tableId="stockAdjustments"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        facetField="reasonCode"
        tabs={[{ key: 'all', label: 'All' }, ...REASONS.map((r) => ({ key: r.value, label: r.label }))]}
        emptyProps={{ title: 'No adjustments recorded' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong ellipsis>{row.productTitle}</Typography.Text>
              <Typography.Text strong className="tabular">{row.qty}</Typography.Text>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.reasonLabel} · {row.warehouseCode}
            </Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={(values) =>
          create.mutate({
            inventoryId: draft.inventoryId,
            qty: draft.qty,
            reasonCode: draft.reasonCode,
            reasonLabel: reason?.label,
            fromBucket: reason?.from,
            toBucket: reason?.to,
            evidence: values.reason,
          })
        }
        loading={create.isPending}
        danger
        title="Adjust stock"
        impact={
          <Space direction="vertical" size={2}>
            <span>
              This changes the count customers can buy against. It is recorded permanently on the
              stock ledger.
            </span>
            {['DAMAGED_IN_WAREHOUSE', 'CYCLE_COUNT'].includes(draft.reasonCode) && (
              <span>Stock lost in our care raises a reimbursement claim for the seller.</span>
            )}
            {draft.qty > 25 && <span>Over 25 units, so this needs a second approver.</span>}
          </Space>
        }
        reasonRequired
        reasonLabel="Evidence — what was counted, and how"
        showNote={false}
        confirmLabel="Apply adjustment"
        extraFields={
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Count twice before writing stock off"
            />
            <Form.Item label="Stock record" required>
              <EntitySelect
                entity="inventorySku"
                value={draft.inventoryId}
                onChange={(v) => setDraft((d) => ({ ...d, inventoryId: v }))}
                placeholder="Search a SKU at a warehouse"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label="Reason" required>
              <Select
                value={draft.reasonCode}
                onChange={(v) => setDraft((d) => ({ ...d, reasonCode: v }))}
                options={REASONS}
              />
            </Form.Item>
            <Form.Item label="Units" required>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                value={draft.qty}
                onChange={(v) => setDraft((d) => ({ ...d, qty: v }))}
              />
            </Form.Item>
          </>
        }
      />
    </Flex>
  );
}
