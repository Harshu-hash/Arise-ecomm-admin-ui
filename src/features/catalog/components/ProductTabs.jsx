import { Descriptions, Flex, Image, Space, Table, Tabs, Typography } from 'antd';
import OfferTable from './OfferTable';

/** Overview, attributes, variants, offers and the size chart for one product. */
export default function ProductTabs({ product, variants, offers, attributes, sizeChart }) {
  return (
    <Tabs
      items={[
        {
          key: 'overview',
          label: 'Overview',
          children: (
            <Flex gap={16} wrap>
              <Space size={8} wrap>
                {(product.images ?? []).map((src) => (
                  <Image
                    key={src}
                    src={src}
                    alt=""
                    width={120}
                    height={120}
                    style={{ objectFit: 'cover', borderRadius: 8 }}
                  />
                ))}
              </Space>
              <Descriptions column={1} size="small" style={{ flex: '1 1 320px' }}>
                <Descriptions.Item label="Description">{product.description}</Descriptions.Item>
                <Descriptions.Item label="Highlights">
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {(product.highlights ?? []).map((h) => (
                      <li key={h}>
                        <Typography.Text style={{ fontSize: 13 }}>{h}</Typography.Text>
                      </li>
                    ))}
                  </ul>
                </Descriptions.Item>
                <Descriptions.Item label="Manufacturer">{product.manufacturer}</Descriptions.Item>
                <Descriptions.Item label="Country of origin">{product.countryOfOrigin}</Descriptions.Item>
                <Descriptions.Item label="HSN / GST">
                  {product.hsnCode} · {product.gstRate}%
                </Descriptions.Item>
                <Descriptions.Item label="Content score">{product.contentScore}%</Descriptions.Item>
              </Descriptions>
            </Flex>
          ),
        },
        {
          key: 'attributes',
          label: `Attributes (${attributes.length})`,
          children: (
            <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
              {attributes.map((a) => (
                <Descriptions.Item key={a.id} label={a.name}>
                  {product.attributes?.[a.code] ?? (
                    <Typography.Text type="secondary">Not set</Typography.Text>
                  )}
                  {a.unit ? ` ${a.unit}` : ''}
                </Descriptions.Item>
              ))}
            </Descriptions>
          ),
        },
        {
          key: 'variants',
          label: `Variants (${variants.length})`,
          children: (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={variants}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Variant', dataIndex: 'label' },
                {
                  title: 'SKU',
                  dataIndex: 'sku',
                  render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
                },
                {
                  title: 'EAN',
                  dataIndex: 'ean',
                  render: (v) => <Typography.Text className="mono" style={{ fontSize: 11 }}>{v}</Typography.Text>,
                },
                { title: 'Weight', dataIndex: 'weightG', align: 'right', render: (v) => `${v} g` },
                {
                  title: 'Offers',
                  align: 'right',
                  render: (_v, row) => offers.filter((o) => o.variantId === row.id).length,
                },
              ]}
            />
          ),
        },
        {
          key: 'offers',
          label: `Seller offers (${offers.length})`,
          children: <OfferTable offers={offers} productId={product.id} />,
        },
        ...(sizeChart
          ? [
              {
                key: 'sizeChart',
                label: 'Size chart',
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(r) => r.join('-')}
                    dataSource={sizeChart.rows}
                    columns={sizeChart.columns.map((c, i) => ({
                      title: i === 0 ? c : `${c} (${sizeChart.unit})`,
                      render: (_v, row) => row[i],
                    }))}
                  />
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
