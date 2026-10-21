import { App, Alert, Button, Descriptions, Divider, Drawer, Flex, Skeleton, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import MoneyText from '@shared/components/MoneyText';
import { financeApi, financeKeys } from '../api/finance.api';

/** One invoice, as it would be printed, plus the re-generate action. */
export default function InvoiceDrawer({ invoiceId, onClose }) {
  const { message } = App.useApp();
  const [regenerating, setRegenerating] = useState(false);

  const query = useQuery({
    queryKey: financeKeys.invoice(invoiceId),
    queryFn: () => financeApi.invoice(invoiceId),
    enabled: Boolean(invoiceId),
  });

  const regenerate = useMutation({
    mutationFn: (payload) => financeApi.regenerateInvoice(invoiceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setRegenerating(false);
      onClose();
      message.success('A replacement invoice has been issued');
    },
    onError: (e) => message.error(e.message),
  });

  const invoice = query.data?.data;

  return (
    <Drawer
      open={Boolean(invoiceId)}
      onClose={onClose}
      width={520}
      title={invoice ? invoice.invoiceNo : 'Invoice'}
      extra={
        invoice && invoice.type === 'TAX_INVOICE' && !invoice.supersededAt ? (
          <Can perm="finance.invoice.regenerate">
            <Button size="small" onClick={() => setRegenerating(true)}>Re-generate</Button>
          </Can>
        ) : null
      }
    >
      {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      {invoice ? (
        <Flex vertical gap={12}>
          {invoice.supersededAt ? (
            <Alert
              type="warning"
              showIcon
              message="This invoice has been superseded"
              description={invoice.supersededReason}
            />
          ) : null}
          {invoice.supersedes ? (
            <Alert type="info" showIcon message={`Replaces ${invoice.supersedes}`} />
          ) : null}

          <Descriptions size="small" column={1} colon={false}>
            <Descriptions.Item label="Type">
              <Tag color={invoice.type === 'CREDIT_NOTE' ? 'purple' : 'blue'}>
                {invoice.type === 'CREDIT_NOTE' ? 'Credit note' : 'Tax invoice'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Issued">
              <DateText value={invoice.issuedAt} variant="datetime" />
            </Descriptions.Item>
            <Descriptions.Item label="Order">
              <Link to={`/orders/${invoice.orderId}`}>
                <Typography.Text className="mono" style={{ fontSize: 12 }}>{invoice.orderId}</Typography.Text>
              </Link>
            </Descriptions.Item>
            <Descriptions.Item label="Seller">
              <Flex vertical gap={0}>
                <Link to={`/sellers/${invoice.sellerId}`}>{invoice.sellerName}</Link>
                <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
                  {invoice.sellerGstin}
                </Typography.Text>
              </Flex>
            </Descriptions.Item>
            <Descriptions.Item label="Customer">{invoice.customerName}</Descriptions.Item>
            <Descriptions.Item label="Place of supply">
              {invoice.placeOfSupply} · {invoice.interState ? 'inter-state (IGST)' : 'intra-state (CGST+SGST)'}
            </Descriptions.Item>
          </Descriptions>

          {invoice.lines?.length ? (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={invoice.lines}
              columns={[
                { key: 'name', title: 'Item', dataIndex: 'name', ellipsis: true },
                { key: 'variantLabel', title: 'Variant', dataIndex: 'variantLabel', width: 90 },
                { key: 'qty', title: 'Qty', dataIndex: 'qty', width: 50, align: 'right' },
                {
                  key: 'linePaise', title: 'Amount', dataIndex: 'linePaise', width: 100, align: 'right',
                  render: (v) => <MoneyText paise={v} />,
                },
              ]}
            />
          ) : null}

          <Divider style={{ margin: '4px 0' }} />

          <Flex vertical gap={5}>
            <Row label="Taxable value" paise={invoice.taxablePaise} />
            {invoice.interState ? (
              <Row label={`IGST ${invoice.gstRate}%`} paise={invoice.igstPaise} />
            ) : (
              <>
                <Row label={`CGST ${invoice.gstRate / 2}%`} paise={invoice.cgstPaise} />
                <Row label={`SGST ${invoice.gstRate / 2}%`} paise={invoice.sgstPaise} />
              </>
            )}
            <Divider style={{ margin: '4px 0' }} />
            <Row label="Invoice total" paise={invoice.totalPaise} strong />
          </Flex>

          {invoice.creditNotes?.length ? (
            <Alert
              type="info"
              showIcon
              message={`${invoice.creditNotes.length} credit note(s) raised against this invoice`}
              description={invoice.creditNotes.map((c) => c.invoiceNo).join(', ')}
            />
          ) : null}
        </Flex>
      ) : null}

      <ConfirmActionModal
        open={regenerating}
        onCancel={() => setRegenerating(false)}
        onConfirm={(values) => regenerate.mutate({ reason: values.reason })}
        loading={regenerate.isPending}
        title="Re-generate this invoice"
        description={invoice?.invoiceNo}
        impact="The existing invoice is marked superseded and kept on record; a new number is issued. Both stay in the GST return for the period."
        reasonRequired
        reasonLabel="Why is a replacement needed?"
        showNote={false}
        confirmLabel="Issue replacement"
      />
    </Drawer>
  );
}

function Row({ label, paise, strong = false }) {
  return (
    <Flex justify="space-between" align="baseline" gap={12}>
      <Typography.Text style={{ fontSize: 13 }} strong={strong}>{label}</Typography.Text>
      <MoneyText paise={paise} strong={strong} colorBySign />
    </Flex>
  );
}
