import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Input, Select, Switch, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

const SECTION_LABEL = {
  HERO_BANNER_CAROUSEL: 'Hero banner carousel',
  AD_SHEET_CARD: 'Ad sheet card',
  RECENTLY_VIEWED_RAIL: 'Recently viewed rail',
  FLASH_SALE_BANNER: 'Flash sale banner',
  AD_TILE_ROW: 'Ad tile row',
  SUGGESTED_FOR_YOU: 'Suggested for you',
  BRANDS_SPOTLIGHT: 'Brands spotlight',
  TOP_VALUE_DEALS: 'Top value deals',
  PRODUCT_FEED: 'Product feed',
  SPONSORED_RAIL: 'Sponsored rail',
};
const SECTION_TYPES = Object.keys(SECTION_LABEL);

/**
 * The section list: reorder, show/hide, remove, add. Each section's own
 * `config` is edited as JSON rather than a bespoke form per type — ten
 * different section shapes (carousel, tile row, product feed, …) each
 * getting their own visual editor is more UI than this panel's resident
 * JSON literacy (it is written and read by the marketing team, not
 * customers) justifies building right now. Recorded as a deliberate scope
 * cut, not an oversight.
 */
export default function SectionEditor({ sections, onChange, saving }) {
  const { message } = App.useApp();
  const [local, setLocal] = useState(sections);
  const [adding, setAdding] = useState(null);

  useEffect(() => setLocal(sections), [sections]);

  const commit = (next) => {
    setLocal(next);
    onChange(next);
  };

  const move = (index, dir) => {
    const next = [...local];
    const [row] = next.splice(index, 1);
    next.splice(index + dir, 0, row);
    commit(next);
  };

  const toggleVisible = (index, enabled) => {
    const next = local.map((s, i) => (i === index ? { ...s, visibility: { ...s.visibility, enabled } } : s));
    commit(next);
  };

  const remove = (index) => commit(local.filter((_, i) => i !== index));

  const addSection = () => {
    if (!adding) return;
    commit([...local, { type: adding, config: {}, visibility: { enabled: true } }]);
    setAdding(null);
  };

  const updateConfig = (index, text) => {
    try {
      const config = text.trim() ? JSON.parse(text) : {};
      const next = local.map((s, i) => (i === index ? { ...s, config } : s));
      commit(next);
    } catch {
      message.error('That is not valid JSON — the change was not saved.');
    }
  };

  const available = SECTION_TYPES.filter((t) => !local.some((s) => s.type === t) || t === 'AD_TILE_ROW' || t === 'TOP_VALUE_DEALS');

  return (
    <Flex vertical gap={10}>
      {saving && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Saving…</Typography.Text>}

      {local.map((section, index) => (
        <Card key={`${section.type}-${index}`} size="small">
          <Flex justify="space-between" align="flex-start" gap={12}>
            <Flex vertical gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Flex gap={8} align="center">
                <Typography.Text strong style={{ fontSize: 13 }}>{SECTION_LABEL[section.type] ?? section.type}</Typography.Text>
                {section.visibility?.enabled === false && <Tag style={{ marginInlineEnd: 0 }}>hidden</Tag>}
              </Flex>
              <Input.TextArea
                defaultValue={JSON.stringify(section.config, null, 2)}
                autoSize={{ minRows: 2, maxRows: 6 }}
                onBlur={(e) => updateConfig(index, e.target.value)}
                className="mono"
                style={{ fontSize: 12 }}
              />
            </Flex>

            <Flex vertical align="center" gap={6}>
              <Switch size="small" checked={section.visibility?.enabled !== false} onChange={(v) => toggleVisible(index, v)} />
              <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up" />
              <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === local.length - 1} onClick={() => move(index, 1)} aria-label="Move down" />
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(index)} aria-label="Remove section" />
            </Flex>
          </Flex>
        </Card>
      ))}

      <Flex gap={8}>
        <Select
          placeholder="Add a section"
          style={{ width: 220 }}
          value={adding}
          onChange={setAdding}
          options={available.map((t) => ({ value: t, label: SECTION_LABEL[t] }))}
        />
        <Button icon={<PlusOutlined />} onClick={addSection} disabled={!adding}>Add</Button>
      </Flex>
    </Flex>
  );
}
