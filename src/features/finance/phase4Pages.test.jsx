import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '@core/auth/sessionStore';
import { handlers } from '@mocks/handlers';
import { seedAll } from '@mocks/seed';
import { DEMO_PASSWORD } from '@mocks/seed/adminUsers';
import { resetSettings, updateSettings } from '@mocks/engine/settings';
import { db } from '@mocks/db/store';
import MoneyPositionCard from '../dashboard/components/MoneyPositionCard';
import CashbackRulesPage from '../wallet/pages/CashbackRulesPage';
import GiftCardsPage from '../wallet/pages/GiftCardsPage';
import WalletAccountsPage from '../wallet/pages/WalletAccountsPage';
import WalletLedgerPage from '../wallet/pages/WalletLedgerPage';
import CodRemittancePage from './pages/CodRemittancePage';
import CommissionPage from './pages/CommissionPage';
import InvoicesPage from './pages/InvoicesPage';
import PaymentsPage from './pages/PaymentsPage';
import PayoutsPage from './pages/PayoutsPage';
import PayoutBatchDetailPage from './pages/PayoutBatchDetailPage';
import ReconciliationPage from './pages/ReconciliationPage';
import RefundsPage from './pages/RefundsPage';
import TaxPage from './pages/TaxPage';

/**
 * Render smoke tests for the Phase 4 screens.
 *
 * There is no browser available in this environment, so without these a page
 * that throws on an undefined `meta.summary`, or passes a bad prop to an Ant
 * Design component, would ship looking fine. Each page is mounted against the
 * real mock API and has to reach the point of showing its own data.
 */
const server = setupServer(...handlers);

/**
 * jsdom has no layout, so every Ant Design breakpoint reads false and every
 * table silently renders its mobile card list. These tests set a width
 * explicitly, which is also the only way the responsive paths get exercised
 * at all without a browser.
 */
function setViewport(width) {
  window.matchMedia = (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
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

  // Sign in for real so the pages run with a genuine token and permission
  // set, rather than a hand-built one that could drift from the role.
  const login = await fetch(`${window.location.origin}/api/admin/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'super@arise.test', password: DEMO_PASSWORD }),
  }).then((r) => r.json());

  const verify = await fetch(`${window.location.origin}/api/admin/v1/auth/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: login.data.challengeId,
      code: login.data.devHint.code,
    }),
  }).then((r) => r.json());

  const { user, accessToken, refreshToken } = verify.data;
  useSessionStore.getState().setAuthenticated({ user, accessToken, refreshToken });
});

function mount(ui, { route } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

/** The title appears in both the breadcrumb and the heading, so never unique. */
async function expectTitle(title) {
  const found = await screen.findAllByText(title);
  expect(found.length).toBeGreaterThan(0);
}

/** Fails if the page rendered an error state instead of its data. */
async function expectNoErrorState() {
  await waitFor(() => {
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not reach the server/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });
}

// Mounting a full Ant Design page in jsdom and waiting for its query takes a
// few seconds, and more when the whole suite runs at once. The default 5s
// budget is close enough to flake, so these blocks get their own.
const SLOW = { timeout: 20000 };

describe('Phase 4 pages render against the mock API', SLOW, () => {
  it('payments', async () => {
    mount(<PaymentsPage />);
    await expectTitle('Payments');
    await waitFor(() => expect(screen.getByText('Captured')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('refunds', async () => {
    mount(<RefundsPage />);
    await expectTitle('Refunds');
    await waitFor(() => expect(screen.getByText('Failed at the gateway')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('seller payouts, with the held-money breakdown', async () => {
    mount(<PayoutsPage />);
    await expectTitle('Seller payouts');
    // The summary and the batch table both have to load.
    await waitFor(() => expect(screen.getByText('Payable now')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Why money is being held')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('commission and fees', async () => {
    mount(<CommissionPage />);
    await expectTitle('Commission & fees');
    await waitFor(() => expect(screen.getByText('Platform fees')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Rate plans')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('tax', async () => {
    mount(<TaxPage />);
    await expectTitle('Tax (TCS / TDS)');
    // "TCS" is glossary-wrapped in its own <span> (for the hover tooltip), so
    // the label is split across elements rather than being one text node.
    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'TCS collected')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('invoices', async () => {
    mount(<InvoicesPage />);
    await expectTitle('Invoices & credit notes');
    // "GST" is glossary-wrapped in its own <span>, same reason as above.
    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'GST charged')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('COD remittance', async () => {
    mount(<CodRemittancePage />);
    await expectTitle('COD remittance');
    await waitFor(() => expect(screen.getByText('Cash still with couriers')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('reconciliation', async () => {
    mount(<ReconciliationPage />);
    await expectTitle('Reconciliation');
    // The legend and the column header share this label.
    await waitFor(() => expect(screen.getAllByText('Not at gateway').length).toBeGreaterThan(1));
    await expectNoErrorState();
  });

  it('wallet accounts', async () => {
    mount(<WalletAccountsPage />);
    await expectTitle('Wallet accounts');
    await waitFor(() => expect(screen.getByText('Outstanding balance')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('wallet ledger', async () => {
    mount(<WalletLedgerPage />);
    await expectTitle('Wallet ledger');
    await waitFor(() => expect(screen.getByText('Issued as goodwill')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('gift cards', async () => {
    mount(<GiftCardsPage />);
    await expectTitle('Gift cards');
    await waitFor(() => expect(screen.getByText('Outstanding liability')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('cashback rules', async () => {
    mount(<CashbackRulesPage />);
    await expectTitle('Cashback rules');
    await waitFor(() => expect(screen.getByText('Budget used')).toBeInTheDocument());
    await expectNoErrorState();
  });
});

describe('the dashboard money widget', SLOW, () => {
  it('separates what the platform owes from what is owed to it', async () => {
    mount(<MoneyPositionCard />);

    expect(await screen.findByText('Money position')).toBeInTheDocument();
    // The card shows a skeleton until the overview lands.
    expect(await screen.findByText('We owe')).toBeInTheDocument();
    expect(screen.getByText('Owed to us, or already ours')).toBeInTheDocument();
    // Liabilities are named individually, never netted into one figure.
    expect(screen.getByText('Payable to sellers now')).toBeInTheDocument();
    expect(screen.getByText('Cash still with couriers')).toBeInTheDocument();
    expect(screen.getByText('Unspent gift cards')).toBeInTheDocument();
    await expectNoErrorState();
  });
});

describe('the screens work at phone width', SLOW, () => {
  beforeEach(() => setViewport(375));

  it('shows payouts as cards rather than a table that cannot fit', async () => {
    mount(<PayoutsPage />);
    await expectTitle('Seller payouts');
    await waitFor(() => expect(screen.getByText('Payable now')).toBeInTheDocument());
    // The desktop table header is gone; the card list carries the data instead.
    await waitFor(() => expect(screen.getAllByText(/sellers$/).length).toBeGreaterThan(0));
    expect(screen.queryByText('Settlement period')).not.toBeInTheDocument();
    await expectNoErrorState();
  });

  it('shows wallets as cards', async () => {
    mount(<WalletAccountsPage />);
    await expectTitle('Wallet accounts');
    await waitFor(() => expect(screen.getByText('Outstanding balance')).toBeInTheDocument());
    expect(screen.queryByText('Credited')).not.toBeInTheDocument();
    await expectNoErrorState();
  });
});

describe('the money-critical interactions', SLOW, () => {
  it('explains every deduction when a settlement line is opened', async () => {
    mount(<PayoutsPage />);
    await expectTitle('Seller payouts');

    fireEvent.click(await screen.findByText('Settlement lines'));
    // Wait for real rows: clicking the empty-state placeholder does nothing.
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(3), { timeout: 8000 });
    // Row 0 is the header.
    fireEvent.click(screen.getAllByRole('row')[1]);

    const drawer = await screen.findByRole('dialog');
    // The full working, not a rolled-up "fees" figure: this is what finance
    // reads out when a seller disputes a deduction.
    expect(await within(drawer).findByText(/Commission \(/)).toBeInTheDocument();
    expect(within(drawer).getByText('Fixed closing fee')).toBeInTheDocument();
    expect(within(drawer).getByText(/GST on our fees/)).toBeInTheDocument();
    expect(within(drawer).getByText(/TCS under GST/)).toBeInTheDocument();
    expect(within(drawer).getByText(/TDS under/)).toBeInTheDocument();
    expect(within(drawer).getByText('Seller receives')).toBeInTheDocument();
  });

  it('raises an adjustment through the payouts workspace', async () => {
    mount(<PayoutsPage />);
    await expectTitle('Seller payouts');

    fireEvent.click(await screen.findByText('Adjustments'));
    // The deduction path has to say, in words, that it takes money.
    fireEvent.click(await screen.findByRole('button', { name: /raise adjustment/i }));

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText(/This takes money from the seller/i)).toBeInTheDocument();
    expect(within(modal).getByText(/needs a second approver/i)).toBeInTheDocument();
  });

  it('will not offer the release button to the person who built the batch', async () => {
    // Super Admin is signed in, and is recorded as the batch's creator.
    const batch = db.payoutBatches.find((b) => b.status === 'PENDING_APPROVAL');
    batch.createdById = db.adminUsers.find((u) => u.email === 'super@arise.test').id;

    mount(
      <Routes>
        <Route path="/finance/payouts/:id" element={<PayoutBatchDetailPage />} />
      </Routes>,
      { route: `/finance/payouts/${batch.id}` },
    );

    expect(await screen.findByText('Someone else has to release this batch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /release payouts/i })).toBeDisabled();
  });

  it('offers release to a different approver, and spells out what it costs', async () => {
    const batch = db.payoutBatches.find((b) => b.status === 'PENDING_APPROVAL');
    batch.createdById = 'ADM-999';

    mount(
      <Routes>
        <Route path="/finance/payouts/:id" element={<PayoutBatchDetailPage />} />
      </Routes>,
      { route: `/finance/payouts/${batch.id}` },
    );

    const button = await screen.findByRole('button', { name: /release payouts/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText(/will be transferred once a second approver agrees/i)).toBeInTheDocument();
    // Typing the word is required before the button unlocks.
    expect(within(modal).getByRole('button', { name: /send for approval/i })).toBeDisabled();
  });
});
