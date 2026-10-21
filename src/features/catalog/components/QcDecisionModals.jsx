import { Checkbox, Form } from 'antd';
import { useState } from 'react';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';

/** The fixed issue codes a seller can act on, rather than free text. */
const ISSUES = [
  'Images are below the 1000×1000 minimum',
  'Primary image does not have a white background',
  'Title does not follow the brand + product + key attribute format',
  'Mandatory attributes are missing',
  'Description contains promotional or contact details',
  'Selling price is above MRP',
  'Size chart is missing for an apparel listing',
  'HSN code does not match the category',
  'Brand authorisation is missing',
];

const REJECT_REASONS = [
  'Counterfeit or replica product',
  'Prohibited or restricted item',
  'Duplicate of an existing listing',
  'Seller is not authorised for this brand',
  'Category is not open to this seller',
  'Other',
];

export default function QcDecisionModals({ which, submission, failedChecks, loading, onCancel, onConfirm }) {
  const [issues, setIssues] = useState([]);
  const [override, setOverride] = useState(false);

  const close = () => {
    setIssues([]);
    setOverride(false);
    onCancel();
  };

  return (
    <>
      <ConfirmActionModal
        open={which === 'APPROVE'}
        onCancel={close}
        onConfirm={(v) => onConfirm({ decision: 'APPROVE', overrideChecks: override, ...v })}
        loading={loading}
        title={`Approve "${submission?.productTitle}"?`}
        description="The listing goes live and its in-stock offers become buyable."
        impact={
          failedChecks?.length
            ? `This listing fails: ${failedChecks.join(', ')}. Approving anyway is recorded against your name.`
            : 'All automated checks passed.'
        }
        danger={Boolean(failedChecks?.length)}
        reasonRequired={false}
        reasonLabel="Note (optional)"
        showNote={false}
        confirmLabel="Approve and publish"
        extraFields={
          failedChecks?.length ? (
            <Form.Item
              validateStatus={override ? undefined : 'error'}
              help={override ? undefined : 'Confirm the override to continue.'}
            >
              <Checkbox checked={override} onChange={(e) => setOverride(e.target.checked)}>
                I have checked these failures and am approving anyway
              </Checkbox>
            </Form.Item>
          ) : null
        }
      />

      <ConfirmActionModal
        open={which === 'REQUEST_CHANGES'}
        onCancel={close}
        onConfirm={(v) => onConfirm({ decision: 'REQUEST_CHANGES', issues, message: v.reason })}
        loading={loading}
        title="What does the seller need to fix?"
        description="They get this as a checklist and resubmit once it is done."
        reasonRequired={false}
        reasonLabel="Message to the seller (optional)"
        showNote={false}
        confirmLabel="Send back to seller"
        extraFields={
          <Form.Item
            label="Issues"
            required
            validateStatus={issues.length ? undefined : 'error'}
            help={issues.length ? undefined : 'Pick at least one so the seller knows what to change.'}
          >
            <Checkbox.Group
              value={issues}
              onChange={setIssues}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              options={ISSUES.map((i) => ({ label: i, value: i }))}
            />
          </Form.Item>
        }
      />

      <ConfirmActionModal
        open={which === 'REJECT'}
        onCancel={close}
        onConfirm={(v) => onConfirm({ decision: 'REJECT', reason: v.reason })}
        loading={loading}
        danger
        title={`Reject "${submission?.productTitle}"?`}
        description="Rejection is for listings that should not exist, not ones that need fixing."
        impact="The seller is told why. Use “Request changes” if the listing could be corrected."
        reasons={REJECT_REASONS}
        confirmLabel="Reject listing"
      />
    </>
  );
}

export { ISSUES };
