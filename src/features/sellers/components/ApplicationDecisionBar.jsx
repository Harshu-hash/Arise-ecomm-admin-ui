import { CheckOutlined, CloseOutlined, QuestionOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Flex, Form, Space, Typography } from 'antd';
import { useState } from 'react';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';

const INFO_ITEMS = [
  'Upload a clearer GST certificate',
  'Upload a cancelled cheque matching the registered business name',
  'Bank account name does not match — provide a correction or a different account',
  'Pickup address proof is missing',
  'Provide the category licence (FSSAI / BIS / drug licence)',
  'Brand authorisation letter is missing or not on letterhead',
];

const REJECT_REASONS = [
  'GSTIN belongs to a different entity',
  'Documents appear forged or altered',
  'Matches a previously blacklisted seller',
  'Prohibited product category',
  'Applicant did not respond to information requests',
  'Other',
];

/**
 * The decision bar at the foot of the review workbench.
 *
 * Approve stays disabled while blockers remain and lists exactly what is
 * outstanding, so a reviewer is never left guessing why they cannot proceed.
 */
export default function ApplicationDecisionBar({ seller, blockers, allowedActions, onDecide, loading }) {
  const [open, setOpen] = useState(null);
  const [infoItems, setInfoItems] = useState([]);

  const canApprove = allowedActions.includes('APPROVE');
  const ready = blockers.length === 0;

  return (
    <Card size="small" style={{ position: 'sticky', bottom: 0, zIndex: 3 }}>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <div style={{ minWidth: 0 }}>
          {ready ? (
            <Typography.Text type="success" strong style={{ fontSize: 13 }}>
              Everything checks out — this application can be approved.
            </Typography.Text>
          ) : (
            <Space direction="vertical" size={2}>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {blockers.length} thing{blockers.length === 1 ? '' : 's'} left before approval
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {blockers.slice(0, 2).join(' · ')}
                {blockers.length > 2 ? ` · +${blockers.length - 2} more` : ''}
              </Typography.Text>
            </Space>
          )}
        </div>

        <Space wrap>
          {allowedActions.includes('REQUEST_INFO') && (
            <Button icon={<QuestionOutlined />} onClick={() => setOpen('INFO')}>
              Request information
            </Button>
          )}
          {allowedActions.includes('REJECT') && (
            <Button danger icon={<CloseOutlined />} onClick={() => setOpen('REJECT')}>
              Reject
            </Button>
          )}
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={!canApprove}
            loading={loading}
            onClick={() => setOpen('APPROVE')}
          >
            Approve application
          </Button>
        </Space>
      </Flex>

      {!ready && blockers.length > 2 && (
        <Alert
          type="warning"
          style={{ marginTop: 10 }}
          message="Outstanding items"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {blockers.map((b) => (
                <li key={b}>
                  <Typography.Text style={{ fontSize: 12 }}>{b}</Typography.Text>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <ConfirmActionModal
        open={open === 'APPROVE'}
        onCancel={() => setOpen(null)}
        onConfirm={(values) => onDecide('approve', values)}
        loading={loading}
        title={`Approve ${seller.storeName}?`}
        description="They move to onboarding and can start listing once activated."
        impact="Commission plan and tier can be changed later from the seller's page."
        reasonRequired={false}
        reasonLabel="Note for the record (optional)"
        showNote={false}
        confirmLabel="Approve application"
      />

      <ConfirmActionModal
        open={open === 'REJECT'}
        onCancel={() => setOpen(null)}
        onConfirm={(values) => onDecide('reject', values)}
        loading={loading}
        danger
        title={`Reject ${seller.storeName}'s application?`}
        description="The applicant is told why and may reapply after 30 days."
        impact="This does not blacklist them. Use blacklist only for fraud you want permanently blocked."
        reasons={REJECT_REASONS}
        reasonLabel="Reason the applicant will see"
        confirmLabel="Reject application"
      />

      <ConfirmActionModal
        open={open === 'INFO'}
        onCancel={() => {
          setOpen(null);
          setInfoItems([]);
        }}
        onConfirm={(values) => onDecide('request-info', { ...values, items: infoItems })}
        loading={loading}
        title="What does the seller need to fix?"
        description="They receive this as a checklist and the application waits for their response."
        reasonRequired={false}
        reasonLabel="Extra context (optional)"
        showNote={false}
        confirmLabel="Send request"
        extraFields={
          <Form.Item
            label="Items"
            required
            validateStatus={infoItems.length ? undefined : 'error'}
            help={infoItems.length ? undefined : 'Pick at least one.'}
          >
            <Checkbox.Group
              value={infoItems}
              onChange={setInfoItems}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              options={INFO_ITEMS.map((i) => ({ label: i, value: i }))}
            />
          </Form.Item>
        }
      />
    </Card>
  );
}
