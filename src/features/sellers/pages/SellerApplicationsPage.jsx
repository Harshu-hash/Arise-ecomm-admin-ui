import { Flex, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { slaCountdown } from '@core/utils/date';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { sellerKeys } from '../api/sellers.api';
import { applicationColumns } from '../sellerColumns';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'APPLIED', label: 'New' },
  { key: 'DOCUMENTS_PENDING', label: 'Documents pending' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'NEEDS_INFO', label: 'Needs info' },
  { key: 'ONBOARDING', label: 'Approved', codes: ['APPROVED', 'ONBOARDING'] },
  { key: 'REJECTED', label: 'Rejected' },
];

export default function SellerApplicationsPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: 'appliedAt' });

  const tabCodes = TABS.find((t) => t.key === state.tab)?.codes;
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: sellerKeys.applications({ ...state.queryParams, tab: state.tab }),
    url: '/sellers/applications',
    params: {
      ...state.queryParams,
      ...(state.tab ? { status: (tabCodes ?? [state.tab]).join(',') } : {}),
    },
  });

  const breaching = rows.filter(
    (r) => !['APPROVED', 'ONBOARDING', 'REJECTED'].includes(r.status) && slaCountdown(r.slaDueAt).overdue,
  ).length;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Onboarding applications"
        breadcrumbs={[{ label: 'Sellers' }, { label: 'Onboarding applications' }]}
        subtitle="Review KYC, then approve, ask for more, or reject. The onboarding SLA is 48 hours."
        meta={
          breaching > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {breaching} past the 48-hour SLA on this page
            </Typography.Text>
          )
        }
      />

      <FilterBar
        schema={[
          { key: 'state', label: 'State', kind: 'text', width: 150 },
          { key: 'appliedAt', label: 'Applied', kind: 'dateRange' },
          { key: 'slaBreached', label: 'Past SLA only', kind: 'boolean' },
        ]}
        tableState={state}
        searchPlaceholder="Search applicant, GSTIN or ID"
      />

      <DataTable
        tableId="sellerApplications"
        columns={applicationColumns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        tabs={TABS}
        onRowClick={(row) => navigate(`/sellers/${row.id}/review`)}
        emptyProps={{
          title: 'No applications here',
          description: 'New seller applications land in this queue as they arrive.',
        }}
        mobileCard={(row) => (
          <Flex vertical gap={6}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{row.storeName}</Typography.Text>
              <StatusTag domain="seller" code={row.status} />
            </Flex>
            <Space size={4} wrap>
              <Tag color={row.gstinOk ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>GST</Tag>
              <Tag color={row.panOk ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>PAN</Tag>
              <Tag color={row.bankOk ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>Bank</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {row.documentsApproved}/{row.documentsTotal} documents
              </Typography.Text>
            </Space>
          </Flex>
        )}
      />
    </Flex>
  );
}
