import { Flex, Space, Tag, Tooltip, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { formatPercent } from '@core/utils/money';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { sellerKeys } from '../api/sellers.api';
import { TIER_COLOR } from '../sellerColumns';

const HEALTH = {
  HEALTHY: ['green', 'Healthy'],
  WATCH: ['gold', 'Watch'],
  AT_RISK: ['red', 'At risk'],
};

function renderMetric(value, threshold) {
  return (
    <Typography.Text className="tabular" type={value > threshold ? 'danger' : undefined} strong={value > threshold}>
      {formatPercent(value, 2)}
    </Typography.Text>
  );
}

/**
 * Sellers ranked by order defect rate — the composite number marketplaces use
 * to decide who needs intervention.
 */
export default function SellerPerformancePage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-odr' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: sellerKeys.performance({ ...state.queryParams, tab: state.tab }),
    url: '/sellers/performance',
    params: { ...state.queryParams, ...(state.tab ? { health: state.tab } : {}) },
  });

  const columns = [
    {
      key: 'storeName', title: 'Seller', dataIndex: 'storeName', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
          <div>
            <Tag color={TIER_COLOR[row.tier]} style={{ marginInlineEnd: 0 }}>{row.tier}</Tag>
          </div>
        </div>
      ),
    },
    {
      key: 'health', title: 'Health', dataIndex: 'health', priority: 1,
      render: (h, row) => (
        <Tooltip title={row.breaches.length ? row.breaches.join(' · ') : 'Within every target'}>
          <Tag color={HEALTH[h][0]} style={{ marginInlineEnd: 0 }}>{HEALTH[h][1]}</Tag>
        </Tooltip>
      ),
    },
    {
      key: 'odr', title: 'Defect rate', dataIndex: 'odr', sorter: true, align: 'right', priority: 1,
      render: (v) => (
        <Typography.Text className="tabular" strong type={v > 4 ? 'danger' : undefined}>
          {formatPercent(v, 2)}
        </Typography.Text>
      ),
    },
    { key: 'cancellationPct', title: 'Cancel %', dataIndex: 'cancellationPct', sorter: true, align: 'right', priority: 1, render: (v) => renderMetric(v, 2) },
    { key: 'lateDispatchPct', title: 'Late dispatch %', dataIndex: 'lateDispatchPct', sorter: true, align: 'right', priority: 2, render: (v) => renderMetric(v, 4) },
    { key: 'returnPct', title: 'Return %', dataIndex: 'returnPct', sorter: true, align: 'right', priority: 2, render: (v) => renderMetric(v, 8) },
    {
      key: 'rating', title: 'Rating', dataIndex: 'rating', sorter: true, align: 'right', priority: 2,
      render: (v) => (
        <Typography.Text className="tabular" type={v < 3.8 ? 'danger' : undefined}>
          {v ? `${v.toFixed(1)} ★` : '—'}
        </Typography.Text>
      ),
    },
    { key: 'orders30d', title: 'Orders (30d)', dataIndex: 'orders30d', sorter: true, align: 'right', priority: 3, render: (v) => <span className="tabular">{v}</span> },
    {
      key: 'gmv30dPaise', title: 'GMV (30d)', dataIndex: 'gmv30dPaise', sorter: true, align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} compact />,
    },
    {
      key: 'openPenalties', title: 'Penalties', dataIndex: 'openPenalties', align: 'right', priority: 3,
      render: (v) => (v ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
  ];

  const atRisk = rows.filter((r) => r.health === 'AT_RISK').length;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Seller performance"
        breadcrumbs={[{ label: 'Sellers' }, { label: 'Performance & SLA' }]}
        subtitle="Order defect rate blends cancellations, returns and late dispatch into one number."
        meta={
          atRisk > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {atRisk} seller{atRisk === 1 ? '' : 's'} breaching two or more targets
            </Typography.Text>
          )
        }
      />

      <FilterBar
        schema={[
          {
            key: 'tier', label: 'Tier', kind: 'multiSelect', width: 170,
            options: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].map((t) => ({ value: t, label: t })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search seller"
      />

      <DataTable
        tableId="sellerPerformance"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        facetField="health"
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'AT_RISK', label: 'At risk' },
          { key: 'WATCH', label: 'Watch' },
          { key: 'HEALTHY', label: 'Healthy' },
        ]}
        onRowClick={(row) => navigate(`/sellers/${row.id}`)}
        emptyProps={{ title: 'No sellers match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.storeName}</Typography.Text>
              <Tag color={HEALTH[row.health][0]} style={{ marginInlineEnd: 0 }}>{HEALTH[row.health][1]}</Tag>
            </Flex>
            <Space size={10} wrap>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Defect {formatPercent(row.odr, 2)}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Cancel {formatPercent(row.cancellationPct, 2)}
              </Typography.Text>
            </Space>
          </Flex>
        )}
      />
    </Flex>
  );
}
