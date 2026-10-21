import { App, Button, Card, Col, Flex, Progress, Row, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import MoneyText from '@shared/components/MoneyText';
import { marketingApi } from '../api/marketing.api';

/** Polls while the sale is live: units sold vs committed stock, and the emergency pull. */
export default function FlashSaleLiveMonitor({ saleId }) {
  const { message } = App.useApp();
  const [pulling, setPulling] = useState(null);

  const query = useQuery({
    queryKey: ['marketing', 'flashSaleLive', saleId],
    queryFn: () => marketingApi.flashSaleLive(saleId),
    refetchInterval: 15_000,
  });

  const pull = useMutation({
    mutationFn: ({ nominationId, reason }) => marketingApi.pullNomination(saleId, nominationId, reason),
    onSuccess: () => { query.refetch(); setPulling(null); message.success('Product pulled from the sale'); },
    onError: (e) => message.error(e.message),
  });

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const data = query.data?.data;

  return (
    <Flex vertical gap={12}>
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <Card size="small"><Flex vertical gap={2}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>GMV so far</Typography.Text>
            <MoneyText paise={data?.gmvPaise ?? 0} strong style={{ fontSize: 20 }} />
          </Flex></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Flex vertical gap={2}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Units sold</Typography.Text>
            <Typography.Text strong className="tabular" style={{ fontSize: 20 }}>{data?.unitsSold ?? 0}</Typography.Text>
          </Flex></Card>
        </Col>
      </Row>

      <Table
        size="small"
        rowKey="id"
        loading={query.isLoading}
        dataSource={data?.products ?? []}
        pagination={false}
        columns={[
          {
            key: 'productTitle', title: 'Product', dataIndex: 'productTitle',
            render: (v, row) => (
              <Flex vertical gap={0} style={{ minWidth: 0 }}>
                <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 240 }}>{v}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.sellerName}</Typography.Text>
              </Flex>
            ),
          },
          {
            key: 'progress', title: 'Sold vs committed',
            render: (_v, row) => (
              <Flex vertical gap={2} style={{ minWidth: 140 }}>
                <Progress
                  percent={Math.round((row.unitsSold / row.committedStock) * 100)}
                  size="small"
                  status={row.soldOut ? 'exception' : 'active'}
                />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {row.unitsSold} / {row.committedStock} {row.soldOut ? <Tag color="red" style={{ marginInlineEnd: 0 }}>sold out</Tag> : null}
                </Typography.Text>
              </Flex>
            ),
          },
          {
            key: 'actions', title: '', align: 'right',
            render: (_v, row) => (
              <Can perm="marketing.flashsale.pull">
                <Button size="small" danger onClick={() => setPulling(row)}>Pull</Button>
              </Can>
            ),
          },
        ]}
      />

      <ConfirmActionModal
        open={Boolean(pulling)}
        onCancel={() => setPulling(null)}
        onConfirm={(values) => pull.mutate({ nominationId: pulling.id, reason: values.reason })}
        loading={pull.isPending}
        danger
        title="Pull this product from the sale"
        description={pulling ? `${pulling.productTitle} · ${pulling.sellerName}` : ''}
        impact="It disappears from the live sale immediately. Use this only for a genuine emergency — pricing error, stock fraud, safety recall."
        reasonRequired
        reasonLabel="What is the emergency?"
        showNote={false}
        typeToConfirm="PULL"
        confirmLabel="Pull product"
      />
    </Flex>
  );
}
