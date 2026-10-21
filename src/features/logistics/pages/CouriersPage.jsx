import { App, Button, Card, Col, Descriptions, Flex, Row, Space, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { formatINR, formatNumber, formatPercent } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { logisticsApi, logisticsKeys } from '../api/logistics.api';

const ZONE_LABEL = {
  LOCAL: 'Local', ZONAL: 'Within state', METRO: 'Metro', REST_OF_INDIA: 'Rest of India', SPECIAL: 'NE & J&K',
};

export default function CouriersPage() {
  const { message } = App.useApp();
  const [pausing, setPausing] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: logisticsKeys.couriers,
    queryFn: () => logisticsApi.couriers(),
  });

  const pause = useMutation({
    mutationFn: ({ id, reason }) => logisticsApi.pauseCourier(id, { reason }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: logisticsKeys.couriers });
      setPausing(null);
      message.success(
        res.data.status === 'PAUSED'
          ? `Paused. ${res.meta.inFlightUnaffected} parcels already with them are unaffected.`
          : 'Courier resumed',
      );
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading couriers…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load couriers" />;

  const couriers = data?.data ?? [];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Courier partners"
        breadcrumbs={[{ label: 'Logistics' }, { label: 'Courier partners' }]}
        subtitle="Pausing a courier stops new allocations. Parcels already with them keep moving."
      />

      <Row gutter={[12, 12]}>
        {couriers.map((courier) => (
          <Col key={courier.id} xs={24} xl={12}>
            <Card
              size="small"
              title={
                <Space size={8} wrap>
                  <Typography.Text strong>{courier.name}</Typography.Text>
                  <Tag color={courier.status === 'ACTIVE' ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>
                    {courier.status.toLowerCase()}
                  </Tag>
                  <Tag
                    color={courier.apiHealth === 'OK' ? undefined : 'red'}
                    style={{ marginInlineEnd: 0 }}
                  >
                    API {courier.apiHealth === 'OK' ? 'healthy' : 'failing'}
                  </Tag>
                </Space>
              }
              extra={
                <Button size="small" danger={courier.status === 'ACTIVE'} onClick={() => setPausing(courier)}>
                  {courier.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                </Button>
              }
            >
              <Descriptions column={{ xs: 1, md: 2 }} size="small" style={{ marginBottom: 10 }}>
                <Descriptions.Item label="On time">
                  <Typography.Text className="tabular" type={courier.onTimePct < 90 ? 'danger' : undefined}>
                    {formatPercent(courier.onTimePct, 1)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="RTO rate">
                  <Typography.Text className="tabular" type={courier.rtoPct > 5 ? 'danger' : undefined}>
                    {formatPercent(courier.rtoPct, 2)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Pickup success">
                  {formatPercent(courier.pickupSuccessPct, 1)}
                </Descriptions.Item>
                <Descriptions.Item label="In flight now">{courier.activeShipments}</Descriptions.Item>
                <Descriptions.Item label="Pincodes">{formatNumber(courier.pincodeCount)}</Descriptions.Item>
                <Descriptions.Item label="COD">{courier.codEnabled ? 'Yes' : 'No'}</Descriptions.Item>
              </Descriptions>

              {courier.rateCard && (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="uptoGrams"
                  dataSource={courier.rateCard.slabs}
                  scroll={{ x: 'max-content' }}
                  title={() => (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Rate card — effective {new Date(courier.rateCard.effectiveFrom).toLocaleDateString('en-IN')}
                    </Typography.Text>
                  )}
                  columns={[
                    {
                      title: 'Up to',
                      dataIndex: 'uptoGrams',
                      render: (v) => <span className="tabular">{v} g</span>,
                    },
                    ...Object.keys(ZONE_LABEL).map((zone) => ({
                      title: ZONE_LABEL[zone],
                      align: 'right',
                      render: (_v, row) => (
                        <span className="tabular">{formatINR(row.pricePaise[zone])}</span>
                      ),
                    })),
                  ]}
                />
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <ConfirmActionModal
        open={Boolean(pausing)}
        onCancel={() => setPausing(null)}
        onConfirm={(values) => pause.mutate({ id: pausing.id, reason: values.reason })}
        loading={pause.isPending}
        danger={pausing?.status === 'ACTIVE'}
        title={
          pausing?.status === 'ACTIVE' ? `Pause ${pausing?.name}?` : `Resume ${pausing?.name}?`
        }
        impact={
          pausing?.status === 'ACTIVE' ? (
            <span>
              No new parcels are allocated to them. The {pausing?.activeShipments} already in their
              network keep moving and are unaffected.
            </span>
          ) : (
            'They re-enter the allocation rules from the next shipment.'
          )
        }
        reasons={
          pausing?.status === 'ACTIVE'
            ? ['API failing', 'Pickup failures', 'Delivery performance', 'Commercial dispute', 'Other']
            : undefined
        }
        reasonRequired
        confirmLabel={pausing?.status === 'ACTIVE' ? 'Pause courier' : 'Resume courier'}
      />
    </Flex>
  );
}
