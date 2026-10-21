import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, App, Button, Col, Flex, Row, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import AuditDrawer from '@shared/components/AuditDrawer';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { orderKeys, ordersApi } from '../api/orders.api';
import OrderActionModals from '../components/OrderActionModals';
import OrderTabs from '../components/OrderTabs';
import { AddressPanel, CustomerPanel, PriceBreakdown } from '../components/OrderSidePanels';

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [modal, setModal] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [returnItem, setReturnItem] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersApi.detail(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['returns'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const act = useMutation({
    mutationFn: ({ kind, values }) => {
      if (kind === 'CANCEL') {
        return ordersApi.cancelItems(id, {
          itemIds: selectedIds, reason: values.reason, note: values.note, actor: values.actor,
        });
      }
      if (kind === 'RETURN') {
        return ordersApi.initiateReturn(id, returnItem.id, {
          reason: values.reason, type: values.type, comments: values.comments,
        });
      }
      if (kind === 'HOLD') return ordersApi.hold(id, { reason: values.reason });
      if (kind === 'ADDRESS') return ordersApi.changeAddress(id, values);
      throw new Error('Unknown action');
    },
    onSuccess: (res, variables) => {
      invalidate();
      setModal(null);
      setSelectedIds([]);
      if (variables.kind === 'CANCEL') {
        message.success(
          res.meta?.refundedPaise
            ? `Cancelled. Refund of ₹${(res.meta.refundedPaise / 100).toLocaleString('en-IN')} started.`
            : 'Items cancelled.',
        );
      } else if (variables.kind === 'RETURN') {
        message.success('Return created');
        navigate(`/returns/${res.data.id}`);
      } else {
        message.success('Done');
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.needsApproval) {
        invalidate();
        setModal(null);
        setSelectedIds([]);
        message.info('Cancelled. The refund is above your limit, so it has gone for approval.');
        return;
      }
      message.error(e.message);
    },
  });

  const release = useMutation({
    mutationFn: () => ordersApi.release(id),
    onSuccess: () => {
      invalidate();
      message.success('Hold released');
    },
    onError: (e) => message.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: (text) => ordersApi.addNote(id, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) }),
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading order…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this order" />;

  const order = data.data;
  const { items, shipments, allowedActions, refunds, customer } = data.meta;
  const selectedItems = items.filter((i) => selectedIds.includes(i.id));

  // Rough client-side estimate; the server computes the authoritative figure.
  const estimatedRefund = selectedItems.reduce((n, i) => n + i.linePaise, 0);

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={<Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to orders" onClick={() => navigate('/orders')} />}
        breadcrumbs={[{ label: 'Orders', to: '/orders' }, { label: order.id }]}
        title={<Typography.Text className="mono">{order.id}</Typography.Text>}
        tags={
          <Space size={6}>
            <StatusTag domain="orderItem" code={order.status} />
            {order.onHold && <Tag color="gold" style={{ marginInlineEnd: 0 }}>On hold</Tag>}
            {order.riskScore >= 60 && <Tag color="red" style={{ marginInlineEnd: 0 }}>High risk</Tag>}
          </Space>
        }
        meta={
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Placed <DateText value={order.placedAt} variant="datetime" />
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{order.channel}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {shipments.length} shipment{shipments.length === 1 ? '' : 's'}
            </Typography.Text>
          </>
        }
        actions={
          <Space wrap>
            {allowedActions.includes('CANCEL_ITEMS') && (
              <Button danger disabled={!selectedIds.length} onClick={() => setModal('CANCEL')}>
                Cancel {selectedIds.length || ''} item{selectedIds.length === 1 ? '' : 's'}
              </Button>
            )}
            {allowedActions.includes('CHANGE_ADDRESS') && (
              <Button onClick={() => setModal('ADDRESS')}>Change address</Button>
            )}
            {allowedActions.includes('HOLD') && <Button onClick={() => setModal('HOLD')}>Put on hold</Button>}
            {allowedActions.includes('RELEASE') && (
              <Button type="primary" loading={release.isPending} onClick={() => release.mutate()}>
                Release hold
              </Button>
            )}
            <AuditDrawer entityType="order" entityId={order.id} entityLabel={order.id} />
          </Space>
        }
      />

      {order.onHold && (
        <Alert type="warning" showIcon message="This order is on hold" description={order.holdReason} />
      )}
      {refunds.some((r) => r.status === 'FAILED') && (
        <Alert
          type="error"
          showIcon
          message="A refund on this order failed"
          description="Retry it or switch the refund mode from the Payment tab."
        />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={16}>
          <OrderTabs
            meta={data.meta}
            canCancel={allowedActions.includes('CANCEL_ITEMS')}
            canReturn={allowedActions.includes('INITIATE_RETURN')}
            selectedIds={selectedIds}
            onToggleItem={(itemId) =>
              setSelectedIds((prev) =>
                prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId],
              )
            }
            onReturn={(item) => {
              setReturnItem(item);
              setModal('RETURN');
            }}
            onAddNote={(text) => addNote.mutate(text)}
            addingNote={addNote.isPending}
          />
        </Col>

        <Col xs={24} xl={8}>
          <Flex vertical gap={12}>
            <PriceBreakdown order={order} />
            <CustomerPanel customer={customer} />
            <AddressPanel order={order} />
          </Flex>
        </Col>
      </Row>

      <OrderActionModals
        which={modal}
        order={order}
        selectedItems={selectedItems}
        returnItem={returnItem}
        estimatedRefundPaise={estimatedRefund}
        loading={act.isPending}
        onCancel={() => setModal(null)}
        onConfirm={(kind, values) => act.mutate({ kind, values })}
      />
    </Flex>
  );
}
