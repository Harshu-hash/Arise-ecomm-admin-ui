import { App, Button, Card, Col, Collapse, Flex, Row, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { cmsApi, cmsKeys } from '../api/cms.api';
import HelpArticleFormModal from '../components/HelpArticleFormModal';

/** Help centre (M12.5): categories, FAQs, and what customers search for and don't find. */
export default function HelpCenterPage() {
  const { message } = App.useApp();
  const [editingArticle, setEditingArticle] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const categories = useQuery({ queryKey: cmsKeys.helpCategories, queryFn: () => cmsApi.helpCategories() });
  const analytics = useQuery({ queryKey: cmsKeys.helpSearchAnalytics, queryFn: () => cmsApi.helpSearchAnalytics() });

  const removeArticle = useMutation({
    mutationFn: (id) => cmsApi.deleteHelpArticle(id),
    onSuccess: () => { categories.refetch(); setDeleting(null); message.success('Removed'); },
    onError: (e) => message.error(e.message),
  });

  if (categories.isLoading) return <FullPageSpinner />;
  if (categories.error) return <ErrorState error={categories.error} onRetry={categories.refetch} />;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Help centre"
        breadcrumbs={[{ label: 'Content' }, { label: 'Help centre' }]}
        subtitle="Drives the app's Help Center, categories and FAQs."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Collapse
            items={categories.data.data.map((cat) => ({
              key: cat.id,
              label: `${cat.title} (${cat.articleCount})`,
              extra: (
                <Can perm="cms.help.create">
                  <Button size="small" onClick={(e) => { e.stopPropagation(); setAddingTo(cat); }}>Add article</Button>
                </Can>
              ),
              children: <CategoryArticles categoryId={cat.id} onEdit={setEditingArticle} onDelete={setDeleting} />,
            }))}
          />
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="Searched, no result">
            <Flex vertical gap={6}>
              {(analytics.data?.data.noResultSearches ?? []).map((row) => (
                <Flex key={row.term} justify="space-between">
                  <Typography.Text style={{ fontSize: 12 }}>{row.term}</Typography.Text>
                  <Typography.Text type="secondary" className="tabular" style={{ fontSize: 12 }}>{row.count}</Typography.Text>
                </Flex>
              ))}
            </Flex>
          </Card>
        </Col>
      </Row>

      <HelpArticleFormModal
        category={addingTo}
        article={editingArticle}
        open={Boolean(addingTo) || Boolean(editingArticle)}
        onClose={() => { setAddingTo(null); setEditingArticle(null); }}
        onSaved={() => { categories.refetch(); setAddingTo(null); setEditingArticle(null); }}
      />

      <ConfirmActionModal
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => removeArticle.mutate(deleting.id)}
        loading={removeArticle.isPending}
        danger
        title="Remove this article"
        description={deleting?.question}
        reasonRequired={false}
        showNote={false}
        confirmLabel="Remove"
      />
    </Flex>
  );
}

/** One category's articles, fetched per panel (there are only a handful of categories). */
function CategoryArticles({ categoryId, onEdit, onDelete }) {
  const query = useQuery({
    queryKey: cmsKeys.helpCategory(categoryId),
    queryFn: () => cmsApi.helpCategory(categoryId),
  });
  if (query.isLoading) return <Typography.Text type="secondary">Loading…</Typography.Text>;

  return (
    <Flex vertical gap={8} style={{ width: '100%' }}>
      {query.data.data.articles.map((a) => (
        <Flex key={a.id} justify="space-between" gap={8} align="flex-start">
          <Flex vertical gap={0} style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{a.question}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: a.answer }}>{a.answer}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {a.helpfulVotes} helpful · {a.notHelpfulVotes} not helpful
            </Typography.Text>
          </Flex>
          <Flex gap={4}>
            <Can perm="cms.help.edit">
              <Button size="small" type="text" onClick={() => onEdit(a)}>Edit</Button>
            </Can>
            <Can perm="cms.help.delete">
              <Button size="small" type="text" danger onClick={() => onDelete(a)}>Remove</Button>
            </Can>
          </Flex>
        </Flex>
      ))}
    </Flex>
  );
}
