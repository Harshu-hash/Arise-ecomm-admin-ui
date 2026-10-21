import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Space, Tooltip, Typography } from 'antd';
import { slaCountdown } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';

/** Columns for the approvals inbox. `onDecide(row, approve)` opens the dialog. */
export function approvalColumns(onDecide) {
  return [
    {
      key: 'actionLabel',
      title: 'Action',
      dataIndex: 'actionLabel',
      alwaysVisible: true,
      sorter: true,
      render: (label, row) => (
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {label}
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.entityLabel}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      key: 'summary',
      title: 'What changes',
      dataIndex: 'summary',
      priority: 2,
      render: (v) => (
        <Typography.Text style={{ fontSize: 12 }} type="secondary">
          {v ?? '—'}
        </Typography.Text>
      ),
    },
    {
      key: 'amountPaise',
      title: 'Amount',
      dataIndex: 'amountPaise',
      sorter: true,
      align: 'right',
      priority: 1,
      render: (v) =>
        v ? <MoneyText paise={v} strong /> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      key: 'requestedByName',
      title: 'Raised by',
      dataIndex: 'requestedByName',
      priority: 2,
      render: (name, row) => (
        <div>
          <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
          <div>
            <DateText value={row.requestedAt} />
          </div>
        </div>
      ),
    },
    {
      key: 'expiresAt',
      title: 'Expires',
      dataIndex: 'expiresAt',
      sorter: true,
      priority: 2,
      render: (v, row) => {
        if (row.status !== 'PENDING') return <Typography.Text type="secondary">—</Typography.Text>;
        const { label, overdue } = slaCountdown(v);
        return (
          <Typography.Text type={overdue ? 'danger' : undefined} style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
        );
      },
    },
    {
      key: 'status',
      title: 'Status',
      dataIndex: 'status',
      priority: 1,
      render: (code) => <StatusTag domain="approval" code={code} />,
    },
    {
      key: 'decide',
      title: '',
      align: 'right',
      priority: 1,
      render: (_v, row) =>
        row.status === 'PENDING' && row.canDecide ? (
          <Space size={4}>
            <Tooltip title="Approve">
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                aria-label={`Approve ${row.actionLabel}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDecide(row, true);
                }}
              />
            </Tooltip>
            <Tooltip title="Reject">
              <Button
                size="small"
                danger
                icon={<CloseOutlined />}
                aria-label={`Reject ${row.actionLabel}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDecide(row, false);
                }}
              />
            </Tooltip>
          </Space>
        ) : null,
    },
  ];
}

export const APPROVAL_FILTER_SCHEMA = [
  {
    key: 'status',
    label: 'Status',
    kind: 'multiSelect',
    options: [
      { value: 'PENDING', label: 'Pending' },
      { value: 'APPROVED', label: 'Approved' },
      { value: 'REJECTED', label: 'Rejected' },
      { value: 'EXPIRED', label: 'Expired' },
      { value: 'CANCELLED', label: 'Cancelled' },
    ],
    width: 190,
  },
  { key: 'requestedAt', label: 'Raised', kind: 'dateRange' },
];

export const APPROVAL_VIEWS = [
  { label: 'Pending my approval', value: 'pending_mine' },
  { label: 'Raised by me', value: 'raised_by_me' },
  { label: 'All', value: 'all' },
];
