import { App, Button, Flex, Form, Input, Select, Switch, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { cmsApi, cmsKeys } from '../api/cms.api';

const LISTS = [
  { key: 'CANCEL', label: 'Customer cancel reasons' },
  { key: 'RETURN', label: 'Return reasons' },
  { key: 'TICKET_SUBJECT', label: 'Ticket subjects' },
  { key: 'ADMIN_ACTION', label: 'Admin action reasons' },
  { key: 'NDR', label: 'NDR reasons' },
];

/**
 * Reason masters (M12.7): one place for every reason list the app and admin
 * use. Return reasons carry a fault attribution, which decides who pays the
 * reverse shipping fee — the one field this screen cannot let through empty.
 */
export default function ReasonMastersPage() {
  const { message } = App.useApp();
  const [listKey, setListKey] = useState('CANCEL');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const query = useQuery({
    queryKey: cmsKeys.reasonLists(listKey),
    queryFn: () => cmsApi.reasonLists(listKey),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }) => cmsApi.updateReason(id, payload),
    onSuccess: () => query.refetch(),
    onError: (e) => message.error(e.message),
  });
  const create = useMutation({
    mutationFn: (payload) => cmsApi.createReason(payload),
    onSuccess: () => { query.refetch(); setAdding(false); message.success('Added'); },
    onError: (e) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => cmsApi.deleteReason(id),
    onSuccess: () => { query.refetch(); setDeleting(null); message.success('Removed'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'label', title: 'Reason', dataIndex: 'label' },
    {
      key: 'faultAttribution', title: 'Fault', dataIndex: 'faultAttribution', width: 120,
      render: (v) => (v ? <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      key: 'active', title: 'Active', dataIndex: 'active', width: 80,
      render: (v, row) => (
        <Can perm="cms.reasons.edit" disable>
          <Switch size="small" checked={v} onChange={(active) => update.mutate({ id: row.id, payload: { active } })} />
        </Can>
      ),
    },
    {
      key: 'actions', title: '', align: 'right', width: 90,
      render: (_v, row) =>
        row.code !== 'OTHER' ? (
          <Can perm="cms.reasons.delete">
            <Button size="small" type="text" danger onClick={() => setDeleting(row)}>Remove</Button>
          </Can>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>protected</Typography.Text>
        ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Reason masters"
        breadcrumbs={[{ label: 'Content' }, { label: 'Reason masters' }]}
        subtitle="Every reason list the app and admin pickers use, in one place. Order here is the order customers see."
        actions={
          <Can perm="cms.reasons.create">
            <Button type="primary" onClick={() => setAdding(true)}>Add reason</Button>
          </Can>
        }
      />

      <Select value={listKey} onChange={setListKey} style={{ width: 260 }} options={LISTS.map((l) => ({ value: l.key, label: l.label }))} />

      {query.isLoading ? <FullPageSpinner /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      {query.data ? (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={[...query.data.data].sort((a, b) => a.order - b.order)}
          columns={columns}
        />
      ) : null}

      <AddReasonModal
        listKey={listKey}
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={(v) => create.mutate({ listKey, ...v })}
        loading={create.isPending}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Remove this reason"
        description={deleting?.label}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}

function AddReasonModal({ listKey, open, onClose, onSubmit, loading }) {
  return (
    <ConfirmActionModal
      open={open}
      onCancel={onClose}
      onConfirm={(v) => onSubmit(v)}
      loading={loading}
      title="Add a reason"
      description={LISTS.find((l) => l.key === listKey)?.label}
      reasonRequired={false}
      showNote={false}
      confirmLabel="Add"
      extraFields={
        <>
          <Form.Item name="label" label="Reason text" rules={[{ required: true, message: 'Required.' }]}>
            <Input />
          </Form.Item>
          {listKey === 'RETURN' && (
            <Form.Item name="faultAttribution" label="Fault attribution" rules={[{ required: true, message: 'Decides who pays the reverse shipping fee.' }]}>
              <Select options={[{ value: 'CUSTOMER', label: 'Customer' }, { value: 'SELLER', label: 'Seller' }, { value: 'COURIER', label: 'Courier' }]} />
            </Form.Item>
          )}
        </>
      }
    />
  );
}
