import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { App, Button, Card, ColorPicker, Flex, Input, Skeleton, Switch, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import ErrorState from '@shared/components/ErrorState';
import { cmsApi, cmsKeys } from '../api/cms.api';

/**
 * Category tabs (app `CATEGORY_TABS`) and top brand tabs (`BRAND_TABS`).
 * Gradient colours use a live picker so a change can be checked before
 * saving, matching the plan's call for "color pickers with live preview."
 */
export default function TabsEditor({ kind }) {
  const { message } = App.useApp();
  const isCategory = kind === 'category';
  const queryKey = isCategory ? cmsKeys.categoryTabs : cmsKeys.brandTabs;
  const fetchFn = isCategory ? cmsApi.categoryTabs : cmsApi.brandTabs;
  const updateFn = isCategory ? cmsApi.updateCategoryTab : cmsApi.updateBrandTab;

  const query = useQuery({ queryKey, queryFn: fetchFn });

  const update = useMutation({
    mutationFn: ({ id, payload }) => updateFn(id, payload),
    onSuccess: () => query.refetch(),
    onError: (e) => message.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: (orderedIds) => cmsApi.reorderCategoryTabs(orderedIds),
    onSuccess: () => query.refetch(),
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const tabs = query.data.data;

  const move = (index, dir) => {
    const next = [...tabs];
    const [row] = next.splice(index, 1);
    next.splice(index + dir, 0, row);
    if (isCategory) reorder.mutate(next.map((t) => t.id));
  };

  return (
    <Flex gap={10} wrap>
      {tabs.map((tab, index) => (
        <Card key={tab.id} size="small" style={{ width: 240 }}>
          <Flex vertical gap={8}>
            <Input
              size="small"
              defaultValue={tab.label}
              onBlur={(e) => e.target.value !== tab.label && update.mutate({ id: tab.id, payload: { label: e.target.value } })}
            />
            {isCategory && (
              <Flex gap={6} align="center">
                <Typography.Text style={{ fontSize: 12 }}>Gradient</Typography.Text>
                {[0, 1].map((i) => (
                  <ColorPicker
                    key={i}
                    size="small"
                    value={tab.gradient[i]}
                    onChangeComplete={(c) => {
                      const gradient = [...tab.gradient];
                      gradient[i] = c.toHexString();
                      update.mutate({ id: tab.id, payload: { gradient } });
                    }}
                  />
                ))}
                <Flex gap={4} style={{ width: 48, height: 20, borderRadius: 4, background: `linear-gradient(90deg, ${tab.gradient[0]}, ${tab.gradient[1]})` }} />
              </Flex>
            )}
            <Flex justify="space-between" align="center">
              <Switch
                size="small"
                checked={tab.active}
                onChange={(active) => update.mutate({ id: tab.id, payload: { active } })}
              />
              {isCategory && (
                <Flex gap={2}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up" />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === tabs.length - 1} onClick={() => move(index, 1)} aria-label="Move down" />
                </Flex>
              )}
            </Flex>
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
