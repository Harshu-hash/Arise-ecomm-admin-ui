import { App, Button, Flex, Form, Modal, Select, Switch, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import DateText from '@shared/components/DateText';
import EntitySelect from '@shared/components/EntitySelect';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import DataTable from '@shared/components/DataTable/DataTable';
import { reportsApi, reportsKeys } from '../api/reports.api';

/** Scheduled reports (M15.2): a report from the library delivered on a cadence, to a chosen set of admins. */
export default function ScheduledReportsPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-lastRunAt' });
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const library = useQuery({ queryKey: reportsKeys.library, queryFn: () => reportsApi.library() });
  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: reportsKeys.scheduled(state.queryParams),
    url: '/reports/scheduled',
    params: state.queryParams,
  });

  const create = useMutation({
    mutationFn: (payload) => reportsApi.createSchedule(payload),
    onSuccess: () => { refetch(); setCreating(false); message.success('Schedule created'); },
    onError: (e) => message.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }) => reportsApi.updateSchedule(id, { enabled }),
    onSuccess: () => refetch(),
    onError: (e) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => reportsApi.deleteSchedule(id),
    onSuccess: () => { refetch(); message.success('Deleted'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'reportName', title: 'Report', dataIndex: 'reportName', alwaysVisible: true },
    { key: 'frequency', title: 'Frequency', dataIndex: 'frequency', render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> },
    { key: 'format', title: 'Format', dataIndex: 'format' },
    { key: 'recipientIds', title: 'Recipients', dataIndex: 'recipientIds', render: (v) => v.length },
    { key: 'lastRunAt', title: 'Last run', dataIndex: 'lastRunAt', render: (v) => <DateText value={v} /> },
    { key: 'nextRunAt', title: 'Next run', dataIndex: 'nextRunAt', render: (v) => <DateText value={v} /> },
    {
      key: 'enabled', title: 'Enabled', dataIndex: 'enabled',
      render: (v, row) => <Can perm="reports.schedule.edit" disable><Switch size="small" checked={v} onChange={(checked) => toggle.mutate({ id: row.id, enabled: checked })} /></Can>,
    },
    {
      key: 'actions', title: '', align: 'right',
      render: (_v, row) => (
        <Can perm="reports.schedule.delete">
          <Button size="small" type="text" danger onClick={() => remove.mutate(row.id)}>Delete</Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Scheduled reports"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Scheduled reports' }]}
        subtitle="Delivered to admin users only, as an email link to the export."
        actions={
          <Can perm="reports.schedule.create">
            <Button type="primary" onClick={() => setCreating(true)}>New schedule</Button>
          </Can>
        }
      />

      <DataTable
        tableId="scheduledReports"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No scheduled reports yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={2}>
            <Typography.Text strong style={{ fontSize: 13 }}>{row.reportName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.frequency} · {row.format}</Typography.Text>
          </Flex>
        )}
      />

      <Modal
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={async () => create.mutate(await form.validateFields())}
        title="New scheduled report"
        okButtonProps={{ loading: create.isPending }}
        destroyOnHidden
        afterOpenChange={(opened) => { if (opened) form.resetFields(); }}
      >
        <Form form={form} layout="vertical" initialValues={{ frequency: 'WEEKLY', format: 'CSV' }}>
          <Form.Item name="reportKey" label="Report" rules={[{ required: true, message: 'Choose a report.' }]}>
            <Select
              loading={library.isLoading}
              options={(library.data?.data ?? []).map((d) => ({ value: d.key, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="frequency" label="Frequency">
            <Select options={[{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }]} />
          </Form.Item>
          <Form.Item name="format" label="Format">
            <Select options={[{ value: 'CSV', label: 'CSV' }, { value: 'XLSX', label: 'XLSX' }]} />
          </Form.Item>
          <Form.Item name="recipientIds" label="Recipients" rules={[{ required: true, message: 'Choose at least one admin.' }]}>
            <EntitySelect entity="adminUser" multiple placeholder="Search admins" />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
}
