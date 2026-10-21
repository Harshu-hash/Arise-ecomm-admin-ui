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
import BannersPage from '@features/cms/pages/BannersPage';
import HelpCenterPage from '@features/cms/pages/HelpCenterPage';
import HomeLayoutPage from '@features/cms/pages/HomeLayoutPage';
import OnboardingPage from '@features/cms/pages/OnboardingPage';
import ReasonMastersPage from '@features/cms/pages/ReasonMastersPage';
import SearchConfigPage from '@features/cms/pages/SearchConfigPage';
import StaticPagesPage from '@features/cms/pages/StaticPagesPage';
import NotificationLogsPage from '@features/notifications/pages/NotificationLogsPage';
import TemplatesPage from '@features/notifications/pages/TemplatesPage';
import BankOffersPage from './pages/BankOffersPage';
import CampaignsPage from './pages/CampaignsPage';
import CouponsListPage from './pages/CouponsListPage';
import DealsPage from './pages/DealsPage';
import FlashSaleDetailPage from './pages/FlashSaleDetailPage';
import FlashSalesListPage from './pages/FlashSalesListPage';
import ReferralPage from './pages/ReferralPage';
import SaleEventsPage from './pages/SaleEventsPage';
import SegmentsPage from './pages/SegmentsPage';

/**
 * Render smoke tests for every Phase 5 screen.
 *
 * Mounted against the real mock API, the same pattern as Phase 4's suite —
 * the only way this environment can catch a page that throws on an
 * undefined field or passes a bad prop to an Ant Design component.
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
    body: JSON.stringify({ email: 'marketing@arise.test', password: DEMO_PASSWORD }),
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

describe('Phase 5 marketing pages', SLOW, () => {
  it('coupons', async () => {
    mount(<CouponsListPage />);
    await expectTitle('Coupons');
    await waitFor(() => expect(screen.getAllByText(/WELCOME50|FLAT200/).length).toBeGreaterThan(0));
    await expectNoErrorState();
  });

  it('segments', async () => {
    mount(<SegmentsPage />);
    await expectTitle('Customer segments');
    await waitFor(() => expect(screen.getByText('High-value customers')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('deals, including the calendar view', async () => {
    mount(<DealsPage />);
    await expectTitle('Deals');
    fireEvent.click(await screen.findByText('Deal of the Day calendar'));
    await waitFor(() => expect(document.querySelectorAll('.ant-picker').length).toBeGreaterThan(0));
    await expectNoErrorState();
  });

  it('flash sales list', async () => {
    mount(<FlashSalesListPage />);
    await expectTitle('Flash sales');
    await expectNoErrorState();
  });

  it('flash sale detail, with its nominations', async () => {
    const sale = db.flashSales.find((f) => f.status === 'CURATION');
    mount(
      <Routes><Route path="/marketing/flash-sales/:id" element={<FlashSaleDetailPage />} /></Routes>,
      { route: `/marketing/flash-sales/${sale.id}` },
    );
    await expectTitle(sale.name);
    await waitFor(() => expect(screen.getByText(/Accepted — display order/)).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('sale events', async () => {
    mount(<SaleEventsPage />);
    await expectTitle('Sale events');
    await expectNoErrorState();
  });

  it('referral program', async () => {
    mount(<ReferralPage />);
    await expectTitle('Referral program');
    await waitFor(() => expect(screen.getByText('Rewarded so far')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('campaigns', async () => {
    mount(<CampaignsPage />);
    await expectTitle('Campaigns');
    await expectNoErrorState();
  });

  it('bank offer display', async () => {
    mount(<BankOffersPage />);
    await expectTitle('Bank offer display');
    await waitFor(() => expect(screen.getAllByText(/HDFC Bank|ICICI Bank/).length).toBeGreaterThan(0));
    await expectNoErrorState();
  });
});

describe('Phase 5 content pages', SLOW, () => {
  it('home layout builder', async () => {
    mount(<HomeLayoutPage />);
    await expectTitle('Home layout');
    await waitFor(() => expect(screen.getAllByText(/Hero banner carousel|Product feed/).length).toBeGreaterThan(0));
    await expectNoErrorState();
  });

  it('banners', async () => {
    mount(<BannersPage />);
    await expectTitle('Banners');
    await expectNoErrorState();
  });

  it('onboarding slides', async () => {
    mount(<OnboardingPage />);
    await expectTitle('Onboarding slides');
    await waitFor(() => expect(screen.getByText('Millions of products')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('help centre', async () => {
    mount(<HelpCenterPage />);
    await expectTitle('Help centre');
    await waitFor(() => expect(screen.getByText(/Orders & Shipping/)).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('static pages', async () => {
    mount(<StaticPagesPage />);
    await expectTitle('Static pages');
    await waitFor(() => expect(screen.getByText('Privacy Policy')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('reason masters', async () => {
    mount(<ReasonMastersPage />);
    await expectTitle('Reason masters');
    await waitFor(() => expect(screen.getByText('Ordered by mistake')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('search configuration, including the test tool', async () => {
    mount(<SearchConfigPage />);
    await expectTitle('Search configuration');
    await waitFor(() => expect(screen.getByText('Test search')).toBeInTheDocument());
    await expectNoErrorState();
  });
});

describe('Phase 5 notifications pages', SLOW, () => {
  it('transactional templates', async () => {
    mount(<TemplatesPage />);
    await expectTitle('Transactional templates');
    await waitFor(() => expect(screen.getByText('Order placed')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('delivery logs', async () => {
    mount(<NotificationLogsPage />);
    await expectTitle('Delivery logs');
    await expectNoErrorState();
  });
});
