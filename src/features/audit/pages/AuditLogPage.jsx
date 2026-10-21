import { App, Flex, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { SEVERITY_COLOR, auditColumns, auditFilterSchema } from '../auditColumns';
import AuditEntryDrawer from '../components/AuditEntryDrawer';

/**
 * The immutable record of who did what. Entries are never edited or deleted —
 * corrections happen as new entries.
 */
export default function AuditLogPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-at', defaultPageSize: 50 });
  const [detail, setDetail] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: qk.audit.list(state.queryParams),
    url: '/audit-events',
    params: state.queryParams,
  });

  const exportLog = async () => {
    try {
      await api.post('/audit-events/export', { filters: state.queryParams });
      message.success('Export started. It will appear in the Export Center when ready.');
    } catch (e) {
      message.error(e.message);
    }
  };

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Audit log"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit log' }]}
        subtitle="Every change and every reveal of personal data, append-only."
      />

      <FilterBar
        schema={auditFilterSchema(meta?.filterOptions)}
        tableState={state}
        searchPlaceholder="Search who, action, record or reason"
      />

      <DataTable
        tableId="auditLog"
        columns={auditColumns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        onRowClick={setDetail}
        onExport={exportLog}
        exportPerm="admin.audit.export"
        emptyProps={{ title: 'No audit entries match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Tag
                color={SEVERITY_COLOR[row.severity]}
                className="mono"
                style={{ marginInlineEnd: 0, fontSize: 11 }}
              >
                {row.action}
              </Tag>
              <DateText value={row.at} />
            </Flex>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {row.entityLabel}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.actorName}
            </Typography.Text>
          </Flex>
        )}
      />

      <AuditEntryDrawer entry={detail} onClose={() => setDetail(null)} />
    </Flex>
  );
}
