import { App, Alert, Button, Drawer, Flex, Input, List, Skeleton, Switch, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Can } from '@core/rbac/Can';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import { cmsApi, cmsKeys } from '../api/cms.api';

/**
 * Editing a static page. The body is plain text in a textarea rather than a
 * rich-text toolbar — there is no TipTap-class editor wired into this panel
 * yet, and these pages are policy prose, not laid-out marketing copy, so a
 * textarea loses nothing a customer would notice.
 */
export default function StaticPageEditorDrawer({ pageId, onClose, onSaved }) {
  const { message } = App.useApp();
  const [body, setBody] = useState('');
  const [materialChange, setMaterialChange] = useState(false);
  const [note, setNote] = useState('');

  const query = useQuery({
    queryKey: cmsKeys.staticPage(pageId),
    queryFn: () => cmsApi.staticPage(pageId),
    enabled: Boolean(pageId),
  });

  useEffect(() => {
    if (query.data) {
      setBody(query.data.data.body);
      setMaterialChange(false);
      setNote('');
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => cmsApi.updateStaticPage(pageId, { body, materialChange, note }),
    onSuccess: () => { message.success('Published'); onSaved(); onClose(); },
    onError: (e) => message.error(e.message),
  });

  const page = query.data?.data;

  return (
    <Drawer
      open={Boolean(pageId)}
      onClose={onClose}
      width={560}
      title={page?.title ?? 'Static page'}
      extra={
        <Can perm="cms.page.edit">
          <Button type="primary" onClick={() => save.mutate()} loading={save.isPending}>Publish</Button>
        </Can>
      }
    >
      {query.isLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      {page ? (
        <Flex vertical gap={12}>
          <Input.TextArea value={body} onChange={(e) => setBody(e.target.value)} autoSize={{ minRows: 10, maxRows: 24 }} />

          <Flex vertical gap={4}>
            <Flex justify="space-between" align="center">
              <Typography.Text style={{ fontSize: 13 }}>This is a material change</Typography.Text>
              <Switch checked={materialChange} onChange={setMaterialChange} />
            </Flex>
            {materialChange && (
              <Alert
                type="warning"
                showIcon
                message="Customers will be asked to re-accept this"
                description="Use this only for changes that actually affect what the customer agreed to, not a typo fix."
              />
            )}
          </Flex>

          <Input placeholder="Note for the version history (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

          <Typography.Text strong style={{ fontSize: 13 }}>Version history</Typography.Text>
          <List
            size="small"
            dataSource={[...page.versions].reverse()}
            renderItem={(v) => (
              <List.Item>
                <Flex vertical gap={0}>
                  <Typography.Text style={{ fontSize: 12 }}>{v.editedByName} · <DateText value={v.editedAt} variant="datetime" /></Typography.Text>
                  {v.note && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{v.note}</Typography.Text>}
                </Flex>
              </List.Item>
            )}
          />
        </Flex>
      ) : null}
    </Drawer>
  );
}
