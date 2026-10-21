import { Alert, Col, Flex, Row, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeKeys } from '../api/finance.api';
import useExport from '../useExport';

/**
 * TCS and TDS, per seller, per period.
 *
 * Both are money we collect on the seller's behalf and hand to the
 * government: TCS monthly in GSTR-8, TDS quarterly with a Form 16A to the
 * seller. A seller without a GSTIN on file cannot be reported at all, which
 * is why that count is called out rather than buried.
 */
export default function TaxPage() {
  const state = useUrlTableState({ defaultSort: '-tcsPaise' });
  const runExport = useExport('tax-summaries');

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.tax(state.queryParams),
    url: '/tax-summaries',
    params: state.queryParams,
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', alwaysVisible: true,
      render: (v, row) => <Link to={`/sellers/${row.sellerId}`}>{v}</Link>,
    },
    {
      key: 'gstin', title: 'GSTIN', dataIndex: 'gstin', priority: 1,
      render: (v) =>
        v ? (
          <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>
        ) : (
          <Tag color="red" style={{ marginInlineEnd: 0 }}>missing</Tag>
        ),
    },
    {
      key: 'pan', title: 'PAN', dataIndex: 'pan', priority: 3,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v ?? '—'}</Typography.Text>,
    },
    { key: 'period', title: 'Period', dataIndex: 'period', priority: 2 },
    {
      key: 'taxableValuePaise', title: 'Taxable value', dataIndex: 'taxableValuePaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'tcsPaise', title: 'TCS (0.5%)', dataIndex: 'tcsPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong />,
    },
    {
      key: 'tdsPaise', title: 'TDS (0.1%)', dataIndex: 'tdsPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'gstr8Filed', title: 'GSTR-8', dataIndex: 'gstr8Filed', priority: 2,
      render: (v) => (
        <Tag color={v ? 'green' : 'gold'} style={{ marginInlineEnd: 0 }}>{v ? 'filed' : 'not filed'}</Tag>
      ),
    },
    {
      key: 'form16aIssued', title: 'Form 16A', dataIndex: 'form16aIssued', priority: 3,
      render: (v) => (
        <Tag color={v ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>{v ? 'issued' : 'pending'}</Tag>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Tax (TCS / TDS)"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Tax' }]}
        subtitle="Collected from sellers on each sale and paid to the government. TCS is reported monthly in GSTR-8; TDS quarterly, with a Form 16A to each seller."
      />

      {summary?.sellersWithoutGstin ? (
        <Alert
          type="warning"
          showIcon
          message={`${summary.sellersWithoutGstin} sellers have no GSTIN on file`}
          description="Their sales cannot be included in GSTR-8 until the registration is collected and verified."
        />
      ) : null}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Taxable value settled" valuePaise={summary?.taxableValuePaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="TCS collected" valuePaise={summary?.tcsPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="TDS withheld" valuePaise={summary?.tdsPaise} format="money" loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'gstr8Filed', label: 'GSTR-8 filed', kind: 'boolean' },
        ]}
        tableState={state}
        searchPlaceholder="Search seller, GSTIN or PAN"
      />

      <DataTable
        tableId="taxSummaries"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.tax.export"
        emptyProps={{ title: 'No tax summaries for this period' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.sellerName}</Typography.Text>
              <MoneyText paise={row.tcsPaise} strong />
            </Flex>
            <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
              {row.gstin ?? 'no GSTIN on file'}
            </Typography.Text>
          </Flex>
        )}
      />
    </Flex>
  );
}
