import { App, Form, Input, InputNumber, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import { cmsApi } from '../api/cms.api';

const TYPES = [
  { value: 'SYNONYM', label: 'Synonym' },
  { value: 'REDIRECT', label: 'Redirect' },
  { value: 'BOOST', label: 'Boost' },
  { value: 'BURY', label: 'Bury' },
  { value: 'BLOCKED', label: 'Blocked term' },
];

export default function SearchRuleFormModal({ open, onClose, onSaved }) {
  const { message } = App.useApp();

  const create = useMutation({
    mutationFn: (payload) => cmsApi.createSearchRule(payload),
    onSuccess: () => { message.success('Rule added'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  return (
    <ConfirmActionModal
      open={open}
      onCancel={onClose}
      onConfirm={(v) => create.mutate(v)}
      loading={create.isPending}
      title="Add a search rule"
      reasonRequired={false}
      showNote={false}
      confirmLabel="Add"
      extraFields={<RuleFields />}
    />
  );
}

/** Fields shown depend on the rule type, read live off the modal's own form. */
function RuleFields() {
  const type = Form.useWatch('type');

  return (
    <>
      <Form.Item name="type" label="Rule type" rules={[{ required: true }]}>
        <Select options={TYPES} />
      </Form.Item>

      {type === 'SYNONYM' && (
        <>
          <Form.Item name="term" label="Term" rules={[{ required: true, message: 'Required.' }]}>
            <Input placeholder="tv" />
          </Form.Item>
          <Form.Item name="synonym" label="Synonym" rules={[{ required: true, message: 'Required.' }]}>
            <Input placeholder="television" />
          </Form.Item>
          <Form.Item name="direction" label="Direction" initialValue="BOTH">
            <Select options={[{ value: 'BOTH', label: 'Both ways' }, { value: 'ONE_WAY', label: 'One way' }]} />
          </Form.Item>
        </>
      )}

      {type === 'REDIRECT' && (
        <>
          <Form.Item name="keyword" label="Search keyword" rules={[{ required: true, message: 'Required.' }]}>
            <Input placeholder="iphone" />
          </Form.Item>
          <Form.Item name="targetType" label="Redirect target type" rules={[{ required: true }]}>
            <Select options={[{ value: 'BRAND', label: 'Brand' }, { value: 'CATEGORY', label: 'Category' }, { value: 'LANDING', label: 'Landing page' }]} />
          </Form.Item>
          <Form.Item name="targetLabel" label="Target" rules={[{ required: true, message: 'Required.' }]}>
            <Input placeholder="Apple" />
          </Form.Item>
        </>
      )}

      {(type === 'BOOST' || type === 'BURY') && (
        <>
          <Form.Item name="scopeType" label="Scope" rules={[{ required: true }]}>
            <Select options={[{ value: 'SELLER_FLAG', label: 'Seller flag' }, { value: 'STOCK', label: 'Stock status' }]} />
          </Form.Item>
          <Form.Item name="scopeLabel" label="Description" rules={[{ required: true, message: 'Required.' }]}>
            <Input placeholder="Assured sellers" />
          </Form.Item>
          <Form.Item name="weight" label="Weight" rules={[{ required: true }]} initialValue={type === 'BURY' ? -10 : 10}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </>
      )}

      {type === 'BLOCKED' && (
        <Form.Item name="term" label="Term to block" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="free iphone" />
        </Form.Item>
      )}
    </>
  );
}
