import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Flex, Row, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { formatDate } from '@core/utils/date';
import DateText from '@shared/components/DateText';
import DocumentViewer from '@shared/components/DocumentViewer';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MaskedValue from '@shared/components/MaskedValue';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { sellerKeys, sellersApi } from '../api/sellers.api';
import ApplicationDecisionBar from '../components/ApplicationDecisionBar';
import DuplicateWarning from '../components/DuplicateWarning';
import VerificationPanel from '../components/VerificationPanel';

/**
 * The onboarding workbench: everything a reviewer needs to decide on one
 * application, on one screen, with the decision bar pinned to the bottom.
 */
export default function SellerApplicationReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: sellerKeys.detail(id),
    queryFn: () => sellersApi.detail(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: sellerKeys.all });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const decideDocument = useMutation({
    mutationFn: ({ doc, approve, reason }) =>
      sellersApi.decideDocument(id, doc.id, { approve, reason }),
    onSuccess: () => {
      invalidate();
      message.success('Document updated');
    },
    onError: (e) => message.error(e.message),
  });

  const decide = useMutation({
    mutationFn: ({ decision, values }) =>
      sellersApi.decideApplication(id, decision, {
        reason: values?.reason,
        items: values?.items,
      }),
    onSuccess: (res, variables) => {
      invalidate();
      if (variables.decision === 'approve') {
        message.success('Application approved. The seller moves to onboarding.');
        navigate(`/sellers/${id}`);
      } else {
        message.success(variables.decision === 'reject' ? 'Application rejected' : 'Request sent to the seller');
        navigate('/sellers/applications');
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'APPROVAL_BLOCKED') {
        modal.warning({
          title: 'This application is not ready yet',
          content: (
            <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
              {(e.details?.blockers ?? []).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ),
        });
        return;
      }
      message.error(e.message);
    },
  });

  if (isLoading) return <FullPageSpinner label="Loading application…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Could not load this application" />;

  const seller = data.data;
  const { documents, addresses, bank, blockers, allowedActions, duplicates, categories } = data.meta;

  const rejectDocument = (doc) => {
    let reason = '';
    modal.confirm({
      title: `Reject ${doc.label}?`,
      content: (
        <textarea
          rows={3}
          placeholder="What is wrong with it? The seller sees this."
          style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 6 }}
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: 'Reject document',
      okButtonProps: { danger: true },
      onOk: () => {
        if (!reason.trim()) {
          message.error('Give a reason so the seller can fix it.');
          return Promise.reject(new Error('reason required'));
        }
        return decideDocument.mutateAsync({ doc, approve: false, reason });
      },
    });
  };

  return (
    <Flex vertical gap={16}>
      <PageHeader
        onBack={
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            aria-label="Back to applications"
            onClick={() => navigate('/sellers/applications')}
          />
        }
        breadcrumbs={[
          { label: 'Sellers' },
          { label: 'Onboarding applications', to: '/sellers/applications' },
          { label: seller.storeName },
        ]}
        title={seller.storeName}
        tags={<StatusTag domain="seller" code={seller.status} />}
        subtitle={seller.legalName}
        meta={
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Applied <DateText value={seller.appliedAt} />
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {seller.city}, {seller.state} — {seller.pincode}
            </Typography.Text>
          </>
        }
        actions={
          <Button onClick={() => navigate(`/sellers/${id}`)}>Open full seller page</Button>
        }
      />

      <DuplicateWarning duplicates={duplicates} />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={9}>
          <Flex vertical gap={12}>
            <Card size="small" title="Business">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Display name">{seller.storeName}</Descriptions.Item>
                <Descriptions.Item label="Legal name">{seller.legalName}</Descriptions.Item>
                <Descriptions.Item label="Contact">
                  <Space direction="vertical" size={0}>
                    <MaskedValue value={seller.contactPhone} kind="phone" entityType="seller" entityId={seller.id} />
                    <MaskedValue value={seller.contactEmail} kind="email" entityType="seller" entityId={seller.id} />
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Categories requested">
                  <Space size={[4, 4]} wrap>
                    {categories.map((c) => (
                      <Tag key={c.id} color={c.gated ? 'gold' : undefined} style={{ marginInlineEnd: 0 }}>
                        {c.name}
                        {c.gated ? ' (gated)' : ''}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <VerificationPanel seller={seller} bank={bank} />

            <Card size="small" title="Pickup address">
              {addresses.length ? (
                addresses.map((a) => (
                  <Descriptions key={a.id} column={1} size="small">
                    <Descriptions.Item label="Address">
                      {a.line1}, {a.line2}
                      <br />
                      {a.city}, {a.state} — {a.pincode}
                    </Descriptions.Item>
                    <Descriptions.Item label="Contact">
                      {a.contactName} ·{' '}
                      <MaskedValue value={a.contactPhone} kind="phone" entityType="seller" entityId={seller.id} />
                    </Descriptions.Item>
                    <Descriptions.Item label="Serviceable by">
                      {a.serviceableCouriers.length} courier
                      {a.serviceableCouriers.length === 1 ? '' : 's'}
                      {a.geoVerified ? (
                        <Tag color="green" style={{ marginLeft: 8 }}>Geo-verified</Tag>
                      ) : (
                        <Tag color="gold" style={{ marginLeft: 8 }}>Not geo-verified</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                ))
              ) : (
                <Typography.Text type="secondary">No pickup address yet.</Typography.Text>
              )}
            </Card>
          </Flex>
        </Col>

        <Col xs={24} xl={15}>
          <Card
            size="small"
            title={`Documents (${documents.filter((d) => d.status === 'APPROVED').length}/${documents.length} approved)`}
          >
            {documents.length === 0 ? (
              <Typography.Text type="secondary">
                The seller has not uploaded anything yet. Use “Request information” to chase them.
              </Typography.Text>
            ) : (
              <Flex vertical gap={20}>
                {documents.map((doc) => (
                  <DocumentViewer
                    key={doc.id}
                    document={doc}
                    deciding={decideDocument.isPending}
                    onDecide={(d, approve) =>
                      approve ? decideDocument.mutate({ doc: d, approve: true }) : rejectDocument(d)
                    }
                  />
                ))}
              </Flex>
            )}
          </Card>

          {seller.infoRequested?.length > 0 && (
            <Card size="small" title="Information already requested" style={{ marginTop: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {seller.infoRequested.map((i) => (
                  <li key={i}>
                    <Typography.Text style={{ fontSize: 13 }}>{i}</Typography.Text>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {seller.rejectionReason && (
            <Card size="small" title="Rejected" style={{ marginTop: 12 }}>
              <Typography.Text type="danger">{seller.rejectionReason}</Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  May reapply from {formatDate(new Date(Date.now() + 30 * 86400_000).toISOString())}
                </Typography.Text>
              </div>
            </Card>
          )}
        </Col>
      </Row>

      <ApplicationDecisionBar
        seller={seller}
        blockers={blockers}
        allowedActions={allowedActions}
        loading={decide.isPending}
        onDecide={(decision, values) => decide.mutate({ decision, values })}
      />
    </Flex>
  );
}
