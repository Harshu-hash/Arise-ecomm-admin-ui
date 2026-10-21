import { App, Button, DatePicker, Flex, Form, Space, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { dayjs } from '@core/utils/date';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { sellerKeys, sellerOpsApi } from '../api/sellers.api';

const TYPE_LABEL = {
  BRAND_OWNER: 'Brand owner',
  RESELLER_AUTHORISED: 'Authorised reseller',
  NEW_BRAND: 'New brand',
};

export default function BrandApprovalsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: 'submittedAt' });
  const [decision, setDecision] = useState(null);
  const [validTill, setValidTill] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: sellerKeys.brandRequests({ ...state.queryParams, tab: state.tab }),
    url: '/brand-requests',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const decide = useMutation({
    mutationFn: ({ id, payload }) => sellerOpsApi.decideBrandRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandRequests'] });
      setDecision(null);
      setValidTill(null);
      message.success('Decision recorded');
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
    { key: 'brandName', title: 'Brand', dataIndex: 'brandName', sorter: true, priority: 1 },
    {
      key: 'requestType', title: 'Claim', dataIndex: 'requestType', priority: 1,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      key: 'documents', title: 'Documents', dataIndex: 'documents', priority: 2,
      render: (docs) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {docs.map((d) => d.label).join(', ')}
        </Typography.Text>
      ),
    },
    { key: 'submittedAt', title: 'Submitted', dataIndex: 'submittedAt', sorter: true, priority: 2, render: (v) => <DateText value={v} /> },
    {
      key: 'validTill', title: 'Valid till', dataIndex: 'validTill', priority: 3,
      render: (v) => (v ? <DateText value={v} variant="date" /> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
      render: (v) => (
        <Tag color={v === 'APPROVED' ? 'green' : v === 'REJECTED' ? 'red' : 'gold'} style={{ marginInlineEnd: 0 }}>
          {v.replace(/_/g, ' ')}
        </Tag>
      ),
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) =>
        ['PENDING', 'INFO_REQUESTED'].includes(row.status) ? (
          <Space size={4}>
            <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); setDecision({ row, kind: 'APPROVED' }); }}>
              Approve
            </Button>
            <Button size="small" danger onClick={(e) => { e.stopPropagation(); setDecision({ row, kind: 'REJECTED' }); }}>
              Reject
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Brand approvals"
        breadcrumbs={[{ label: 'Sellers' }, { label: 'Brand approvals' }]}
        subtitle="Sellers claiming the right to list a brand. Check the authorisation before approving."
      />

      <FilterBar
        schema={[
          {
            key: 'requestType', label: 'Claim type', kind: 'select', width: 190,
            options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
          },
          { key: 'submittedAt', label: 'Submitted', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search seller or brand"
      />

      <DataTable
        tableId="brandRequests"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'PENDING', label: 'Pending' },
          { key: 'INFO_REQUESTED', label: 'Info requested' },
          { key: 'APPROVED', label: 'Approved' },
          { key: 'REJECTED', label: 'Rejected' },
        ]}
        emptyProps={{ title: 'No brand requests here' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text strong>{row.brandName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.sellerName}</Typography.Text>
            <Tag style={{ marginInlineEnd: 0, width: 'fit-content' }}>{TYPE_LABEL[row.requestType]}</Tag>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(decision)}
        onCancel={() => { setDecision(null); setValidTill(null); }}
        onConfirm={(values) =>
          decide.mutate({
            id: decision.row.id,
            payload: {
              decision: decision.kind,
              reason: values.reason,
              validTill: validTill ? validTill.toISOString() : null,
            },
          })
        }
        loading={decide.isPending}
        danger={decision?.kind === 'REJECTED'}
        title={
          decision?.kind === 'APPROVED'
            ? `Authorise ${decision?.row?.sellerName} to sell ${decision?.row?.brandName}?`
            : `Reject this ${decision?.row?.brandName} claim?`
        }
        description={decision?.row?.documents?.map((d) => d.label).join(' · ')}
        impact={
          decision?.kind === 'APPROVED'
            ? 'Their listings for this brand go live. Listings are deactivated automatically when the authorisation expires.'
            : 'The seller cannot list this brand and is told why.'
        }
        reasonRequired={decision?.kind !== 'APPROVED'}
        reasonLabel={decision?.kind === 'APPROVED' ? 'Note (optional)' : 'What is wrong with the authorisation?'}
        showNote={false}
        confirmLabel={decision?.kind === 'APPROVED' ? 'Approve authorisation' : 'Reject claim'}
        extraFields={
          decision?.kind === 'APPROVED' ? (
            <Form.Item
              label="Authorisation valid until"
              required
              help="Authorisations always expire; the seller re-submits before this date."
            >
              <DatePicker
                style={{ width: '100%' }}
                value={validTill}
                onChange={setValidTill}
                disabledDate={(d) => d && d < dayjs().endOf('day')}
              />
            </Form.Item>
          ) : null
        }
      />
    </Flex>
  );
}
