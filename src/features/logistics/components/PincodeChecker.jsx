import { Button, Card, Flex, Form, InputNumber, Select, Table, Typography } from 'antd';
import { formatINR, formatPercent } from '@core/utils/money';

/**
 * The same serviceability check the app runs to show a delivery date.
 *
 * Having it here means an agent can answer "why can't this customer order?"
 * directly, instead of guessing from the pincode table.
 */
export default function PincodeChecker({ value, onChange, onCheck, loading, result }) {
  return (
    <Card size="small" title="Check a pincode">
      <Flex gap={8} wrap align="flex-end">
        <Form.Item label="Pincode" style={{ marginBottom: 0 }}>
          <InputNumber
            style={{ width: 140 }}
            controls={false}
            maxLength={6}
            value={value.pincode}
            onChange={(v) => onChange((c) => ({ ...c, pincode: v }))}
            placeholder="400072"
          />
        </Form.Item>
        <Form.Item label="Weight" style={{ marginBottom: 0 }}>
          <InputNumber
            style={{ width: 130 }}
            addonAfter="g"
            min={1}
            value={value.weightG}
            onChange={(v) => onChange((c) => ({ ...c, weightG: v }))}
          />
        </Form.Item>
        <Form.Item label="Payment" style={{ marginBottom: 0 }}>
          <Select
            style={{ width: 150 }}
            value={value.paymentMode}
            onChange={(v) => onChange((c) => ({ ...c, paymentMode: v }))}
            options={[
              { value: 'PREPAID', label: 'Prepaid' },
              { value: 'COD', label: 'Cash on delivery' },
            ]}
          />
        </Form.Item>
        <Button type="primary" loading={loading} onClick={onCheck}>
          Check
        </Button>
      </Flex>

      {result && (
        <div style={{ marginTop: 12 }}>
          {!result.serviceable ? (
            <Typography.Text type="danger">{result.reason ?? 'Not serviceable.'}</Typography.Text>
          ) : (
            <Table
              size="small"
              rowKey="courierId"
              pagination={false}
              dataSource={result.options}
              columns={[
                { title: 'Courier', dataIndex: 'courierName' },
                {
                  title: 'Cost to us',
                  dataIndex: 'pricePaise',
                  align: 'right',
                  render: (v) => <span className="tabular">{formatINR(v)}</span>,
                },
                {
                  title: 'Delivery',
                  dataIndex: 'tatDays',
                  align: 'right',
                  render: (v) => `${v} days`,
                },
                {
                  title: 'On time',
                  dataIndex: 'onTimePct',
                  align: 'right',
                  render: (v) => formatPercent(v, 1),
                },
              ]}
            />
          )}
        </div>
      )}
    </Card>
  );
}
