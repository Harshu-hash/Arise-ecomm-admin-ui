import { Card, Flex, Form, Input, Select } from 'antd';
import { SCOPE_DIMENSIONS, SCOPE_LIMITS } from '@core/rbac/scopes';

const SCOPE_OPTIONS = [
  ...SCOPE_DIMENSIONS.map((d) => ({ value: d.key, label: d.label })),
  ...SCOPE_LIMITS.map((l) => ({ value: l.key, label: l.label })),
];

/** Name, scope dimensions, description and the reason for the change. */
export default function RoleDetailsForm({ form, readOnly, saving, isNew, onSubmit, onDirty }) {
  return (
    <Card size="small">
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={readOnly || saving}
        onFinish={onSubmit}
        onValuesChange={onDirty}
      >
        <Flex gap={12} wrap>
          <Form.Item
            name="name"
            label="Role name"
            rules={[{ required: true, message: 'Give the role a name.' }]}
            style={{ flex: '1 1 240px', marginBottom: 12 }}
          >
            <Input placeholder="Regional Catalog Lead" />
          </Form.Item>

          <Form.Item
            name="scopedBy"
            label="Scoped by"
            extra="Dimensions an admin must be narrowed to when given this role."
            style={{ flex: '1 1 240px', marginBottom: 12 }}
          >
            <Select mode="multiple" options={SCOPE_OPTIONS} placeholder="Unrestricted" />
          </Form.Item>
        </Flex>

        <Form.Item name="description" label="Description" style={{ marginBottom: 12 }}>
          <Input.TextArea rows={2} placeholder="What this role is for, in one line." />
        </Form.Item>

        {!readOnly && (
          <Form.Item
            name="reason"
            label="Reason for this change"
            extra="Shown to the approver and kept in the audit log."
            rules={[{ required: !isNew, message: 'Give a reason.' }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="e.g. new regional team needs QC access for South categories" />
          </Form.Item>
        )}
      </Form>
    </Card>
  );
}
