import { Card, Table, Tag, Typography } from 'antd';

/** The rules that flag accounts, and the blocklists that keep them out. */
export default function RiskReferenceCards({ rules = [], blocklist = [] }) {
  return (
    <>
      <Card size="small" title="Risk rules">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={rules}
          columns={[
            {
              title: 'Rule',
              dataIndex: 'name',
              render: (v, row) => (
                <div>
                  <Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {row.condition}
                    </Typography.Text>
                  </div>
                </div>
              ),
            },
            {
              title: 'Action',
              dataIndex: 'action',
              render: (v) => (
                <Tag style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ').toLowerCase()}</Tag>
              ),
            },
            { title: 'Hits (7d)', dataIndex: 'matchedLast7d', align: 'right' },
            {
              title: '',
              dataIndex: 'enabled',
              render: (v) =>
                v ? (
                  <Tag color="green" style={{ marginInlineEnd: 0 }}>On</Tag>
                ) : (
                  <Tag style={{ marginInlineEnd: 0 }}>Off</Tag>
                ),
            },
          ]}
        />
      </Card>

      <Card size="small" title={`Blocklist (${blocklist.length})`}>
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 6, size: 'small' }}
          dataSource={blocklist}
          columns={[
            {
              title: 'Type',
              dataIndex: 'kind',
              render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v.replace(/_/g, ' ').toLowerCase()}</Tag>,
            },
            {
              title: 'Value',
              dataIndex: 'value',
              render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
            },
            { title: 'Reason', dataIndex: 'reason' },
          ]}
        />
      </Card>
    </>
  );
}
