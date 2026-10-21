import { App, Button, Flex, Form, InputNumber, Select, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { sellerKeys, sellerOpsApi } from '../api/sellers.api';

const TYPES = [
  { value: 'RETURN_DAMAGED', label: 'Return received damaged' },
  { value: 'WRONG_ITEM_RETURNED', label: 'Wrong item returned' },
  { value: 'LOST_IN_TRANSIT', label: 'Lost by courier' },
  { value: 'LOST_IN_WAREHOUSE', label: 'Lost in Arise warehouse' },
  { value: 'WEIGHT_DISPUTE', label: 'Weight dispute' },
];

export default function SellerClaimsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'submittedAt' });
  const [deciding, setDeciding] = useState(null);
  const [kind, setKind] = useState('APPROVED');
  const [partialRupees, setPartialRupees] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: sellerKeys.claims({ ...state.queryParams, tab: state.tab }),
    url: '/seller-claims',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const decide = useMutation({
    mutationFn: ({ id, payload }) => sellerOpsApi.decideClaim(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellerClaims'] });
      setDeciding(null);
      setPartialRupees(null);
      message.success('Claim decided');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', sorter: true, alwaysVisible: true,
      render: (name, row) => (
        <Link to={`/sellers/${row.sellerId}`}>
          <Typography.Text strong style={{ fontSize: 13 }}>{name}</Typography.Text>
        </Link>
      ),
    },
    { key: 'typeLabel', title: 'Claim', dataIndex: 'typeLabel', priority: 1 },
    {
      key: 'orderId', title: 'Order', dataIndex: 'orderId', priority: 3,
      render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
    },
    {
      key: 'amountClaimedPaise', title: 'Claimed', dataIndex: 'amountClaimedPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'amountApprovedPaise', title: 'Approved', dataIndex: 'amountApprovedPaise', align: 'right', priority: 2,
      render: (v) => (v ? <MoneyText paise={v} strong /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'ageDays', title: 'Age', dataIndex: 'ageDays', sorter: true, priority: 2,
      render: (v) => (
        <Typography.Text type={v > 14 ? 'danger' : undefined} className="tabular" style={{ fontSize: 12 }}>
          {v}d
        </Typography.Text>
      ),
    },
    { key: 'submittedAt', title: 'Submitted', dataIndex: 'submittedAt', sorter: true, priority: 3, render: (v) => <DateText value={v} /> },
    {
      key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
      render: (v) => <StatusTag domain="claim" code={v} />,
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(row.status) ? (
          <Button size="small" onClick={(e) => { e.stopPropagation(); setDeciding(row); setKind('APPROVED'); }}>
            Decide
          </Button>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Seller claims"
        breadcrumbs={[{ label: 'Sellers' }, { label: 'Seller claims' }]}
        subtitle="Reimbursement requests for stock lost or damaged in our care, or returned in the wrong condition."
      />

      <FilterBar
        schema={[
          { key: 'type', label: 'Claim type', kind: 'multiSelect', options: TYPES, width: 230 },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 200 },
          { key: 'submittedAt', label: 'Submitted', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search seller, order or claim"
      />

      <DataTable
        tableId="sellerClaims"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'SUBMITTED', label: 'New' },
          { key: 'UNDER_REVIEW', label: 'Under review' },
          { key: 'INFO_REQUESTED', label: 'Info requested' },
          { key: 'APPROVED', label: 'Approved' },
          { key: 'REJECTED', label: 'Rejected' },
        ]}
        emptyProps={{ title: 'No claims match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.sellerName}</Typography.Text>
              <MoneyText paise={row.amountClaimedPaise} strong />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.typeLabel}</Typography.Text>
            <StatusTag domain="claim" code={row.status} />
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(deciding)}
        onCancel={() => { setDeciding(null); setPartialRupees(null); }}
        onConfirm={(values) =>
          decide.mutate({
            id: deciding.id,
            payload: {
              decision: kind,
              reason: values.reason,
              amountApprovedPaise: kind === 'PARTIALLY_APPROVED' ? Math.round((partialRupees ?? 0) * 100) : undefined,
            },
          })
        }
        loading={decide.isPending}
        danger={kind === 'REJECTED'}
        title={`Decide this claim from ${deciding?.sellerName}`}
        description={`${deciding?.typeLabel} · order ${deciding?.orderId}`}
        impact={
          <span>
            Claimed: <MoneyText paise={deciding?.amountClaimedPaise ?? 0} strong />. Anything approved is
            paid through the seller&apos;s next payout.
          </span>
        }
        reasonRequired={kind !== 'APPROVED'}
        reasonLabel={kind === 'APPROVED' ? 'Note (optional)' : 'Explain the decision to the seller'}
        showNote={false}
        confirmLabel="Record decision"
        extraFields={
          <>
            <Form.Item label="Decision" required>
              <Select
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'APPROVED', label: 'Approve in full' },
                  { value: 'PARTIALLY_APPROVED', label: 'Approve part of it' },
                  { value: 'REJECTED', label: 'Reject' },
                  { value: 'INFO_REQUESTED', label: 'Ask for more evidence' },
                ]}
              />
            </Form.Item>
            {kind === 'PARTIALLY_APPROVED' && (
              <Form.Item
                label="Amount to approve"
                required
                help="Must be less than the amount claimed."
              >
                <InputNumber
                  style={{ width: '100%' }}
                  prefix="₹"
                  min={1}
                  max={Math.max(1, Math.floor((deciding?.amountClaimedPaise ?? 0) / 100) - 1)}
                  value={partialRupees}
                  onChange={setPartialRupees}
                />
              </Form.Item>
            )}
          </>
        }
      />
    </Flex>
  );
}
