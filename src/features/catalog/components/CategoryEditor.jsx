import { Alert, App, Button, Card, Form, Input, Modal, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import AuditDrawer from '@shared/components/AuditDrawer';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import { catalogApi, catalogKeys } from '../api/catalog.api';
import CategoryPolicyFields from './CategoryPolicyFields';

/** Editor for one category: identity, policies and the attribute set. */
export default function CategoryEditor({ categoryId, onSelect }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [addOpen, setAddOpen] = useState(false);
  const [childForm] = Form.useForm();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: catalogKeys.category(categoryId),
    queryFn: () => catalogApi.category(categoryId),
  });

  const hsn = useQuery({
    queryKey: catalogKeys.hsn({ pageSize: 100 }),
    queryFn: () => catalogApi.hsnCodes({ pageSize: 100 }),
  });

  const category = data?.data;

  useEffect(() => {
    if (category) form.setFieldsValue(category);
  }, [category, form]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const save = useMutation({
    mutationFn: (values) =>
      catalogApi.updateCategory(categoryId, { ...values, version: category.version }),
    onSuccess: () => {
      invalidate();
      message.success('Category saved');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CATEGORY_HAS_LISTINGS') {
        Modal.confirm({
          title: 'This category still holds live listings',
          content: `${e.details?.liveListings ?? 'Several'} live listings sit here. Hiding the category takes them down with it.`,
          okText: 'Hide the category and its listings',
          okButtonProps: { danger: true },
          onOk: () =>
            catalogApi
              .updateCategory(categoryId, { ...form.getFieldsValue(), hideListings: true, version: category.version })
              .then(() => {
                invalidate();
                message.success('Category hidden');
              }),
        });
        return;
      }
      if (e instanceof ApiError && e.isVersionConflict) {
        message.warning('Someone else changed this category. Reloading it.');
        refetch();
        return;
      }
      message.error(e.message);
    },
  });

  const addChild = useMutation({
    mutationFn: (values) => catalogApi.createCategory({ ...values, parentId: categoryId }),
    onSuccess: (res) => {
      invalidate();
      setAddOpen(false);
      childForm.resetFields();
      message.success('Category created');
      onSelect?.(res.data.id);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) {
        childForm.setFields(Object.entries(e.fieldErrors).map(([name, msg]) => ({ name, errors: [msg] })));
        return;
      }
      message.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => catalogApi.deleteCategory(categoryId),
    onSuccess: () => {
      invalidate();
      message.success('Category deleted');
      onSelect?.(data.meta.ancestors.at(-1)?.id ?? null);
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading category…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this category" />;

  const { ancestors, attributes, childCount, allowedActions } = data.meta;
  const isLeaf = category.level === 3;

  return (
    <Card
      size="small"
      title={
        <Space size={6} wrap>
          {ancestors.map((a) => (
            <Typography.Text key={a.id} type="secondary" style={{ fontSize: 12 }}>
              {a.name} ›
            </Typography.Text>
          ))}
          <Typography.Text strong>{category.name}</Typography.Text>
          <Tag style={{ marginInlineEnd: 0 }}>Level {category.level}</Tag>
        </Space>
      }
      extra={
        <Space size={6}>
          <AuditDrawer entityType="category" entityId={category.id} entityLabel={category.name} />
          {category.level < 3 && (
            <Can perm="catalog.category.create">
              <Button size="small" onClick={() => setAddOpen(true)}>Add child</Button>
            </Can>
          )}
          {allowedActions.includes('DELETE') && (
            <Can perm="catalog.category.delete">
              <Button
                size="small"
                danger
                loading={remove.isPending}
                onClick={() =>
                  Modal.confirm({
                    title: `Delete "${category.name}"?`,
                    content: 'Only empty categories with no children can be deleted.',
                    okText: 'Delete',
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(),
                  })
                }
              >
                Delete
              </Button>
            </Can>
          )}
        </Space>
      }
    >
      {category.liveListings > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${category.liveListings} live listings sit in this category`}
          description="Policy changes here apply to all of them."
        />
      )}

      <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => save.mutate(v)}>
        <CategoryPolicyFields
          hsnOptions={(hsn.data?.data ?? []).map((h) => ({
            value: h.code,
            label: `${h.code} — ${h.description} (${h.gstRate}%)`,
          }))}
        />

        {isLeaf && (
          <Alert
            type="info"
            style={{ marginBottom: 12 }}
            message={`Attribute set: ${data.meta.attributeSet?.name ?? 'none'}`}
            description={
              attributes.length ? (
                <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
                  {attributes.map((a) => (
                    <Tag key={a.id} style={{ marginInlineEnd: 0 }}>
                      {a.name}
                      {a.variantDefining ? ' · variant' : ''}
                    </Tag>
                  ))}
                </Space>
              ) : (
                'No attributes assigned, so listings here have no structured fields.'
              )
            }
          />
        )}

        <Space>
          <Can perm="catalog.category.edit" disable reason="You cannot edit categories">
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              Save changes
            </Button>
          </Can>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {childCount} child categor{childCount === 1 ? 'y' : 'ies'}
          </Typography.Text>
        </Space>
      </Form>

      <Modal
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => childForm.submit()}
        confirmLoading={addChild.isPending}
        title={`Add a category under "${category.name}"`}
        okText="Create"
        destroyOnHidden
      >
        <Form form={childForm} layout="vertical" requiredMark={false} onFinish={(v) => addChild.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give it a name.' }]}>
            <Input autoFocus placeholder="e.g. Running Shoes" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            It inherits this category&apos;s policies, which you can then change.
          </Typography.Text>
        </Form>
      </Modal>
    </Card>
  );
}
