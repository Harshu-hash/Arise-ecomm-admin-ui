import { Flex, Space, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { catalogApi, catalogKeys } from '../api/catalog.api';

const TYPES = ['TEXT', 'NUMBER', 'SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN', 'COLOUR', 'SIZE', 'DATE'];

export default function AttributesPage() {
  const state = useUrlTableState({ defaultSort: 'name', defaultPageSize: 50 });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: catalogKeys.attributes(state.queryParams),
    url: '/attributes',
    params: state.queryParams,
  });

  const sets = useQuery({
    queryKey: ['catalog', 'attributeSets'],
    queryFn: () => catalogApi.attributes({ pageSize: 1 }),
  });

  const columns = [
    {
      key: 'name', title: 'Attribute', dataIndex: 'name', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
          <div>
            <Typography.Text className="mono" type="secondary" style={{ fontSize: 11 }}>{row.code}</Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'type', title: 'Type', dataIndex: 'type', sorter: true, priority: 1,
      render: (t) => <Tag style={{ marginInlineEnd: 0 }}>{t.replace(/_/g, ' ').toLowerCase()}</Tag>,
    },
    { key: 'unit', title: 'Unit', dataIndex: 'unit', priority: 3, render: (v) => v ?? '—' },
    {
      key: 'values', title: 'Values', dataIndex: 'values', priority: 2,
      render: (values) =>
        values.length ? (
          <Space size={[4, 4]} wrap>
            {values.slice(0, 4).map((v) => (
              <Tag key={v.value} style={{ marginInlineEnd: 0 }}>{v.value}</Tag>
            ))}
            {values.length > 4 && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>+{values.length - 4}</Typography.Text>
            )}
          </Space>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Free text</Typography.Text>
        ),
    },
    {
      key: 'variantDefining', title: 'Defines variants', dataIndex: 'variantDefining', priority: 1,
      render: (v) => (v ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>Yes</Tag> : <Typography.Text type="secondary" style={{ fontSize: 12 }}>No</Typography.Text>),
    },
    {
      key: 'filterable', title: 'Filterable in app', dataIndex: 'filterable', priority: 2,
      render: (v) => (v ? <Tag color="green" style={{ marginInlineEnd: 0 }}>Yes</Tag> : <Typography.Text type="secondary" style={{ fontSize: 12 }}>No</Typography.Text>),
    },
    {
      key: 'usedInCategories', title: 'Categories', dataIndex: 'usedInCategories', sorter: true, align: 'right', priority: 2,
      render: (v) => <span className="tabular">{v}</span>,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Attributes"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Attributes' }]}
        subtitle="The structured fields listings are built from. Variant-defining attributes create SKUs; filterable ones become app filters."
      />

      <FilterBar
        schema={[
          { key: 'type', label: 'Type', kind: 'multiSelect', width: 200, options: TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').toLowerCase() })) },
          { key: 'variantDefining', label: 'Variant-defining', kind: 'boolean' },
          { key: 'filterable', label: 'Filterable', kind: 'boolean' },
        ]}
        tableState={state}
        searchPlaceholder="Search attribute or code"
      />

      <DataTable
        tableId="attributes"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No attributes match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text strong>{row.name}</Typography.Text>
            <Space size={4} wrap>
              <Tag style={{ marginInlineEnd: 0 }}>{row.type.toLowerCase()}</Tag>
              {row.variantDefining && <Tag color="blue" style={{ marginInlineEnd: 0 }}>variant</Tag>}
            </Space>
          </Flex>
        )}
      />

      <Flex vertical gap={8}>
        <Typography.Title level={5} style={{ margin: 0, fontSize: 14 }}>
          Attribute sets
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Sets group attributes so a category can adopt them all at once.
        </Typography.Text>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          loading={sets.isLoading}
          dataSource={sets.data?.meta?.sets ?? []}
          columns={[
            { title: 'Set', dataIndex: 'name' },
            { title: 'Applies to', dataIndex: 'rootName', render: (v) => v ?? 'Any category' },
            {
              title: 'Attributes', dataIndex: 'attributeIds',
              render: (ids) => `${ids.length} attribute${ids.length === 1 ? '' : 's'}`,
            },
          ]}
        />
      </Flex>
    </Flex>
  );
}
