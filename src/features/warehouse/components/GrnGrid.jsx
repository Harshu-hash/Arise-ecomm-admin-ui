import { Alert, Input, InputNumber, Table, Typography } from 'antd';

/**
 * The counting grid: what the seller declared against what was actually on
 * the pallet.
 *
 * Counting more than was declared is blocked rather than absorbed — it means
 * either the paperwork is wrong or the pallet is mixed, and both need a human
 * to resolve before stock goes live.
 */
export default function GrnGrid({ lines, counts, setCounts, editable, totals, overCounted }) {
  const editColumn = (field, title) => ({
    title,
    render: (_v, line) => (
      <InputNumber
        size="small"
        min={0}
        max={line.declaredQty}
        style={{ width: 84 }}
        value={counts[line.id]?.[field]}
        onChange={(v) => setCounts((c) => ({ ...c, [line.id]: { ...c[line.id], [field]: v ?? 0 } }))}
      />
    ),
  });

  const readColumn = (field, title, danger) => ({
    title,
    dataIndex: field,
    align: 'right',
    render: (v) => (
      <Typography.Text className="tabular" type={danger && v ? 'danger' : undefined}>
        {v}
      </Typography.Text>
    ),
  });

  return (
    <>
      {editable && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Count every line before posting"
          description="Posting the GRN is what turns these units into sellable stock. Anything short or damaged is reported to the seller automatically."
        />
      )}
      {overCounted && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="A line counts more than was declared"
          description="Either the paperwork is wrong or the pallet is mixed. Resolve it before posting."
        />
      )}

      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={lines}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'SKU',
            dataIndex: 'sku',
            render: (sku, line) => (
              <div style={{ minWidth: 0, maxWidth: 220 }}>
                <Typography.Text className="mono" style={{ fontSize: 11 }}>{sku}</Typography.Text>
                <div>
                  <Typography.Text style={{ fontSize: 12 }} ellipsis>{line.productTitle}</Typography.Text>
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>{line.variantLabel}</Typography.Text>
              </div>
            ),
          },
          {
            title: 'Declared',
            dataIndex: 'declaredQty',
            align: 'right',
            render: (v) => <span className="tabular">{v}</span>,
          },
          ...(editable
            ? [
                editColumn('sellable', 'Good'),
                editColumn('damaged', 'Damaged'),
                editColumn('missing', 'Missing'),
                {
                  title: 'Note',
                  render: (_v, line) => (
                    <Input
                      size="small"
                      style={{ width: 180 }}
                      placeholder="e.g. carton crushed"
                      value={counts[line.id]?.note}
                      onChange={(e) =>
                        setCounts((c) => ({ ...c, [line.id]: { ...c[line.id], note: e.target.value } }))
                      }
                    />
                  ),
                },
              ]
            : [
                readColumn('receivedSellable', 'Good', false),
                readColumn('receivedDamaged', 'Damaged', true),
                readColumn('receivedMissing', 'Missing', true),
                { title: 'Note', dataIndex: 'note', render: (v) => v ?? '—' },
              ]),
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Typography.Text strong>Total</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Typography.Text strong className="tabular">{totals.declared}</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2}>
              <Typography.Text strong className="tabular">{totals.sellable}</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3}>
              <Typography.Text strong className="tabular" type={totals.damaged ? 'danger' : undefined}>
                {totals.damaged}
              </Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4}>
              <Typography.Text strong className="tabular" type={totals.missing ? 'danger' : undefined}>
                {totals.missing}
              </Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} />
          </Table.Summary.Row>
        )}
      />
    </>
  );
}
