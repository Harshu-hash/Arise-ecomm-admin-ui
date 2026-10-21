import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@mocks/db/store';
import { handlers } from '@mocks/handlers';
import { seedAll } from '@mocks/seed';
import { DEMO_PASSWORD } from '@mocks/seed/adminUsers';
import { resetSettings, updateSettings } from '@mocks/engine/settings';
import { useSessionStore } from '@core/auth/sessionStore';
import AdReviewPage from './pages/AdReviewPage';
import BillingPage from './pages/BillingPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import PlacementsPage from './pages/PlacementsPage';
import ReportsPage from './pages/ReportsPage';

/**
 * Render smoke tests for every Phase 7 screen — campaigns, ad review,
 * placements & pricing, advertiser billing, and reports — mounted against
 * the real mock API, the same pattern as Phases 4, 5 and 6.
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
    body: JSON.stringify({ email: 'ads@arise.test', password: DEMO_PASSWORD }),
  }).then((r) => r.json());
  const verify = await fetch(`${window.location.origin}/api/admin/v1/auth/2fa/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: login.data.challengeId, code: login.data.devHint.code }),
  }).then((r) => r.json());
  useSessionStore.getState().setAuthenticated(verify.data);
});

function mount(ui, { route } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route ?? '/']}>{ui}</MemoryRouter>
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

describe('Phase 7 sponsored ads pages', SLOW, () => {
  it('campaigns list', async () => {
    mount(<CampaignsPage />);
    await expectTitle('Ad campaigns');
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(3), { timeout: 8000 });
    await expectNoErrorState();
  });

  it('a campaign detail page, with settings and daily performance', async () => {
    const campaign = db.adCampaigns.find((c) => c.status === 'ACTIVE');
    mount(
      <Routes><Route path="/ads/campaigns/:id" element={<CampaignDetailPage />} /></Routes>,
      { route: `/ads/campaigns/${campaign.id}` },
    );
    await expectTitle(campaign.name);
    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Daily performance')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('ad review queue', async () => {
    mount(<AdReviewPage />);
    await expectTitle('Ad review queue');
    await expectNoErrorState();
  });

  it('placements & pricing, with the floor-price approval flow', async () => {
    mount(<PlacementsPage />);
    await expectTitle('Placements & pricing');
    await waitFor(() => expect(screen.getAllByText('Change floor prices').length).toBeGreaterThan(0));
    await expectNoErrorState();
    fireEvent.click(screen.getAllByText('Change floor prices')[0]);
    await waitFor(() => expect(screen.getByText('This action needs a second approver')).toBeInTheDocument());
  });

  it('advertiser billing, switching between wallets, invoices and invalid traffic', async () => {
    mount(<BillingPage />);
    await expectTitle('Advertiser billing');
    await waitFor(() => expect(screen.getByText('Low-balance advertisers')).toBeInTheDocument());
    await expectNoErrorState();
    fireEvent.click(screen.getByText('Invoices'));
    await waitFor(() => expect(screen.getByText('Period')).toBeInTheDocument());
    await expectNoErrorState();
    fireEvent.click(screen.getByText('Invalid traffic'));
    await expectNoErrorState();
  });

  it('ads reports', async () => {
    mount(<ReportsPage />);
    await expectTitle('Sponsored ads reports');
    await waitFor(() => expect(screen.getByText('Platform ad revenue')).toBeInTheDocument());
    await expectNoErrorState();
  });
});
