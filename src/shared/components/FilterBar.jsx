import { CloseOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Badge,
  Button,
  DatePicker,
  Drawer,
  Flex,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { dayjs, rangePresets } from '@core/utils/date';
import useBreakpoint from '@shared/hooks/useBreakpoint';
import EntitySelect from './EntitySelect';

/**
 * Declarative filters. A module passes a `schema` and the bar renders the
 * controls, the active-filter chips and (on narrow screens) a drawer, so every
 * list filters the same way.
 *
 * Supported kinds: text, select, multiSelect, entity, dateRange, numberRange,
 * boolean.
 */
export default function FilterBar({
  schema = [],
  tableState,
  searchPlaceholder = 'Search…',
  extra,
  savedViews,
}) {
  const { isMobile } = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(tableState.q);

  useEffect(() => setSearchDraft(tableState.q), [tableState.q]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (searchDraft === tableState.q) return undefined;
    const t = setTimeout(() => tableState.setSearch(searchDraft), 300);
    return () => clearTimeout(t);
  }, [searchDraft, tableState]);

  const chips = useMemo(() => buildChips(schema, tableState.filters), [schema, tableState.filters]);

  const controls = schema.map((field) => (
    <FilterControl
      key={field.key}
      field={field}
      value={tableState.filters[field.key]}
      onChange={(v) => tableState.patchFilters({ [field.key]: v })}
      block={isMobile}
    />
  ));

  return (
    <div style={{ marginBottom: 12 }}>
      <Flex gap={8} wrap align="center">
        <Input
          allowClear
          prefix={<SearchOutlined style={{ opacity: 0.45 }} />}
          placeholder={searchPlaceholder}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          style={{ width: isMobile ? '100%' : 300 }}
        />

        {isMobile ? (
          <Button icon={<FilterOutlined />} onClick={() => setDrawerOpen(true)} block>
            Filters
            {tableState.activeFilterCount > 0 && (
              <Badge count={tableState.activeFilterCount} style={{ marginLeft: 6 }} />
            )}
          </Button>
        ) : (
          controls
        )}

        {savedViews}
        {extra}
      </Flex>

      {chips.length > 0 && (
        <Flex gap={6} wrap align="center" style={{ marginTop: 8 }}>
          {chips.map((chip) => (
            <Tag
              key={chip.key}
              closable
              onClose={() => tableState.patchFilters({ [chip.key]: undefined })}
              style={{ marginInlineEnd: 0 }}
            >
              <strong style={{ fontWeight: 500 }}>{chip.label}:</strong> {chip.text}
            </Tag>
          ))}
          <Button
            type="link"
            size="small"
            icon={<CloseOutlined />}
            onClick={tableState.clearFilters}
            style={{ padding: 0 }}
          >
            Clear all
          </Button>
        </Flex>
      )}

      <Drawer
        title="Filters"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="bottom"
        height="auto"
        styles={{ body: { paddingBottom: 24 } }}
        extra={
          <Button type="link" onClick={tableState.clearFilters}>
            Clear all
          </Button>
        }
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {controls}
        </Space>
      </Drawer>
    </div>
  );
}

function FilterControl({ field, value, onChange, block }) {
  const width = block ? '100%' : (field.width ?? 180);
  const common = { style: { width }, placeholder: field.placeholder ?? field.label, allowClear: true };

  switch (field.kind) {
    case 'select':
      return <Select {...common} options={field.options} value={value ?? undefined} onChange={onChange} showSearch optionFilterProp="label" />;

    case 'multiSelect':
      return (
        <Select
          {...common}
          mode="multiple"
          maxTagCount="responsive"
          options={field.options}
          value={Array.isArray(value) ? value : value ? [value] : []}
          onChange={(v) => onChange(v.length ? v : undefined)}
          showSearch
          optionFilterProp="label"
        />
      );

    case 'entity':
      return (
        <EntitySelect
          entity={field.entity}
          multiple={field.multiple}
          value={value}
          onChange={onChange}
          style={{ width }}
          placeholder={field.placeholder ?? field.label}
        />
      );

    case 'dateRange':
      return (
        <DatePicker.RangePicker
          style={{ width: block ? '100%' : (field.width ?? 250) }}
          presets={rangePresets()}
          value={value?.gte && value?.lte ? [dayjs(value.gte), dayjs(value.lte)] : null}
          onChange={(range) =>
            onChange(
              range && range[0] && range[1]
                ? { gte: range[0].startOf('day').toISOString(), lte: range[1].endOf('day').toISOString() }
                : undefined,
            )
          }
        />
      );

    case 'numberRange':
      return (
        <Space.Compact style={{ width: block ? '100%' : (field.width ?? 200) }}>
          <InputNumber
            placeholder="Min"
            style={{ width: '50%' }}
            value={value?.gte}
            onChange={(v) => onChange(cleanRange({ ...value, gte: v }))}
          />
          <InputNumber
            placeholder="Max"
            style={{ width: '50%' }}
            value={value?.lte}
            onChange={(v) => onChange(cleanRange({ ...value, lte: v }))}
          />
        </Space.Compact>
      );

    case 'boolean':
      return (
        <Space size={6}>
          <Switch
            size="small"
            checked={String(value) === 'true'}
            onChange={(checked) => onChange(checked ? 'true' : undefined)}
          />
          <span style={{ fontSize: 13 }}>{field.label}</span>
        </Space>
      );

    case 'text':
    default:
      return <Input {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
  }
}

function cleanRange(range) {
  const out = {};
  if (range?.gte !== null && range?.gte !== undefined) out.gte = range.gte;
  if (range?.lte !== null && range?.lte !== undefined) out.lte = range.lte;
  return Object.keys(out).length ? out : undefined;
}

function buildChips(schema, filters) {
  const chips = [];
  for (const field of schema) {
    const value = filters[field.key];
    if (value === null || value === undefined || value === '') continue;

    let text;
    if (field.kind === 'dateRange') {
      text = `${dayjs(value.gte).format('DD MMM')} – ${dayjs(value.lte).format('DD MMM YYYY')}`;
    } else if (field.kind === 'numberRange') {
      text = `${value.gte ?? '0'} – ${value.lte ?? '∞'}`;
    } else if (Array.isArray(value)) {
      const labels = value.map((v) => field.options?.find((o) => o.value === v)?.label ?? v);
      text = labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ');
    } else if (field.kind === 'boolean') {
      text = 'Yes';
    } else {
      text = field.options?.find((o) => o.value === value)?.label ?? String(value);
    }
    chips.push({ key: field.key, label: field.label, text });
  }
  return chips;
}
