import { App, Button, Drawer, Flex, List, Skeleton, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import StatusTag from '@shared/components/StatusTag';
import { cmsApi, cmsKeys } from '../api/cms.api';

/** Every home layout version, oldest draft to oldest archive, with a rollback that needs a second approver. */
export default function VersionHistoryDrawer({ open, onClose }) {
  const { message } = App.useApp();
  const [rollingBack, setRollingBack] = useState(null);

  const query = useQuery({
    queryKey: cmsKeys.homeVersions,
    queryFn: () => cmsApi.homeVersions(),
    enabled: open,
  });

  const rollback = useMutation({
    mutationFn: ({ versionId, reason }) => cmsApi.rollbackHome(versionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms', 'home'] });
      setRollingBack(null);
      message.info('Sent for approval. The rollback takes effect once another admin agrees.');
    },
    onError: (e) => message.error(e instanceof ApiError ? e.message : 'Could not roll back'),
  });

  return (
    <Drawer open={open} onClose={onClose} width={480} title="Version history">
      {query.isLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : null}
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      {query.data ? (
        <List
          dataSource={query.data.data}
          renderItem={(v) => (
            <List.Item
              actions={
                v.status === 'ARCHIVED'
                  ? [
                      <Can key="rb" perm="cms.home.rollback">
                        <Button size="small" onClick={() => setRollingBack(v)}>Roll back to this</Button>
                      </Can>,
                    ]
                  : []
              }
            >
              <Flex vertical gap={2}>
                <Flex gap={6} align="center">
                  <StatusTag domain="homeLayoutVersion" code={v.status} showIcon={false} />
                  <Typography.Text style={{ fontSize: 12 }}>{v.sections.length} sections</Typography.Text>
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {v.publishedAt ? <>Published <DateText value={v.publishedAt} variant="datetime" /> by {v.publishedByName}</>
                    : <>Created <DateText value={v.createdAt} variant="datetime" /> by {v.createdByName}</>}
                </Typography.Text>
                {v.note && <Tag style={{ marginInlineEnd: 0, width: 'fit-content' }}>{v.note}</Tag>}
              </Flex>
            </List.Item>
          )}
        />
      ) : null}

      <ConfirmActionModal
        open={Boolean(rollingBack)}
        onCancel={() => setRollingBack(null)}
        onConfirm={(values) => rollback.mutate({ versionId: rollingBack.id, reason: values.reason })}
        loading={rollback.isPending}
        needsApproval
        danger
        title="Roll back the home layout"
        description={rollingBack ? `Version with ${rollingBack.sections.length} sections` : ''}
        impact="Every customer sees this version the moment a second approver agrees. The currently published version is kept in history."
        reasonRequired
        reasonLabel="Why is this being rolled back?"
        showNote={false}
        confirmLabel="Request rollback"
      />
    </Drawer>
  );
}
