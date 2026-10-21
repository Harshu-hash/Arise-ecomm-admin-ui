import { App, Button, Card, Col, Descriptions, Flex, Progress, Row, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { formatNumber } from '@core/utils/money';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { warehouseApi, warehouseKeys } from '@features/logistics/api/logistics.api';

export default function WarehousesPage() {
  const { message } = App.useApp();
  const [pausing, setPausing] = useState(null);
  const [flow, setFlow] = useState('inbound');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: warehouseKeys.warehouses,
    queryFn: () => warehouseApi.warehouses(),
  });

  const pause = useMutation({
    mutationFn: ({ id, payload }) => warehouseApi.pauseWarehouse(id, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
      setPausing(null);
      message.success(
        res.meta?.affectedReservations
          ? `Done. ${res.meta.affectedReservations} reservations will re-route to other sites.`
          : 'Done',
      );
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading warehouses…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load warehouses" />;

  const warehouses = data?.data ?? [];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Warehouses"
        breadcrumbs={[{ label: 'Inventory & warehouses' }, { label: 'Warehouses' }]}
        subtitle="Fulfilled-by-Arise sites. Pausing outbound re-routes orders to another site holding the same SKUs."
      />

      <Row gutter={[12, 12]}>
        {warehouses.map((w) => (
          <Col key={w.id} xs={24} lg={12}>
            <Card
              size="small"
              title={
                <Space size={8} wrap>
                  <Typography.Text strong>{w.name}</Typography.Text>
                  <Tag style={{ marginInlineEnd: 0 }}>{w.code}</Tag>
                  <Tag color={w.type === 'FULFILMENT' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
                    {w.type === 'FULFILMENT' ? 'Fulfilment' : 'Returns'}
                  </Tag>
                  {w.inboundPaused && <Tag color="gold" style={{ marginInlineEnd: 0 }}>Inbound paused</Tag>}
                  {w.outboundPaused && <Tag color="red" style={{ marginInlineEnd: 0 }}>Outbound paused</Tag>}
                </Space>
              }
              extra={
                <Space size={6}>
                  <Button size="small" onClick={() => { setPausing(w); setFlow('inbound'); }}>
                    {w.inboundPaused ? 'Resume inbound' : 'Pause inbound'}
                  </Button>
                  <Button size="small" danger={!w.outboundPaused} onClick={() => { setPausing(w); setFlow('outbound'); }}>
                    {w.outboundPaused ? 'Resume outbound' : 'Pause outbound'}
                  </Button>
                </Space>
              }
            >
              <Descriptions column={{ xs: 1, md: 2 }} size="small">
                <Descriptions.Item label="Location">{w.city}, {w.state} — {w.pincode}</Descriptions.Item>
                <Descriptions.Item label="GSTIN">
                  <Typography.Text className="mono" style={{ fontSize: 11 }}>{w.gstin}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="SKUs">{formatNumber(w.skuCount)}</Descriptions.Item>
                <Descriptions.Item label="Units on hand">{formatNumber(w.unitCount)}</Descriptions.Item>
                <Descriptions.Item label="Low stock">
                  <Typography.Text type={w.lowStockSkus ? 'warning' : undefined}>
                    {w.lowStockSkus} SKUs
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Inbound pending">
                  <Link to={`/warehouses/inbound?warehouseId=${w.id}`}>{w.inboundPending}</Link>
                </Descriptions.Item>
                <Descriptions.Item label="Dispatch cut-off">{w.dispatchCutoff}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Capacity used
                </Typography.Text>
                <Progress
                  percent={w.capacityUsedPct}
                  size="small"
                  status={w.capacityUsedPct > 90 ? 'exception' : 'normal'}
                />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <ConfirmActionModal
        open={Boolean(pausing)}
        onCancel={() => setPausing(null)}
        onConfirm={(values) => pause.mutate({ id: pausing.id, payload: { flow, reason: values.reason } })}
        loading={pause.isPending}
        danger={flow === 'outbound'}
        title={`${pausing?.[flow === 'inbound' ? 'inboundPaused' : 'outboundPaused'] ? 'Resume' : 'Pause'} ${flow} at ${pausing?.name}?`}
        impact={
          flow === 'inbound'
            ? 'Sellers cannot book new dock appointments here. Consignments already booked still arrive.'
            : 'Orders stop being allocated to this site and re-route to another holding the same SKUs. If no other site has stock, those items go out of stock.'
        }
        reasons={
          flow === 'inbound'
            ? ['Dock refurbishment', 'At capacity', 'Staff shortage', 'Other']
            : ['System outage', 'Staff shortage', 'Stock count in progress', 'Other']
        }
        reasonRequired
        confirmLabel="Confirm"
      />
    </Flex>
  );
}
