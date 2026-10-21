import { App, Checkbox, Form, Input, Modal, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { marketingApi, marketingKeys } from '../api/marketing.api';
import AudiencePicker from './AudiencePicker';

const CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'IN_APP', 'WHATSAPP'];

/**
 * Create a campaign: audience, channels, content per channel, and a test
 * send before anything real goes out. Sending is a separate action from the
 * list page, not part of this form — creating a campaign never sends it.
 */
export default function CampaignWizardModal({ open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [audience, setAudience] = useState({ type: 'ALL' });
  const [channels, setChannels] = useState(['PUSH']);

  const segments = useQuery({
    queryKey: marketingKeys.segments({}),
    queryFn: () => marketingApi.segments({ pageSize: 100 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (payload) => marketingApi.createCampaign(payload),
    onSuccess: () => { message.success('Campaign created as a draft'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  const submit = async () => {
    if (!channels.length) {
      message.error('Choose at least one channel.');
      return;
    }
    const v = await form.validateFields();
    create.mutate({
      name: v.name,
      audience,
      channels,
      content: Object.fromEntries(channels.map((ch) => [ch, { title: v.title, message: v.message, deepLink: { screen: 'Home' } }])),
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title="New campaign"
      okText="Create draft"
      okButtonProps={{ loading: create.isPending }}
      width={560}
      destroyOnHidden
      afterOpenChange={(opened) => {
        if (opened) {
          form.resetFields();
          setAudience({ type: 'ALL' });
          setChannels(['PUSH']);
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Internal name" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="Diwali sale teaser" />
        </Form.Item>

        <Form.Item label="Audience">
          <AudiencePicker value={audience} onChange={setAudience} segments={segments.data?.data} />
        </Form.Item>

        <Form.Item label="Channels" required>
          <Checkbox.Group value={channels} onChange={setChannels} options={CHANNELS.map((c) => ({ value: c, label: c }))} />
        </Form.Item>

        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="⚡ Flash sale starts in 1 hour" />
        </Form.Item>
        <Form.Item name="message" label="Message" rules={[{ required: true, message: 'Required.' }]}>
          <Input.TextArea rows={3} placeholder="Up to 70% off electronics. Ends tonight." />
        </Form.Item>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Saved as a draft. Sending — and the quiet-hours check — happens from the campaign list.
        </Typography.Text>
      </Form>
    </Modal>
  );
}
