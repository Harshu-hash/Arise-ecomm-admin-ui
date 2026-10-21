import { Flex, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import MoneyText from '@shared/components/MoneyText';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { sellerKeys } from '../api/sellers.api';
import { TIER_COLOR, sellerColumns, sellerFilterSchema } from '../sellerColumns';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'ONBOARDING', label: 'Onboarding', codes: ['APPROVED', 'ONBOARDING'] },
  { key: 'ON_HOLD', label: 'On hold' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'DEACTIVATED', label: 'Deactivated' },
  { key: 'BLACKLISTED', label: 'Blacklisted' },
];

export default function SellersListPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-gmv30dPaise' });

  const tabCodes = TABS.find((t) => t.key === state.tab)?.codes;
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: sellerKeys.list({ ...state.queryParams, tab: state.tab }),
    url: '/sellers',
    params: {
      ...state.queryParams,
      ...(state.tab ? { status: (tabCodes ?? [state.tab]).join(',') } : {}),
    },
  });

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Sellers"
        breadcrumbs={[{ label: 'Sellers' }, { label: 'All sellers' }]}
        subtitle="Everyone selling on Arise, and how they are performing."
      />

      <FilterBar
        schema={sellerFilterSchema}
        tableState={state}
        searchPlaceholder="Search store, legal name, GSTIN or ID"
      />

      <DataTable
        tableId="sellers"
        columns={sellerColumns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={TABS}
        onRowClick={(row) => navigate(`/sellers/${row.id}`)}
        onExport={() => {}}
        exportPerm="sellers.seller.export"
        emptyProps={{ title: 'No sellers match' }}
        mobileCard={(row) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" align="flex-start" gap={8}>
              <div>
                <Typography.Text strong>{row.storeName}</Typography.Text>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.id} · {row.city}
                  </Typography.Text>
                </div>
              </div>
              <StatusTag domain="seller" code={row.status} />
            </Flex>
            <Space size={6} wrap>
              <Tag color={TIER_COLOR[row.tier]} style={{ marginInlineEnd: 0 }}>{row.tier}</Tag>
              {row.rating ? <Tag style={{ marginInlineEnd: 0 }}>{row.rating.toFixed(1)} ★</Tag> : null}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.liveListings} listings
              </Typography.Text>
            </Space>
            <MoneyText paise={row.gmv30dPaise} compact strong />
          </Flex>
        )}
      />
    </Flex>
  );
}
