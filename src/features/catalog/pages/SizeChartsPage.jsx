import { Card, Col, Empty, Flex, Row, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { catalogApi, catalogKeys } from '../api/catalog.api';

/**
 * Size charts as the app renders them, so what a reviewer checks here is what
 * a customer sees on the product page.
 */
export default function SizeChartsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: catalogKeys.sizeCharts,
    queryFn: () => catalogApi.sizeCharts(),
  });

  if (isLoading) return <FullPageSpinner label="Loading size charts…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load size charts" />;

  const charts = data?.data ?? [];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Size charts"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Size charts' }]}
        subtitle="Attached to apparel and footwear listings. Wrong measurements are a leading cause of returns."
      />

      {charts.length === 0 ? (
        <Card size="small">
          <Empty description="No size charts yet" />
        </Card>
      ) : (
        <Row gutter={[12, 12]}>
          {charts.map((chart) => (
            <Col key={chart.id} xs={24} xl={12}>
              <Card
                size="small"
                title={chart.name}
                extra={
                  <Flex gap={6}>
                    {chart.categoryName && <Tag style={{ marginInlineEnd: 0 }}>{chart.categoryName}</Tag>}
                    <Tag style={{ marginInlineEnd: 0 }}>{chart.productCount} products</Tag>
                  </Flex>
                }
              >
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(row) => row.join('-')}
                  dataSource={chart.rows}
                  scroll={{ x: 'max-content' }}
                  columns={chart.columns.map((c, i) => ({
                    title: i === 0 ? c : `${c} (${chart.unit})`,
                    render: (_v, row) => (
                      <Typography.Text className="tabular" strong={i === 0}>
                        {row[i]}
                      </Typography.Text>
                    ),
                  }))}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Flex>
  );
}
