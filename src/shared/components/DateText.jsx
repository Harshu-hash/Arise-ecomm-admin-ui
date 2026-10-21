import { Tooltip, Typography } from 'antd';
import { formatDate, formatDateTime, fromNow } from '@core/utils/date';

/**
 * Dates render relative ("2h ago") because that is what operations staff
 * actually reason about, with the exact IST timestamp one hover away.
 */
export default function DateText({ value, variant = 'relative', type = undefined, strong = false }) {
  if (!value) return <Typography.Text type="secondary">—</Typography.Text>;

  const exact = formatDateTime(value);
  const shown =
    variant === 'relative' ? fromNow(value) : variant === 'date' ? formatDate(value) : exact;

  const text = (
    <Typography.Text type={type} strong={strong} className="tabular">
      {shown}
    </Typography.Text>
  );

  // No tooltip when the exact value is already what we printed.
  return shown === exact ? text : <Tooltip title={`${exact} IST`}>{text}</Tooltip>;
}
