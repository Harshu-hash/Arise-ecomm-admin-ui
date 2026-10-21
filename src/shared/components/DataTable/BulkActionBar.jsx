import { CloseOutlined } from '@ant-design/icons';
import { Button, Flex, Space, Typography } from 'antd';
import { useCan } from '@core/rbac/useCan';
import { formatNumber, pluralizeSafe } from './helpers';

/**
 * Appears only when rows are selected. "Select all N matching" is offered
 * separately from the page selection, because acting on 8,000 filtered rows
 * and acting on the 25 you can see are very different intentions.
 */
export default function BulkActionBar({
  selectedCount,
  totalMatching,
  allMatchingSelected,
  onSelectAllMatching,
  onClear,
  actions = [],
}) {
  const can = useCan();
  if (!selectedCount) return null;

  const visible = actions.filter((a) => !a.perm || can(a.perm));

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={12}
      wrap
      style={{
        padding: '8px 12px',
        marginBottom: 8,
        borderRadius: 8,
        background: 'var(--ant-color-primary-bg)',
        border: '1px solid var(--ant-color-primary-border, rgba(40,116,240,0.25))',
      }}
    >
      <Space size={10} wrap>
        <Typography.Text strong>
          {allMatchingSelected
            ? `All ${formatNumber(totalMatching)} matching ${pluralizeSafe(totalMatching, 'row')} selected`
            : `${formatNumber(selectedCount)} ${pluralizeSafe(selectedCount, 'row')} selected`}
        </Typography.Text>

        {!allMatchingSelected && totalMatching > selectedCount && onSelectAllMatching && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={onSelectAllMatching}>
            Select all {formatNumber(totalMatching)} matching
          </Button>
        )}
      </Space>

      <Space size={8} wrap>
        {visible.map((a) => (
          <Button
            key={a.key}
            size="small"
            danger={a.danger}
            icon={a.icon}
            disabled={a.disabled}
            onClick={() => a.onClick({ allMatchingSelected })}
          >
            {a.label}
          </Button>
        ))}
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClear} aria-label="Clear selection" />
      </Space>
    </Flex>
  );
}
