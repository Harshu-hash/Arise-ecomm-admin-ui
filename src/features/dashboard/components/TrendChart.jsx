import { Card, Empty, Segmented, Skeleton } from 'antd';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useThemeStore } from '@app/theme/themeStore';
import { formatDate } from '@core/utils/date';
import { formatINRCompact, formatNumber } from '@core/utils/money';

/** GMV and orders over the selected range, against the previous period. */
export default function TrendChart({ series = [], previousSeries = [], loading }) {
  const [metric, setMetric] = useState('gmv');
  const dark = useThemeStore((s) => s.resolved) === 'dark';

  if (loading) {
    return (
      <Card size="small" title="Trend">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  if (!series.length) {
    return (
      <Card size="small" title="Trend">
        <Empty description="No data for this range" />
      </Card>
    );
  }

  const isMoney = metric === 'gmv';
  const key = isMoney ? 'gmvPaise' : metric;

  // The comparison line is aligned by position, not date, so a shorter
  // previous period simply ends early rather than skewing the axis.
  const data = series.map((d, i) => ({
    date: d.date,
    current: d[key],
    previous: previousSeries[i]?.[key] ?? null,
  }));

  const axis = dark ? '#A0A4AB' : '#6B6B6B';
  const grid = dark ? '#2A2E36' : '#EFEFEF';
  const fmt = (v) => (isMoney ? formatINRCompact(v) : formatNumber(v));

  return (
    <Card
      size="small"
      title="Trend"
      extra={
        <Segmented
          size="small"
          value={metric}
          onChange={setMetric}
          options={[
            { label: 'GMV', value: 'gmv' },
            { label: 'Orders', value: 'orders' },
            { label: 'Units', value: 'units' },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={248}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: axis, fontSize: 11 }}
            tickFormatter={(d) => formatDate(d).slice(0, 6)}
            axisLine={{ stroke: grid }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: axis, fontSize: 11 }}
            tickFormatter={fmt}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: dark ? '#1F232B' : '#fff',
              border: `1px solid ${grid}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(d) => formatDate(d)}
            formatter={(value, name) => [fmt(value), name === 'current' ? 'This period' : 'Previous period']}
          />
          <Line
            type="monotone"
            dataKey="previous"
            stroke={axis}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
          <Line type="monotone" dataKey="current" stroke="#2874F0" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
