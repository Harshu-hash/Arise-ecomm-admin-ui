import { App, Alert, Button, Flex, Segmented, Space } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { queryClient } from '@core/api/queryClient';
import { Can } from '@core/rbac/Can';
import { ApiError } from '@core/api/errors';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import { cmsApi, cmsKeys } from '../api/cms.api';
import SectionEditor from '../components/SectionEditor';
import TabsEditor from '../components/TabsEditor';
import VersionHistoryDrawer from '../components/VersionHistoryDrawer';

/**
 * Home layout builder (M12.1) — the Phase 5 exit criterion: publishing has
 * to produce the exact JSON `HomeScreen` consumes, not the admin's internal
 * version record. `/cms/home/publish` strips that record down before
 * returning it; this page never has to know the difference.
 */
export default function HomeLayoutPage() {
  const { message } = App.useApp();
  const [view, setView] = useState('sections');
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState(false);

  const draft = useQuery({ queryKey: cmsKeys.homeDraft, queryFn: () => cmsApi.homeDraft() });

  const saveSections = useMutation({
    mutationFn: (sections) => cmsApi.updateHomeDraft(sections),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cmsKeys.homeDraft }),
    onError: (e) => message.error(e.message),
  });

  const publish = useMutation({
    mutationFn: (note) => cmsApi.publishHome(note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms', 'home'] });
      setPublishing(false);
      message.success('Published — the app will pick this up immediately');
    },
    onError: (e) => {
      if (e instanceof ApiError) { message.error(e.message); return; }
      message.error('Could not publish');
    },
  });

  if (draft.isLoading) return <FullPageSpinner label="Loading the draft layout…" />;
  if (draft.error) return <ErrorState error={draft.error} onRetry={draft.refetch} />;

  const sections = draft.data.data.sections;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Home layout"
        breadcrumbs={[{ label: 'Content' }, { label: 'Home layout' }]}
        subtitle="Drives the app's home screen. Changes here only reach customers once published."
        actions={
          <Space>
            <Button onClick={() => setHistory(true)}>Version history</Button>
            <Can perm="cms.home.publish">
              <Button type="primary" onClick={() => setPublishing(true)}>Publish</Button>
            </Can>
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        message="Editing the draft, not what customers currently see"
        description="The live app keeps showing the last published version until you publish again."
      />

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'sections', label: 'Sections' },
          { value: 'categoryTabs', label: 'Category tabs' },
          { value: 'brandTabs', label: 'Top brand tabs' },
        ]}
      />

      {view === 'sections' && (
        <SectionEditor sections={sections} onChange={(next) => saveSections.mutate(next)} saving={saveSections.isPending} />
      )}
      {view === 'categoryTabs' && <TabsEditor kind="category" />}
      {view === 'brandTabs' && <TabsEditor kind="brand" />}

      <ConfirmActionModal
        open={publishing}
        onCancel={() => setPublishing(false)}
        onConfirm={(values) => publish.mutate(values.reason)}
        loading={publish.isPending}
        danger
        title="Publish the home layout"
        description={`${sections.filter((s) => s.visibility?.enabled !== false).length} sections will be live`}
        impact="Every customer sees this the moment it is published. The previous version stays in history and can be rolled back with a second approver."
        reasonRequired={false}
        reasonLabel="Note for the version history (optional)"
        showNote={false}
        confirmLabel="Publish now"
        typeToConfirm="PUBLISH"
      />

      <VersionHistoryDrawer open={history} onClose={() => setHistory(false)} />
    </Flex>
  );
}
