import { App, Button, Empty, Flex, Input, Space, Table, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ActivityTimeline from '@shared/components/ActivityTimeline';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import ShipmentCard from './ShipmentCard';

/** Items, payment, returns, timeline and notes for one order. */
export default function OrderTabs({
  meta, canCancel, canReturn, selectedIds, onToggleItem, onReturn, onAddNote, addingNote,
}) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const { items, shipments, payments, refunds, returns, events, notes } = meta;

  return (
    <Tabs
      items={[
        {
          key: 'items',
          label: `Items & shipments (${items.length})`,
          children: (
            <div>
              {canCancel && (
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Tick the items you need to cancel. Only items that have not shipped can be selected.
                </Typography.Text>
              )}
              {shipments.map((s) => (
                <ShipmentCard
                  key={s.id}
                  shipment={s}
                  selectable={canCancel}
                  selectedIds={selectedIds}
                  onToggleItem={onToggleItem}
                  onReturn={canReturn ? onReturn : null}
                />
              ))}
            </div>
          ),
        },
        {
          key: 'payment',
          label: 'Payment & refunds',
          children: (
            <Flex vertical gap={12}>
              <Table
                size="small" rowKey="id" pagination={false} dataSource={payments}
                title={() => 'Payment attempts'}
                columns={[
                  { title: 'Gateway', dataIndex: 'gateway' },
                  { title: 'Method', dataIndex: 'method' },
                  { title: 'Amount', dataIndex: 'amountPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="payment" code={v} /> },
                  {
                    title: 'Reference', dataIndex: 'txnRef',
                    render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
                  },
                ]}
              />
              <Table
                size="small" rowKey="id" pagination={false} dataSource={refunds}
                title={() => 'Refunds'} locale={{ emptyText: 'No refunds on this order' }}
                columns={[
                  {
                    title: 'Refund', dataIndex: 'id',
                    render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
                  },
                  { title: 'Type', dataIndex: 'type' },
                  { title: 'Amount', dataIndex: 'amountPaise', align: 'right', render: (v) => <MoneyText paise={v} strong /> },
                  { title: 'Mode', dataIndex: 'mode' },
                  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="refund" code={v} /> },
                  { title: 'Started', dataIndex: 'initiatedAt', render: (v) => <DateText value={v} /> },
                ]}
              />
            </Flex>
          ),
        },
        {
          key: 'returns',
          label: `Returns (${returns.length})`,
          children: returns.length ? (
            <Table
              size="small" rowKey="id" pagination={false} dataSource={returns}
              onRow={(row) => ({ onClick: () => navigate(`/returns/${row.id}`), style: { cursor: 'pointer' } })}
              columns={[
                {
                  title: 'Return', dataIndex: 'id',
                  render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
                },
                { title: 'Item', dataIndex: 'productName' },
                { title: 'Type', dataIndex: 'type' },
                { title: 'Reason', dataIndex: 'reason' },
                { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="returnRequest" code={v} /> },
              ]}
            />
          ) : <Empty description="No returns on this order" />,
        },
        {
          key: 'timeline',
          label: 'Timeline',
          children: (
            <ActivityTimeline
              events={events.map((e) => ({
                id: e.id,
                at: e.at,
                title: e.status.replace(/_/g, ' ').toLowerCase(),
                actorName: e.actorName,
                actorType: e.actorType?.toLowerCase(),
                reason: e.note,
              }))}
              emptyText="No events recorded"
            />
          ),
        },
        {
          key: 'notes',
          label: `Notes (${notes.length})`,
          children: (
            <Flex vertical gap={12}>
              <Space.Compact style={{ width: '100%' }}>
                <Input.TextArea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Internal note — visible to admins only"
                />
                <Button
                  type="primary"
                  loading={addingNote}
                  onClick={() => {
                    if (!note.trim()) {
                      message.error('Write something first.');
                      return;
                    }
                    onAddNote(note.trim());
                    setNote('');
                  }}
                >
                  Add
                </Button>
              </Space.Compact>

              {notes.length === 0 ? (
                <Empty description="No notes yet" />
              ) : (
                notes.map((n) => (
                  <Flex
                    key={n.id}
                    vertical
                    gap={2}
                    style={{ paddingBottom: 8, borderBottom: '1px solid var(--ant-color-border-secondary)' }}
                  >
                    <Typography.Text style={{ fontSize: 13 }}>{n.text}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {n.authorName} · <DateText value={n.at} />
                    </Typography.Text>
                  </Flex>
                ))
              )}
            </Flex>
          ),
        },
      ]}
    />
  );
}
