import { Alert, Flex, Tag, Typography } from 'antd';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { catalogKeys } from '../api/catalog.api';

export default function HsnCodesPage() {
  const state = useUrlTableState({ defaultSort: 'code', defaultPageSize: 50 });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: catalogKeys.hsn(state.queryParams),
    url: '/hsn-codes',
    params: state.queryParams,
  });

  const columns = [
    {
      key: 'code', title: 'HSN', dataIndex: 'code', sorter: true, alwaysVisible: true,
      render: (v) => <Typography.Text className="mono" strong>{v}</Typography.Text>,
    },
    { key: 'description', title: 'Description', dataIndex: 'description', priority: 1 },
    {
      key: 'gstRate', title: 'GST', dataIndex: 'gstRate', sorter: true, align: 'right', priority: 1,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}%</Tag>,
    },
    { key: 'rootName', title: 'Applies to', dataIndex: 'rootName', priority: 2 },
    {
      key: 'categoryCount', title: 'Categories using it', dataIndex: 'categoryCount', sorter: true, align: 'right', priority: 2,
      render: (v) => <span className="tabular">{v}</span>,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="HSN & tax codes"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'HSN & tax codes' }]}
        subtitle="HSN drives the GST rate on every invoice, so a wrong code is a tax problem, not a catalog one."
      />

      <Alert
        type="info"
        showIcon
        message="Rate changes are effective-dated and never retroactive"
        description="Editing a rate requires a second approver and applies only to invoices raised after the effective date."
      />

      <FilterBar
        schema={[
          {
            key: 'gstRate', label: 'GST rate', kind: 'multiSelect', width: 170,
            options: [0, 5, 12, 18, 28].map((r) => ({ value: String(r), label: `${r}%` })),
          },
        ]}
        tableState={state}
        searchPlaceholder="Search code or description"
      />

      <DataTable
        tableId="hsnCodes"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No HSN codes match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong>{row.code}</Typography.Text>
              <Tag style={{ marginInlineEnd: 0 }}>{row.gstRate}%</Tag>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
