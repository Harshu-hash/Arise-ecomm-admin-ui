import { Flex, Input, InputNumber, Select, Switch, Typography } from 'antd';

/** `"platformFeePaise"` → `"Platform fee"`. Money fields are rendered and edited in rupees — paise never reaches the screen. */
function humanize(key) {
  const words = key.replace(/Paise$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isMoneyKey(key) {
  return key.endsWith('Paise');
}

function Field({ fieldKey, value, onChange, disabled }) {
  if (typeof value === 'boolean') {
    return <Switch checked={value} onChange={onChange} disabled={disabled} />;
  }

  if (typeof value === 'number') {
    return isMoneyKey(fieldKey) ? (
      <InputNumber
        style={{ width: 200 }} min={0} addonBefore="₹" disabled={disabled}
        value={value / 100}
        onChange={(v) => onChange(Math.round((v ?? 0) * 100))}
      />
    ) : (
      <InputNumber style={{ width: 200 }} value={value} onChange={onChange} disabled={disabled} />
    );
  }

  if (typeof value === 'string') {
    return <Input style={{ maxWidth: 420 }} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  }

  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (
      <Select
        mode="tags" style={{ minWidth: 280, maxWidth: 560 }} value={value} disabled={disabled}
        onChange={onChange} tokenSeparators={[',']}
      />
    );
  }

  // A flat map of numbers (e.g. tier GMV thresholds, refund timing by trust tier).
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((v) => typeof v === 'number')) {
    const money = isMoneyKey(fieldKey);
    return (
      <Flex gap={8} wrap>
        {Object.entries(value).map(([k, v]) => (
          <InputNumber
            key={k} disabled={disabled}
            addonBefore={humanize(k)}
            {...(money ? { addonAfter: '₹', value: v / 100, onChange: (nv) => onChange({ ...value, [k]: Math.round((nv ?? 0) * 100) }) }
              : { value: v, onChange: (nv) => onChange({ ...value, [k]: nv }) })}
          />
        ))}
      </Flex>
    );
  }

  // Nested structures (GSTIN list, etc.) are shown read-only; editing them needs a
  // dedicated UI this phase does not build — see the plan's Phase 8 decisions.
  return <Typography.Text type="secondary" code style={{ fontSize: 12 }}>{JSON.stringify(value)}</Typography.Text>;
}

/** Renders every field in a settings section's `values` object with the right control for its type. */
export default function SettingsSectionForm({ values, onChange, disabled }) {
  return (
    <Flex vertical gap={16}>
      {Object.entries(values).map(([key, value]) => (
        <Flex key={key} vertical gap={4} align="flex-start">
          <Typography.Text style={{ fontSize: 13 }}>{humanize(key)}</Typography.Text>
          <Field fieldKey={key} value={value} disabled={disabled} onChange={(v) => onChange({ ...values, [key]: v })} />
        </Flex>
      ))}
    </Flex>
  );
}
