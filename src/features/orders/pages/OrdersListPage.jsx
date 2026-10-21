import { Flex, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { orderKeys } from '../api/orders.api';
import { ORDER_TABS, orderColumns, orderFilterSchema } from '../orderColumns';

export default function OrdersListPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-placedAt' });

  const tabCodes = ORDER_TABS.find((t) => t.key === state.tab)?.codes;
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: orderKeys.list({ ...state.queryParams, tab: state.tab }),
    url: '/orders',
    params: {
      ...state.queryParams,
      ...(state.tab ? { status: (tabCodes ?? [state.tab]).join(',') } : {}),
    },
  });

  const breaching = rows.filter((r) => r.slaBreached).length;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Orders"
        breadcrumbs={[{ label: 'Orders' }, { label: 'All orders' }]}
        subtitle="An order splits into one shipment per seller. Status reflects whichever item is furthest behind."
        meta={
          breaching > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {breaching} past their SLA on this page
            </Typography.Text>
          )
        }
      />

      <FilterBar
        schema={orderFilterSchema}
        tableState={state}
        searchPlaceholder="Search order ID, customer, phone or product"
      />

      <DataTable
        tableId="orders"
        columns={orderColumns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={ORDER_TABS}
        onRowClick={(row) => navigate(`/orders/${row.id}`)}
        onExport={() => {}}
        exportPerm="orders.order.export"
        emptyProps={{ title: 'No orders match' }}
        mobileCard={(row) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" align="flex-start" gap={8}>
              <div style={{ minWidth: 0 }}>
                <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.id}</Typography.Text>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {row.customerName} · <DateText value={row.placedAt} />
                  </Typography.Text>
                </div>
              </div>
              <StatusTag domain="orderItem" code={row.status} />
            </Flex>
            <Typography.Text style={{ fontSize: 12 }} ellipsis>
              {row.firstItemName}
              {row.itemCount > 1 ? ` +${row.itemCount - 1}` : ''}
            </Typography.Text>
            <Space size={8} wrap>
              <MoneyText paise={row.grandTotalPaise} strong />
              <Tag style={{ marginInlineEnd: 0 }}>{row.paymentMethod}</Tag>
              {row.slaBreached && <Tag color="red" style={{ marginInlineEnd: 0 }}>Past SLA</Tag>}
            </Space>
          </Flex>
        )}
      />
    </Flex>
  );
}
