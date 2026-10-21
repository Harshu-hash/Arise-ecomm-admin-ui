import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { App, Button, Tooltip, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { useCan } from '@core/rbac/useCan';
import { MASKERS, REVEAL_PERMISSION } from '@core/utils/mask';

const AUTO_HIDE_MS = 30_000;

/**
 * Masked personal data with an audited reveal.
 *
 * Revealing calls the server so the access is written to the audit log — doing
 * it purely client-side would leave no trail, and the trail is the point. The
 * value re-hides after 30 seconds so a shared or unattended screen does not
 * sit on someone's phone number indefinitely.
 */
export default function MaskedValue({
  value,
  kind = 'phone',
  entityType,
  entityId,
  entityLabel,
  copyable = false,
}) {
  const { message } = App.useApp();
  const can = useCan();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef(null);

  const permission = REVEAL_PERMISSION[kind];
  const allowed = can(permission);
  const masker = MASKERS[kind] ?? ((v) => v);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!value) return <Typography.Text type="secondary">—</Typography.Text>;

  const reveal = async () => {
    try {
      if (entityType && entityId) {
        await api.post('/pii/reveal', { kind, entityType, entityId, entityLabel });
      }
      setRevealed(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setRevealed(false), AUTO_HIDE_MS);
    } catch {
      message.error('Could not reveal this value.');
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <Typography.Text
        className="tabular"
        copyable={revealed && copyable ? { text: String(value) } : false}
      >
        {revealed ? value : masker(value)}
      </Typography.Text>
      {allowed ? (
        <Tooltip title={revealed ? 'Hide' : 'Reveal (this access is logged)'}>
          <Button
            type="text"
            size="small"
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
            icon={revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              if (revealed) {
                clearTimeout(timer.current);
                setRevealed(false);
              } else {
                reveal();
              }
            }}
          />
        </Tooltip>
      ) : (
        <Tooltip title="You do not have permission to reveal personal data">
          <EyeInvisibleOutlined style={{ opacity: 0.35, fontSize: 12 }} />
        </Tooltip>
      )}
    </span>
  );
}
