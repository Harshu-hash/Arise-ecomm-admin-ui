import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Flex, Row, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import AuditDrawer from '@shared/components/AuditDrawer';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { warehouseApi, warehouseKeys } from '@features/logistics/api/logistics.api';
import GrnGrid from '../components/GrnGrid';
import InboundTransitionModal from '../components/InboundTransitionModal';
import { STEP_LABEL } from '../inboundSteps';


/**
 * Receiving a consignment. The counting grid is the heart of it: what the
 * seller declared against what was actually on the pallet, with the shortfall
 * made obvious before the GRN is posted.
 */
export default function InboundDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [counts, setCounts] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [transition, setTransition] = useState(null);
  const [slot, setSlot] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: warehouseKeys.inboundDetail(id),
    queryFn: () => warehouseApi.inboundDetail(id),
  });

  // Seed the grid with the declared quantities, which is what a receiver
  // starts from and edits down.
  useEffect(() => {
    if (!data?.meta?.lines) return;
    setCounts(
      Object.fromEntries(
        data.meta.lines.map((l) => [
          l.id,
          { sellable: l.receivedSellable || l.declaredQty, damaged: l.receivedDamaged || 0, missing: l.receivedMissing || 0, note: l.note ?? '' },
        ]),
      ),
    );
  }, [data?.meta?.lines]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const move = useMutation({
    mutationFn: (payload) => warehouseApi.transitionInbound(id, payload),
    onSuccess: () => {
      invalidate();
      setTransition(null);
      setSlot(null);
      message.success('Updated');
    },
    onError: (e) => message.error(e.message),
  });

  const receive = useMutation({
    mutationFn: (payload) => warehouseApi.receiveInbound(id, payload),
    onSuccess: (res) => {
      invalidate();
      setConfirming(false);
      message.success(
        res.meta?.discrepancy
          ? 'GRN posted. A discrepancy report has gone to the seller.'
          : 'GRN posted — the stock is now sellable.',
      );
    },
    onError: (e) => {
      if (e.fieldErrors) {
        message.error('Some counts exceed what was declared. Correct them and try again.');
        return;
      }
      message.error(e.message);
    },
  });

  if (isLoading) return <FullPageSpinner label="Loading consignment…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this consignment" />;

  const row = data.data;
  const { lines, allowedActions, canReceive } = data.meta;

  const totals = lines.reduce(
    (acc, l) => {
      const c = counts[l.id] ?? {};
      return {
        declared: acc.declared + l.declaredQty,
        sellable: acc.sellable + Number(c.sellable ?? 0),
        damaged: acc.damaged + Number(c.damaged ?? 0),
        missing: acc.missing + Number(c.missing ?? 0),
      };
    },
    { declared: 0, sellable: 0, damaged: 0, missing: 0 },
  );
  const overCounted = lines.some((l) => {
    const c = counts[l.id] ?? {};
    return Number(c.sellable ?? 0) + Number(c.damaged ?? 0) + Number(c.missing ?? 0) > l.declaredQty;
  });

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={<Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to inbound" onClick={() => navigate('/warehouses/inbound')} />}
        breadcrumbs={[
          { label: 'Inventory & warehouses' },
          { label: 'Inbound', to: '/warehouses/inbound' },
          { label: row.id },
        ]}
        title={<Typography.Text className="mono">{row.id}</Typography.Text>}
        tags={
          <Space size={6}>
            <StatusTag domain="inbound" code={row.status} />
            {row.hasDiscrepancy && <Tag color="red" style={{ marginInlineEnd: 0 }}>Discrepancy</Tag>}
          </Space>
        }
        meta={
          <>
            <Link to={`/sellers/${row.sellerId}`}>
              <Typography.Text style={{ fontSize: 12 }}>{row.sellerName}</Typography.Text>
            </Link>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.warehouseName} ({row.warehouseCode})
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Raised <DateText value={row.createdAt} />
            </Typography.Text>
          </>
        }
        actions={
          <Space wrap>
            {allowedActions
              .filter((s) => !['RECEIVED', 'CANCELLED'].includes(s))
              .map((target) => (
                <Button key={target} onClick={() => setTransition(target)}>
                  {STEP_LABEL[target] ?? target}
                </Button>
              ))}
            <AuditDrawer entityType="inboundConsignment" entityId={row.id} entityLabel={row.id} />
          </Space>
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <Card
            size="small"
            title={canReceive ? 'Count what arrived' : 'Consignment lines'}
            extra={
              canReceive && (
                <Button type="primary" disabled={overCounted} onClick={() => setConfirming(true)}>
                  Post GRN
                </Button>
              )
            }
          >
            <GrnGrid
              lines={lines}
              counts={counts}
              setCounts={setCounts}
              editable={canReceive}
              totals={totals}
              overCounted={overCounted}
            />
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card size="small" title="Consignment">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Seller invoice">{row.invoiceNo}</Descriptions.Item>
              <Descriptions.Item label="E-way bill">
                <Typography.Text className="mono" style={{ fontSize: 11 }}>{row.ewayBillNo}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Boxes">{row.boxCount}</Descriptions.Item>
              <Descriptions.Item label="Dock slot">
                {row.appointmentAt ? (
                  <Space direction="vertical" size={0}>
                    <DateText value={row.appointmentAt} variant="date" />
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.appointmentSlot}</Typography.Text>
                  </Space>
                ) : 'Not booked'}
              </Descriptions.Item>
              <Descriptions.Item label="Vehicle">{row.vehicleNo ?? '—'}</Descriptions.Item>
              {row.receivedAt && (
                <Descriptions.Item label="Received">
                  <DateText value={row.receivedAt} /> by {row.receivedByName}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <ConfirmActionModal
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          receive.mutate({
            lines: lines.map((l) => ({ id: l.id, ...counts[l.id] })),
          })
        }
        loading={receive.isPending}
        danger={totals.damaged + totals.missing > 0}
        title="Post the GRN?"
        impact={
          <Space direction="vertical" size={2}>
            <span>{totals.sellable} units become sellable immediately.</span>
            {totals.damaged > 0 && <span>{totals.damaged} damaged units go to unsellable stock.</span>}
            {totals.missing > 0 && <span>{totals.missing} units are recorded as short.</span>}
            {totals.damaged + totals.missing > 0 && (
              <span>A discrepancy report is sent to {row.sellerName}, who may dispute it.</span>
            )}
          </Space>
        }
        reasonRequired={false}
        reasonLabel="Note (optional)"
        showNote={false}
        confirmLabel="Post GRN"
      />

      <InboundTransitionModal
        target={transition}
        slot={slot}
        setSlot={setSlot}
        loading={move.isPending}
        onCancel={() => { setTransition(null); setSlot(null); }}
        onConfirm={(values) =>
          move.mutate({
            status: transition,
            appointmentAt: slot ? slot.toISOString() : undefined,
            slot: slot ? '11:00–13:00' : undefined,
            vehicleNo: values.vehicleNo,
          })
        }
      />
    </Flex>
  );
}
