import { App, Button, Flex, Form, InputNumber, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import { queryClient } from '@core/api/queryClient';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import MoneyText from '@shared/components/MoneyText';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { adsApi, adsKeys } from '../api/ads.api';

const TYPE_LABEL = {
  BOT_TRAFFIC: 'Bot traffic',
  COMPETITOR_CLICKING: 'Competitor clicking',
  DUPLICATE_CLICK: 'Duplicate click',
};

/** Flagged clicks worth crediting back to the advertiser, separate from the main wallet ledger view. */
export default function InvalidTrafficTable() {
  const { message } = App.useApp();
  const state = useUrlTableState({ defaultSort: '-flaggedAt' });
  const [crediting, setCrediting] = useState(null);

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: adsKeys.invalidClicks(state.queryParams),
    url: '/ads/invalid-clicks',
    params: state.queryParams,
  });

  const credit = useMutation({
    mutationFn: ({ id, amountPaise }) => adsApi.creditInvalidClick(id, amountPaise),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      refetch();
      setCrediting(null);
      message.success('Credited');
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { key: 'sellerName', title: 'Advertiser', dataIndex: 'sellerName', alwaysVisible: true },
    { key: 'type', title: 'Type', dataIndex: 'type', render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{TYPE_LABEL[v] ?? v}</Tag> },
    { key: 'clickCount', title: 'Clicks', dataIndex: 'clickCount', align: 'right' },
    { key: 'flaggedAt', title: 'Flagged', dataIndex: 'flaggedAt', render: (v) => <DateText value={v} /> },
    {
      key: 'status', title: 'Status', dataIndex: 'status',
      render: (v, row) => (
        <Flex gap={8} align="center">
          <Tag color={v === 'CREDITED' ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>{v}</Tag>
          {v === 'CREDITED' && <MoneyText paise={row.creditedPaise} compact />}
        </Flex>
      ),
    },
    {
      key: 'actions', title: '', align: 'right', priority: 1,
      render: (_v, row) => row.status !== 'CREDITED' && (
        <Can perm="ads.billing.credit">
          <Button size="small" onClick={() => setCrediting(row)}>Credit advertiser</Button>
        </Can>
      ),
    },
  ];

  return (
    <>
      <DataTable
        tableId="invalidClicks"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        emptyProps={{ title: 'No flagged traffic' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>{row.sellerName}</Typography.Text>
              <Tag color={row.status === 'CREDITED' ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>{row.status}</Tag>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{TYPE_LABEL[row.type] ?? row.type} · {row.clickCount} clicks</Typography.Text>
          </Flex>
        )}
      />

      <ConfirmActionModal
        open={Boolean(crediting)}
        onCancel={() => setCrediting(null)}
        onConfirm={(v) => credit.mutate({ id: crediting.id, amountPaise: Math.round(v.amountRupees * 100) })}
        loading={credit.isPending}
        title="Credit this advertiser for invalid traffic"
        description={crediting ? `${crediting.sellerName} · ${crediting.clickCount} flagged click(s)` : undefined}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Credit"
        extraFields={
          <Form.Item name="amountRupees" label="Credit amount (₹)" rules={[{ required: true, message: 'Enter an amount.' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        }
      />
    </>
  );
}
