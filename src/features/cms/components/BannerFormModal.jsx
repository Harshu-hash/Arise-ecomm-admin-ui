import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { dayjs } from '@core/utils/date';
import { cmsApi } from '../api/cms.api';

const PLACEMENTS = [
  { value: 'HOME_HERO', label: 'Home hero' },
  { value: 'HOME_AD_TILES', label: 'Home ad tiles' },
  { value: 'OFFERS_PAGE', label: 'Offers page' },
];

/**
 * A banner's image is a URL rather than an upload: there is no real asset
 * store behind this mock, and every other image in the catalog (product
 * photos, seller logos) is already just a string — a dedicated
 * ImageUploader would have nowhere real to put the file.
 */
export default function BannerFormModal({ banner, open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (banner) {
      form.setFieldsValue({
        name: banner.name,
        kind: banner.kind,
        imageUrl: banner.images?.mobile_16_9 ?? '',
        altText: banner.altText,
        placements: banner.placements,
        window: [dayjs(banner.startsAt), dayjs(banner.endsAt)],
      });
    } else {
      form.setFieldsValue({ kind: 'HERO', placements: ['HOME_HERO'], window: [dayjs(), dayjs().add(14, 'day')] });
    }
  }, [open, banner, form]);

  const create = useMutation({
    mutationFn: (payload) => cmsApi.createBanner(payload),
    onSuccess: () => { message.success('Banner created'); onSaved(); },
    onError: (e) => message.error(e.message),
  });
  const update = useMutation({
    mutationFn: (payload) => cmsApi.updateBanner(banner.id, payload),
    onSuccess: () => { message.success('Saved'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  const submit = async () => {
    const v = await form.validateFields();
    const payload = {
      name: v.name,
      kind: v.kind,
      images: { mobile_16_9: v.imageUrl, tile_1_1: v.imageUrl, web: v.imageUrl },
      altText: v.altText,
      placements: v.placements,
      startsAt: v.window[0].startOf('day').toISOString(),
      endsAt: v.window[1].endOf('day').toISOString(),
    };
    if (banner) update.mutate(payload);
    else create.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title={banner ? `Edit ${banner.name}` : 'New banner'}
      okText="Save"
      okButtonProps={{ loading: create.isPending || update.isPending }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="Monsoon sale hero" />
        </Form.Item>
        <Form.Item name="kind" label="Kind">
          <Select options={[{ value: 'HERO', label: 'Hero (16:9)' }, { value: 'TILE', label: 'Tile (1:1)' }]} />
        </Form.Item>
        <Form.Item name="imageUrl" label="Image URL" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="https://…" />
        </Form.Item>
        <Form.Item name="altText" label="Alt text" rules={[{ required: true, message: 'Required for accessibility.' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="placements" label="Placements" rules={[{ required: true }]}>
          <Select mode="multiple" options={PLACEMENTS} />
        </Form.Item>
        <Form.Item name="window" label="Schedule" rules={[{ required: true }]}>
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
