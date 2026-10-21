import { Card, Col, Flex, Row, Segmented, Table, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';
import { useCan, useCurrentUser } from '@core/rbac/useCan';
import { formatNumber, formatPercent } from '@core/utils/money';
import ErrorState from '@shared/components/ErrorState';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatCard from '@shared/components/StatCard';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import ActionCenter from '../components/ActionCenter';
import AlertsFeed from '../components/AlertsFeed';
import MoneyPositionCard from '../components/MoneyPositionCard';
import TopListsCard from '../components/TopListsCard';
import TrendChart from '../components/TrendChart';

const RANGES = [
  { label: 'Today', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

/**
 * KPIs, the trend chart, the action center, the funnel, top categories/
 * sellers/products and the system alerts feed (plan §16, Phase 8's "final
 * widgets"). Per-user widget hiding/reordering is not built — see the plan's
 * Phase 8 decisions for why.
 */
export default function DashboardPage() {
  const user = useCurrentUser();
  const can = useCan();
  const state = useUrlTableState({ defaultSort: '', defaultPageSize: 25 });
  const days = Number(state.filters.days ?? 7);

  const summary = useQuery({
    queryKey: qk.dashboard.summary({ days }),
    queryFn: () => api.get('/dashboard/summary', { days }).then((r) => r.data),
  });

  const actionCenter = useQuery({
    queryKey: qk.dashboard.actionCenter,
    queryFn: () => api.get('/dashboard/action-center').then((r) => r.data),
    enabled: can('dashboard.action_center.view'),
    refetchInterval: 120_000,
  });

  const queryClient = useQueryClient();
  const alerts = useQuery({
    queryKey: qk.dashboard.alerts,
    queryFn: () => api.get('/dashboard/alerts'),
    refetchInterval: 120_000,
  });
  const markAlertRead = useMutation({
    mutationFn: (id) => api.post(`/dashboard/alerts/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.dashboard.alerts }),
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={`Good day, ${firstName}`}
        subtitle="Everything below is scoped to what your roles can see."
        actions={
          <Segmented
            value={days}
            onChange={(v) => state.patchFilters({ days: String(v) })}
            options={RANGES}
          />
        }
      />

      {summary.error ? (
        <Card variant="borderless">
          <ErrorState error={summary.error} onRetry={summary.refetch} title="Could not load the dashboard" />
        </Card>
      ) : (
        <Row gutter={[12, 12]}>
          {(summary.data?.kpis ?? Array.from({ length: 8 })).map((kpi, i) => (
            <Col key={kpi?.key ?? i} xs={12} sm={12} md={8} lg={6} xxl={4}>
              <StatCard
                loading={summary.isLoading}
                label={kpi?.label}
                value={kpi?.value}
                valuePaise={kpi?.valuePaise}
                format={kpi?.format}
                deltaPct={kpi?.deltaPct}
                invertDelta={kpi?.invertDelta}
                comparisonLabel={days === 1 ? 'vs yesterday' : `vs previous ${days} days`}
              />
            </Col>
          ))}
        </Row>
      )}

      {can('dashboard.action_center.view') && (
        <ActionCenter tiles={actionCenter.data} loading={actionCenter.isLoading} />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <TrendChart
            series={summary.data?.series}
            previousSeries={summary.data?.previousSeries}
            loading={summary.isLoading}
          />
        </Col>

        <Col xs={24} xl={8}>
          <Card size="small" title="Order funnel" loading={summary.isLoading} style={{ height: '100%' }}>
            <Flex vertical gap={10}>
              {(summary.data?.funnel ?? []).map((stage, i, arr) => {
                const pct = arr[0]?.count ? (stage.count / arr[0].count) * 100 : 0;
                return (
                  <div key={stage.stage}>
                    <Flex justify="space-between" style={{ marginBottom: 3 }}>
                      <Typography.Text style={{ fontSize: 13 }}>{stage.stage}</Typography.Text>
                      <Typography.Text className="tabular" style={{ fontSize: 13 }}>
                        {formatNumber(stage.count)}{' '}
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {formatPercent(pct, 0)}
                        </Typography.Text>
                      </Typography.Text>
                    </Flex>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--ant-color-fill-quaternary)' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: i === arr.length - 1 ? 'var(--ant-color-success)' : 'var(--ant-color-primary)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </Flex>
          </Card>
        </Col>
      </Row>

      {can('dashboard.finance_widgets.view') && (
        <Row gutter={[12, 12]}>
          <Col span={24}>
            <MoneyPositionCard />
          </Col>
        </Row>
      )}

      <Row gutter={[12, 12]}>
        {can('dashboard.finance_widgets.view') && (
          <Col xs={24} lg={12}>
            <Card size="small" title="Payment mix" loading={summary.isLoading}>
              <Table
                size="small"
                pagination={false}
                rowKey="method"
                dataSource={summary.data?.paymentMix ?? []}
                columns={[
                  { title: 'Method', dataIndex: 'method' },
                  {
                    title: 'Share',
                    dataIndex: 'sharePct',
                    align: 'right',
                    render: (v) => <span className="tabular">{formatPercent(v)}</span>,
                  },
                  {
                    title: 'Success rate',
                    dataIndex: 'successPct',
                    align: 'right',
                    render: (v) => (
                      <Typography.Text type={v < 93 ? 'danger' : undefined} className="tabular">
                        {formatPercent(v)}
                      </Typography.Text>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        )}

        <Col xs={24} lg={can('dashboard.finance_widgets.view') ? 12 : 24}>
          <Card size="small" title="Top states by orders" loading={summary.isLoading}>
            <Table
              size="small"
              pagination={false}
              rowKey="state"
              dataSource={summary.data?.topStates ?? []}
              columns={[
                { title: 'State', dataIndex: 'state' },
                {
                  title: 'Orders',
                  dataIndex: 'orders',
                  align: 'right',
                  render: (v) => <span className="tabular">{formatNumber(v)}</span>,
                },
                {
                  title: 'GMV',
                  dataIndex: 'gmvPaise',
                  align: 'right',
                  render: (v) => <MoneyText paise={v} compact />,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <TopListsCard data={summary.data} loading={summary.isLoading} />
        </Col>
        <Col xs={24} lg={10}>
          <AlertsFeed
            alerts={alerts.data?.data}
            unread={alerts.data?.meta?.unread}
            loading={alerts.isLoading}
            onRead={(id) => markAlertRead.mutate(id)}
          />
        </Col>
      </Row>
    </Flex>
  );
}
