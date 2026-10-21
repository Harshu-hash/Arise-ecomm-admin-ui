import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Empty, Flex, Input, Row, Tag, Tree, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Can } from '@core/rbac/Can';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { catalogApi, catalogKeys } from '../api/catalog.api';
import CategoryEditor from '../components/CategoryEditor';

/**
 * The taxonomy: a three-level tree beside an editor for the selected node.
 *
 * Split view rather than a list and a separate page, because category work is
 * comparative — you are usually checking a node against its siblings.
 */
export default function CategoriesPage() {
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('selected');
  const [search, setSearch] = useState('');

  const tree = useQuery({
    queryKey: catalogKeys.categoryTree,
    queryFn: () => catalogApi.categoryTree(),
  });

  const treeData = useMemo(() => {
    const term = search.trim().toLowerCase();

    const toNode = (c) => {
      const children = (c.children ?? []).map(toNode).filter(Boolean);
      const selfMatches = !term || c.name.toLowerCase().includes(term);
      if (!selfMatches && children.length === 0) return null;

      return {
        key: c.id,
        title: (
          <Flex align="center" gap={6} style={{ paddingRight: 4 }}>
            <span>{c.name}</span>
            {c.gated && <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: 10 }}>gated</Tag>}
            {c.status !== 'ACTIVE' && <Tag style={{ marginInlineEnd: 0, fontSize: 10 }}>hidden</Tag>}
            {c.level === 3 && c.liveListings > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {c.liveListings}
              </Typography.Text>
            )}
          </Flex>
        ),
        children,
      };
    };

    return (tree.data?.data ?? []).map(toNode).filter(Boolean);
  }, [tree.data, search]);

  const expandedKeys = useMemo(() => {
    if (!search.trim()) return undefined;
    // Expand everything while filtering, so matches deep in the tree show.
    const keys = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        keys.push(n.key);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(treeData);
    return keys;
  }, [treeData, search]);

  if (tree.isLoading) return <FullPageSpinner label="Loading taxonomy…" />;
  if (tree.error) {
    return <ErrorState error={tree.error} onRetry={tree.refetch} title="Could not load the taxonomy" />;
  }

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Categories"
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Categories' }]}
        subtitle="Three levels deep. Policies set here — return windows, GST, gating — apply to every listing below."
        actions={
          <Can perm="catalog.category.create" disable reason="You cannot create categories">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => message.info('Pick a parent in the tree, then use “Add child” in the editor.')}
            >
              New category
            </Button>
          </Can>
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={9}>
          <Card size="small" title="Taxonomy" styles={{ body: { paddingTop: 10 } }}>
            <Input.Search
              allowClear
              placeholder="Find a category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            {treeData.length === 0 ? (
              <Empty description="No categories match" />
            ) : (
              <Tree
                treeData={treeData}
                selectedKeys={selectedId ? [selectedId] : []}
                {...(expandedKeys ? { expandedKeys } : {})}
                onSelect={(keys) => {
                  const next = new URLSearchParams(params);
                  if (keys[0]) next.set('selected', keys[0]);
                  else next.delete('selected');
                  setParams(next);
                }}
                blockNode
                style={{ maxHeight: 560, overflowY: 'auto' }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          {selectedId ? (
            <CategoryEditor
              categoryId={selectedId}
              onSelect={(id) => {
                const next = new URLSearchParams(params);
                next.set('selected', id);
                setParams(next);
              }}
            />
          ) : (
            <Card size="small">
              <Empty description="Pick a category to see and edit its policies" />
            </Card>
          )}
        </Col>
      </Row>
    </Flex>
  );
}
