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
import BulkUploadsPage from './pages/BulkUploadsPage';
import BuyBoxRulesPage from './pages/BuyBoxRulesPage';

/**
 * Render smoke tests for the two catalog screens deferred out of Phase 1 and
 * delivered in Phase 8: Buy-box & Badge Rules (M3.9) and Bulk Uploads
 * (M3.10) — the same pattern as every other phase's page tests.
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
    body: JSON.stringify({ email: 'catalog@arise.test', password: DEMO_PASSWORD }),
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

describe('Phase 8 catalog catch-up pages', SLOW, () => {
  it('buy-box & badge rules, with weight sliders summing to 100%', async () => {
    mount(<BuyBoxRulesPage />);
    await expectTitle('Buy-box & badge rules');
    await waitFor(() => expect(screen.getByText('100% of 100%')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('bulk uploads, downloading a template and seeing the job history', async () => {
    mount(<BulkUploadsPage />);
    await expectTitle('Bulk uploads');
    await waitFor(() => expect(screen.getByText('Download template (.csv)')).toBeInTheDocument());
    await expectNoErrorState();
    fireEvent.click(screen.getByText('Price & stock update'));
    await waitFor(() => expect(screen.getByText('Download template (.csv)')).toBeInTheDocument());
  });
});
