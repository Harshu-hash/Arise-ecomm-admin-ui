import { HolderOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Checkbox, Divider, Dropdown, Flex, Space, Typography } from 'antd';
import { useMemo } from 'react';

/**
 * Column visibility and order. Dragging is deliberately not used here: a small
 * move-up/move-down pair is far easier to hit inside a dropdown, and keyboard
 * users get it for free.
 */
export default function ColumnChooser({ columns, prefs, onChange, onReset }) {
  const items = useMemo(() => {
    const savedOrder = prefs?.order ?? [];
    const keyed = columns.map((c) => ({
      key: c.key ?? c.dataIndex,
      title: typeof c.title === 'string' ? c.title : (c.exportLabel ?? c.key ?? c.dataIndex),
      alwaysVisible: c.alwaysVisible,
    }));
    return [
      ...savedOrder.map((k) => keyed.find((c) => c.key === k)).filter(Boolean),
      ...keyed.filter((c) => !savedOrder.includes(c.key)),
    ];
  }, [columns, prefs]);

  const hidden = prefs?.hidden ?? columns.filter((c) => c.defaultHidden).map((c) => c.key ?? c.dataIndex);

  const toggle = (key, checked) => {
    const next = checked ? hidden.filter((k) => k !== key) : [...new Set([...hidden, key])];
    onChange({ ...prefs, hidden: next, order: items.map((i) => i.key) });
  };

  const move = (key, dir) => {
    const order = items.map((i) => i.key);
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    onChange({ ...prefs, hidden, order });
  };

  const content = (
    <div
      style={{
        width: 288,
        maxHeight: 420,
        overflowY: 'auto',
        padding: 8,
        background: 'var(--ant-color-bg-elevated)',
        borderRadius: 8,
        boxShadow: 'var(--ant-box-shadow-secondary, 0 6px 16px rgba(0,0,0,0.12))',
      }}
    >
      <Flex justify="space-between" align="center" style={{ padding: '2px 6px 6px' }}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          Columns
        </Typography.Text>
        <Button type="link" size="small" onClick={onReset} style={{ padding: 0 }}>
          Reset
        </Button>
      </Flex>
      <Divider style={{ margin: '0 0 6px' }} />
      {items.map((col, idx) => (
        <Flex key={col.key} align="center" justify="space-between" style={{ padding: '3px 6px' }}>
          <Checkbox
            checked={col.alwaysVisible || !hidden.includes(col.key)}
            disabled={col.alwaysVisible}
            onChange={(e) => toggle(col.key, e.target.checked)}
          >
            <Typography.Text style={{ fontSize: 13 }}>{col.title}</Typography.Text>
          </Checkbox>
          <Space size={0}>
            <Button
              type="text"
              size="small"
              aria-label={`Move ${col.title} up`}
              disabled={idx === 0}
              onClick={() => move(col.key, -1)}
            >
              ↑
            </Button>
            <Button
              type="text"
              size="small"
              aria-label={`Move ${col.title} down`}
              disabled={idx === items.length - 1}
              onClick={() => move(col.key, 1)}
            >
              ↓
            </Button>
            <HolderOutlined style={{ opacity: 0.2, marginLeft: 2 }} />
          </Space>
        </Flex>
      ))}
    </div>
  );

  return (
    <Dropdown trigger={['click']} dropdownRender={() => content} placement="bottomRight">
      <Button icon={<SettingOutlined />} aria-label="Choose columns" />
    </Dropdown>
  );
}
