import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Form, Input, Modal, Space, Switch, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { cmsApi, cmsKeys } from '../api/cms.api';

/** Onboarding slides (M12.3): the app's first-run carousel. */
export default function OnboardingPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const query = useQuery({ queryKey: cmsKeys.onboardingSlides, queryFn: () => cmsApi.onboardingSlides() });

  const create = useMutation({
    mutationFn: (payload) => cmsApi.createOnboardingSlide(payload),
    onSuccess: () => { query.refetch(); setCreating(false); message.success('Slide added'); },
    onError: (e) => message.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }) => cmsApi.updateOnboardingSlide(id, payload),
    onSuccess: () => { query.refetch(); setEditing(null); message.success('Saved'); },
    onError: (e) => message.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: (orderedIds) => cmsApi.reorderOnboardingSlides(orderedIds),
    onSuccess: () => query.refetch(),
    onError: (e) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => cmsApi.deleteOnboardingSlide(id),
    onSuccess: () => { query.refetch(); setDeleting(null); message.success('Removed'); },
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const slides = query.data.data;
  const move = (index, dir) => {
    const next = [...slides];
    const [row] = next.splice(index, 1);
    next.splice(index + dir, 0, row);
    reorder.mutate(next.map((s) => s.id));
  };

  const openForm = (slide) => {
    setEditing(slide);
    form.setFieldsValue(slide ?? { icon: 'star', title: '', description: '', bg: '#EFF6FF' });
  };

  const submit = async () => {
    const v = await form.validateFields();
    if (editing) update.mutate({ id: editing.id, payload: v });
    else create.mutate(v);
  };

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Onboarding slides"
        breadcrumbs={[{ label: 'Content' }, { label: 'Onboarding' }]}
        subtitle="The first-run carousel a new install sees before sign-in."
        actions={
          <Can perm="cms.onboarding.create">
            <Button type="primary" onClick={() => { setCreating(true); openForm(null); }}>New slide</Button>
          </Can>
        }
      />

      <Flex gap={10} wrap>
        {slides.map((slide, index) => (
          <Card
            key={slide.id}
            size="small"
            style={{ width: 220, background: slide.bg }}
            onClick={() => { setCreating(false); openForm(slide); }}
            hoverable
          >
            <Flex vertical gap={6}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>#{index + 1} · {slide.icon}</Typography.Text>
              <Typography.Text strong style={{ fontSize: 13 }}>{slide.title}</Typography.Text>
              <Typography.Text style={{ fontSize: 11 }} ellipsis={{ tooltip: slide.description }}>{slide.description}</Typography.Text>
              <Flex justify="space-between" align="center" onClick={(e) => e.stopPropagation()}>
                <Switch size="small" checked={slide.active} onChange={(active) => update.mutate({ id: slide.id, payload: { active } })} />
                <Space size={0}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up" />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === slides.length - 1} onClick={() => move(index, 1)} aria-label="Move down" />
                  <Can perm="cms.onboarding.delete">
                    <Button size="small" type="text" danger onClick={() => setDeleting(slide)}>×</Button>
                  </Can>
                </Space>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>

      <Modal
        open={Boolean(editing) || creating}
        onCancel={() => { setEditing(null); setCreating(false); }}
        onOk={submit}
        title={editing ? 'Edit slide' : 'New slide'}
        okText="Save"
        okButtonProps={{ loading: create.isPending || update.isPending }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="icon" label="Icon name">
            <Input placeholder="shopping-bag" />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Required.' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="bg" label="Background color">
            <Input type="color" style={{ width: 80 }} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Remove this slide"
        description={deleting?.title}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}
