import ConfirmActionModal from '@shared/components/ConfirmActionModal';

/**
 * The three confirmations the admin detail page can raise. Each spells out its
 * real effect — sessions ending, nobody being able to sign in — before the
 * user commits.
 */
export default function AdminUserConfirmModals({ which, user, isSelf, loading, onCancel, onConfirm }) {
  return (
    <>
      <ConfirmActionModal
        open={which === 'DEACTIVATE'}
        onCancel={onCancel}
        onConfirm={(values) => onConfirm('DEACTIVATE', values)}
        loading={loading}
        danger
        title={`Deactivate ${user.name}?`}
        description="They will be signed out of every device and cannot sign in again until reactivated."
        impact={
          <span>
            {user.activeSessions} active session{user.activeSessions === 1 ? '' : 's'} will end
            immediately. Their roles and scope are kept, so reactivating restores the same access.
          </span>
        }
        reasons={[
          'Left the company',
          'Changed role or team',
          'Security concern',
          'Account created in error',
          'Other',
        ]}
        typeToConfirm="DEACTIVATE"
        confirmLabel="Deactivate admin"
      />

      <ConfirmActionModal
        open={which === 'RESET_2FA'}
        onCancel={onCancel}
        onConfirm={(values) => onConfirm('RESET_2FA', values)}
        loading={loading}
        needsApproval
        title={`Reset two-step verification for ${user.name}?`}
        description="They will set up a new authenticator at their next sign-in, and every current session ends."
        impact="Until they re-enrol, nobody can sign in to this account — including them."
        reasons={['Lost or replaced phone', 'Lost backup codes', 'Suspected compromise', 'Other']}
        confirmLabel="Send for approval"
      />

      <ConfirmActionModal
        open={which === 'REVOKE_SESSIONS'}
        onCancel={onCancel}
        onConfirm={() => onConfirm('REVOKE_SESSIONS')}
        loading={loading}
        title={`Sign ${isSelf ? 'yourself' : user.name} out of all devices?`}
        description="Any unsaved work in those sessions will be lost."
        reasonRequired={false}
        showNote={false}
        confirmLabel="Sign out all devices"
      />
    </>
  );
}
