import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { settingsApi } from '../api/settings.api';

/** Creates or edits a feature flag. A flag's reach is decided by this one rule set — platform, min version, segment and rollout % — never a stored yes/no. */
export default function FeatureFlagModal({ open, flag, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const save = useMutation({
    mutationFn: (values) => (flag ? settingsApi.updateFlag(flag.id, values) : settingsApi.createFlag(values)),
    onSuccess: () => { message.success(flag ? 'Updated' : 'Created'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  const submit = async () => {
    const v = await form.validateFields();
    save.mutate(v);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title={flag ? `Edit ${flag.label}` : 'New feature flag'}
      okButtonProps={{ loading: save.isPending }}
      destroyOnHidden
      afterOpenChange={(opened) => { if (opened) form.setFieldsValue(flag ?? { enabled: false, rolloutPct: 100, platform: 'ALL' }); }}
    >
      <Form form={form} layout="vertical">
        {!flag && (
          <Form.Item name="key" label="Key" rules={[{ required: true, message: 'Required.' }]} extra="A stable identifier the app checks, e.g. new_checkout_flow.">
            <Input placeholder="new_checkout_flow" />
          </Form.Item>
        )}
        <Form.Item name="label" label="Label" rules={[{ required: true, message: 'Required.' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="platform" label="Platform">
          <Select options={[
            { value: 'ALL', label: 'All platforms' },
            { value: 'ANDROID', label: 'Android' },
            { value: 'IOS', label: 'iOS' },
            { value: 'WEB', label: 'Web' },
          ]}
          />
        </Form.Item>
        <Form.Item name="minAppVersion" label="Minimum app version" extra="Leave blank for no minimum.">
          <Input placeholder="2.4.0" />
        </Form.Item>
        <Form.Item name="rolloutPct" label="Rollout %" rules={[{ required: true, message: 'Required.' }]}>
          <InputNumber min={0} max={100} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
