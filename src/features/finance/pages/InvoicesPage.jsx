import { Col, Flex, Row, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { financeKeys } from '../api/finance.api';
import useExport from '../useExport';
import InvoiceDrawer from '../components/InvoiceDrawer';

/**
 * Tax invoices and credit notes.
 *
 * On a marketplace the invoice is raised by the seller, not by Arise — we
 * generate it on their behalf and in their GSTIN. That is why the seller's
 * registration and the customer's state both appear: together they decide
 * whether the sale is taxed as CGST+SGST or as IGST.
 */
export default function InvoicesPage() {
  const state = useUrlTableState({ defaultSort: '-issuedAt' });
  const runExport = useExport('invoices');
  const [viewing, setViewing] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: financeKeys.invoices({ ...state.queryParams, tab: state.tab }),
    url: '/invoices',
    params: { ...state.queryParams, ...(state.tab && state.tab !== 'all' ? { type: state.tab } : {}) },
  });

  const summary = meta?.summary;

  const columns = [
    {
      key: 'invoiceNo', title: 'Invoice', dataIndex: 'invoiceNo', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{v}</Typography.Text>
          {row.supersededAt ? (
            <Tag color="default" style={{ marginInlineEnd: 0, width: 'fit-content' }}>superseded</Tag>
          ) : null}
        </Flex>
      ),
    },
    {
      key: 'type', title: 'Type', dataIndex: 'type', priority: 2,
      render: (v) => (
        <Tag color={v === 'CREDIT_NOTE' ? 'purple' : 'blue'} style={{ marginInlineEnd: 0 }}>
          {v === 'CREDIT_NOTE' ? 'credit note' : 'tax invoice'}
        </Tag>
      ),
    },
    {
      key: 'orderId', title: 'Order', dataIndex: 'orderId', priority: 1,
      render: (v) => (
        <Link to={`/orders/${v}`} onClick={(e) => e.stopPropagation()}>
          <Typography.Text className="mono" style={{ fontSize: 12 }}>{v}</Typography.Text>
        </Link>
      ),
    },
    {
      key: 'sellerName', title: 'Raised by', dataIndex: 'sellerName', priority: 1,
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 180 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" className="mono" style={{ fontSize: 10 }}>{row.sellerGstin}</Typography.Text>
        </Flex>
      ),
    },
    { key: 'placeOfSupply', title: 'Place of supply', dataIndex: 'placeOfSupply', priority: 2 },
    {
      key: 'taxablePaise', title: 'Taxable', dataIndex: 'taxablePaise', sorter: true, align: 'right', priority: 2,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'tax', title: 'GST', align: 'right', priority: 1,
      render: (_v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <MoneyText paise={row.cgstPaise + row.sgstPaise + row.igstPaise} />
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>
            {row.interState ? `IGST ${row.gstRate}%` : `CGST+SGST ${row.gstRate}%`}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'totalPaise', title: 'Total', dataIndex: 'totalPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} strong colorBySign />,
    },
    {
      key: 'issuedAt', title: 'Issued', dataIndex: 'issuedAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} variant="date" />,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Invoices & credit notes"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Invoices' }]}
        subtitle="Raised in the seller’s name and GSTIN. A statutory invoice is never edited — it is superseded by a new one, or reversed by a credit note."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}>
          <StatCard label="Taxable value invoiced" valuePaise={summary?.taxablePaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="GST charged" valuePaise={summary?.taxPaise} format="money" loading={loading} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard label="Credit notes raised" value={summary?.creditNoteCount} loading={loading} />
        </Col>
      </Row>

      <FilterBar
        schema={[
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'interState', label: 'Inter-state', kind: 'boolean' },
          { key: 'issuedAt', label: 'Issued', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search invoice number, order, seller or GSTIN"
      />

      <DataTable
        tableId="invoices"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={(row) => setViewing(row.id)}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'TAX_INVOICE', label: 'Tax invoices' },
          { key: 'CREDIT_NOTE', label: 'Credit notes' },
        ]}
        onExport={() => runExport(state.queryParams)}
        exportPerm="finance.invoice.export"
        emptyProps={{ title: 'No invoices match these filters' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.invoiceNo}</Typography.Text>
              <MoneyText paise={row.totalPaise} strong colorBySign />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sellerName} · {row.placeOfSupply}
            </Typography.Text>
          </Flex>
        )}
      />

      <InvoiceDrawer invoiceId={viewing} onClose={() => setViewing(null)} />
    </Flex>
  );
}
