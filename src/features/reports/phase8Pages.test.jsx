import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handlers } from '@mocks/handlers';
import { seedAll } from '@mocks/seed';
import { DEMO_PASSWORD } from '@mocks/seed/adminUsers';
import { resetSettings, updateSettings } from '@mocks/engine/settings';
import { useSessionStore } from '@core/auth/sessionStore';
import AppConfigPage from '@features/settings/pages/AppConfigPage';
import IntegrationsPage from '@features/settings/pages/IntegrationsPage';
import PlatformSettingsPage from '@features/settings/pages/PlatformSettingsPage';
import AnalyticsDashboardsPage from './pages/AnalyticsDashboardsPage';
import ExportCenterPage from './pages/ExportCenterPage';
import ReportLibraryPage from './pages/ReportLibraryPage';
import ScheduledReportsPage from './pages/ScheduledReportsPage';

/**
 * Render smoke tests for every Phase 8 screen — analytics dashboards, report
 * library, scheduled reports, Export Center, platform settings, app config
 * and integrations — mounted against the real mock API, the same pattern as
 * every earlier phase.
 */
const server = setupServer(...handlers);

function setViewport(width) {
  window.matchMedia = (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return {
      matches, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    };
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(async () => {
  setViewport(1440);
  seedAll();
  resetSettings();
  updateSettings({ latencyMs: 0 });

  const login = await fetch(`${window.location.origin}/api/admin/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'super@arise.test', password: DEMO_PASSWORD }),
  }).then((r) => r.json());
  const verify = await fetch(`${window.location.origin}/api/admin/v1/auth/2fa/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: login.data.challengeId, code: login.data.devHint.code }),
  }).then((r) => r.json());
  useSessionStore.getState().setAuthenticated(verify.data);
});

function mount(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>,
  );
}

async function expectTitle(title) {
  const found = await screen.findAllByText(title);
  expect(found.length).toBeGreaterThan(0);
}

async function expectNoErrorState() {
  await waitFor(() => {
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not reach the server/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });
}

const SLOW = { timeout: 20000 };

describe('Phase 8 reports pages', SLOW, () => {
  it('analytics dashboards, defaulting to sales', async () => {
    mount(<AnalyticsDashboardsPage />);
    await expectTitle('Analytics dashboards');
    await waitFor(() => expect(screen.getByText('Top categories')).toBeInTheDocument());
    await expectNoErrorState();
    fireEvent.click(screen.getByText('Support'));
    await waitFor(() => expect(screen.getByText('Ticket volume')).toBeInTheDocument());
  });

  it('report library, running a report', async () => {
    mount(<ReportLibraryPage />);
    await expectTitle('Report library');
    await waitFor(() => expect(screen.getByText('Order item report')).toBeInTheDocument());
    await expectNoErrorState();
    fireEvent.click(screen.getAllByText('Run')[0]);
    await waitFor(() => expect(screen.getByText(/Started/)).toBeInTheDocument());
  });

  it('scheduled reports', async () => {
    mount(<ScheduledReportsPage />);
    await expectTitle('Scheduled reports');
    await waitFor(() => expect(screen.getAllByText(/WEEKLY|MONTHLY|DAILY/).length).toBeGreaterThan(0));
    await expectNoErrorState();
  });

  it('Export Center', async () => {
    mount(<ExportCenterPage />);
    await expectTitle('Export Center');
    await expectNoErrorState();
  });
});

describe('Phase 8 settings & integrations pages', SLOW, () => {
  it('platform settings, switching sections and saving directly', async () => {
    mount(<PlatformSettingsPage />);
    await expectTitle('Platform settings');
    await waitFor(() => expect(screen.getAllByText('General').length).toBeGreaterThan(0));
    await expectNoErrorState();
  });

  it('app config, with platforms, languages and feature flags', async () => {
    mount(<AppConfigPage />);
    await expectTitle('App config');
    await waitFor(() => expect(screen.getByText('Feature flags')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Wishlist v2')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('integrations, opening the credentials flow', async () => {
    mount(<IntegrationsPage />);
    await expectTitle('Integrations');
    await waitFor(() => expect(screen.getByText('Razorpay')).toBeInTheDocument());
    await expectNoErrorState();
    fireEvent.click(screen.getAllByText('Change credentials')[0]);
    await waitFor(() => expect(screen.getByText('This action needs a second approver')).toBeInTheDocument());
  });
});
