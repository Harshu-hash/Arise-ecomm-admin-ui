import { App, Form, Input, Modal, Segmented, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@core/api/errors';
import RuleBuilder from '@shared/components/RuleBuilder';
import { SEGMENT_FIELDS } from '../segmentFields';
import { marketingApi } from '../api/marketing.api';
import useSegmentPreview from '../useSegmentPreview';

/** Create or edit a segment: name, the rule, and a live member count as it is built. */
export default function SegmentFormModal({ segment, open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [rule, setRule] = useState({ match: 'ALL', conditions: [] });
  const [kind, setKind] = useState('DYNAMIC');

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (segment) {
      form.setFieldsValue({ name: segment.name, description: segment.description });
      setRule(segment.rule?.conditions ? segment.rule : { match: 'ALL', conditions: segment.rule ? [segment.rule] : [] });
      setKind(segment.kind);
    } else {
      setRule({ match: 'ALL', conditions: [] });
      setKind('DYNAMIC');
    }
  }, [open, segment, form]);

  const preview = useSegmentPreview(rule, open);

  const create = useMutation({
    mutationFn: (payload) => marketingApi.createSegment(payload),
    onSuccess: () => { message.success('Segment created'); onSaved(); },
    onError: (e) => handleError(e),
  });
  const update = useMutation({
    mutationFn: (payload) => marketingApi.updateSegment(segment.id, payload),
    onSuccess: () => { message.success('Saved'); onSaved(); },
    onError: (e) => handleError(e),
  });

  function handleError(e) {
    if (e instanceof ApiError && e.fieldErrors) {
      form.setFields(Object.entries(e.fieldErrors).map(([name, errors]) => ({ name, errors: [errors] })));
      return;
    }
    message.error(e.message);
  }

  const submit = async () => {
    const v = await form.validateFields();
    const payload = { name: v.name, description: v.description, rule, kind };
    if (segment) update.mutate(payload);
    else create.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title={segment ? `Edit ${segment.name}` : 'New segment'}
      okText="Save"
      okButtonProps={{ loading: create.isPending || update.isPending }}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the segment a name.' }]}>
          <Input placeholder="High-value customers" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input placeholder="What this segment is for" />
        </Form.Item>

        <Form.Item label="Rule">
          <RuleBuilder value={rule} onChange={setRule} fields={SEGMENT_FIELDS} />
        </Form.Item>

        <Form.Item label="Type" extra={
          kind === 'STATIC'
            ? 'Membership is frozen the moment this is saved.'
            : 'Membership is re-evaluated every time this segment is used.'
        }>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[{ value: 'DYNAMIC', label: 'Dynamic' }, { value: 'STATIC', label: 'Static snapshot' }]}
          />
        </Form.Item>

        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Matches <strong className="tabular">{preview.data?.data?.memberCount ?? '…'}</strong> customers right now.
        </Typography.Text>
      </Form>
    </Modal>
  );
}
