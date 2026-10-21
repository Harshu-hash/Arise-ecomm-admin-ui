import { Card, Segmented, Table } from 'antd';
import { useState } from 'react';
import { formatNumber } from '@core/utils/money';
import MoneyText from '@shared/components/MoneyText';

const TABS = [
  { value: 'topCategories', label: 'Categories' },
  { value: 'topSellers', label: 'Sellers' },
  { value: 'topProducts', label: 'Products' },
];

const COLUMNS = [
  { key: 'label', title: 'Name', dataIndex: 'label', ellipsis: true },
  { key: 'units', title: 'Units', dataIndex: 'units', align: 'right', render: (v) => formatNumber(v) },
  { key: 'gmvPaise', title: 'GMV', dataIndex: 'gmvPaise', align: 'right', render: (v) => <MoneyText paise={v} compact /> },
];

/** Top 5 categories, sellers and products by GMV for the selected range — a Segmented toggle keeps the dashboard from sprawling into three separate cards. */
export default function TopListsCard({ data, loading }) {
  const [tab, setTab] = useState('topCategories');

  return (
    <Card
      size="small"
      title="Top performers"
      loading={loading}
      extra={<Segmented size="small" value={tab} onChange={setTab} options={TABS} />}
    >
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={data?.[tab] ?? []}
        columns={COLUMNS}
        locale={{ emptyText: 'No activity in this range' }}
      />
    </Card>
  );
}
