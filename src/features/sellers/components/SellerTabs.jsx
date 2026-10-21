import { App, Button, Descriptions, Empty, Flex, Input, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPercent } from '@core/utils/money';
import DateText from '@shared/components/DateText';
import DocumentViewer from '@shared/components/DocumentViewer';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import VerificationPanel from './VerificationPanel';

/** Metric against the threshold sellers are actually managed to. */
function Metric({ label, value, threshold, suffix = '%' }) {
  const bad = value > threshold;
  return (
    <Flex vertical gap={2} style={{ minWidth: 120 }}>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        {label}
      </Typography.Text>
      <Typography.Text strong type={bad ? 'danger' : undefined} className="tabular" style={{ fontSize: 17 }}>
        {suffix === '%' ? formatPercent(value, 2) : value}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 10 }}>
        target ≤ {threshold}
        {suffix}
      </Typography.Text>
    </Flex>
  );
}

export default function SellerTabs({ seller, meta, onAddNote, addingNote }) {
  const { message } = App.useApp();
  const [note, setNote] = useState('');
  const { documents, bank, addresses, penalties, claims, notes, brandRequests, counts } = meta;

  const submitNote = async () => {
    if (!note.trim()) {
      message.error('Write something first.');
      return;
    }
    await onAddNote(note.trim());
    setNote('');
  };

  return (
    <Tabs
      items={[
        {
          key: 'overview',
          label: 'Overview',
          children: (
            <Flex vertical gap={12}>
              <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
                <Descriptions.Item label="Legal name">{seller.legalName}</Descriptions.Item>
                <Descriptions.Item label="Business type">
                  {String(seller.businessType ?? '').replace(/_/g, ' ')}
                </Descriptions.Item>
                <Descriptions.Item label="GSTIN">
                  <Typography.Text className="mono">{seller.gstin}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="PAN">
                  <MaskedValue value={seller.pan} kind="pan" entityType="seller" entityId={seller.id} />
                </Descriptions.Item>
                <Descriptions.Item label="Contact">
                  <MaskedValue value={seller.contactPhone} kind="phone" entityType="seller" entityId={seller.id} />
                </Descriptions.Item>
                <Descriptions.Item label="Account manager">
                  {seller.accountManagerName ?? <Typography.Text type="secondary">Unassigned</Typography.Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Commission plan">{seller.commissionPlan ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Payout cycle">{seller.payoutCycle ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Fulfilment">
                  {(seller.fulfillmentTypes ?? []).map((f) => (
                    <Tag key={f} style={{ marginInlineEnd: 4 }}>
                      {f === 'ARISE' ? 'Fulfilled by Arise' : 'Seller fulfilled'}
                    </Tag>
                  ))}
                </Descriptions.Item>
                <Descriptions.Item label="Joined">
                  <DateText value={seller.joinedAt ?? seller.appliedAt} variant="date" />
                </Descriptions.Item>
              </Descriptions>

              {addresses.map((a) => (
                <Descriptions key={a.id} column={1} size="small" title="Pickup address">
                  <Descriptions.Item label="Address">
                    {a.line1}, {a.city}, {a.state} — {a.pincode}
                  </Descriptions.Item>
                </Descriptions>
              ))}
            </Flex>
          ),
        },
        {
          key: 'performance',
          label: 'Performance',
          children: (
            <Flex vertical gap={16}>
              <Flex gap={24} wrap>
                <Metric label="Cancellations" value={seller.cancellationPct} threshold={2} />
                <Metric label="Late dispatch" value={seller.lateDispatchPct} threshold={4} />
                <Metric label="Returns" value={seller.returnPct} threshold={8} />
                <Flex vertical gap={2} style={{ minWidth: 120 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>Rating</Typography.Text>
                  <Typography.Text strong className="tabular" style={{ fontSize: 17 }}>
                    {seller.rating ? `${seller.rating.toFixed(1)} ★` : '—'}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>target ≥ 3.8</Typography.Text>
                </Flex>
              </Flex>

              <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
                <Descriptions.Item label="GMV (30d)">
                  <MoneyText paise={seller.gmv30dPaise} compact strong />
                </Descriptions.Item>
                <Descriptions.Item label="Orders (30d)">{seller.orders30d}</Descriptions.Item>
                <Descriptions.Item label="Live listings">{counts.liveOffers}</Descriptions.Item>
              </Descriptions>
            </Flex>
          ),
        },
        {
          key: 'kyc',
          label: `KYC (${documents.filter((d) => d.status === 'APPROVED').length}/${documents.length})`,
          children: (
            <Flex vertical gap={16}>
              <VerificationPanel seller={seller} bank={bank} />
              {documents.map((doc) => (
                <DocumentViewer key={doc.id} document={doc} readOnly />
              ))}
            </Flex>
          ),
        },
        {
          key: 'brands',
          label: `Brands (${brandRequests.length})`,
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={brandRequests}
              locale={{ emptyText: 'No brand requests' }}
              columns={[
                { title: 'Brand', dataIndex: 'brandName' },
                { title: 'Type', dataIndex: 'requestType', render: (v) => v.replace(/_/g, ' ').toLowerCase() },
                { title: 'Submitted', dataIndex: 'submittedAt', render: (v) => <DateText value={v} /> },
                { title: 'Valid till', dataIndex: 'validTill', render: (v) => (v ? <DateText value={v} variant="date" /> : '—') },
                {
                  title: 'Status', dataIndex: 'status',
                  render: (v) => <Tag color={v === 'APPROVED' ? 'green' : v === 'REJECTED' ? 'red' : 'gold'} style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ')}</Tag>,
                },
              ]}
            />
          ),
        },
        {
          key: 'penalties',
          label: `Penalties (${penalties.length})`,
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={penalties}
              locale={{ emptyText: 'No penalties — a clean record' }}
              columns={[
                { title: 'Violation', dataIndex: 'violationLabel' },
                { title: 'Order', dataIndex: 'orderId', render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text> },
                { title: 'Amount', dataIndex: 'amountPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                { title: 'Applied', dataIndex: 'appliedAt', render: (v) => <DateText value={v} /> },
                {
                  title: 'Status', dataIndex: 'status',
                  render: (v) => <Tag color={v === 'WAIVED' ? 'green' : v === 'DISPUTED' ? 'gold' : 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag>,
                },
              ]}
            />
          ),
        },
        {
          key: 'claims',
          label: `Claims (${claims.length})`,
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={claims}
              locale={{ emptyText: 'No claims raised' }}
              columns={[
                { title: 'Type', dataIndex: 'typeLabel' },
                { title: 'Claimed', dataIndex: 'amountClaimedPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                { title: 'Approved', dataIndex: 'amountApprovedPaise', align: 'right', render: (v) => (v ? <MoneyText paise={v} /> : '—') },
                { title: 'Submitted', dataIndex: 'submittedAt', render: (v) => <DateText value={v} /> },
                { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag domain="claim" code={v} /> },
              ]}
            />
          ),
        },
        {
          key: 'listings',
          label: `Listings (${counts.products})`,
          children: (
            <Empty
              description={
                <Space direction="vertical" size={4}>
                  <Typography.Text>
                    {counts.products} products with {counts.offers} offers ({counts.liveOffers} live)
                  </Typography.Text>
                  <Link to={`/catalog/products?sellerId=${seller.id}`}>Open these in the catalog</Link>
                </Space>
              }
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
                <Button type="primary" loading={addingNote} onClick={submitNote}>
                  Add
                </Button>
              </Space.Compact>

              {notes.length === 0 ? (
                <Empty description="No notes yet" />
              ) : (
                notes.map((n) => (
                  <Flex key={n.id} vertical gap={2} style={{ paddingBottom: 8, borderBottom: '1px solid var(--ant-color-border-secondary)' }}>
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
