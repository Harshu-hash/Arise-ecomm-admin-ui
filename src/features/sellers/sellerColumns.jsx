import { Progress, Space, Tag, Tooltip, Typography } from 'antd';
import { slaCountdown } from '@core/utils/date';
import { formatPercent } from '@core/utils/money';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import { statusOptions } from '@shared/constants/statusMaps';

export const TIER_COLOR = { BRONZE: 'default', SILVER: 'blue', GOLD: 'gold', PLATINUM: 'purple' };

function StoreCell(name, row) {
  return (
    <div style={{ minWidth: 0 }}>
      <Typography.Text strong style={{ fontSize: 13 }}>
        {name}
      </Typography.Text>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {row.id} · {row.city}, {row.state}
        </Typography.Text>
      </div>
    </div>
  );
}

/** A metric that turns red once it crosses the threshold sellers are held to. */
function renderMetric(value, threshold) {
  return (
    <Typography.Text
      className="tabular"
      type={value > threshold ? 'danger' : undefined}
      strong={value > threshold}
    >
      {formatPercent(value, 2)}
    </Typography.Text>
  );
}

export const sellerColumns = [
  { key: 'storeName', title: 'Seller', dataIndex: 'storeName', sorter: true, alwaysVisible: true, render: StoreCell },
  {
    key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
    render: (code) => <StatusTag domain="seller" code={code} />,
  },
  {
    key: 'tier', title: 'Tier', dataIndex: 'tier', sorter: true, priority: 2,
    render: (tier) => <Tag color={TIER_COLOR[tier]} style={{ marginInlineEnd: 0 }}>{tier}</Tag>,
  },
  {
    key: 'rating', title: 'Rating', dataIndex: 'rating', sorter: true, align: 'right', priority: 2,
    render: (v) => (v ? <span className="tabular">{v.toFixed(1)} ★</span> : <Typography.Text type="secondary">—</Typography.Text>),
  },
  {
    key: 'liveListings', title: 'Listings', dataIndex: 'liveListings', sorter: true, align: 'right', priority: 2,
    render: (v) => <span className="tabular">{v}</span>,
  },
  {
    key: 'gmv30dPaise', title: 'GMV (30d)', dataIndex: 'gmv30dPaise', sorter: true, align: 'right', priority: 1,
    render: (v) => <MoneyText paise={v} compact />,
  },
  {
    key: 'orders30d', title: 'Orders (30d)', dataIndex: 'orders30d', sorter: true, align: 'right', priority: 3,
    render: (v) => <span className="tabular">{v}</span>,
  },
  { key: 'cancellationPct', title: 'Cancel %', dataIndex: 'cancellationPct', sorter: true, align: 'right', priority: 2, render: (v) => renderMetric(v, 2) },
  { key: 'lateDispatchPct', title: 'Late dispatch %', dataIndex: 'lateDispatchPct', sorter: true, align: 'right', priority: 3, render: (v) => renderMetric(v, 4) },
  { key: 'returnPct', title: 'Return %', dataIndex: 'returnPct', sorter: true, align: 'right', priority: 3, defaultHidden: true, render: (v) => renderMetric(v, 8) },
  {
    key: 'payoutOnHold', title: 'Payouts', dataIndex: 'payoutOnHold', priority: 3,
    render: (held) => (held ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>On hold</Tag> : <Typography.Text type="secondary" style={{ fontSize: 12 }}>Normal</Typography.Text>),
  },
  {
    key: 'joinedAt', title: 'Joined', dataIndex: 'joinedAt', sorter: true, priority: 3, defaultHidden: true,
    render: (v) => <DateText value={v} variant="date" />,
  },
];

export const sellerFilterSchema = [
  { key: 'status', label: 'Status', kind: 'multiSelect', options: statusOptions('seller'), width: 200 },
  {
    key: 'tier', label: 'Tier', kind: 'multiSelect', width: 160,
    options: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].map((t) => ({ value: t, label: t })),
  },
  { key: 'state', label: 'State', kind: 'text', width: 150 },
  { key: 'payoutOnHold', label: 'Payouts on hold', kind: 'boolean' },
  { key: 'joinedAt', label: 'Joined', kind: 'dateRange' },
];

/** Columns for the onboarding queue — verification progress and the SLA. */
export const applicationColumns = [
  { key: 'storeName', title: 'Applicant', dataIndex: 'storeName', sorter: true, alwaysVisible: true, render: StoreCell },
  {
    key: 'gstin', title: 'GSTIN', dataIndex: 'gstin', priority: 2,
    render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
  },
  {
    key: 'verification', title: 'Verified', priority: 1,
    render: (_v, row) => (
      <Space size={4}>
        <Tooltip title="GSTIN"><Tag color={row.gstinOk ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>GST</Tag></Tooltip>
        <Tooltip title="PAN"><Tag color={row.panOk ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>PAN</Tag></Tooltip>
        <Tooltip title="Bank penny drop"><Tag color={row.bankOk ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>Bank</Tag></Tooltip>
      </Space>
    ),
  },
  {
    key: 'documentsApproved', title: 'Documents', dataIndex: 'documentsApproved', sorter: true, priority: 1,
    render: (approved, row) => (
      <Space size={6}>
        <Progress
          type="circle"
          size={22}
          percent={Math.round((approved / row.documentsTotal) * 100)}
          showInfo={false}
          strokeColor={approved === row.documentsTotal ? 'var(--ant-color-success)' : undefined}
        />
        <Typography.Text className="tabular" style={{ fontSize: 12 }}>
          {approved}/{row.documentsTotal}
        </Typography.Text>
      </Space>
    ),
  },
  {
    key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
    render: (code) => <StatusTag domain="seller" code={code} />,
  },
  {
    key: 'blockerCount', title: 'Blockers', dataIndex: 'blockerCount', priority: 2,
    render: (n) =>
      n === 0 ? (
        <Tag color="green" style={{ marginInlineEnd: 0 }}>Ready</Tag>
      ) : (
        <Tag color="gold" style={{ marginInlineEnd: 0 }}>{n} to clear</Tag>
      ),
  },
  {
    key: 'appliedAt', title: 'Applied', dataIndex: 'appliedAt', sorter: true, priority: 2,
    render: (v) => <DateText value={v} />,
  },
  {
    key: 'slaDueAt', title: 'SLA', dataIndex: 'slaDueAt', sorter: true, priority: 1,
    render: (v, row) => {
      if (['APPROVED', 'ONBOARDING', 'REJECTED'].includes(row.status)) {
        return <Typography.Text type="secondary">—</Typography.Text>;
      }
      const { label, overdue } = slaCountdown(v);
      return (
        <Typography.Text type={overdue ? 'danger' : undefined} strong={overdue} style={{ fontSize: 12 }}>
          {label}
        </Typography.Text>
      );
    },
  },
];
