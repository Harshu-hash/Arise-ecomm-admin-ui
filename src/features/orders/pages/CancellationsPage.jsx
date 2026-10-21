import { Card, Col, Flex, Image, Row, Space, Statistic, Tag, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import DataTable from '@shared/components/DataTable/DataTable';
import DateText from '@shared/components/DateText';
import FilterBar from '@shared/components/FilterBar';
import MoneyText from '@shared/components/MoneyText';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import useListQuery from '@shared/hooks/useListQuery';
import useUrlTableState from '@shared/hooks/useUrlTableState';
import { orderKeys } from '../api/orders.api';

const BLANK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const ACTOR_COLOR = { CUSTOMER: 'default', SELLER: 'red', ADMIN: 'blue', SYSTEM: 'gold' };

export default function CancellationsPage() {
  const navigate = useNavigate();
  const state = useUrlTableState({ defaultSort: '-cancelledAt' });

  const { rows, meta, loading, error, refetch, fetching } = useListQuery({
    queryKey: orderKeys.cancellations({ ...state.queryParams, tab: state.tab }),
    url: '/orders/cancellations',
    params: { ...state.queryParams, ...(state.tab ? { cancelledBy: state.tab } : {}) },
  });

  const columns = [
    {
      key: 'productName', title: 'Item', dataIndex: 'productName', alwaysVisible: true,
      render: (name, row) => (
        <Space size={8}>
          <Image src={row.image} alt="" width={30} height={30} preview={false} style={{ objectFit: 'cover', borderRadius: 4 }} fallback={BLANK} />
          <div style={{ minWidth: 0, maxWidth: 190 }}>
            <Typography.Text style={{ fontSize: 13 }} ellipsis>{name}</Typography.Text>
            <div>
              <Link to={`/orders/${row.orderId}`}>
                <Typography.Text className="mono" style={{ fontSize: 11 }}>{row.orderId}</Typography.Text>
              </Link>
            </div>
          </div>
        </Space>
      ),
    },
    {
      key: 'cancelledBy', title: 'Cancelled by', dataIndex: 'cancelledBy', priority: 1,
      render: (v) => <Tag color={ACTOR_COLOR[v]} style={{ marginInlineEnd: 0 }}>{v.toLowerCase()}</Tag>,
    },
    { key: 'cancelReason', title: 'Reason', dataIndex: 'cancelReason', priority: 1 },
    {
      key: 'stage', title: 'Stage', dataIndex: 'stage', priority: 2,
      render: (v) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {v === 'PRE_SHIP' ? 'Before dispatch' : 'After dispatch'}
        </Typography.Text>
      ),
    },
    { key: 'sellerName', title: 'Seller', dataIndex: 'sellerName', sorter: true, priority: 2 },
    { key: 'customerName', title: 'Customer', dataIndex: 'customerName', priority: 3 },
    {
      key: 'amountPaise', title: 'Value', dataIndex: 'amountPaise', sorter: true, align: 'right', priority: 1,
      render: (v) => <MoneyText paise={v} />,
    },
    {
      key: 'refundStatus', title: 'Refund', dataIndex: 'refundStatus', priority: 2,
      render: (v) =>
        v === 'NOT_APPLICABLE' || v === 'NONE' ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {v === 'NOT_APPLICABLE' ? 'COD — nothing charged' : '—'}
          </Typography.Text>
        ) : (
          <StatusTag domain="refund" code={v} />
        ),
    },
    {
      key: 'cancelledAt', title: 'When', dataIndex: 'cancelledAt', sorter: true, priority: 2,
      render: (v) => <DateText value={v} />,
    },
  ];

  const byActor = meta?.byActor ?? {};
  const total = Object.values(byActor).reduce((a, b) => a + b, 0);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Cancellations"
        breadcrumbs={[{ label: 'Orders' }, { label: 'Cancellations' }]}
        subtitle="Who cancelled, and when in the journey. Seller-attributed cancellations carry a penalty."
      />

      <Row gutter={[12, 12]}>
        {['CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM'].map((actor) => (
          <Col key={actor} xs={12} md={6}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<Typography.Text type="secondary" style={{ fontSize: 12 }}>By {actor.toLowerCase()}</Typography.Text>}
                value={byActor[actor] ?? 0}
                suffix={
                  total ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {Math.round(((byActor[actor] ?? 0) / total) * 100)}%
                    </Typography.Text>
                  ) : null
                }
                valueStyle={{ fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <FilterBar
        schema={[
          {
            key: 'stage', label: 'Stage', kind: 'select', width: 170,
            options: [
              { value: 'PRE_SHIP', label: 'Before dispatch' },
              { value: 'POST_SHIP', label: 'After dispatch' },
            ],
          },
          { key: 'sellerId', label: 'Seller', kind: 'entity', entity: 'seller', width: 190 },
          { key: 'cancelledAt', label: 'Cancelled', kind: 'dateRange' },
        ]}
        tableState={state}
        searchPlaceholder="Search order, product, seller or customer"
      />

      <DataTable
        tableId="cancellations"
        columns={columns}
        rows={rows}
        meta={meta}
        loading={loading || fetching}
        error={error}
        onRetry={refetch}
        tableState={state}
        facetField="cancelledBy"
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'CUSTOMER', label: 'Customer' },
          { key: 'SELLER', label: 'Seller' },
          { key: 'ADMIN', label: 'Arise' },
          { key: 'SYSTEM', label: 'System' },
        ]}
        onRowClick={(row) => navigate(`/orders/${row.orderId}`)}
        onExport={() => {}}
        exportPerm="orders.cancellation.export"
        emptyProps={{ title: 'No cancellations match' }}
        mobileCard={(row) => (
          <Flex vertical gap={4}>
            <Typography.Text strong ellipsis>{row.productName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.cancelReason}</Typography.Text>
            <Space size={8}>
              <Tag color={ACTOR_COLOR[row.cancelledBy]} style={{ marginInlineEnd: 0 }}>{row.cancelledBy.toLowerCase()}</Tag>
              <MoneyText paise={row.amountPaise} strong />
            </Space>
          </Flex>
        )}
      />
    </Flex>
  );
}
