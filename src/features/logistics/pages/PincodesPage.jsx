import { App, Button, Flex, Form, Select, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { formatPercent } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { logisticsApi, logisticsKeys } from '../api/logistics.api';
import PincodeChecker from '../components/PincodeChecker';

const ZONES = [
  { value: 'LOCAL', label: 'Local' },
  { value: 'ZONAL', label: 'Within state' },
  { value: 'METRO', label: 'Metro' },
  { value: 'REST_OF_INDIA', label: 'Rest of India' },
  { value: 'SPECIAL', label: 'NE & J&K' },
];

/**
 * Serviceability, plus the same check the app runs to show a delivery date.
 * Having the checker here means an agent can answer "why can't they order?"
 * without guessing.
 */
export default function PincodesPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'pincode', defaultPageSize: 50 });
  const [overriding, setOverriding] = useState(null);
  const [override, setOverride] = useState('COD_DISABLED');
  const [check, setCheck] = useState({ pincode: '', weightG: 500, paymentMode: 'PREPAID' });
  const [checkQuery, setCheckQuery] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: logisticsKeys.pincodes({ ...state.queryParams, tab: state.tab }),
    url: '/pincodes',
    params: { ...state.queryParams, ...(state.tab ? { zone: state.tab } : {}) },
  });

  const result = useQuery({
    queryKey: ['logistics', 'pincodeCheck', checkQuery],
    queryFn: () => logisticsApi.checkPincode(checkQuery),
    enabled: Boolean(checkQuery?.pincode),
  });

  const applyOverride = useMutation({
    mutationFn: ({ id, payload }) => logisticsApi.overridePincode(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics', 'pincodes'] });
      setOverriding(null);
      message.success('Override applied');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'pincode', title: 'Pincode', dataIndex: 'pincode', sorter: true, alwaysVisible: true,
      render: (v, row) => (
        <div>
          <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{v}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.city}, {row.state}</Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'zone', title: 'Zone', dataIndex: 'zone', priority: 1,
      render: (v, row) => (
        <Space size={4}>
          <Tag style={{ marginInlineEnd: 0 }}>{ZONES.find((z) => z.value === v)?.label ?? v}</Tag>
          {row.oda && <Tag color="gold" style={{ marginInlineEnd: 0 }}>ODA</Tag>}
        </Space>
      ),
    },
    {
      key: 'courierCount', title: 'Couriers', dataIndex: 'courierCount', sorter: true, align: 'right', priority: 1,
      render: (v) => (
        <Typography.Text className="tabular" type={v === 0 ? 'danger' : undefined}>{v}</Typography.Text>
      ),
    },
    {
      key: 'tatDays', title: 'Delivery', dataIndex: 'tatDays', sorter: true, align: 'right', priority: 2,
      render: (v, row) => <span className="tabular">{v + (row.oda ? 2 : 0)} days</span>,
    },
    {
      key: 'rtoPct', title: 'RTO rate', dataIndex: 'rtoPct', sorter: true, align: 'right', priority: 1,
      render: (v) => (
        <Typography.Text className="tabular" type={v > 25 ? 'danger' : v > 15 ? 'warning' : undefined}>
          {formatPercent(v, 0)}
        </Typography.Text>
      ),
    },
    {
      key: 'codAvailable', title: 'COD', dataIndex: 'codAvailable', priority: 1,
      render: (v) => (v ? <Tag color="green" style={{ marginInlineEnd: 0 }}>On</Tag> : <Tag color="red" style={{ marginInlineEnd: 0 }}>Off</Tag>),
    },
    {
      key: 'override', title: 'Override', dataIndex: 'override', priority: 2,
      render: (v, row) =>
        v ? (
          <Space direction="vertical" size={0}>
            <Tag color="gold" style={{ marginInlineEnd: 0, width: 'fit-content' }}>{v.replace(/_/g, ' ').toLowerCase()}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.overrideReason}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>None</Typography.Text>
        ),
    },
    {
      key: 'actions', title: '', align: 'right', priority: 2,
      render: (_v, row) => (
        <Button size="small" onClick={(e) => { e.stopPropagation(); setOverriding(row); setOverride(row.override ?? 'COD_DISABLED'); }}>
          Override
        </Button>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Pincode serviceability"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'Pincode serviceability' }]}
        subtitle="Which couriers reach where, how long it takes, and where COD is too risky to offer."
      />

      <PincodeChecker
        value={check}
        onChange={setCheck}
        onCheck={() => setCheckQuery({ ...check, pincode: String(check.pincode ?? '') })}
        loading={result.isFetching}
        result={result.data?.data}
      />

      <FilterBar
        schema={[
          { key: 'state', label: 'State', kind: 'text', width: 160 },
          { key: 'codAvailable', label: 'COD available', kind: 'boolean' },
          { key: 'oda', label: 'Out of delivery area', kind: 'boolean' },
        ]}
        tableState={state}
        searchPlaceholder="Search pincode, city or state"
      />

      <DataTable
        tableId="pincodes"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        facetField="zone"
        tabs={[{ key: 'all', label: 'All' }, ...ZONES.map((z) => ({ key: z.value, label: z.label }))]}
        onExport={() => {}}
        exportPerm="logistics.pincode.export"
        emptyProps={{ title: 'No pincodes match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong>{row.pincode}</Typography.Text>
              {row.codAvailable ? <Tag color="green" style={{ marginInlineEnd: 0 }}>COD on</Tag> : <Tag color="red" style={{ marginInlineEnd: 0 }}>COD off</Tag>}
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.city} · RTO {formatPercent(row.rtoPct, 0)}
            </Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(overriding)}
        onCancel={() => setOverriding(null)}
        onConfirm={(values) =>
          applyOverride.mutate({
            id: overriding.id,
            payload: { override: override === 'NONE' ? null : override, reason: values.reason },
          })
        }
        loading={applyOverride.isPending}
        danger={override === 'BLOCKED'}
        title={`Override ${overriding?.pincode} — ${overriding?.city}`}
        impact={
          override === 'BLOCKED'
            ? 'Nobody at this pincode can place an order at all. Use this only for a genuine disruption.'
            : override === 'COD_DISABLED'
              ? 'Customers here must pay up front. This is the main lever against RTO.'
              : 'The pincode returns to normal serviceability.'
        }
        reasonRequired={override !== 'NONE'}
        showNote={false}
        confirmLabel="Apply override"
        extraFields={
          <Form.Item label="Override" required>
            <Select
              value={override}
              onChange={setOverride}
              options={[
                { value: 'COD_DISABLED', label: 'Disable cash on delivery' },
                { value: 'BLOCKED', label: 'Block the pincode entirely' },
                { value: 'NONE', label: 'Clear the override' },
              ]}
            />
          </Form.Item>
        }
      />
    </Flex>
  );
}
