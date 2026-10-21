/**
 * The permission catalog: the single source of truth for every permission key
 * in the panel. It drives the Roles matrix UI, the route guards, the <Can>
 * component and the mock API's own 403 enforcement.
 *
 * Key format: `<module>.<resource>.<action>` (see plan §12.1).
 *
 * `implies` lists keys that are granted automatically with this one, so the
 * matrix can auto-select dependencies (e.g. `edit` is useless without `view`).
 * `sensitive: true` surfaces a warning in the role editor.
 * `mc: true` means the action goes through maker-checker when performed.
 */

const A = {
  view: { action: 'view', label: 'View' },
  create: { action: 'create', label: 'Create' },
  edit: { action: 'edit', label: 'Edit' },
  delete: { action: 'delete', label: 'Delete' },
  export: { action: 'export', label: 'Export' },
};

/** Shorthand: standard CRUD set, each implying `view` of the same resource. */
function crud(extra = []) {
  return [A.view, A.create, A.edit, ...extra];
}

export const PERMISSION_MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    resources: [
      { key: 'dashboard', label: 'Dashboard', actions: [A.view] },
      { key: 'finance_widgets', label: 'Revenue & finance widgets', actions: [A.view] },
      { key: 'action_center', label: 'Action center', actions: [A.view] },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    resources: [
      {
        key: 'order',
        label: 'Orders',
        actions: [
          A.view,
          A.export,
          { action: 'hold', label: 'Put on hold' },
          { action: 'release', label: 'Release hold' },
          { action: 'edit_address', label: 'Change delivery address' },
          { action: 'note', label: 'Add internal note' },
        ],
      },
      {
        key: 'item',
        label: 'Order items',
        actions: [
          { action: 'cancel', label: 'Cancel item', sensitive: true },
          { action: 'return_initiate', label: 'Initiate return' },
        ],
      },
      {
        key: 'cancellation',
        label: 'Cancellations',
        actions: [A.view, A.export, { action: 'reverse_penalty', label: 'Reverse seller penalty' }],
      },
      {
        key: 'return',
        label: 'Returns & replacements',
        actions: [
          A.view,
          A.export,
          { action: 'approve', label: 'Approve return' },
          { action: 'reject', label: 'Reject return' },
          { action: 'reschedule', label: 'Reschedule pickup' },
          { action: 'mark_received', label: 'Mark received' },
          { action: 'qc', label: 'Record QC result' },
          { action: 'convert', label: 'Convert replacement to refund' },
        ],
      },
      {
        key: 'exception',
        label: 'Order exceptions',
        actions: [A.view, { action: 'assign', label: 'Assign' }, { action: 'resolve', label: 'Resolve' }],
      },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    resources: [
      { key: 'category', label: 'Categories', actions: crud([A.delete]) },
      { key: 'attribute', label: 'Attributes & sets', actions: crud([A.delete]) },
      {
        key: 'brand',
        label: 'Brands',
        actions: crud([
          { action: 'verify', label: 'Verify' },
          { action: 'block', label: 'Block', sensitive: true, mc: true },
          { action: 'merge', label: 'Merge duplicates', sensitive: true },
        ]),
      },
      {
        key: 'product',
        label: 'Products & listings',
        actions: [
          A.view,
          A.edit,
          A.export,
          { action: 'approve', label: 'Approve listing' },
          { action: 'request_changes', label: 'Request changes' },
          { action: 'reject', label: 'Reject listing' },
          { action: 'activate', label: 'Activate / deactivate' },
          { action: 'block', label: 'Block', sensitive: true, mc: true },
          { action: 'archive', label: 'Archive' },
          { action: 'bulk_edit', label: 'Bulk edit', sensitive: true },
          { action: 'revert', label: 'Revert to previous version' },
        ],
      },
      { key: 'sizechart', label: 'Size charts', actions: crud([A.delete]) },
      { key: 'hsn', label: 'HSN & tax codes', actions: crud([A.delete]) },
      { key: 'import', label: 'Bulk uploads', actions: [A.view, A.create, { action: 'commit', label: 'Commit import' }] },
      {
        key: 'rules',
        label: 'Buy-box & badge rules',
        actions: [A.view, { action: 'edit', label: 'Edit', sensitive: true, mc: true }],
      },
    ],
  },
  {
    key: 'sellers',
    label: 'Sellers',
    resources: [
      {
        key: 'application',
        label: 'Onboarding applications',
        actions: [
          A.view,
          A.export,
          { action: 'assign', label: 'Assign' },
          { action: 'review', label: 'Review' },
          { action: 'request_info', label: 'Request info' },
          { action: 'approve', label: 'Approve', sensitive: true },
          { action: 'reject', label: 'Reject' },
        ],
      },
      { key: 'kyc', label: 'KYC documents', actions: [A.view, { action: 'verify', label: 'Verify / reject documents' }] },
      { key: 'bank', label: 'Seller bank details', actions: [{ action: 'view_full', label: 'Reveal full account number', sensitive: true }] },
      {
        key: 'seller',
        label: 'Seller accounts',
        actions: [
          A.view,
          A.edit,
          A.export,
          { action: 'note', label: 'Add note' },
          { action: 'hold', label: 'Put on hold' },
          { action: 'suspend', label: 'Suspend', sensitive: true, mc: true },
          { action: 'reactivate', label: 'Reactivate', sensitive: true, mc: true },
          { action: 'deactivate', label: 'Deactivate' },
          { action: 'blacklist', label: 'Blacklist', sensitive: true, mc: true },
          { action: 'change_tier', label: 'Change tier', mc: true },
          { action: 'change_plan', label: 'Change commission plan', sensitive: true, mc: true },
          { action: 'impersonate_view', label: 'View as seller (read-only)', sensitive: true },
        ],
      },
      {
        key: 'brandapproval',
        label: 'Brand approvals',
        actions: [A.view, { action: 'approve', label: 'Approve' }, { action: 'reject', label: 'Reject' }],
      },
      {
        key: 'penalty',
        label: 'Penalties',
        actions: [A.view, A.create, { action: 'waive', label: 'Waive', sensitive: true, mc: true }, A.export],
      },
      {
        key: 'claim',
        label: 'Seller claims',
        actions: [A.view, { action: 'decide', label: 'Approve / reject claim', sensitive: true }, A.export],
      },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    resources: [
      {
        key: 'customer',
        label: 'Customers',
        actions: [
          A.view,
          A.edit,
          A.export,
          { action: 'note', label: 'Add note' },
          { action: 'block', label: 'Block / unblock', sensitive: true },
          { action: 'disable_cod', label: 'Disable COD' },
          { action: 'force_logout', label: 'Force logout devices' },
        ],
      },
      { key: 'pii', label: 'Personal data', actions: [{ action: 'view', label: 'Reveal phone / email / address', sensitive: true }] },
      {
        key: 'privacy',
        label: 'Privacy requests',
        actions: [A.view, { action: 'process', label: 'Process' }, { action: 'reject', label: 'Reject' }],
      },
      {
        key: 'risk',
        label: 'Fraud & risk',
        actions: [A.view, { action: 'edit_rules', label: 'Edit risk rules', sensitive: true }, { action: 'decide', label: 'Clear / confirm flags' }],
      },
      { key: 'blocklist', label: 'Blocklists', actions: crud([A.delete]) },
    ],
  },
  {
    key: 'warehouse',
    label: 'Inventory & warehouses',
    resources: [
      { key: 'warehouse', label: 'Warehouses', actions: crud([{ action: 'pause', label: 'Pause inbound / outbound', sensitive: true }]) },
      { key: 'inbound', label: 'Inbound consignments', actions: crud([{ action: 'receive', label: 'Post GRN' }, { action: 'cancel', label: 'Cancel' }]) },
      { key: 'inventory', label: 'Inventory', actions: [A.view, A.export] },
      { key: 'adjustment', label: 'Stock adjustments', actions: [A.view, { action: 'create', label: 'Create adjustment', sensitive: true, mc: true }] },
      { key: 'removal', label: 'Removal orders', actions: crud([{ action: 'approve', label: 'Approve' }]) },
    ],
  },
  {
    key: 'logistics',
    label: 'Logistics',
    resources: [
      { key: 'courier', label: 'Courier partners', actions: crud([{ action: 'pause', label: 'Pause courier', sensitive: true }, { action: 'edit_rates', label: 'Edit rate card', sensitive: true, mc: true }]) },
      { key: 'pincode', label: 'Pincode serviceability', actions: crud([A.export, { action: 'override', label: 'Block / override pincode' }]) },
      {
        key: 'shipment',
        label: 'Shipments',
        actions: [
          A.view,
          A.export,
          { action: 'reallocate', label: 'Re-allocate courier' },
          { action: 'cancel', label: 'Cancel shipment' },
          { action: 'mark_lost', label: 'Mark lost', sensitive: true },
          { action: 'print', label: 'Print labels & invoices' },
        ],
      },
      { key: 'pickup', label: 'Pickups & manifests', actions: [A.view, { action: 'reschedule', label: 'Reschedule pickup' }, { action: 'print', label: 'Print manifest' }] },
      { key: 'ndr', label: 'NDR', actions: [A.view, A.export, { action: 'action', label: 'Reattempt / RTO' }] },
      { key: 'rto', label: 'RTO', actions: [A.view, A.export] },
      { key: 'weight', label: 'Weight disputes', actions: [A.view, { action: 'decide', label: 'Accept / reject dispute' }] },
      { key: 'rules', label: 'Shipping & allocation rules', actions: [A.view, { action: 'edit', label: 'Edit', sensitive: true, mc: true }] },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    resources: [
      { key: 'payment', label: 'Payments', actions: [A.view, A.export] },
      {
        key: 'refund',
        label: 'Refunds',
        actions: [
          A.view,
          A.export,
          { action: 'issue', label: 'Issue refund', sensitive: true, mc: true },
          { action: 'retry', label: 'Retry failed refund' },
          { action: 'switch_mode', label: 'Change refund mode', sensitive: true },
        ],
      },
      { key: 'recon', label: 'Reconciliation', actions: [A.view, A.create, { action: 'resolve', label: 'Resolve mismatch' }, A.export] },
      { key: 'commission', label: 'Commission & fees', actions: [A.view, { action: 'edit', label: 'Edit rules', sensitive: true, mc: true }] },
      {
        key: 'payout',
        label: 'Seller payouts',
        actions: [
          A.view,
          A.export,
          { action: 'create', label: 'Create batch' },
          { action: 'approve', label: 'Approve batch', sensitive: true, mc: true },
          { action: 'release', label: 'Release batch', sensitive: true, mc: true },
          { action: 'hold', label: 'Hold / release seller payouts', sensitive: true, mc: true },
          { action: 'adjust', label: 'Manual adjustment', sensitive: true, mc: true },
        ],
      },
      { key: 'tax', label: 'Tax (TCS / TDS)', actions: [A.view, A.export, { action: 'edit_rates', label: 'Edit rates', sensitive: true, mc: true }] },
      { key: 'cod', label: 'COD remittance', actions: [A.view, A.export, { action: 'dispute', label: 'Raise dispute' }] },
      { key: 'invoice', label: 'Invoices & credit notes', actions: [A.view, A.export, { action: 'regenerate', label: 'Re-generate', sensitive: true }] },
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet & gift cards',
    resources: [
      { key: 'account', label: 'Wallet accounts', actions: [A.view, { action: 'freeze', label: 'Freeze / unfreeze', sensitive: true }] },
      { key: 'ledger', label: 'Wallet ledger', actions: [A.view, A.export] },
      { key: 'adjust', label: 'Manual wallet credit / debit', actions: [{ action: 'create', label: 'Credit or debit wallet', sensitive: true, mc: true }] },
      { key: 'giftcard', label: 'Gift cards', actions: crud([{ action: 'generate', label: 'Generate batch', sensitive: true, mc: true }, { action: 'block', label: 'Block card' }, { action: 'extend', label: 'Extend expiry', mc: true }]) },
      { key: 'cashback', label: 'Cashback rules', actions: crud([{ action: 'pause', label: 'Pause / resume' }]) },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    resources: [
      { key: 'coupon', label: 'Coupons', actions: crud([A.export, { action: 'pause', label: 'Pause / end' }]) },
      { key: 'deal', label: 'Deals', actions: crud([A.delete]) },
      { key: 'flashsale', label: 'Flash sales', actions: crud([{ action: 'curate', label: 'Accept / reject nominations' }, { action: 'publish', label: 'Publish' }, { action: 'pull', label: 'Pull product live', sensitive: true }]) },
      { key: 'event', label: 'Sale events', actions: crud([A.delete]) },
      { key: 'referral', label: 'Referral program', actions: [A.view, A.edit, { action: 'decide', label: 'Approve / reject referral' }, A.export] },
      { key: 'campaign', label: 'Campaigns', actions: crud([{ action: 'send', label: 'Send / schedule', sensitive: true }, { action: 'cancel', label: 'Cancel' }]) },
      { key: 'segment', label: 'Customer segments', actions: crud([A.delete, A.export]) },
      { key: 'bankoffer', label: 'Bank offer display', actions: [A.view, { action: 'display', label: 'Toggle visibility & placement' }] },
    ],
  },
  {
    key: 'ads',
    label: 'Sponsored ads',
    resources: [
      { key: 'campaign', label: 'Ad campaigns', actions: [A.view, A.create, A.edit, A.export, { action: 'pause', label: 'Pause for policy', sensitive: true }] },
      { key: 'review', label: 'Ad review queue', actions: [A.view, { action: 'decide', label: 'Approve / reject' }] },
      { key: 'placement', label: 'Placements & pricing', actions: [A.view, { action: 'edit', label: 'Edit', sensitive: true, mc: true }] },
      { key: 'billing', label: 'Advertiser billing', actions: [A.view, A.export, { action: 'credit', label: 'Issue credit', sensitive: true }] },
      { key: 'report', label: 'Ads reports', actions: [A.view, A.export] },
    ],
  },
  {
    key: 'cms',
    label: 'Content',
    resources: [
      { key: 'home', label: 'Home layout', actions: [A.view, A.edit, { action: 'publish', label: 'Publish layout', sensitive: true }, { action: 'rollback', label: 'Roll back', sensitive: true, mc: true }] },
      { key: 'banner', label: 'Banners', actions: crud([A.delete]) },
      { key: 'onboarding', label: 'Onboarding slides', actions: crud([A.delete]) },
      { key: 'page', label: 'Static pages', actions: crud([{ action: 'publish', label: 'Publish' }]) },
      { key: 'help', label: 'Help center', actions: crud([A.delete, { action: 'publish', label: 'Publish' }]) },
      { key: 'search', label: 'Search configuration', actions: [A.view, A.edit] },
      { key: 'reasons', label: 'Reason masters', actions: crud([A.delete]) },
    ],
  },
  {
    key: 'reviews',
    label: 'Reviews & Q&A',
    resources: [
      { key: 'review', label: 'Reviews', actions: [A.view, A.export, { action: 'moderate', label: 'Publish / reject' }] },
      { key: 'qa', label: 'Questions & answers', actions: [A.view, { action: 'moderate', label: 'Moderate' }, { action: 'answer', label: 'Answer as Arise' }] },
      { key: 'abuse', label: 'Abuse reports', actions: [A.view, { action: 'decide', label: 'Dismiss / remove' }] },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    resources: [
      {
        key: 'ticket',
        label: 'Tickets',
        actions: [
          A.view,
          A.create,
          A.export,
          { action: 'reply', label: 'Reply' },
          { action: 'note', label: 'Internal note' },
          { action: 'assign', label: 'Assign / reassign' },
          { action: 'escalate', label: 'Escalate' },
          { action: 'merge', label: 'Merge / split' },
          { action: 'close', label: 'Resolve / close' },
        ],
      },
      { key: 'queue', label: 'Queues & routing', actions: [A.view, { action: 'manage', label: 'Manage' }] },
      { key: 'macro', label: 'Macros', actions: crud([A.delete]) },
      { key: 'sla', label: 'SLA policies', actions: [A.view, A.edit] },
      { key: 'chat', label: 'Live chat', actions: [{ action: 'handle', label: 'Handle chats' }, { action: 'supervise', label: 'Supervise / take over' }] },
      { key: 'csat', label: 'CSAT & quality', actions: [A.view, A.export, { action: 'review', label: 'QA review' }] },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    resources: [
      { key: 'sales', label: 'Sales & customer analytics', actions: [A.view] },
      { key: 'operations', label: 'Catalog, seller & fulfilment analytics', actions: [A.view] },
      { key: 'finance', label: 'Finance analytics', actions: [A.view] },
      { key: 'library', label: 'Report library', actions: [A.view, { action: 'export', label: 'Run & export' }] },
      { key: 'schedule', label: 'Scheduled reports', actions: crud([A.delete]) },
      { key: 'export', label: 'Export center', actions: [A.view, { action: 'download', label: 'Download exports' }] },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    resources: [
      { key: 'template', label: 'Transactional templates', actions: [A.view, A.edit, { action: 'test', label: 'Send test' }] },
      { key: 'log', label: 'Delivery logs', actions: [A.view, A.export, { action: 'resend', label: 'Resend' }] },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    resources: [
      {
        key: 'user',
        label: 'Admin users',
        actions: [
          A.view,
          { action: 'invite', label: 'Invite', sensitive: true },
          A.edit,
          { action: 'reset_2fa', label: 'Reset 2FA', sensitive: true, mc: true },
          { action: 'unlock', label: 'Unlock account' },
          { action: 'deactivate', label: 'Deactivate', sensitive: true },
          { action: 'revoke_session', label: 'Revoke sessions' },
        ],
      },
      {
        key: 'role',
        label: 'Roles & permissions',
        actions: [A.view, { action: 'create', label: 'Create', sensitive: true, mc: true }, { action: 'edit', label: 'Edit', sensitive: true, mc: true }, { action: 'delete', label: 'Delete', sensitive: true, mc: true }],
      },
      { key: 'approval', label: 'Approvals (maker-checker)', actions: [A.view, { action: 'decide', label: 'Approve / reject requests', sensitive: true }] },
      { key: 'audit', label: 'Audit log', actions: [A.view, A.export] },
      { key: 'settings', label: 'Platform settings', actions: [A.view, { action: 'edit', label: 'Edit', sensitive: true, mc: true }] },
      { key: 'appconfig', label: 'App config & feature flags', actions: [A.view, { action: 'edit', label: 'Edit', sensitive: true }, { action: 'maintenance', label: 'Toggle maintenance mode', sensitive: true, mc: true }] },
      { key: 'integration', label: 'Integrations', actions: [A.view, { action: 'edit', label: 'Edit credentials', sensitive: true, mc: true }] },
    ],
  },
];
