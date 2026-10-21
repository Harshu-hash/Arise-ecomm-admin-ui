import { App, Button, Card, Flex, Progress, Segmented, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import ImportWizard from '@shared/components/ImportWizard';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { catalogApi, catalogKeys } from '../api/catalog.api';

const JOB_TYPES = [
  { value: 'PRICE_STOCK_UPDATE', label: 'Price & stock update' },
  { value: 'OFFER_DEACTIVATION', label: 'Offer deactivation' },
];

const COLUMNS_BY_TYPE = {
  PRICE_STOCK_UPDATE: [
    { key: 'sku', required: true },
    { key: 'sellerId', required: true },
    { key: 'sellingPriceRupees', required: true },
    { key: 'stock', required: true },
  ],
  OFFER_DEACTIVATION: [
    { key: 'sku', required: true },
    { key: 'sellerId', required: true },
    { key: 'reason', required: false },
  ],
};

const SAMPLE_ROWS = {
  PRICE_STOCK_UPDATE: [{ sku: 'ABCD-00001-0', sellerId: 'SEL-0001', sellingPriceRupees: 499, stock: 25 }],
  OFFER_DEACTIVATION: [{ sku: 'ABCD-00001-0', sellerId: 'SEL-0001', reason: 'Discontinued' }],
};

const STATUS_COLOR = { COMPLETED: 'green', COMPLETED_WITH_ERRORS: 'orange', FAILED: 'red', PROCESSING: 'blue' };

function validateRow(jobType, row) {
  const errors = [];
  if (!row.sku?.trim()) errors.push('SKU is required');
  if (!row.sellerId?.trim()) errors.push('Seller ID is required');
  if (jobType === 'PRICE_STOCK_UPDATE') {
    if (!(Number(row.sellingPriceRupees) > 0)) errors.push('Price must be a positive number');
    if (row.stock === undefined || row.stock === '' || Number(row.stock) < 0) errors.push('Stock must be zero or more');
  }
  return errors;
}

/** Bulk uploads (M3.10): price & stock updates and offer deactivation, via the generic ImportWizard. New-product creation, image-URL and attribute bulk edits are not built — see the plan's Phase 8 decisions. */
export default function BulkUploadsPage() {
  const { message } = App.useApp();
  const [jobType, setJobType] = useState('PRICE_STOCK_UPDATE');
  const state = useUrlTableState({ defaultSort: '-createdAt' });
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: catalogKeys.imports(state.queryParams),
    url: '/catalog/imports',
    params: state.queryParams,
  });

  const commit = useMutation({
    mutationFn: ({ rows: importRows, importValidOnly }) => catalogApi.commitImport({
      jobType,
      importValidOnly,
      rows: importRows.map(({ _row, _errors, ...r }) => r),
    }),
    onSuccess: (job) => {
      refetch();
      message.success(`Done — ${job.data.totalRows - job.data.failRows} succeeded, ${job.data.failRows} failed.`);
    },
    onError: (e) => message.error(e.message),
  });

  const retry = useMutation({
    mutationFn: (jobId) => catalogApi.retryImport(jobId),
    onSuccess: () => { refetch(); message.success('Retried'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'label', title: 'Import', dataIndex: 'label', alwaysVisible: true },
    {
      key: 'status', title: 'Status', dataIndex: 'status',
      render: (v, row) => (
        <Flex vertical gap={2} style={{ minWidth: 120 }}>
          <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ marginInlineEnd: 0, width: 'fit-content' }}>{v.replace(/_/g, ' ')}</Tag>
          {v === 'PROCESSING' && <Progress percent={row.progressPct} size="small" showInfo={false} />}
        </Flex>
      ),
    },
    { key: 'totalRows', title: 'Rows', dataIndex: 'totalRows', align: 'right' },
    { key: 'failRows', title: 'Failed', dataIndex: 'failRows', align: 'right', render: (v) => (v > 0 ? <Typography.Text type="danger">{v}</Typography.Text> : 0) },
    { key: 'createdByName', title: 'Uploaded by', dataIndex: 'createdByName' },
    { key: 'createdAt', title: 'Created', dataIndex: 'createdAt', render: (v) => <DateText value={v} /> },
    {
      key: 'actions', title: '', align: 'right',
      render: (_v, row) => (row.failRows > 0 ? <Button size="small" onClick={() => retry.mutate(row.id)} loading={retry.isPending}>Retry failed rows</Button> : null),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <PageHeader
        title="Bulk uploads"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Bulk Uploads' }]}
        subtitle="Price & stock updates and offer deactivation, in bulk, on a seller's behalf."
      />

      <Card size="small" title="New import">
        <Flex vertical gap={16}>
          <Segmented value={jobType} onChange={setJobType} options={JOB_TYPES} />
          <ImportWizard
            key={jobType}
            jobType={jobType}
            columns={COLUMNS_BY_TYPE[jobType]}
            sampleRows={SAMPLE_ROWS[jobType]}
            validateRow={(row) => validateRow(jobType, row)}
            committing={commit.isPending}
            onCommit={(importRows, importValidOnly) => commit.mutate({ rows: importRows, importValidOnly })}
          />
        </Flex>
      </Card>

      <Card size="small" title="Import history">
        <DataTable
          tableId="catalogImports"
          columns={columns}
          rows={rows}
          meta={meta}
          loading={loading || fetching}
          error={error}
          onRetry={refetch}
          tableState={state}
          emptyProps={{ title: 'No imports yet' }}
        />
      </Card>
    </Flex>
  );
}
