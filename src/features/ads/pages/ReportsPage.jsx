import { Card, Col, Progress, Row, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThemeStore } from '@app/theme/themeStore';
import { formatDate } from '@core/utils/date';
import { formatINRCompact } from '@core/utils/money';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import { adsApi, adsKeys } from '../api/ads.api';

/** Ads reports (M11.5): platform ad revenue, placement fill rate, and top advertisers by spend. */
export default function ReportsPage() {
  const dark = useThemeStore((s) => s.resolved) === 'dark';
  const query = useQuery({ queryKey: adsKeys.reports, queryFn: () => adsApi.reports() });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const { series, topAdvertisers, fillRateByPlacement, platformRevenuePaise, platformTotals } = query.data.data;

  const axis = dark ? '#A0A4AB' : '#6B6B6B';
  const grid = dark ? '#2A2E36' : '#EFEFEF';

  return (
    <>
      <PageHeader
        title="Sponsored ads reports"
        breadcrumbs={[{ label: 'Sponsored Ads' }, { label: 'Reports' }]}
        subtitle="What advertisers spent, what it delivered, and how often each placement actually filled."
      />

      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}><StatCard label="Platform ad revenue" valuePaise={platformRevenuePaise} format="money" /></Col>
        <Col xs={12} sm={6}><StatCard label="Impressions" value={platformTotals.impressions} /></Col>
        <Col xs={12} sm={6}><StatCard label="CTR" value={platformTotals.ctrPct} format="percent" /></Col>
        <Col xs={12} sm={6}><StatCard label="ROAS" value={platformTotals.roas} /></Col>
      </Row>

      <Card size="small" title="Daily ad spend" style={{ marginTop: 12 }}>
        {series.length === 0 ? (
          <Typography.Text type="secondary">No ad activity recorded yet.</Typography.Text>
        ) : (
          <ResponsiveContainer width="100%" height={248}>
            <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(d) => formatDate(d).slice(0, 6)} axisLine={{ stroke: grid }} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fill: axis, fontSize: 11 }} tickFormatter={formatINRCompact} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={{ background: dark ? '#1F232B' : '#fff', border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
                labelFormatter={(d) => formatDate(d)}
                formatter={(value) => [formatINRCompact(value), 'Ad spend']}
              />
              <Line type="monotone" dataKey="spendPaise" stroke="#2874F0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Fill rate by placement">
            <Table
              size="small" pagination={false} rowKey="placement"
              dataSource={fillRateByPlacement}
              columns={[
                { key: 'placement', title: 'Placement', dataIndex: 'placement' },
                {
                  key: 'fillRatePct', title: 'Fill rate', dataIndex: 'fillRatePct', width: 180,
                  render: (v) => <Progress percent={v} size="small" status={v < 40 ? 'exception' : undefined} />,
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Top advertisers by spend">
            <Table
              size="small" pagination={false} rowKey="sellerName"
              dataSource={topAdvertisers}
              columns={[
                { key: 'sellerName', title: 'Advertiser', dataIndex: 'sellerName' },
                { key: 'spendPaise', title: 'Spend', dataIndex: 'spendPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
                { key: 'adGmvPaise', title: 'Ad GMV', dataIndex: 'adGmvPaise', align: 'right', render: (v) => <MoneyText paise={v} compact /> },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
