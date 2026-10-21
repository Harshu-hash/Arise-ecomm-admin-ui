import { Card, Flex, Table, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

/**
 * The per-seller rows inside a batch.
 *
 * Shown as a plain table rather than a DataTable: these rows arrive with the
 * batch, are never paged, and sorting them by net amount is the only
 * interaction finance needs.
 */
export default function BatchPayoutsTable({ payouts }) {
  const columns = [
    {
      key: 'sellerName',
      title: 'Seller',
      dataIndex: 'sellerName',
      render: (v, row) => (
        <Flex vertical gap={0}>
          <Link to={`/sellers/${row.sellerId}`}>{v}</Link>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {row.lineCount} settlement lines · account ••{row.bankLast4}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'grossPaise', title: 'Gross', dataIndex: 'grossPaise', align: 'right',
      sorter: (a, b) => a.grossPaise - b.grossPaise,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'feesPaise', title: 'Fees', dataIndex: 'feesPaise', align: 'right',
      render: (v) => <MoneyText paise={-v} signed />,
    },
    {
      key: 'taxes', title: 'TCS + TDS', align: 'right',
      render: (_v, row) => <MoneyText paise={-(row.tcsPaise + row.tdsPaise)} signed />,
    },
    {
      key: 'adjustmentsPaise', title: 'Adjustments', dataIndex: 'adjustmentsPaise', align: 'right',
      render: (v) =>
        v ? <MoneyText paise={v} signed colorBySign /> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'netPaise', title: 'Net', dataIndex: 'netPaise', align: 'right',
      sorter: (a, b) => a.netPaise - b.netPaise,
      defaultSortOrder: 'descend',
      render: (v, row) => <MoneyText paise={v} strong type={row.netPaise < 0 ? 'danger' : undefined} />,
    },
    {
      key: 'status', title: 'Status', dataIndex: 'status',
      render: (v, row) => (
        <Flex vertical gap={2} align="flex-start">
          <StatusTag
            domain="sellerPayout"
            code={v}
            tooltip={row.failureReason ?? (v === 'CARRIED_FORWARD' ? 'Negative balance held against the next payout' : undefined)}
          />
          {row.retryCount ? (
            <Tag style={{ marginInlineEnd: 0 }}>retried {row.retryCount}×</Tag>
          ) : null}
        </Flex>
      ),
    },
    {
      key: 'utr', title: 'Bank reference', dataIndex: 'utr',
      render: (v, row) =>
        v ? (
          <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>
        ) : row.failureReason ? (
          <Tooltip title={row.failureReason}>
            <Typography.Text type="danger" style={{ fontSize: 12 }}>Returned by bank</Typography.Text>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ];

  return (
    <Card size="small" title={`Sellers in this batch (${payouts.length})`} styles={{ body: { padding: 0 } }}>
      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={payouts}
        pagination={payouts.length > 25 ? { pageSize: 25, size: 'small' } : false}
        scroll={{ x: 900 }}
      />
    </Card>
  );
}
