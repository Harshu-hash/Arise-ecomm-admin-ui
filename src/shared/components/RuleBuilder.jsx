import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Flex, Input, InputNumber, Select, Typography } from 'antd';

/**
 * AND/OR condition builder for customer segments (and anything else that
 * needs to target a rule at the customer base — coupon audiences, cashback).
 *
 * Deliberately one flat group rather than nested groups: the engine behind
 * this (`mocks/engine/segments.js`) supports nesting, but every real segment
 * in the spec — "high value", "inactive 30 days", "Mumbai shoppers" — is a
 * flat AND/OR list, and a flat builder is one a marketer can read back
 * without parsing parentheses.
 */

const OPS_BY_TYPE = {
  string: [{ value: 'eq', label: 'is' }],
  number: [
    { value: 'gte', label: 'is at least' },
    { value: 'lte', label: 'is at most' },
    { value: 'eq', label: 'equals' },
  ],
  date: [
    { value: 'within_days', label: 'within the last (days)' },
    { value: 'before_days', label: 'more than (days) ago' },
  ],
};

function emptyCondition(fields) {
  const field = fields[0];
  return { field: field.key, op: OPS_BY_TYPE[field.type][0].value, value: null };
}

export default function RuleBuilder({ value, onChange, fields }) {
  const rule = value?.conditions ? value : { match: 'ALL', conditions: value ? [value] : [] };

  const setMatch = (match) => onChange({ ...rule, match });

  const updateCondition = (index, patch) => {
    const conditions = rule.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...rule, conditions });
  };

  const addCondition = () => onChange({ ...rule, conditions: [...rule.conditions, emptyCondition(fields)] });
  const removeCondition = (index) => onChange({ ...rule, conditions: rule.conditions.filter((_, i) => i !== index) });

  return (
    <Flex vertical gap={8}>
      {rule.conditions.map((condition, index) => {
        const field = fields.find((f) => f.key === condition.field) ?? fields[0];
        const ops = OPS_BY_TYPE[field.type];

        return (
          <Flex key={index} gap={6} align="center" wrap>
            {index > 0 && (
              <Select
                size="small"
                value={rule.match}
                onChange={setMatch}
                options={[{ value: 'ALL', label: 'AND' }, { value: 'ANY', label: 'OR' }]}
                style={{ width: 70 }}
              />
            )}
            {index === 0 && <Typography.Text style={{ width: 70, textAlign: 'right', fontSize: 12 }}>Where</Typography.Text>}

            <Select
              size="small"
              value={condition.field}
              style={{ width: 150 }}
              options={fields.map((f) => ({ value: f.key, label: f.label }))}
              onChange={(key) => {
                const next = fields.find((f) => f.key === key);
                updateCondition(index, { field: key, op: OPS_BY_TYPE[next.type][0].value, value: null });
              }}
            />

            <Select
              size="small"
              value={condition.op}
              style={{ width: 170 }}
              options={ops}
              onChange={(op) => updateCondition(index, { op })}
            />

            <ValueInput field={field} condition={condition} onChange={(v) => updateCondition(index, { value: v })} />

            <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => removeCondition(index)} aria-label="Remove condition" />
          </Flex>
        );
      })}

      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addCondition} style={{ width: 'fit-content' }}>
        Add condition
      </Button>

      {!rule.conditions.length && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          No conditions — this matches every active customer.
        </Typography.Text>
      )}
    </Flex>
  );
}

function ValueInput({ field, condition, onChange }) {
  if (field.type === 'number' || field.type === 'date') {
    return (
      <InputNumber
        size="small"
        min={0}
        value={condition.value ?? undefined}
        onChange={onChange}
        style={{ width: 100 }}
        placeholder={field.type === 'date' ? 'days' : 'value'}
      />
    );
  }
  if (field.options) {
    return (
      <Select
        size="small"
        value={condition.value ?? undefined}
        onChange={onChange}
        style={{ width: 150 }}
        options={field.options}
        showSearch
      />
    );
  }
  return (
    <Input
      size="small"
      value={condition.value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 150 }}
      placeholder="value"
    />
  );
}
