import { Button, Card, Col, Divider, Flex, Row, Space, Typography } from 'antd';
import { useState } from 'react';
import ActivityTimeline from '@shared/components/ActivityTimeline';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import CopyableId from '@shared/components/CopyableId';
import DateText from '@shared/components/DateText';
import DiffList from '@shared/components/DiffList';
import EmptyState from '@shared/components/EmptyState';
import EntitySelect from '@shared/components/EntitySelect';
import MaskedValue from '@shared/components/MaskedValue';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import StatusTag from '@shared/components/StatusTag';
import { STATUS_MAPS } from '@shared/constants/statusMaps';

/**
 * Living reference for the shared component library. Dev-only; it is how we
 * check a component in both themes and at every breakpoint without hunting for
 * a real screen that happens to use it.
 */
export default function ComponentGalleryPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [seller, setSeller] = useState(null);

  return (
    <Flex vertical gap={16}>
      <PageHeader
        title="Component gallery"
        subtitle="Every shared primitive, for checking light and dark themes and narrow widths."
        tags={<StatusTag domain="generic" code="ACTIVE" />}
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <StatCard label="GMV" valuePaise={152_00_00_000} format="money" deltaPct={12.4} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="Orders" value={18420} deltaPct={-3.1} />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="Return rate" value={4.8} format="percent" deltaPct={0.6} invertDelta />
        </Col>
        <Col xs={12} md={6}>
          <StatCard label="Active sellers" value={62} deltaPct={0} />
        </Col>
      </Row>

      <Card size="small" title="Status tags">
        {Object.entries(STATUS_MAPS).map(([domain, codes]) => (
          <div key={domain} style={{ marginBottom: 10 }}>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {domain}
            </Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Space size={[6, 6]} wrap>
                {Object.keys(codes).map((code) => (
                  <StatusTag key={code} domain={domain} code={code} />
                ))}
              </Space>
            </div>
          </div>
        ))}
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Money, dates and identifiers">
            <Space direction="vertical" size={8}>
              <Space size={16} wrap>
                <MoneyText paise={130400} />
                <MoneyText paise={482134000} compact strong />
                <MoneyText paise={-25000} colorBySign />
                <MoneyText paise={null} />
              </Space>
              <Space size={16} wrap>
                <DateText value={new Date(Date.now() - 7200_000).toISOString()} />
                <DateText value={new Date().toISOString()} variant="datetime" />
                <DateText value={null} />
              </Space>
              <Space size={16} wrap>
                <CopyableId value="ORD-84920" to="/orders/ORD-84920" />
                <CopyableId value="SEL-0031" />
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="Masked personal data">
            <Space direction="vertical" size={8}>
              <Space size={16} wrap>
                <MaskedValue value="+91 98765 43210" kind="phone" entityType="customer" entityId="CUS-1" />
                <MaskedValue value="harsh@example.com" kind="email" entityType="customer" entityId="CUS-1" />
              </Space>
              <MaskedValue value="50100248172834" kind="account" entityType="seller" entityId="SEL-0001" />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Revealing writes an entry to the audit log and re-hides after 30 seconds.
              </Typography.Text>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Entity select">
            <EntitySelect entity="seller" value={seller} onChange={setSeller} placeholder="Search sellers" style={{ width: '100%' }} />
            <Divider />
            <EntitySelect entity="category" multiple placeholder="Search categories" style={{ width: '100%' }} />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="Diff and timeline">
            <DiffList
              changes={[
                { field: 'commissionPct', from: 12, to: 9.5 },
                { field: 'status', from: 'ACTIVE', to: 'SUSPENDED' },
                { field: 'permissions', from: ['a', 'b'], to: ['a', 'b', 'c', 'd', 'e'] },
              ]}
            />
            <Divider />
            <ActivityTimeline
              events={[
                {
                  id: '1',
                  at: new Date(Date.now() - 3600_000).toISOString(),
                  title: 'Seller approved',
                  actorName: 'Imran Qureshi',
                  actorEmail: 'onboarding@arise.test',
                  action: 'seller.approve',
                },
                {
                  id: '2',
                  at: new Date(Date.now() - 7200_000).toISOString(),
                  title: 'Listing blocked',
                  actorName: 'System',
                  actorId: 'system',
                  severity: 'warning',
                  reason: 'Price above MRP',
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Empty states">
            <EmptyState variant="empty" actionLabel="Invite admin" onAction={() => {}} />
            <Divider />
            <EmptyState variant="filtered" onClearFilters={() => {}} />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title="Confirmation dialog">
            <Button danger onClick={() => setConfirmOpen(true)}>
              Open a destructive confirmation
            </Button>
            <ConfirmActionModal
              open={confirmOpen}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() => setConfirmOpen(false)}
              danger
              needsApproval
              title="Suspend Bhatt Traders?"
              description="Their listings are hidden and payouts held until reinstated."
              impact="184 live listings will be hidden. ₹2,14,500 of pending payout will be held. 12 open orders can still be fulfilled."
              reasons={['Counterfeit complaints', 'High order defect rate', 'KYC expired', 'Other']}
              typeToConfirm="SUSPEND"
            />
          </Card>
        </Col>
      </Row>
    </Flex>
  );
}
