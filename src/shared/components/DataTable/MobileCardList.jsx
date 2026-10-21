import { Card, Flex, Pagination, Skeleton, Space } from 'antd';

/**
 * Below 768px a dense table is unusable, so each row becomes a card. Modules
 * supply a `render(row)` that puts the two or three fields that matter on a
 * phone up front — this is why columns carry a `priority`.
 */
export default function MobileCardList({
  rows,
  rowKey,
  loading,
  render,
  onRowClick,
  empty,
  page,
  pageSize,
  total,
  onPageChange,
}) {
  if (loading) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} size="small">
            <Skeleton active paragraph={{ rows: 2 }} title={{ width: '45%' }} />
          </Card>
        ))}
      </Space>
    );
  }

  if (!rows.length) return <Card variant="borderless">{empty}</Card>;

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {rows.map((row) => (
        <Card
          key={row[rowKey]}
          size="small"
          hoverable={Boolean(onRowClick)}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          styles={{ body: { padding: 12 } }}
        >
          {render(row)}
        </Card>
      ))}

      <Flex justify="center" style={{ padding: '8px 0 4px' }}>
        <Pagination
          simple
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(p, ps) => onPageChange?.(p, ps)}
        />
      </Flex>
    </Space>
  );
}
