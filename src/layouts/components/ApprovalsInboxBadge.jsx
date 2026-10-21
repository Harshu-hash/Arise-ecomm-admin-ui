import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Badge, Button, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';
import { useCan } from '@core/rbac/useCan';

/**
 * Pending maker-checker requests waiting on *this* user. It sits in the header
 * because an unapproved payout batch blocks money leaving the platform, and
 * nobody should have to go looking for it.
 */
export default function ApprovalsInboxBadge() {
  const can = useCan();
  const navigate = useNavigate();
  const allowed = can('admin.approval.view');

  const { data } = useQuery({
    queryKey: qk.approvals.counts,
    queryFn: () => api.get('/approvals/counts').then((r) => r.data),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (!allowed) return null;
  const count = data?.pendingMine ?? 0;

  return (
    <Tooltip title={count ? `${count} approval${count === 1 ? '' : 's'} waiting on you` : 'Approvals'}>
      <Badge count={count} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<SafetyCertificateOutlined />}
          onClick={() => navigate('/admin/approvals')}
          aria-label={`Approvals inbox, ${count} pending`}
        />
      </Badge>
    </Tooltip>
  );
}
