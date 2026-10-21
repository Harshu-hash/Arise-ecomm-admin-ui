import { Image, Space, Tag, Tooltip, Typography } from 'antd';
import { slaCountdown } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

/** Columns for the QC queue. */
export const qcColumns = [
  {
    key: 'productTitle',
    title: 'Listing',
    dataIndex: 'productTitle',
    sorter: true,
    alwaysVisible: true,
    render: (title, row) => (
      <Space size={8}>
        <Image
          src={row.productImage}
          alt=""
          width={34}
          height={34}
          preview={false}
          style={{ objectFit: 'cover', borderRadius: 6 }}
          fallback={BLANK}
        />
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>{title}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {row.sellerName}
            </Typography.Text>
          </div>
        </div>
      </Space>
    ),
  },
  {
    key: 'type', title: 'Type', dataIndex: 'type', priority: 2,
    render: (t) => <Tag style={{ marginInlineEnd: 0 }}>{t.toLowerCase()}</Tag>,
  },
  {
    key: 'checks', title: 'Checks', priority: 1,
    render: (_v, row) => (
      <Space size={4}>
        {row.failedChecks > 0 && (
          <Tooltip title="Failing automated checks block approval">
            <Tag color="red" style={{ marginInlineEnd: 0 }}>{row.failedChecks} fail</Tag>
          </Tooltip>
        )}
        {row.warnChecks > 0 && <Tag color="gold" style={{ marginInlineEnd: 0 }}>{row.warnChecks} warn</Tag>}
        {row.failedChecks === 0 && row.warnChecks === 0 && (
          <Tag color="green" style={{ marginInlineEnd: 0 }}>Clean</Tag>
        )}
      </Space>
    ),
  },
  {
    key: 'priority', title: 'Priority', dataIndex: 'priority', sorter: true, priority: 2,
    render: (p) => (p === 'HIGH' ? <Tag color="red" style={{ marginInlineEnd: 0 }}>High</Tag> : <Typography.Text type="secondary" style={{ fontSize: 12 }}>Normal</Typography.Text>),
  },
  {
    key: 'assignedToName', title: 'Reviewer', dataIndex: 'assignedToName', priority: 3,
    render: (v) => v ?? <Typography.Text type="secondary" style={{ fontSize: 12 }}>Unassigned</Typography.Text>,
  },
  {
    key: 'slaDueAt', title: 'SLA', dataIndex: 'slaDueAt', sorter: true, priority: 1,
    render: (v) => {
      const { label, overdue } = slaCountdown(v);
      return (
        <Typography.Text type={overdue ? 'danger' : undefined} strong={overdue} style={{ fontSize: 12 }}>
          {label}
        </Typography.Text>
      );
    },
  },
  {
    key: 'submittedAt', title: 'Submitted', dataIndex: 'submittedAt', sorter: true, priority: 3, defaultHidden: true,
    render: (v) => <DateText value={v} />,
  },
];

/** Columns for the product catalog list. */
export const productColumns = [
  {
    key: 'title', title: 'Product', dataIndex: 'title', sorter: true, alwaysVisible: true,
    render: (title, row) => (
      <Space size={8}>
        <Image
          src={row.images?.[0]}
          alt=""
          width={34}
          height={34}
          preview={false}
          style={{ objectFit: 'cover', borderRadius: 6 }}
          fallback={BLANK}
        />
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>{title}</Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {row.brandName} · {row.id}
            </Typography.Text>
          </div>
        </div>
      </Space>
    ),
  },
  { key: 'categoryPath', title: 'Category', dataIndex: 'categoryPath', priority: 2 },
  {
    key: 'status', title: 'Status', dataIndex: 'status', sorter: true, priority: 1,
    render: (code) => <StatusTag domain="listing" code={code} />,
  },
  {
    key: 'variantCount', title: 'Variants', dataIndex: 'variantCount', align: 'right', priority: 3,
    render: (v) => <span className="tabular">{v}</span>,
  },
  {
    key: 'sellerCount', title: 'Sellers', dataIndex: 'sellerCount', align: 'right', priority: 2,
    render: (v) => <span className="tabular">{v}</span>,
  },
  {
    key: 'buyBoxSellerName', title: 'Buy box', dataIndex: 'buyBoxSellerName', priority: 2,
    render: (v) => v ?? <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>,
  },
  {
    key: 'minPricePaise', title: 'Price', dataIndex: 'minPricePaise', sorter: true, align: 'right', priority: 1,
    render: (min, row) =>
      min === null ? (
        <Typography.Text type="secondary">—</Typography.Text>
      ) : min === row.maxPricePaise ? (
        <MoneyText paise={min} />
      ) : (
        <Space size={2}>
          <MoneyText paise={min} />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>–</Typography.Text>
          <MoneyText paise={row.maxPricePaise} />
        </Space>
      ),
  },
  {
    key: 'totalStock', title: 'Stock', dataIndex: 'totalStock', sorter: true, align: 'right', priority: 1,
    render: (v) => (
      <Typography.Text className="tabular" type={v === 0 ? 'danger' : v < 20 ? 'warning' : undefined}>
        {v}
      </Typography.Text>
    ),
  },
  {
    key: 'rating', title: 'Rating', dataIndex: 'rating', sorter: true, align: 'right', priority: 3,
    render: (v, row) =>
      v ? (
        <Space size={2}>
          <span className="tabular">{v.toFixed(1)} ★</span>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>({row.ratingCount})</Typography.Text>
        </Space>
      ) : (
        <Typography.Text type="secondary">—</Typography.Text>
      ),
  },
  {
    key: 'contentScore', title: 'Content', dataIndex: 'contentScore', sorter: true, align: 'right', priority: 3,
    render: (v) => (
      <Typography.Text className="tabular" type={v < 70 ? 'warning' : undefined}>{v}%</Typography.Text>
    ),
  },
  {
    key: 'assured', title: 'Assured', dataIndex: 'assured', priority: 3, defaultHidden: true,
    render: (v) => (v ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>Assured</Tag> : null),
  },
];
