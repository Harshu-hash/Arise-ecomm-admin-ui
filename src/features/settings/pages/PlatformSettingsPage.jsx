import { App, Button, Card, Flex, Menu, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@core/api/errors';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import DateText from '@shared/components/DateText';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import useBreakpoint from '@shared/hooks/useBreakpoint';
import SettingsSectionForm from '../components/SettingsSectionForm';
import { settingsApi, settingsKeys } from '../api/settings.api';

const SENSITIVE_IDS = ['fees', 'approvalThresholds', 'security'];

/** Platform settings (M17.5): ten independently saved, versioned sections; three route edits through maker-checker. */
export default function PlatformSettingsPage() {
  const { message } = App.useApp();
  const { isMobile } = useBreakpoint();
  const query = useQuery({ queryKey: settingsKeys.sections, queryFn: () => settingsApi.sections() });
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const sections = query.data?.data ?? [];
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  useEffect(() => {
    if (active && draft === null) setDraft(active.values);
  }, [active, draft]);

  const save = useMutation({
    mutationFn: ({ sectionId, values, reason }) => settingsApi.updateSection(sectionId, { values, reason }),
    onSuccess: () => {
      query.refetch();
      setConfirming(false);
      message.success('Saved');
    },
    onError: (e) => message.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const saveSensitive = useMutation({
    mutationFn: ({ sectionId, values, reason }) => settingsApi.updateSection(sectionId, { values, reason }),
    onSuccess: () => {
      query.refetch();
      setConfirming(false);
      message.info('Sent for approval. The change applies once another admin agrees.');
    },
    onError: (e) => message.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const dirty = active && JSON.stringify(draft) !== JSON.stringify(active.values);
  const sensitive = active && SENSITIVE_IDS.includes(active.id);

  return (
    <>
      <PageHeader
        title="Platform settings"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Platform settings' }]}
        subtitle="Fees, approval thresholds and security changes need a second approver; everything else saves immediately."
      />

      <Flex gap={20} vertical={isMobile} align="flex-start" style={{ marginTop: 16 }}>
        <Menu
          mode={isMobile ? 'horizontal' : 'vertical'}
          selectedKeys={active ? [active.id] : []}
          onClick={({ key }) => { setActiveId(key); setDraft(sections.find((s) => s.id === key)?.values ?? null); }}
          items={sections.map((s) => ({ key: s.id, label: s.label }))}
          style={
            isMobile
              ? { width: '100%', overflowX: 'auto', borderInlineEnd: 'none', borderBottom: '1px solid var(--ant-color-border-secondary)' }
              : { width: 220, flexShrink: 0, borderInlineEnd: 'none' }
          }
        />

        {active && draft && (
          <Card
            size="small"
            title={active.label}
            style={{ flex: 1, minWidth: 0, width: '100%' }}
            extra={
              <Flex gap={8} align="center" wrap>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Last updated <DateText value={active.updatedAt} /> by {active.updatedByName}
                </Typography.Text>
                <Can perm="admin.settings.edit">
                  <Button
                    type="primary" size="small" disabled={!dirty}
                    onClick={() => (sensitive ? setConfirming(true) : save.mutate({ sectionId: active.id, values: draft }))}
                    loading={save.isPending}
                  >
                    Save
                  </Button>
                </Can>
              </Flex>
            }
          >
            <SettingsSectionForm values={draft} onChange={setDraft} disabled={save.isPending} />
          </Card>
        )}
      </Flex>

      <ConfirmActionModal
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={(v) => saveSensitive.mutate({ sectionId: active.id, values: draft, reason: v.reason })}
        loading={saveSensitive.isPending}
        needsApproval
        title={`Change ${active?.label}`}
        impact="This section affects every order or seller on the platform the moment a second approver agrees."
        reasonRequired
        reasonLabel="Why is this changing?"
        showNote={false}
        confirmLabel="Request change"
      />
    </>
  );
}
