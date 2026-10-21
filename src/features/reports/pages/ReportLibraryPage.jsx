import { App, Button, Card, Flex, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Can } from '@core/rbac/Can';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { reportsApi, reportsKeys } from '../api/reports.api';

const DOMAIN_LABEL = { sales: 'Sales', operations: 'Operations', finance: 'Finance' };

/** Report library (M15.2): predefined tabular reports, run on demand through the same export-job infrastructure every list's "Export" button uses. */
export default function ReportLibraryPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: reportsKeys.library, queryFn: () => reportsApi.library() });

  const run = useMutation({
    mutationFn: (reportKey) => reportsApi.runReport(reportKey),
    onSuccess: () => message.success('Started — track it in the Export Center.'),
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Report library"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Report library' }]}
        subtitle="Running a report creates a job in the Export Center, the same as exporting any list."
      />

      {query.data.data.map((def) => (
        <Card key={def.id} size="small">
          <Flex justify="space-between" align="flex-start" gap={12}>
            <Flex vertical gap={4} style={{ minWidth: 0 }}>
              <Flex gap={8} align="center">
                <Typography.Text strong>{def.name}</Typography.Text>
                <Tag style={{ marginInlineEnd: 0 }}>{DOMAIN_LABEL[def.domain] ?? def.domain}</Tag>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>{def.description}</Typography.Text>
              <Flex gap={4} wrap>
                {def.columns.map((c) => <Tag key={c} style={{ marginInlineEnd: 0, fontSize: 11 }}>{c}</Tag>)}
              </Flex>
            </Flex>
            <Can perm="reports.library.export">
              <Button onClick={() => run.mutate(def.key)} loading={run.isPending}>Run</Button>
            </Can>
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
