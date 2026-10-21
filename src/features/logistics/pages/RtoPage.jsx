import { Alert, Card, Col, Flex, Row, Table, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { formatPercent } from '@core/utils/money';
import DataTable from '@shared/components/DataTable/DataTable';
import FilterBar from '@shared/components/FilterBar';
import PageHeader from '@shared/components/PageHeader';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { logisticsKeys } from '../api/logistics.api';
import { shipmentColumns } from '../shipmentColumns';

/**
 * Parcels coming back undelivered. The pincode table matters more than the
 * list: RTO is a pattern problem, and switching COD off in the worst pincodes
 * is the lever that actually moves it.
 */
export default function RtoPage() {
  const state = useUrlTableState({ defaultSort: '-promisedDate' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: logisticsKeys.rto({ ...state.queryParams, tab: state.tab }),
    url: '/rto',
    params: { ...state.queryParams, ...(state.tab ? { status: state.tab } : {}) },
  });

  const topPincodes = meta?.topPincodes ?? [];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="RTO — returning to origin"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'RTO' }]}
        subtitle="Every one of these cost delivery, return freight and a lost sale."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={15}>
          <FilterBar
            schema={[
              { key: 'courierId', label: 'Courier', kind: 'entity', entity: 'courier', width: 180 },
              { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
            ]}
            tableState={state}
            searchPlaceholder="Search AWB, order, customer or seller"
          />
          <DataTable
            tableId="rto"
            columns={shipmentColumns}
            rows={rows}
            meta={meta}
            loading={loading || fetching}
            error={error}
            onRetry={refetch}
            tableState={state}
            tabs={[
              { key: 'all', label: 'All' },
              { key: 'RTO_INITIATED', label: 'Initiated' },
              { key: 'RTO_IN_TRANSIT', label: 'In transit' },
              { key: 'RTO_DELIVERED', label: 'Back with seller' },
            ]}
            onExport={() => {}}
            exportPerm="logistics.rto.export"
            emptyProps={{ title: 'Nothing coming back' }}
            mobileCard={(row) => (
              <Flex vertical gap={4}>
                <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{row.awb}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {row.destinationCity} → {row.sellerName}
                </Typography.Text>
              </Flex>
            )}
          />
        </Col>

        <Col xs={24} xl={9}>
          <Card size="small" title="Where RTO comes from">
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 10 }}
              message="Switching COD off in the worst pincodes is the single biggest lever"
              description="Prepaid orders almost never come back. Use the pincode screen to apply an override."
            />
            <Table
              size="small"
              rowKey="pincode"
              pagination={false}
              dataSource={topPincodes}
              locale={{ emptyText: 'No concentration yet' }}
              columns={[
                {
                  title: 'Pincode',
                  dataIndex: 'pincode',
                  render: (v, row) => (
                    <div>
                      <Typography.Text className="mono" strong style={{ fontSize: 12 }}>{v}</Typography.Text>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.city}</Typography.Text>
                      </div>
                    </div>
                  ),
                },
                { title: 'Parcels', dataIndex: 'count', align: 'right' },
                {
                  title: 'RTO rate',
                  dataIndex: 'rtoPct',
                  align: 'right',
                  render: (v) => (
                    <Typography.Text className="tabular" type={v > 25 ? 'danger' : undefined}>
                      {v ? formatPercent(v, 0) : '—'}
                    </Typography.Text>
                  ),
                },
                {
                  title: 'COD',
                  dataIndex: 'codAvailable',
                  render: (v) =>
                    v ? (
                      <Tag color="gold" style={{ marginInlineEnd: 0 }}>On</Tag>
                    ) : (
                      <Tag style={{ marginInlineEnd: 0 }}>Off</Tag>
                    ),
                },
              ]}
            />
            <Link to="/logistics/pincodes" style={{ display: 'inline-block', marginTop: 10 }}>
              Manage pincode overrides
            </Link>
          </Card>
        </Col>
      </Row>
    </Flex>
  );
}
