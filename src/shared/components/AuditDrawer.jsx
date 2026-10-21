import { HistoryOutlined } from '@ant-design/icons';
import { Button, Drawer } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { cloneElement, useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';
import { useCan } from '@core/rbac/useCan';
import ActivityTimeline from './ActivityTimeline';
import ErrorState from './ErrorState';
import FullPageSpinner from './FullPageSpinner';

/**
 * "History" for any entity. Every detail page gets one, so the question
 * "who changed this and why" is always one click away rather than a trip to
 * the central audit log with filters.
 */
export default function AuditDrawer({ entityType, entityId, entityLabel, trigger }) {
  const [open, setOpen] = useState(false);
  const can = useCan();
  const allowed = can('admin.audit.view');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.audit.forEntity(entityType, entityId),
    queryFn: () => api.get(`/audit-events/entity/${entityType}/${entityId}`).then((r) => r.data),
    enabled: open && allowed,
  });

  if (!allowed) return null;

  return (
    <>
      {/* Cloning the caller's element keeps its own semantics (usually a
          Button) instead of wrapping it in a div that only responds to a
          mouse. */}
      {trigger ? (
        cloneElement(trigger, { onClick: () => setOpen(true) })
      ) : (
        <Button icon={<HistoryOutlined />} onClick={() => setOpen(true)}>
          History
        </Button>
      )}

      <Drawer
        title={`History — ${entityLabel ?? entityId}`}
        open={open}
        onClose={() => setOpen(false)}
        width={520}
      >
        {isLoading ? (
          <FullPageSpinner label="Loading history…" />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <ActivityTimeline
            events={(data ?? []).map((e) => ({ ...e, title: e.entityLabel, actorType: 'admin' }))}
            emptyText="No changes have been recorded for this record"
          />
        )}
      </Drawer>
    </>
  );
}
