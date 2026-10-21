import { avatarColor } from '@core/utils/misc';
import { find, id, insert } from '../db/store';
import { mockNow, mockNowIso } from '../engine/settings';

/**
 * One admin per seeded role, so every permission shape can be signed into
 * from the dev toolbar's "switch role" control.
 *
 * The shared password is intentionally obvious; this is a mock backend.
 */
export const DEMO_PASSWORD = 'Arise@123456';

const PEOPLE = [
  ['super_admin', 'Harshvardhan Panchal', 'super'],
  // A second Super Admin account exists purely so platform settings, app
  // config and integration credential changes — each maker-checker with
  // `admin.*` as both the maker's and the approver's permission — have a
  // second holder to approve them. Self-approval is blocked by user id, and
  // every other guarded action in the catalog pairs a lone specialist role
  // with Super Admin as its second approver; here Super Admin is the only
  // role holding the permission at all, so it needs a second person.
  ['super_admin', 'Deepika Rao', 'super2'],
  ['operations_manager', 'Ananya Deshpande', 'ops'],
  ['catalog_manager', 'Rohit Malhotra', 'catalog'],
  ['category_manager', 'Sneha Iyer', 'category'],
  ['seller_onboarding', 'Imran Qureshi', 'onboarding'],
  ['seller_account_manager', 'Kavya Reddy', 'sam'],
  ['finance_executive', 'Nikhil Joshi', 'finance'],
  ['finance_approver', 'Meera Krishnan', 'approver'],
  ['support_agent', 'Aditya Bhatt', 'agent'],
  ['support_lead', 'Fatima Shaikh', 'supportlead'],
  ['marketing_manager', 'Varun Kapoor', 'marketing'],
  ['warehouse_manager', 'Pooja Nair', 'warehouse'],
  ['logistics_manager', 'Sandeep Rawat', 'logistics'],
  ['ads_manager', 'Tanvi Mehta', 'ads'],
  ['auditor', 'Rajesh Subramanian', 'auditor'],
];

/** Scope presets, so scoped roles demonstrably restrict what you can see. */
function scopeFor(roleKey, refs) {
  switch (roleKey) {
    case 'category_manager':
      return { ...EMPTY_SCOPE, categories: refs.categoryIds.slice(0, 3) };
    case 'seller_account_manager':
      return { ...EMPTY_SCOPE, sellers: refs.sellerIds.slice(0, 12) };
    case 'warehouse_manager':
      return { ...EMPTY_SCOPE, warehouses: refs.warehouseIds.slice(0, 1) };
    case 'support_agent':
      return { ...EMPTY_SCOPE, queues: refs.queueIds.slice(0, 2), refundLimit: 500000 };
    case 'finance_executive':
      return { ...EMPTY_SCOPE, refundLimit: 2500000, walletAdjustLimit: 100000 };
    case 'support_lead':
      return { ...EMPTY_SCOPE, refundLimit: 1000000, walletAdjustLimit: 100000 };
    default:
      return null;
  }
}

const EMPTY_SCOPE = {
  categories: null,
  sellers: null,
  warehouses: null,
  queues: null,
  refundLimit: null,
  walletAdjustLimit: null,
};

const LANDING = {
  finance_executive: '/finance/payouts',
  finance_approver: '/admin/approvals',
  support_agent: '/support/tickets',
  support_lead: '/support/tickets',
  catalog_manager: '/catalog/qc',
  category_manager: '/catalog/qc',
  seller_onboarding: '/sellers/applications',
  warehouse_manager: '/warehouses/inbound',
  logistics_manager: '/logistics/ndr',
  ads_manager: '/ads/review',
  marketing_manager: '/marketing/coupons',
  auditor: '/admin/audit',
};

export function seedAdminUsers(refs) {
  const users = PEOPLE.map(([roleKey, name, handle], i) => {
    const role = find('roles', (r) => r.key === roleKey);
    const email = `${handle}@arise.test`;

    // A few deliberately off-happy-path accounts so the UI's states are real:
    // one awaiting 2FA enrolment, one locked out, one invited, one forced to
    // change its password on first sign-in.
    const notEnrolled = roleKey === 'ads_manager';
    const locked = roleKey === 'auditor';
    const invited = roleKey === 'logistics_manager';
    const mustChange = roleKey === 'warehouse_manager';

    return insert('adminUsers', {
      id: id('ADM', 3),
      name,
      email,
      password: DEMO_PASSWORD,
      avatarColor: avatarColor(email),
      status: locked ? 'LOCKED' : invited ? 'INVITED' : 'ACTIVE',
      roleIds: role ? [role.id] : [],
      scope: scopeFor(roleKey, refs),
      twoFactorEnrolled: !notEnrolled && !invited,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      backupCodes: Array.from({ length: 10 }, (_, n) => ({
        code: `${handle.slice(0, 3).toUpperCase()}-${String(1000 + n * 37).slice(0, 4)}`,
        usedAt: null,
      })),
      mustChangePassword: mustChange,
      failedLoginCount: locked ? 5 : 0,
      lockedUntil: locked ? new Date(mockNow() + 15 * 60 * 1000).toISOString() : null,
      invitedAt: invited ? mockNowIso() : null,
      inviteToken: invited ? `invite_${handle}_tok` : null,
      lastLoginAt: invited || locked ? null : new Date(mockNow() - (i + 1) * 3600_000).toISOString(),
      createdAt: new Date(mockNow() - (90 - i) * 86400_000).toISOString(),
      createdByName: 'System',
      defaultLanding: LANDING[roleKey] ?? '/',
      notifyInPanel: true,
      notifyEmail: roleKey !== 'auditor',
      version: 1,
    });
  });

  return users;
}

export { EMPTY_SCOPE };
