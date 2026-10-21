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
import ApprovalsPage from './pages/ApprovalsPage';

/**
 * Regression test: opening an approval request and then closing the drawer
 * (or the drawer re-rendering with a cleared id for any other reason) must
 * not crash. The drawer's detail query is keyed by id, so closing it points
 * the query at a fresh, disabled, data-less cache entry — react-query v5
 * reports `isLoading: false` for a disabled query, so the render branch that
 * used to assume "not loading, no error" meant "data is here" was wrong.
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

describe('Approvals page', { timeout: 20000 }, () => {
  it('opening a request and then closing the drawer does not crash', async () => {
    mount(<ApprovalsPage />);
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2), { timeout: 10000 });

    fireEvent.click(screen.getAllByRole('row')[1]);
    await waitFor(() => expect(screen.getByText('Affects')).toBeInTheDocument(), { timeout: 10000 });

    // Antd's Drawer keeps its content mounted while it animates shut, so the
    // close path — not just the open one — has to survive a render.
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByText('Affects')).not.toBeInTheDocument());
    expect(screen.queryByText(/cannot read properties/i)).not.toBeInTheDocument();
  });
});
