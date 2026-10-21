import { Tag, Typography } from 'antd';
import DateText from '@shared/components/DateText';

export const SEVERITY_COLOR = { info: undefined, warning: 'gold', error: 'red' };

/** Column definitions for the audit log table. */
export const auditColumns = [
  {
    key: 'at',
    title: 'When',
    dataIndex: 'at',
    sorter: true,
    alwaysVisible: true,
    width: 150,
    render: (v) => <DateText value={v} />,
  },
  {
    key: 'actorName',
    title: 'Who',
    dataIndex: 'actorName',
    sorter: true,
    priority: 1,
    render: (name, row) => (
      <div>
        <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {row.actorEmail ?? 'system'}
          </Typography.Text>
        </div>
      </div>
    ),
  },
  {
    key: 'action',
    title: 'Action',
    dataIndex: 'action',
    sorter: true,
    priority: 1,
    render: (action, row) => (
      <Tag color={SEVERITY_COLOR[row.severity]} className="mono" style={{ marginInlineEnd: 0, fontSize: 11 }}>
        {action}
      </Tag>
    ),
  },
  {
    key: 'entityLabel',
    title: 'Record',
    dataIndex: 'entityLabel',
    priority: 1,
    render: (label, row) => (
      <div style={{ minWidth: 0 }}>
        <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
        <div>
          <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }}>
            {row.entityType} · {row.entityId}
          </Typography.Text>
        </div>
      </div>
    ),
  },
  {
    key: 'changes',
    title: 'Changes',
    dataIndex: 'changes',
    priority: 2,
    render: (changes) =>
      changes?.length ? (
        <Typography.Link style={{ fontSize: 12 }}>
          {changes.length} field{changes.length === 1 ? '' : 's'}
        </Typography.Link>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          —
        </Typography.Text>
      ),
  },
  {
    key: 'reason',
    title: 'Reason',
    dataIndex: 'reason',
    priority: 3,
    render: (v) => (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {v ?? '—'}
      </Typography.Text>
    ),
  },
  {
    key: 'ip',
    title: 'IP',
    dataIndex: 'ip',
    priority: 3,
    defaultHidden: true,
    render: (v) => <span className="mono">{v}</span>,
  },
];

/** Filter schema, built from the options the list endpoint returns. */
export function auditFilterSchema(options) {
  return [
    {
      key: 'module',
      label: 'Module',
      kind: 'multiSelect',
      options: (options?.modules ?? []).map((m) => ({ value: m, label: m })),
      width: 170,
    },
    {
      key: 'action',
      label: 'Action',
      kind: 'select',
      options: (options?.actions ?? []).map((a) => ({ value: a, label: a })),
      width: 220,
    },
    {
      key: 'actorId',
      label: 'Who',
      kind: 'select',
      options: (options?.actors ?? []).map((a) => ({ value: a.value, label: a.label })),
      width: 200,
    },
    {
      key: 'severity',
      label: 'Severity',
      kind: 'select',
      options: [
        { value: 'info', label: 'Info' },
        { value: 'warning', label: 'Warning' },
        { value: 'error', label: 'Error' },
      ],
      width: 140,
    },
    { key: 'at', label: 'When', kind: 'dateRange' },
    { key: 'entityId', label: 'Record ID', kind: 'text', width: 170 },
  ];
}
