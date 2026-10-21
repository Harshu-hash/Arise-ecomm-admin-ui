import { App, Button, Card, Flex, InputNumber, Switch, Table, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import { adsApi, adsKeys } from '../api/ads.api';

/** Placements & pricing (M11.3): where ads serve, how many per page, and the floor CPC — the one maker-checker action here. */
export default function PlacementsPage() {
  const { message } = App.useApp();
  const [editingFloor, setEditingFloor] = useState(null);
  const [draftFloors, setDraftFloors] = useState({});

  const query = useQuery({ queryKey: adsKeys.placements, queryFn: () => adsApi.placements() });

  const update = useMutation({
    mutationFn: ({ id, payload }) => adsApi.updatePlacement(id, payload),
    onSuccess: () => query.refetch(),
    onError: (e) => message.error(e.message),
  });
  const updateFloor = useMutation({
    mutationFn: ({ id, floorCpcByCategory, reason }) => adsApi.updatePlacement(id, { floorCpcByCategory, reason }),
    onSuccess: () => {
      query.refetch();
      setEditingFloor(null);
      message.info('Sent for approval. The new floor price applies once another admin agrees.');
    },
    onError: (e) => message.error(e instanceof ApiError ? e.message : 'Could not update'),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const placements = query.data.data;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Placements & pricing"
        breadcrumbs={[{ label: 'Sponsored Ads' }, { label: 'Placements & pricing' }]}
        subtitle="A floor-price change moves what every advertiser in a category pays and needs a second approver."
      />

      {placements.map((p) => (
        <Card key={p.id} size="small" title={p.name} extra={
          <Can perm="ads.placement.view" disable>
            <Switch checked={p.enabled} onChange={(enabled) => update.mutate({ id: p.id, payload: { enabled } })} />
          </Can>
        }>
          <Flex vertical gap={10}>
            <Flex gap={16} wrap>
              <Flex vertical gap={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Max ads per page</Typography.Text>
                <InputNumber
                  size="small" min={1} value={p.maxAdsPerPage}
                  onBlur={(e) => Number(e.target.value) !== p.maxAdsPerPage && update.mutate({ id: p.id, payload: { maxAdsPerPage: Number(e.target.value) } })}
                />
              </Flex>
              <Flex vertical gap={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Quality score weight</Typography.Text>
                <InputNumber
                  size="small" min={0} max={100} addonAfter="%" value={p.qualityWeightPct}
                  onBlur={(e) => Number(e.target.value) !== p.qualityWeightPct && update.mutate({ id: p.id, payload: { qualityWeightPct: Number(e.target.value) } })}
                />
              </Flex>
              <Flex vertical gap={2}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Ad label</Typography.Text>
                <Typography.Text style={{ fontSize: 13 }}>{p.adLabelStyle}</Typography.Text>
              </Flex>
            </Flex>

            <Table
              size="small" pagination={false} rowKey="category"
              dataSource={Object.entries(p.floorCpcByCategory).map(([category, floorCpcPaise]) => ({ category, floorCpcPaise }))}
              columns={[
                { key: 'category', title: 'Category', dataIndex: 'category' },
                { key: 'floorCpcPaise', title: 'Floor CPC', dataIndex: 'floorCpcPaise', align: 'right', render: (v) => <MoneyText paise={v} /> },
              ]}
              footer={() => (
                <Can perm="ads.placement.edit">
                  <Button size="small" onClick={() => { setEditingFloor(p); setDraftFloors(p.floorCpcByCategory); }}>
                    Change floor prices
                  </Button>
                </Can>
              )}
            />
          </Flex>
        </Card>
      ))}

      <ConfirmActionModal
        open={Boolean(editingFloor)}
        onCancel={() => setEditingFloor(null)}
        onConfirm={(v) => updateFloor.mutate({ id: editingFloor.id, floorCpcByCategory: draftFloors, reason: v.reason })}
        loading={updateFloor.isPending}
        needsApproval
        title={`Change floor prices for ${editingFloor?.name}`}
        impact="Every advertiser bidding into this placement pays at least this much per click, the moment a second approver agrees."
        reasonRequired
        reasonLabel="Why are floor prices changing?"
        showNote={false}
        confirmLabel="Request change"
        extraFields={
          <Flex vertical gap={8}>
            {Object.keys(draftFloors).map((category) => (
              <Flex key={category} justify="space-between" align="center" gap={12}>
                <Typography.Text style={{ fontSize: 13 }}>{category}</Typography.Text>
                <InputNumber
                  size="small"
                  value={draftFloors[category] / 100}
                  min={0}
                  addonBefore="₹"
                  onChange={(v) => setDraftFloors((prev) => ({ ...prev, [category]: Math.round((v ?? 0) * 100) }))}
                />
              </Flex>
            ))}
          </Flex>
        }
      />
    </Flex>
  );
}
