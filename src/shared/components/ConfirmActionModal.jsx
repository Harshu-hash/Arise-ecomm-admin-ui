import { ExclamationCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';

/**
 * The confirmation dialog used for every consequential action.
 *
 * Three things make it more than a yes/no:
 *  - `impact` spells out what will actually happen (money moved, listings
 *    hidden, customers notified) before the user commits;
 *  - a reason is captured where the domain requires one, and goes to the audit
 *    log, not just the screen;
 *  - `typeToConfirm` forces deliberate typing for destructive or high-value
 *    actions, which is the only reliable guard against a misplaced click.
 *
 * When `needsApproval` is set, the primary button says so — the user is
 * raising a request, not performing the action, and should not be surprised
 * afterwards.
 */
export default function ConfirmActionModal({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  impact,
  reasons,
  reasonLabel = 'Reason',
  reasonRequired = true,
  noteLabel = 'Note (optional)',
  showNote = true,
  danger = false,
  needsApproval = false,
  typeToConfirm,
  confirmLabel,
  loading,
  extraFields,
}) {
  const [form] = Form.useForm();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      form.resetFields();
      setTyped('');
    }
  }, [open, form]);

  const typeGateOk = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();

  const submit = async () => {
    const values = await form.validateFields();
    onConfirm(values);
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={submit}
      title={
        <Space>
          {danger ? <ExclamationCircleFilled style={{ color: 'var(--ant-color-error)' }} /> : null}
          {title}
        </Space>
      }
      okText={confirmLabel ?? (needsApproval ? 'Send for approval' : 'Confirm')}
      okButtonProps={{ danger, disabled: !typeGateOk, loading }}
      cancelButtonProps={{ disabled: loading }}
      destroyOnHidden
      maskClosable={!loading}
      width={520}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {description && <Typography.Paragraph style={{ margin: 0 }}>{description}</Typography.Paragraph>}

        {needsApproval && (
          <Alert
            type="info"
            showIcon
            icon={<SafetyCertificateOutlined />}
            message="This action needs a second approver"
            description="It will be sent to the approvals inbox and takes effect once someone else approves it."
          />
        )}

        {impact && (
          <Alert
            type={danger ? 'warning' : 'info'}
            showIcon
            message="What will happen"
            description={impact}
          />
        )}

        <Form form={form} layout="vertical" requiredMark={false} disabled={loading}>
          {reasons && (
            <Form.Item
              name="reason"
              label={reasonLabel}
              rules={reasonRequired ? [{ required: true, message: 'Choose a reason.' }] : []}
            >
              <Select
                placeholder="Select a reason"
                options={reasons.map((r) => (typeof r === 'string' ? { label: r, value: r } : r))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}

          {!reasons && reasonRequired && (
            <Form.Item
              name="reason"
              label={reasonLabel}
              rules={[{ required: true, message: 'Give a reason.' }]}
            >
              <Input.TextArea rows={2} placeholder="This is recorded in the audit log" />
            </Form.Item>
          )}

          {extraFields}

          {showNote && (
            <Form.Item name="note" label={noteLabel} style={{ marginBottom: typeToConfirm ? 12 : 0 }}>
              <Input.TextArea rows={2} placeholder="Anything a colleague would need to know later" />
            </Form.Item>
          )}

          {typeToConfirm && (
            <Form.Item
              label={
                <span>
                  Type <Typography.Text strong code>{typeToConfirm}</Typography.Text> to confirm
                </span>
              }
              style={{ marginBottom: 0 }}
              validateStatus={typed && !typeGateOk ? 'error' : undefined}
              help={typed && !typeGateOk ? 'That does not match.' : undefined}
            >
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </Form.Item>
          )}
        </Form>
      </Space>
    </Modal>
  );
}
