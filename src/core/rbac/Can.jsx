import { Tooltip } from 'antd';
import { cloneElement, isValidElement } from 'react';
import { useCan } from './useCan';

/**
 * Renders children only when the permission is held.
 *
 * <Can perm="orders.item.cancel">…</Can>                      hides when denied
 * <Can perm="…" disable>…</Can>                               renders disabled + tooltip
 * <Can perm={['a','b']} mode="all">…</Can>
 * <Can perm="…" fallback={<Empty/>}>…</Can>
 *
 * `disable` exists for actions users should know exist but cannot perform —
 * the tooltip says why, which is better than a button that silently vanishes.
 */
export function Can({
  perm,
  mode = 'any',
  disable = false,
  reason = 'You do not have permission for this action',
  fallback = null,
  children,
}) {
  const can = useCan();
  const allowed = can(perm, mode);

  if (allowed) return children;
  if (!disable) return fallback;

  const child = isValidElement(children) ? cloneElement(children, { disabled: true }) : children;
  return (
    <Tooltip title={reason}>
      <span style={{ display: 'inline-block', cursor: 'not-allowed' }}>{child}</span>
    </Tooltip>
  );
}

export default Can;
