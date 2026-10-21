import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  EyeFilled,
  MinusCircleFilled,
  SyncOutlined,
} from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import { getStatus } from '@shared/constants/statusMaps';

/**
 * Status is never carried by colour alone: every tag pairs its tone with an
 * icon and a text label, so it reads the same to colour-blind users and in
 * greyscale printouts.
 */
const ICONS = {
  blue: <SyncOutlined />,
  gold: <ClockCircleFilled />,
  green: <CheckCircleFilled />,
  red: <CloseCircleFilled />,
  default: <MinusCircleFilled />,
  purple: <EyeFilled />,
};

export default function StatusTag({ domain = 'generic', code, tooltip, showIcon = true, style }) {
  const status = getStatus(domain, code);
  const tag = (
    <Tag
      color={status.tone === 'default' ? undefined : status.tone}
      icon={showIcon ? ICONS[status.tone] : undefined}
      style={{ marginInlineEnd: 0, ...style }}
    >
      {status.label}
    </Tag>
  );
  return tooltip ? <Tooltip title={tooltip}>{tag}</Tooltip> : tag;
}
