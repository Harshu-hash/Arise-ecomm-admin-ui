import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { App, Button, Flex, Space, Table, Tag, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import MoneyText from '@shared/components/MoneyText';
import StatusTag from '@shared/components/StatusTag';
import { marketingApi } from '../api/marketing.api';

/**
 * Sellers' nominated offers for this sale: accept/reject per row, and the
 * curation order (which decides display order, with the top row as hero).
 *
 * Reordering is up/down buttons rather than drag — the rows are few enough
 * (curated nominations, not the open catalog) that this costs nothing in
 * practice and needs no pointer-drag testing.
 */
export default function NominationsTable({ sale, onChanged }) {
  const { message } = App.useApp();
  const [rejecting, setRejecting] = useState(null);

  const decide = useMutation({
    mutationFn: ({ nominationId, decision, reason }) => marketingApi.decideNomination(sale.id, nominationId, decision, reason),
    onSuccess: () => { onChanged(); setRejecting(null); message.success('Done'); },
    onError: (e) => message.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: (orderedNominationIds) => marketingApi.reorderNominations(sale.id, orderedNominationIds),
    onSuccess: () => onChanged(),
    onError: (e) => message.error(e.message),
  });

  const accepted = [...sale.nominations].filter((n) => n.status === 'ACCEPTED').sort((a, b) => a.order - b.order);
  const others = sale.nominations.filter((n) => n.status !== 'ACCEPTED');

  const move = (index, dir) => {
    const next = [...accepted];
    const [row] = next.splice(index, 1);
    next.splice(index + dir, 0, row);
    reorder.mutate(next.map((n) => n.id));
  };

  const columns = (curating) => [
    {
      key: 'productTitle', title: 'Product', dataIndex: 'productTitle',
      render: (v, row) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Typography.Text ellipsis style={{ fontSize: 13, maxWidth: 260 }}>{v}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.sellerName}</Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'prices', title: 'Price', align: 'right',
      render: (_v, row) => (
        <Flex vertical align="flex-end" gap={0}>
          <MoneyText paise={row.flashPricePaise} strong />
          <Typography.Text type="secondary" style={{ fontSize: 10, textDecoration: 'line-through' }}>
            <MoneyText paise={row.currentPricePaise} />
          </Typography.Text>
        </Flex>
      ),
    },
    {
      key: 'discountPct', title: 'Discount', dataIndex: 'discountPct', align: 'right',
      render: (v) => (
        <Tag color={v < sale.minDiscountPct ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>{v}%</Tag>
      ),
    },
    {
      key: 'committedStock', title: 'Committed stock', dataIndex: 'committedStock', align: 'right',
    },
    {
      key: 'status', title: 'Status',
      render: (_v, row) => (
        <Flex vertical gap={2} align="flex-start">
          <StatusTag domain="flashSaleNomination" code={row.status} tooltip={row.rejectReason ?? undefined} />
          {row.hero ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>Hero</Tag> : null}
        </Flex>
      ),
    },
    {
      key: 'actions', title: '', align: 'right',
      render: (_v, row) => {
        if (curating) {
          const index = accepted.findIndex((n) => n.id === row.id);
          return (
            <Space size={2}>
              <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up" />
              <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === accepted.length - 1} onClick={() => move(index, 1)} aria-label="Move down" />
            </Space>
          );
        }
        if (row.status !== 'PENDING') return null;
        return (
          <Can perm="marketing.flashsale.curate">
            <Space size={4}>
              <Button size="small" onClick={() => decide.mutate({ nominationId: row.id, decision: 'ACCEPTED' })}>Accept</Button>
              <Button size="small" danger onClick={() => setRejecting(row)}>Reject</Button>
            </Space>
          </Can>
        );
      },
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={6}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          Accepted — display order ({accepted.length})
        </Typography.Text>
        <Table size="small" rowKey="id" pagination={false} dataSource={accepted} columns={columns(true)} />
      </Flex>

      <Flex vertical gap={6}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          Pending, rejected and auto-rejected ({others.length})
        </Typography.Text>
        <Table size="small" rowKey="id" pagination={false} dataSource={others} columns={columns(false)} />
      </Flex>

      <ConfirmActionModal
        open={Boolean(rejecting)}
        onCancel={() => setRejecting(null)}
        onConfirm={(values) => decide.mutate({ nominationId: rejecting.id, decision: 'REJECTED', reason: values.reason })}
        loading={decide.isPending}
        title="Reject this nomination"
        description={rejecting ? `${rejecting.productTitle} · ${rejecting.sellerName}` : ''}
        impact="The seller is told why so they can renominate at the right price."
        reasonRequired
        reasonLabel="Reason for the seller"
        showNote={false}
        confirmLabel="Reject"
      />
    </Flex>
  );
}
