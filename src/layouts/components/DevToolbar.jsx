import { CodeOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Divider,
  Drawer,
  Flex,
  Form,
  InputNumber,
  Segmented,
  Select,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { queryClient } from '@core/api/queryClient';
import { useSessionStore } from '@core/auth/sessionStore';
import { SHOW_DEV_TOOLS } from '@core/config/env';

/**
 * Mock-backend controls (plan §6): latency, error injection, role switching,
 * time travel and a data reset. Present only in the mock dev build.
 */
export default function DevToolbar() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);

  const { data: settings } = useQuery({
    queryKey: ['dev', 'settings'],
    queryFn: () => api.get('/dev/settings').then((r) => r.data),
    enabled: SHOW_DEV_TOOLS && open,
  });

  const { data: users } = useQuery({
    queryKey: ['dev', 'users'],
    queryFn: () => api.get('/dev/users').then((r) => r.data),
    enabled: SHOW_DEV_TOOLS && open,
  });

  const patch = useMutation({
    mutationFn: (body) => api.patch('/dev/settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dev', 'settings'] }),
  });

  const switchUser = useMutation({
    mutationFn: (email) => api.post('/dev/switch-user', { email }).then((r) => r.data),
    onSuccess: (payload) => {
      setAuthenticated(payload);
      queryClient.clear();
      message.success(`Signed in as ${payload.user.name}`);
      setOpen(false);
    },
    onError: (e) => message.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => api.post('/dev/reset', {}),
    onSuccess: () => {
      queryClient.clear();
      message.success('Demo data reset. Reloading…');
      setTimeout(() => window.location.reload(), 600);
    },
  });

  const travel = useMutation({
    mutationFn: (hours) => api.post('/dev/time-travel', { hours }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ['dev', 'settings'] });
      message.success('Mock clock moved');
    },
  });

  if (!SHOW_DEV_TOOLS) return null;

  const offsetHours = Math.round((settings?.clockOffsetMs ?? 0) / 3600_000);

  return (
    <>
      <Tooltip title="Mock backend controls" placement="left">
        <Button
          shape="circle"
          icon={<CodeOutlined />}
          onClick={() => setOpen(true)}
          className="no-print"
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
          aria-label="Open mock backend controls"
        />
      </Tooltip>

      <Drawer title="Mock backend" open={open} onClose={() => setOpen(false)} width={380}>
        <Form layout="vertical" size="small">
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            This panel exists only in the mock build. Everything here simulates how the real backend
            will behave so the UI&apos;s slow, failing and stale paths can be exercised on demand.
          </Typography.Paragraph>

          <Form.Item label="Network latency">
            <Segmented
              block
              value={settings?.latencyMs ?? 300}
              onChange={(v) => patch.mutate({ latencyMs: v })}
              options={[
                { label: 'Instant', value: 0 },
                { label: 'Normal', value: 300 },
                { label: 'Slow', value: 1500 },
              ]}
            />
          </Form.Item>

          <Form.Item label="Random error rate" help="Percentage of non-auth requests that fail with a 500.">
            <InputNumber
              min={0}
              max={100}
              addonAfter="%"
              style={{ width: '100%' }}
              value={settings?.errorRate ?? 0}
              onChange={(v) => patch.mutate({ errorRate: v ?? 0 })}
            />
          </Form.Item>

          <Button
            block
            icon={<ThunderboltOutlined />}
            onClick={() => {
              patch.mutate({ failNext: true });
              message.info('The next request will fail');
            }}
          >
            Fail the next request
          </Button>

          <Divider />

          <Form.Item label="Sign in as" help="Skips password and 2FA. Only ACTIVE accounts can be used.">
            <Select
              style={{ width: '100%' }}
              placeholder="Pick a seeded admin"
              loading={switchUser.isPending}
              onChange={(email) => switchUser.mutate(email)}
              options={(users ?? []).map((u) => ({
                value: u.email,
                label: `${u.name} — ${u.roleNames.join(', ')}`,
                disabled: u.status !== 'ACTIVE',
              }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Divider />

          <Form.Item
            label="Time travel"
            help={offsetHours ? `Mock clock is ${offsetHours}h ahead of real time.` : 'Mock clock matches real time.'}
          >
            <Flex gap={6} wrap>
              <Button size="small" onClick={() => travel.mutate(1)}>
                +1h
              </Button>
              <Button size="small" onClick={() => travel.mutate(24)}>
                +1 day
              </Button>
              <Button size="small" onClick={() => travel.mutate(24 * 7)}>
                +1 week
              </Button>
              <Button size="small" onClick={() => travel.mutate(0)} disabled={!offsetHours}>
                Reset clock
              </Button>
            </Flex>
          </Form.Item>

          <Divider />

          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              danger
              block
              icon={<ReloadOutlined />}
              loading={reset.isPending}
              onClick={() => reset.mutate()}
            >
              Reset demo data
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Rebuilds every record from the seed and discards anything you changed.
            </Typography.Text>
          </Space>
        </Form>
      </Drawer>
    </>
  );
}
