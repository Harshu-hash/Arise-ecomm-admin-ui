import { Card, Col, Row, Segmented, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import { reportsApi, reportsKeys } from '../api/reports.api';

const DOMAINS = [
  { value: 'sales', label: 'Sales' },
  { value: 'customers', label: 'Customers' },
  { value: 'catalog', label: 'Catalog' },
  { value: 'sellers', label: 'Sellers' },
  { value: 'fulfilment', label: 'Fulfilment' },
  { value: 'returns', label: 'Returns' },
  { value: 'finance', label: 'Finance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'support', label: 'Support' },
];

const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

/** Analytics dashboards (M15.1): nine domains, each aggregated live from the collections the rest of the panel maintains. */
export default function AnalyticsDashboardsPage() {
  const [domain, setDomain] = useState('sales');
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: reportsKeys.analytics(domain, days),
    queryFn: () => reportsApi.analytics(domain, days),
  });

  return (
    <>
      <PageHeader
        title="Analytics dashboards"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Analytics dashboards' }]}
        subtitle="Each dashboard reads the same records the rest of the panel edits — never a separate copy."
        actions={<Segmented value={days} onChange={setDays} options={RANGES} />}
      />

      <Segmented value={domain} onChange={setDomain} options={DOMAINS} style={{ marginBottom: 12 }} />

      {query.isLoading && <FullPageSpinner />}
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && <DomainView domain={domain} data={query.data.data} />}
    </>
  );
}

function Totals({ entries }) {
  return (
    <Row gutter={[12, 12]}>
      {entries.map(([key, label, value, format]) => (
        <Col key={key} xs={12} sm={8} md={6}>
          <StatCard label={label} value={format === 'money' ? undefined : value} valuePaise={format === 'money' ? value : undefined} format={format} />
        </Col>
      ))}
    </Row>
  );
}

function RankedTable(rows, extraCols = []) {
  return (
    <Table
      size="small" pagination={false} rowKey="label"
      dataSource={rows}
      columns={[
        { key: 'label', title: 'Name', dataIndex: 'label' },
        ...(rows?.[0]?.gmvPaise !== undefined ? [{ key: 'gmvPaise', title: 'GMV', dataIndex: 'gmvPaise', align: 'right', render: (v) => <MoneyText paise={v} compact /> }] : []),
        ...(rows?.[0]?.units !== undefined ? [{ key: 'units', title: 'Units', dataIndex: 'units', align: 'right' }] : []),
        ...(rows?.[0]?.count !== undefined ? [{ key: 'count', title: 'Count', dataIndex: 'count', align: 'right' }] : []),
        ...extraCols,
      ]}
    />
  );
}

function DomainView({ domain, data }) {
  if (domain === 'sales') {
    return (
      <>
        <Totals entries={[
          ['gmvPaise', 'GMV', data.totals.gmvPaise, 'money'],
          ['orders', 'Orders', data.totals.orders, 'number'],
          ['units', 'Units', data.totals.units, 'number'],
          ['aovPaise', 'AOV', data.totals.aovPaise, 'money'],
        ]}
        />
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} lg={8}><Card size="small" title="Top categories">{RankedTable(data.byCategory)}</Card></Col>
          <Col xs={24} lg={8}><Card size="small" title="Top cities">{RankedTable(data.byCity)}</Card></Col>
          <Col xs={24} lg={8}><Card size="small" title="By channel">{RankedTable(data.byChannel)}</Card></Col>
        </Row>
      </>
    );
  }

  if (domain === 'customers') {
    return (
      <>
        <Totals entries={[
          ['newCustomers', 'New customers', data.totals.newCustomers, 'number'],
          ['returningCustomers', 'Returning customers', data.totals.returningCustomers, 'number'],
          ['totalCustomers', 'Total customers', data.totals.totalCustomers, 'number'],
          ['avgGmvPaise', 'Avg. lifetime GMV', data.totals.avgGmvPaise, 'money'],
        ]}
        />
        <Card size="small" title="Top cities" style={{ marginTop: 12 }}>{RankedTable(data.topCities)}</Card>
      </>
    );
  }

  if (domain === 'catalog') {
    return (
      <>
        <Totals entries={[
          ['liveListings', 'Live listings', data.totals.liveListings, 'number'],
          ['qcQueueSize', 'QC queue size', data.totals.qcQueueSize, 'number'],
          ['qcHighPriority', 'QC high priority', data.totals.qcHighPriority, 'number'],
          ['outOfStockPct', 'Out-of-stock rate', data.totals.outOfStockPct, 'percent'],
        ]}
        />
        <Card size="small" title="Live listings by category" style={{ marginTop: 12 }}>{RankedTable(data.byCategory)}</Card>
      </>
    );
  }

  if (domain === 'sellers') {
    return (
      <>
        <Totals entries={[
          ['activeSellers', 'Active sellers', data.totals.activeSellers, 'number'],
          ['avgRating', 'Avg. rating', data.totals.avgRating, 'number'],
          ['avgCancellationPct', 'Avg. cancellation rate', data.totals.avgCancellationPct, 'percent'],
        ]}
        />
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={12}><Card size="small" title="Onboarding funnel">{RankedTable(data.onboardingFunnel)}</Card></Col>
          <Col xs={24} md={12}><Card size="small" title="By tier">{RankedTable(data.byTier)}</Card></Col>
        </Row>
      </>
    );
  }

  if (domain === 'fulfilment') {
    return (
      <>
        <Totals entries={[
          ['shipments', 'Shipments', data.totals.shipments, 'number'],
          ['deliveredPct', 'Delivered', data.totals.deliveredPct, 'percent'],
          ['ndrPct', 'NDR rate', data.totals.ndrPct, 'percent'],
          ['rtoPct', 'RTO rate', data.totals.rtoPct, 'percent'],
        ]}
        />
        <Card size="small" title="By courier" style={{ marginTop: 12 }}>
          {RankedTable(data.byCourier, [{ key: 'ndrCount', title: 'NDR count', dataIndex: 'ndrCount', align: 'right' }])}
        </Card>
      </>
    );
  }

  if (domain === 'returns') {
    return (
      <>
        <Totals entries={[
          ['totalReturns', 'Total returns', data.totals.totalReturns, 'number'],
          ['returnRatePct', 'Return rate', data.totals.returnRatePct, 'percent'],
          ['qcFailPct', 'QC fail rate', data.totals.qcFailPct, 'percent'],
          ['closedCount', 'Closed', data.totals.closedCount, 'number'],
        ]}
        />
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={12}><Card size="small" title="By reason">{RankedTable(data.byReason)}</Card></Col>
          <Col xs={24} md={12}><Card size="small" title="By seller">{RankedTable(data.bySeller)}</Card></Col>
        </Row>
      </>
    );
  }

  if (domain === 'finance') {
    return (
      <Totals entries={[
        ['commissionPaise', 'Commission', data.totals.commissionPaise, 'money'],
        ['feesPaise', 'Fees', data.totals.feesPaise, 'money'],
        ['adsRevenuePaise', 'Ads revenue', data.totals.adsRevenuePaise, 'money'],
        ['netRevenuePaise', 'Net platform revenue', data.totals.netRevenuePaise, 'money'],
        ['refundsPaise', 'Refunds', data.totals.refundsPaise, 'money'],
        ['payoutsPaidPaise', 'Payouts paid', data.totals.payoutsPaidPaise, 'money'],
        ['codOutstandingPaise', 'COD outstanding', data.totals.codOutstandingPaise, 'money'],
      ]}
      />
    );
  }

  if (domain === 'marketing') {
    return (
      <>
        <Totals entries={[
          ['couponRedemptions', 'Coupon redemptions', data.totals.couponRedemptions, 'number'],
          ['couponDiscountGivenPaise', 'Discount given', data.totals.couponDiscountGivenPaise, 'money'],
          ['couponNetGmvPaise', 'Coupon-driven GMV', data.totals.couponNetGmvPaise, 'money'],
          ['flashSaleGmvPaise', 'Flash sale GMV', data.totals.flashSaleGmvPaise, 'money'],
        ]}
        />
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={12}>
            <Card size="small" title="Campaign performance">
              <Table
                size="small" pagination={false} rowKey="label"
                dataSource={data.campaignPerformance}
                columns={[
                  { key: 'label', title: 'Campaign', dataIndex: 'label' },
                  { key: 'sent', title: 'Sent', dataIndex: 'sent', align: 'right' },
                  { key: 'openRatePct', title: 'Open rate', dataIndex: 'openRatePct', align: 'right', render: (v) => `${v}%` },
                  { key: 'clickRatePct', title: 'Click rate', dataIndex: 'clickRatePct', align: 'right', render: (v) => `${v}%` },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}><Card size="small" title="Referral funnel">{RankedTable(data.referralFunnel)}</Card></Col>
        </Row>
      </>
    );
  }

  if (domain === 'support') {
    return (
      <>
        <Totals entries={[
          ['ticketVolume', 'Ticket volume', data.totals.ticketVolume, 'number'],
          ['avgFirstResponseMins', 'Avg. first response (min)', data.totals.avgFirstResponseMins, 'number'],
          ['avgResolutionHrs', 'Avg. resolution (hrs)', data.totals.avgResolutionHrs, 'number'],
          ['avgCsat', 'Avg. CSAT', data.totals.avgCsat ?? 0, 'number'],
          ['contactRatePct', 'Contact rate per order', data.totals.contactRatePct, 'percent'],
        ]}
        />
        <Card size="small" title="By channel" style={{ marginTop: 12 }}>{RankedTable(data.byChannel)}</Card>
      </>
    );
  }

  return <Typography.Text type="secondary">Unknown domain.</Typography.Text>;
}
