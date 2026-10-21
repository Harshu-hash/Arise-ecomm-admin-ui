import { Tooltip, Typography } from 'antd';
import { formatINR, formatINRCompact } from '@core/utils/money';

/**
 * Renders paise as INR. `compact` is for KPI tiles, where the exact figure is
 * still available on hover rather than being lost.
 */
export default function MoneyText({
  paise,
  compact = false,
  signed = false,
  strong = false,
  type,
  colorBySign = false,
  style,
}) {
  if (paise === null || paise === undefined) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  const full = formatINR(paise, { signed });
  const shown = compact ? formatINRCompact(paise) : full;
  const resolvedType = colorBySign ? (paise < 0 ? 'danger' : paise > 0 ? 'success' : type) : type;

  const text = (
    <Typography.Text strong={strong} type={resolvedType} className="tabular" style={style}>
      {shown}
    </Typography.Text>
  );

  return compact && shown !== full ? <Tooltip title={full}>{text}</Tooltip> : text;
}
