import { App, Button, Flex, Input, Modal, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { supportApi, supportKeys } from '../api/support.api';

/** Canned replies with `{{variables}}`, rendered with the ticket's own data before an agent sends them. */
export default function MacrosPage() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-usageCount' });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: supportKeys.macros(state.queryParams),
    url: '/macros',
    params: state.queryParams,
  });

  const remove = useMutation({
    mutationFn: (id) => supportApi.deleteMacro(id),
    onSuccess: () => { refetch(); setDeleting(null); message.success('Removed'); },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      key: 'name', title: 'Macro', dataIndex: 'name', alwaysVisible: true,
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Typography.Text strong style={{ fontSize: 13 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>{row.body}</Typography.Text>
        </Flex>
      ),
    },
    { key: 'category', title: 'Category', dataIndex: 'category', priority: 2, render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> },
    { key: 'usageCount', title: 'Used', dataIndex: 'usageCount', sorter: true, align: 'right', priority: 1 },
    { key: 'shared', title: 'Shared', dataIndex: 'shared', priority: 3, render: (v) => (v ? 'Shared' : 'Personal') },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => (
        <Flex gap={4} onClick={(e) => e.stopPropagation()}>
          <Can perm="support.macro.edit">
            <Button size="small" type="text" onClick={() => setEditing(row)}>Edit</Button>
          </Can>
          <Can perm="support.macro.delete">
            <Button size="small" type="text" danger onClick={() => setDeleting(row)}>Remove</Button>
          </Can>
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Macros"
        breadcrumbs={[{ label: 'Support' }, { label: 'Macros' }]}
        subtitle="Canned replies with variables like {{customer.name}} and {{order.id}}, rendered before an agent sends them."
        actions={
          <Can perm="support.macro.create">
            <Button type="primary" onClick={() => setCreating(true)}>New macro</Button>
          </Can>
        }
      />

      <DataTable
        tableId="macros"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No macros yet' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text strong style={{ fontSize: 13 }}>{row.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{row.body}</Typography.Text>
          </Flex>
        )}
      />

      <MacroFormModal
        macro={editing}
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={() => { refetch(); setEditing(null); setCreating(false); }}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Remove this macro"
        description={deleting?.name}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}

function MacroFormModal({ macro, open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(macro?.name ?? '');
    setCategory(macro?.category ?? 'General');
    setBody(macro?.body ?? '');
  }, [open, macro]);

  const create = useMutation({
    mutationFn: () => supportApi.createMacro({ name, category, body }),
    onSuccess: () => { message.success('Macro created'); onSaved(); },
    onError: (e) => message.error(e.message),
  });
  const update = useMutation({
    mutationFn: () => supportApi.updateMacro(macro.id, { name, category, body }),
    onSuccess: () => { message.success('Saved'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => (macro ? update.mutate() : create.mutate())}
      title={macro ? 'Edit macro' : 'New macro'}
      okText="Save"
      okButtonProps={{ loading: create.isPending || update.isPending }}
      destroyOnHidden
    >
      <Flex vertical gap={10}>
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <Input.TextArea
          rows={5}
          placeholder="Hi {{customer.name}}, your order {{order.id}}…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Variables: {'{{customer.name}}'}, {'{{order.id}}'}, {'{{refund.amount}}'}, {'{{refund.eta}}'}
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
