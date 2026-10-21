import { App, Button, Card, Flex, List, Segmented, Switch, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { cmsApi, cmsKeys } from '../api/cms.api';
import SearchRuleFormModal from '../components/SearchRuleFormModal';
import SearchTestTool from '../components/SearchTestTool';

const TYPE_LABEL = { SYNONYM: 'Synonyms', REDIRECT: 'Redirects', BOOST: 'Boost', BURY: 'Bury', BLOCKED: 'Blocked terms' };

/** Search configuration (M12.6): synonyms, redirects, boost/bury, trending, blocked terms, and a test tool. */
export default function SearchConfigPage() {
  const { message } = App.useApp();
  const [type, setType] = useState('SYNONYM');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const rules = useQuery({
    queryKey: cmsKeys.searchRules({ type }),
    queryFn: () => cmsApi.searchRules({ type, pageSize: 100 }),
  });
  const trending = useQuery({
    queryKey: cmsKeys.trendingSearches,
    queryFn: () => cmsApi.trendingSearches(),
  });

  const removeRule = useMutation({
    mutationFn: (id) => cmsApi.deleteSearchRule(id),
    onSuccess: () => { rules.refetch(); setDeleting(null); message.success('Removed'); },
    onError: (e) => message.error(e.message),
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, active }) => cmsApi.updateSearchRule(id, { active }),
    onSuccess: () => rules.refetch(),
    onError: (e) => message.error(e.message),
  });
  const togglePin = useMutation({
    mutationFn: ({ id, pinned }) => cmsApi.updateTrendingSearch(id, { pinned }),
    onSuccess: () => trending.refetch(),
    onError: (e) => message.error(e.message),
  });

  const columnsByType = {
    SYNONYM: [
      { key: 'term', title: 'Term', dataIndex: 'term' },
      { key: 'synonym', title: 'Synonym', dataIndex: 'synonym' },
      { key: 'direction', title: 'Direction', dataIndex: 'direction', render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v === 'BOTH' ? 'both ways' : 'one way'}</Tag> },
    ],
    REDIRECT: [
      { key: 'keyword', title: 'Keyword', dataIndex: 'keyword' },
      { key: 'target', title: 'Redirects to', render: (_v, r) => `${r.targetType}: ${r.targetLabel}` },
    ],
    BOOST: [
      { key: 'scopeLabel', title: 'Applies to', dataIndex: 'scopeLabel' },
      { key: 'weight', title: 'Weight', dataIndex: 'weight', render: (v) => <Tag color="green" style={{ marginInlineEnd: 0 }}>+{v}</Tag> },
    ],
    BURY: [
      { key: 'scopeLabel', title: 'Applies to', dataIndex: 'scopeLabel' },
      { key: 'weight', title: 'Weight', dataIndex: 'weight', render: (v) => <Tag color="red" style={{ marginInlineEnd: 0 }}>{v}</Tag> },
    ],
    BLOCKED: [{ key: 'term', title: 'Blocked term', dataIndex: 'term' }],
  };

  const columns = [
    ...columnsByType[type],
    {
      key: 'active', title: 'Active', dataIndex: 'active', width: 80,
      render: (v, row) => (
        <Can perm="cms.search.edit" disable>
          <Switch size="small" checked={v} onChange={(active) => toggleRule.mutate({ id: row.id, active })} />
        </Can>
      ),
    },
    {
      key: 'actions', title: '', align: 'right', width: 90,
      render: (_v, row) => (
        <Can perm="cms.search.edit">
          <Button size="small" type="text" danger onClick={() => setDeleting(row)}>Remove</Button>
        </Can>
      ),
    },
  ];

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Search configuration"
        breadcrumbs={[{ label: 'Content' }, { label: 'Search' }]}
        subtitle="Synonyms, redirects, boost/bury rules and blocked terms. Test any change against the live catalog below."
        actions={
          <Can perm="cms.search.edit">
            <Button type="primary" onClick={() => setCreating(true)}>Add rule</Button>
          </Can>
        }
      />

      <Segmented value={type} onChange={setType} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />

      {rules.isLoading ? <FullPageSpinner /> : null}
      {rules.error ? <ErrorState error={rules.error} onRetry={rules.refetch} /> : null}
      {rules.data ? <Table size="small" rowKey="id" pagination={false} dataSource={rules.data.data} columns={columns} /> : null}

      <Card size="small" title="Trending searches">
        <List
          size="small"
          dataSource={trending.data?.data ?? []}
          renderItem={(t) => (
            <List.Item
              actions={[
                <Switch key="pin" size="small" checked={t.pinned} onChange={(pinned) => togglePin.mutate({ id: t.id, pinned })} />,
              ]}
            >
              <Flex justify="space-between" style={{ width: '100%' }}>
                <Typography.Text style={{ fontSize: 13 }}>{t.term} {t.pinned && <Tag color="gold">pinned</Tag>}</Typography.Text>
                <Typography.Text type="secondary" className="tabular" style={{ fontSize: 12 }}>{t.searchCount.toLocaleString('en-IN')}</Typography.Text>
              </Flex>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="Test search">
        <SearchTestTool />
      </Card>

      <SearchRuleFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => { rules.refetch(); setCreating(false); }}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => removeRule.mutate(deleting.id)}
        loading={removeRule.isPending}
        danger
        title="Remove this rule"
        description={deleting?.term ?? deleting?.keyword ?? deleting?.scopeLabel}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}
