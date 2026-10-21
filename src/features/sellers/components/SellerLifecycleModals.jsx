import { Checkbox, Form } from 'antd';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import MoneyText from '@shared/components/MoneyText';

const SUSPEND_REASONS = [
  'Counterfeit product complaints',
  'High order defect rate',
  'Repeated seller cancellations',
  'KYC documents expired',
  'Legal or regulatory notice',
  'Other',
];

/**
 * The lifecycle confirmations. Each spells out the operational consequence —
 * listings hidden, payouts held, open orders — because those are what the
 * seller and the customers actually feel.
 */
export default function SellerLifecycleModals({ which, seller, counts, loading, onCancel, onConfirm }) {
  const liveListings = counts?.liveOffers ?? 0;

  return (
    <>
      <ConfirmActionModal
        open={which === 'hold'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('hold', v)}
        loading={loading}
        title={`Put ${seller.storeName} on hold?`}
        description="A temporary pause while something is investigated."
        impact="Payouts are held. Listings stay live and open orders continue to be fulfilled."
        reasons={['Payment verification', 'Document verification', 'Customer complaints under review', 'Other']}
        confirmLabel="Put on hold"
      />

      <ConfirmActionModal
        open={which === 'release-hold'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('release-hold', v)}
        loading={loading}
        title={`Release the hold on ${seller.storeName}?`}
        impact="Payouts resume from the next cycle."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Release hold"
      />

      <ConfirmActionModal
        open={which === 'suspend'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('suspend', v)}
        loading={loading}
        danger
        needsApproval
        title={`Suspend ${seller.storeName}?`}
        description="Suspension is reversible, but it takes the seller off the platform immediately."
        impact={
          <span>
            {liveListings} live listing{liveListings === 1 ? '' : 's'} will be hidden and pending
            payouts held. Reinstating restores exactly the listings that were hidden.
          </span>
        }
        reasons={SUSPEND_REASONS}
        typeToConfirm="SUSPEND"
        confirmLabel="Send for approval"
        extraFields={
          <>
            <Form.Item name="hideListings" valuePropName="checked" initialValue style={{ marginBottom: 6 }}>
              <Checkbox>Hide their listings</Checkbox>
            </Form.Item>
            <Form.Item name="holdPayouts" valuePropName="checked" initialValue style={{ marginBottom: 6 }}>
              <Checkbox>Hold their payouts</Checkbox>
            </Form.Item>
            <Form.Item name="allowFulfilment" valuePropName="checked" initialValue>
              <Checkbox>Let them fulfil orders already placed</Checkbox>
            </Form.Item>
          </>
        }
      />

      <ConfirmActionModal
        open={which === 'reactivate'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('reactivate', v)}
        loading={loading}
        needsApproval
        title={`Reinstate ${seller.storeName}?`}
        description="They return to selling and the listings hidden by the suspension come back."
        impact="Payout holds applied by the suspension are released."
        reasons={['Complaint withdrawn', 'Investigation found no fault', 'Seller remediated the issue', 'Other']}
        confirmLabel="Send for approval"
      />

      <ConfirmActionModal
        open={which === 'deactivate'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('deactivate', v)}
        loading={loading}
        danger
        title={`Deactivate ${seller.storeName}?`}
        description="Used when a seller chooses to leave, or has been dormant."
        impact="Listings come down and the account stops trading. It can be reactivated later."
        reasons={['Seller requested closure', 'Dormant account', 'Business has closed', 'Other']}
        confirmLabel="Deactivate seller"
      />

      <ConfirmActionModal
        open={which === 'blacklist'}
        onCancel={onCancel}
        onConfirm={(v) => onConfirm('blacklist', v)}
        loading={loading}
        danger
        needsApproval
        title={`Blacklist ${seller.storeName}?`}
        description="This is permanent. It is for fraud, not for performance problems."
        impact={
          <span>
            Their GSTIN, PAN and bank account are blocked from reapplying under any name. Listings
            come down and{' '}
            <MoneyText paise={0} compact /> any pending payout is frozen pending investigation.
          </span>
        }
        reasons={['Confirmed counterfeit selling', 'Identity or document fraud', 'Repeated policy evasion', 'Legal order', 'Other']}
        typeToConfirm="BLACKLIST"
        confirmLabel="Send for approval"
      />
    </>
  );
}
