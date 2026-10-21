import { App, Button, Card, Flex, InputNumber, Slider, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import EntitySelect from '@shared/components/EntitySelect';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import { catalogApi, catalogKeys } from '../api/catalog.api';

const FACTOR_LABEL = {
  landedPricePct: 'Landed price',
  deliverySpeedPct: 'Delivery speed',
  sellerRatingPct: 'Seller rating',
  fulfillmentTypePct: 'Fulfillment type (FBA bonus)',
  cancellationRatePct: 'Cancellation rate',
};

/** Buy-box & badge rules (M3.9): the weights deciding which offer wins the buy box, and the Arise Assured thresholds. Publishing either is maker-checker. */
export default function BuyBoxRulesPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: catalogKeys.buyBoxRules, queryFn: () => catalogApi.buyBoxRules() });
  const [weights, setWeights] = useState(null);
  const [ariseAssured, setAriseAssured] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [productId, setProductId] = useState(null);

  const simulate = useQuery({
    queryKey: ['catalog', 'buyBoxSimulate', productId, weights],
    queryFn: () => catalogApi.simulateBuyBox({ productId, weights }),
    enabled: Boolean(productId && weights),
  });

  useEffect(() => {
    if (query.data && weights === null) {
      setWeights(query.data.data.weights);
      setAriseAssured(query.data.data.ariseAssured);
    }
  }, [query.data, weights]);

  const publish = useMutation({
    mutationFn: ({ reason }) => catalogApi.publishBuyBoxRules({ weights, ariseAssured, reason }),
    onSuccess: () => {
      query.refetch();
      setConfirming(false);
      message.info('Sent for approval. Every listing re-ranks once another admin agrees.');
    },
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!weights) return null;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const dirty = JSON.stringify(weights) !== JSON.stringify(query.data.data.weights)
    || JSON.stringify(ariseAssured) !== JSON.stringify(query.data.data.ariseAssured);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Buy-box & badge rules"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Buy-box & Badge Rules' }]}
        subtitle="These weights decide which seller's offer wins the buy box on every shared product page. Publishing needs a second approver."
        actions={
          <Can perm="catalog.rules.edit">
            <Button type="primary" disabled={!dirty || total !== 100} onClick={() => setConfirming(true)}>
              Publish
            </Button>
          </Can>
        }
      />

      <Card size="small" title="Buy-box rule weights" extra={<Tag color={total === 100 ? 'green' : 'red'} style={{ marginInlineEnd: 0 }}>{total}% of 100%</Tag>}>
        <Flex vertical gap={20}>
          {Object.keys(weights).map((key) => (
            <Flex key={key} vertical gap={2}>
              <Flex justify="space-between" align="center" gap={12}>
                <Typography.Text style={{ fontSize: 13 }}>{FACTOR_LABEL[key]}</Typography.Text>
                <InputNumber
                  size="small" style={{ width: 90 }} value={weights[key]} min={0} max={100} addonAfter="%"
                  onChange={(v) => setWeights((w) => ({ ...w, [key]: v ?? 0 }))}
                />
              </Flex>
              <Slider
                value={weights[key]} min={0} max={100} tooltip={{ open: false }}
                onChange={(v) => setWeights((w) => ({ ...w, [key]: v }))}
              />
            </Flex>
          ))}
        </Flex>
      </Card>

      <Card size="small" title="Arise Assured badge">
        <Flex gap={24} wrap>
          <Flex vertical gap={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Minimum seller rating</Typography.Text>
            <InputNumber style={{ width: 100 }} min={0} max={5} step={0.1} value={ariseAssured.minSellerRating} onChange={(v) => setAriseAssured((a) => ({ ...a, minSellerRating: v ?? 0 }))} />
          </Flex>
          <Flex vertical gap={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Maximum return rate</Typography.Text>
            <InputNumber style={{ width: 100 }} min={0} max={100} addonAfter="%" value={ariseAssured.maxReturnRatePct} onChange={(v) => setAriseAssured((a) => ({ ...a, maxReturnRatePct: v ?? 0 }))} />
          </Flex>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          A Fulfilled-by-Arise offer earns the badge only when both thresholds are met.
        </Typography.Text>
      </Card>

      <Card size="small" title="Simulate on a product">
        <Flex vertical gap={12}>
          <EntitySelect entity="product" value={productId} onChange={setProductId} placeholder="Search products" style={{ maxWidth: 420 }} />
          {simulate.isLoading && <Typography.Text type="secondary">Ranking offers…</Typography.Text>}
          {simulate.data?.data?.variants.map((v) => (
            <div key={v.variantId}>
              <Typography.Text strong style={{ fontSize: 13 }}>{v.variantLabel}</Typography.Text>
              <Table
                size="small" pagination={false} rowKey="id"
                dataSource={v.draft}
                columns={[
                  { key: 'rank', title: '#', dataIndex: 'rank', width: 40 },
                  { key: 'sellerName', title: 'Seller', dataIndex: 'sellerName' },
                  { key: 'sellingPricePaise', title: 'Price', dataIndex: 'sellingPricePaise', align: 'right', render: (p) => <MoneyText paise={p} /> },
                  { key: 'fulfillmentType', title: 'Fulfilment', dataIndex: 'fulfillmentType' },
                  {
                    key: 'currentRank', title: 'Current rank',
                    render: (_val, row) => {
                      const currentRank = v.current.find((c) => c.id === row.id)?.rank;
                      return currentRank ? <Tag style={{ marginInlineEnd: 0 }}>#{currentRank}</Tag> : <Typography.Text type="secondary">not ranked</Typography.Text>;
                    },
                  },
                ]}
              />
            </div>
          ))}
        </Flex>
      </Card>

      <ConfirmActionModal
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={(v) => publish.mutate({ reason: v.reason })}
        loading={publish.isPending}
        needsApproval
        title="Publish buy-box & badge rules"
        impact="Every variant's buy-box winner and every offer's Arise Assured badge are recomputed against these weights the moment another admin agrees."
        reasonRequired
        reasonLabel="Why are the rules changing?"
        showNote={false}
        confirmLabel="Request publish"
      />
    </Flex>
  );
}
