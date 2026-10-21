import { ArrowLeftOutlined } from '@ant-design/icons';
import {
  Alert, App, Button, Card, Checkbox, Col, Descriptions, Flex, Form, Image,
  Radio, Row, Space, Tag, Typography,
} from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import AuditDrawer from '@shared/components/AuditDrawer';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { orderKeys, ordersApi } from '../api/orders.api';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";

const ACTION_LABEL = {
  APPROVE: ['approve', 'Approve return'],
  REJECT: ['reject', 'Reject'],
  SCHEDULE_PICKUP: ['schedule-pickup', 'Schedule pickup'],
  MARK_RECEIVED: ['mark-received', 'Mark received'],
  RECORD_QC: ['qc', 'Record QC'],
  CONVERT_TO_REFUND: ['convert-to-refund', 'Convert to refund'],
};

export default function ReturnDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [modal, setModal] = useState(null);
  const [qcResult, setQcResult] = useState('PASS');
  const [checked, setChecked] = useState([]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: orderKeys.returnDetail(id),
    queryFn: () => ordersApi.returnDetail(id),
  });

  const act = useMutation({
    mutationFn: ({ action, payload }) => ordersApi.returnAction(id, action, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setModal(null);
      message.success(
        res.data.refundId ? 'QC passed — the refund has been started.' : 'Return updated',
      );
    },
    onError: (e) => message.error(e.message),
  });

  if (isLoading) return <FullPageSpinner label="Loading return…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this return" />;

  const row = data.data;
  const { allowedActions, item, order, refund, qcChecklist } = data.meta;

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={<Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to returns" onClick={() => navigate('/returns')} />}
        breadcrumbs={[{ label: 'Orders' }, { label: 'Returns', to: '/returns' }, { label: row.id }]}
        title={row.productName}
        tags={
          <Space size={6}>
            <StatusTag domain="returnRequest" code={row.status} />
            <Tag color={row.type === 'REPLACEMENT' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
              {row.type.toLowerCase()}
            </Tag>
            <Tag color={row.faultAttribution === 'SELLER' ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>
              {row.faultAttribution.toLowerCase()} fault
            </Tag>
          </Space>
        }
        meta={
          <>
            <Typography.Text className="mono" type="secondary" style={{ fontSize: 12 }}>{row.id}</Typography.Text>
            <Link to={`/orders/${row.orderId}`}>
              <Typography.Text style={{ fontSize: 12 }}>{row.orderId}</Typography.Text>
            </Link>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Requested <DateText value={row.requestedAt} />
            </Typography.Text>
          </>
        }
        actions={
          <Space wrap>
            {allowedActions.map((a) => (
              <Button
                key={a}
                danger={a === 'REJECT'}
                type={a === 'APPROVE' || a === 'RECORD_QC' ? 'primary' : 'default'}
                onClick={() => setModal(a)}
              >
                {ACTION_LABEL[a][1]}
              </Button>
            ))}
            <AuditDrawer entityType="return" entityId={row.id} entityLabel={row.productName} />
          </Space>
        }
      />

      {row.qcResult === 'FAIL' && (
        <Alert
          type="error"
          showIcon
          message="QC failed"
          description={
            <Space direction="vertical" size={2}>
              <span>{row.qcNotes}</span>
              <span>The seller can raise a claim against this outcome.</span>
            </Space>
          }
        />
      )}
      {refund && (
        <Alert
          type={refund.status === 'PENDING_DETAILS' ? 'warning' : 'info'}
          showIcon
          message={`Refund ${refund.id} — ${refund.status.replace(/_/g, ' ').toLowerCase()}`}
          description={
            refund.status === 'PENDING_DETAILS'
              ? 'This was a cash-on-delivery order, so there is no card to refund. It is waiting on the customer’s bank details.'
              : <MoneyText paise={refund.amountPaise} strong />
          }
        />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="What came back">
            <Flex gap={12} style={{ marginBottom: 12 }}>
              <Image src={row.image} alt="" width={76} height={76} style={{ objectFit: 'cover', borderRadius: 8 }} fallback={BLANK} />
              <Flex vertical gap={2}>
                <Typography.Text strong>{row.productName}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.variantLabel}</Typography.Text>
                <MoneyText paise={row.amountPaise} strong />
              </Flex>
            </Flex>

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Reason">{row.reason}</Descriptions.Item>
              <Descriptions.Item label="Customer said">
                {row.comments ?? <Typography.Text type="secondary">Nothing added</Typography.Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Photos">
                {row.images?.length ? `${row.images.length} supplied` : 'None'}
              </Descriptions.Item>
              <Descriptions.Item label="Pickup AWB">
                {row.pickupAwb ? <Typography.Text className="mono">{row.pickupAwb}</Typography.Text> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Delivered on">
                <DateText value={item?.deliveredAt} variant="date" />
              </Descriptions.Item>
              <Descriptions.Item label="Return window closed">
                <DateText value={item?.returnWindowEndsAt} variant="date" />
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card size="small" title="Order & seller">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Order">
                <Link to={`/orders/${row.orderId}`}>{row.orderId}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">{row.customerName}</Descriptions.Item>
              <Descriptions.Item label="Seller">
                <Link to={`/sellers/${row.sellerId}`}>{row.sellerName}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="Payment">{order?.paymentMethod}</Descriptions.Item>
              <Descriptions.Item label="Age">{row.ageDays} days</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <ConfirmActionModal
        open={Boolean(modal) && modal !== 'RECORD_QC'}
        onCancel={() => setModal(null)}
        onConfirm={(values) => act.mutate({ action: ACTION_LABEL[modal][0], payload: values })}
        loading={act.isPending}
        danger={modal === 'REJECT'}
        title={modal ? `${ACTION_LABEL[modal][1]}?` : ''}
        description={row.productName}
        impact={
          modal === 'APPROVE'
            ? 'A reverse pickup is arranged. The refund is released only after QC passes at the origin.'
            : modal === 'REJECT'
              ? 'The customer keeps the item and gets no refund. They are told why.'
              : modal === 'CONVERT_TO_REFUND'
                ? 'The replacement is cancelled and the customer gets their money back instead.'
                : undefined
        }
        reasonRequired={['REJECT', 'CONVERT_TO_REFUND'].includes(modal)}
        reasonLabel={modal === 'REJECT' ? 'Why are you rejecting this?' : 'Reason'}
        showNote={false}
        confirmLabel={modal ? ACTION_LABEL[modal][1] : ''}
      />

      <ConfirmActionModal
        open={modal === 'RECORD_QC'}
        onCancel={() => setModal(null)}
        onConfirm={(values) =>
          act.mutate({
            action: 'qc',
            payload: { result: qcResult, notes: values.reason, checklist: checked },
          })
        }
        loading={act.isPending}
        danger={qcResult === 'FAIL'}
        title="Record the QC result"
        description={row.productName}
        impact={
          qcResult === 'PASS'
            ? 'Passing QC releases the customer’s refund immediately.'
            : 'Failing QC stops the refund. The seller may raise a claim, so the notes matter.'
        }
        reasonRequired={qcResult === 'FAIL'}
        reasonLabel={qcResult === 'FAIL' ? 'What was wrong with it?' : 'Notes (optional)'}
        showNote={false}
        confirmLabel="Record result"
        extraFields={
          <>
            <Form.Item label="Outcome" required>
              <Radio.Group value={qcResult} onChange={(e) => setQcResult(e.target.value)}>
                <Radio.Button value="PASS">Pass</Radio.Button>
                <Radio.Button value="FAIL">Fail</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="Checklist">
              <Checkbox.Group
                value={checked}
                onChange={setChecked}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                options={(qcChecklist ?? []).map((c) => ({ label: c, value: c }))}
              />
            </Form.Item>
          </>
        }
      />
    </Flex>
  );
}
