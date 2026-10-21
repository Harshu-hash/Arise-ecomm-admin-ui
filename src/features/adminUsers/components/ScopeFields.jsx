import { Alert, Form, InputNumber, Typography } from 'antd';
import { SCOPE_DIMENSIONS, SCOPE_LIMITS } from '@core/rbac/scopes';
import EntitySelect from '@shared/components/EntitySelect';

/**
 * Renders only the scope dimensions the assigned roles actually use, so a
 * Finance Executive is asked for refund limits and a Category Manager for
 * categories — not both.
 *
 * Money limits are entered in rupees and stored in paise.
 */
export default function ScopeFields({ dimensions = [] }) {
  const entityDims = SCOPE_DIMENSIONS.filter((d) => dimensions.includes(d.key));
  const limitDims = SCOPE_LIMITS.filter((l) => dimensions.includes(l.key));

  if (!entityDims.length && !limitDims.length) return null;

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Data scope"
        description="Leave a field empty for unrestricted access on that dimension."
      />

      {entityDims.map((d) => (
        <Form.Item key={d.key} name={['scope', d.key]} label={d.label} extra={d.help}>
          <EntitySelect entity={d.entity} multiple placeholder={`All ${d.label.toLowerCase()}`} />
        </Form.Item>
      ))}

      {limitDims.map((l) => (
        <Form.Item key={l.key} label={l.label} extra={l.help} style={{ marginBottom: 12 }}>
          <Form.Item name={['scope', l.key]} noStyle>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={500}
              prefix="₹"
              placeholder="No limit"
              formatter={(v) => (v ? Number(v).toLocaleString('en-IN') : '')}
              parser={(v) => (v ? v.replace(/[^\d]/g, '') : '')}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            Anything above this amount creates a maker-checker request instead.
          </Typography.Text>
        </Form.Item>
      ))}
    </>
  );
}
