import { Flex, List, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import StatusTag from '@shared/components/StatusTag';
import { cmsApi, cmsKeys } from '../api/cms.api';
import StaticPageEditorDrawer from '../components/StaticPageEditorDrawer';

/** Static pages (M12.4): About, Privacy Policy, Terms, Return/Shipping/Seller policies. */
export default function StaticPagesPage() {
  const [editingId, setEditingId] = useState(null);
  const query = useQuery({ queryKey: cmsKeys.staticPages, queryFn: () => cmsApi.staticPages() });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Static pages"
        breadcrumbs={[{ label: 'Content' }, { label: 'Static pages' }]}
        subtitle="A material change forces customers to re-accept it in the app before they can continue."
      />

      <List
        dataSource={query.data.data}
        renderItem={(page) => (
          <List.Item onClick={() => setEditingId(page.id)} style={{ cursor: 'pointer' }}>
            <List.Item.Meta
              title={
                <Flex gap={8} align="center">
                  <Typography.Text strong>{page.title}</Typography.Text>
                  <StatusTag domain="staticPage" code={page.status} />
                  {page.requiresReacceptance && <Tag color="gold">needs re-acceptance</Tag>}
                </Flex>
              }
              description={`${page.versions.length} version(s) · last published by ${page.versions.at(-1)?.editedByName ?? '—'}`}
            />
          </List.Item>
        )}
      />

      <StaticPageEditorDrawer pageId={editingId} onClose={() => setEditingId(null)} onSaved={() => query.refetch()} />
    </Flex>
  );
}
