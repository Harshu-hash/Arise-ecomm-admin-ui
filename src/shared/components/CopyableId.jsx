import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { copyToClipboard } from '@core/utils/misc';

/** Monospace identifier with a copy affordance, and an optional deep link. */
export default function CopyableId({ value, to, strong = false, hideCopy = false }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <Typography.Text type="secondary">—</Typography.Text>;

  const label = (
    <Typography.Text className="mono" strong={strong}>
      {value}
    </Typography.Text>
  );

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
      {to ? <Link to={to}>{label}</Link> : label}
      {!hideCopy && (
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <Button
            type="text"
            size="small"
            aria-label={`Copy ${value}`}
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={async (e) => {
              e.stopPropagation();
              if (await copyToClipboard(value)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
          />
        </Tooltip>
      )}
    </span>
  );
}
