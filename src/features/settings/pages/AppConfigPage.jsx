import { App, Button, Card, Col, Flex, Input, Row, Select, Switch, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Can } from '@core/rbac/Can';
import ConfirmActionModal from '@shared/components/ConfirmActionModal';
import ErrorState from '@shared/components/ErrorState';
import FullPageSpinner from '@shared/components/FullPageSpinner';
import PageHeader from '@shared/components/PageHeader';
import FeatureFlagModal from '../components/FeatureFlagModal';
import { settingsApi, settingsKeys } from '../api/settings.api';

const PLATFORMS = ['ANDROID', 'IOS', 'WEB'];
const PLATFORM_LABEL = { ANDROID: 'Android', IOS: 'iOS', WEB: 'Web' };

/** App config (M17.6): maintenance mode, app versions, languages, and feature flags — what drives the app's own update and maintenance screens. */
export default function AppConfigPage() {
  const { message } = App.useApp();
  const query = useQuery({ queryKey: settingsKeys.appConfig, queryFn: () => settingsApi.appConfig() });
  const flagsQuery = useQuery({ queryKey: settingsKeys.featureFlags, queryFn: () => settingsApi.featureFlags() });
  const [togglingMaintenance, setTogglingMaintenance] = useState(null);
  const [editingFlag, setEditingFlag] = useState(null);
  const [creatingFlag, setCreatingFlag] = useState(false);

  const updateConfig = useMutation({
    mutationFn: (payload) => settingsApi.updateAppConfig(payload),
    onSuccess: () => { query.refetch(); message.success('Saved'); },
    onError: (e) => message.error(e.message),
  });
  const setMaintenance = useMutation({
    mutationFn: ({ platform, payload }) => settingsApi.setMaintenance(platform, payload),
    onSuccess: () => {
      query.refetch();
      setTogglingMaintenance(null);
      message.info('Sent for approval. It takes effect once another admin agrees.');
    },
    onError: (e) => message.error(e.message),
  });
  const deleteFlag = useMutation({
    mutationFn: (id) => settingsApi.deleteFlag(id),
    onSuccess: () => { flagsQuery.refetch(); message.success('Deleted'); },
    onError: (e) => message.error(e.message),
  });
  const toggleFlag = useMutation({
    mutationFn: ({ id, enabled }) => settingsApi.updateFlag(id, { enabled }),
    onSuccess: () => flagsQuery.refetch(),
    onError: (e) => message.error(e.message),
  });

  if (query.isLoading) return <FullPageSpinner />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const config = query.data.data;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="App config"
        breadcrumbs={[{ label: 'Administration' }, { label: 'App config' }]}
        subtitle="Drives the app's own update-required screen, maintenance screen, language list and feature gating."
      />

      <Row gutter={[12, 12]}>
        {PLATFORMS.map((platform) => {
          const p = config.platforms[platform];
          const maintenance = config.maintenance[platform];
          return (
            <Col key={platform} xs={24} md={8}>
              <Card
                size="small" title={PLATFORM_LABEL[platform]}
                extra={
                  <Flex align="center" gap={6}>
                    {maintenance.enabled && <Tag color="red" style={{ marginInlineEnd: 0 }}>Maintenance</Tag>}
                    <Can perm="admin.appconfig.maintenance">
                      <Switch
                        size="small" checked={maintenance.enabled}
                        onChange={() => setTogglingMaintenance({ platform, enabled: !maintenance.enabled })}
                      />
                    </Can>
                  </Flex>
                }
              >
                <Flex vertical gap={8}>
                  <Field label="Latest version" value={p.latestVersion} onBlur={(v) => updateConfig.mutate({ platforms: { [platform]: { ...p, latestVersion: v } } })} />
                  <Field label="Minimum supported" value={p.minSupportedVersion} onBlur={(v) => updateConfig.mutate({ platforms: { [platform]: { ...p, minSupportedVersion: v } } })} />
                  <Field label="Soft-update from" value={p.softUpdateFromVersion} onBlur={(v) => updateConfig.mutate({ platforms: { [platform]: { ...p, softUpdateFromVersion: v } } })} />
                  <Field label="Store URL" value={p.storeUrl} onBlur={(v) => updateConfig.mutate({ platforms: { [platform]: { ...p, storeUrl: v } } })} />
                </Flex>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card size="small" title="Languages">
        <Flex gap={12} align="center" wrap>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>Enabled</Typography.Text>
          <Select
            mode="tags" style={{ minWidth: 240 }} value={config.languages.enabled}
            onChange={(v) => updateConfig.mutate({ languages: { ...config.languages, enabled: v } })}
          />
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>Default</Typography.Text>
          <Select
            style={{ width: 120 }} value={config.languages.default}
            options={config.languages.enabled.map((l) => ({ value: l, label: l }))}
            onChange={(v) => updateConfig.mutate({ languages: { ...config.languages, default: v } })}
          />
        </Flex>
      </Card>

      <Card
        size="small" title="Feature flags"
        extra={<Can perm="admin.appconfig.edit"><Button size="small" onClick={() => setCreatingFlag(true)}>New flag</Button></Can>}
      >
        <Table
          size="small" rowKey="id" pagination={false}
          dataSource={flagsQuery.data?.data ?? []}
          loading={flagsQuery.isLoading}
          columns={[
            { key: 'label', title: 'Flag', dataIndex: 'label', render: (v, row) => <Flex vertical gap={0}><Typography.Text style={{ fontSize: 13 }}>{v}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.key}</Typography.Text></Flex> },
            { key: 'platform', title: 'Platform', dataIndex: 'platform', render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> },
            { key: 'minAppVersion', title: 'Min version', dataIndex: 'minAppVersion', render: (v) => v ?? '—' },
            { key: 'rolloutPct', title: 'Rollout', dataIndex: 'rolloutPct', align: 'right', render: (v) => `${v}%` },
            { key: 'enabled', title: 'Enabled', dataIndex: 'enabled', render: (v, row) => <Can perm="admin.appconfig.edit" disable><Switch size="small" checked={v} onChange={(checked) => toggleFlag.mutate({ id: row.id, enabled: checked })} /></Can> },
            {
              key: 'actions', title: '', align: 'right',
              render: (_v, row) => (
                <Can perm="admin.appconfig.edit">
                  <Flex gap={4} justify="flex-end">
                    <Button size="small" type="text" onClick={() => setEditingFlag(row)}>Edit</Button>
                    <Button size="small" type="text" danger onClick={() => deleteFlag.mutate(row.id)}>Delete</Button>
                  </Flex>
                </Can>
              ),
            },
          ]}
        />
      </Card>

      <ConfirmActionModal
        open={Boolean(togglingMaintenance)}
        onCancel={() => setTogglingMaintenance(null)}
        onConfirm={(v) => setMaintenance.mutate({ platform: togglingMaintenance.platform, payload: { enabled: togglingMaintenance.enabled, reason: v.reason } })}
        loading={setMaintenance.isPending}
        needsApproval
        danger={togglingMaintenance?.enabled}
        title={`${togglingMaintenance?.enabled ? 'Enable' : 'Disable'} maintenance mode on ${PLATFORM_LABEL[togglingMaintenance?.platform]}`}
        impact={togglingMaintenance?.enabled ? 'Every customer on this platform is shown the maintenance screen and cannot use the app until this is turned off.' : 'Customers on this platform can use the app again.'}
        reasonRequired
        reasonLabel="Why is this changing?"
        showNote={false}
        confirmLabel="Request change"
      />

      <FeatureFlagModal
        open={creatingFlag || Boolean(editingFlag)}
        flag={editingFlag}
        onClose={() => { setCreatingFlag(false); setEditingFlag(null); }}
        onSaved={() => { flagsQuery.refetch(); setCreatingFlag(false); setEditingFlag(null); }}
      />
    </Flex>
  );
}

function Field({ label, value, onBlur }) {
  return (
    <Flex vertical gap={2}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>
      <Input
        size="small" defaultValue={value}
        onBlur={(e) => e.target.value !== value && onBlur(e.target.value)}
      />
    </Flex>
  );
}
