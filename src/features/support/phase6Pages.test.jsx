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
import AbuseReportsPage from '@features/reviews/pages/AbuseReportsPage';
import QaPage from '@features/reviews/pages/QaPage';
import ReviewsPage from '@features/reviews/pages/ReviewsPage';
import CsatPage from './pages/CsatPage';
import LiveChatPage from './pages/LiveChatPage';
import MacrosPage from './pages/MacrosPage';
import SlaPoliciesPage from './pages/SlaPoliciesPage';
import TicketDetailPage from './pages/TicketDetailPage';
import TicketsPage from './pages/TicketsPage';

/**
 * Render smoke tests for every Phase 6 screen — tickets, live chat, macros,
 * SLA policies, CSAT, reviews, Q&A and abuse reports — mounted against the
 * real mock API, the same pattern as Phases 4 and 5.
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
    body: JSON.stringify({ email: 'supportlead@arise.test', password: DEMO_PASSWORD }),
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

describe('Phase 6 support pages', SLOW, () => {
  it('ticket queues & inbox', async () => {
    mount(<TicketsPage />);
    await expectTitle('Ticket queues');
    await waitFor(() => expect(screen.getAllByText(/TKT-/).length).toBeGreaterThan(0));
    await expectNoErrorState();
  });

  it('the ticket workspace, with the thread and customer 360', async () => {
    const ticket = db.tickets.find((t) => t.status !== 'NEW');
    mount(
      <Routes><Route path="/support/tickets/:id" element={<TicketDetailPage />} /></Routes>,
      { route: `/support/tickets/${ticket.id}` },
    );
    await expectTitle(`${ticket.id} · ${ticket.subject}`);
    await waitFor(() => expect(screen.getByText('Conversation')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Customer')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('opening the composer and switching to an internal note', async () => {
    const ticket = db.tickets.find((t) => t.status === 'OPEN');
    mount(
      <Routes><Route path="/support/tickets/:id" element={<TicketDetailPage />} /></Routes>,
      { route: `/support/tickets/${ticket.id}` },
    );
    await waitFor(() => expect(screen.getByPlaceholderText(/write a reply/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Internal note'));
    await waitFor(() => expect(screen.getByPlaceholderText(/internal note/i)).toBeInTheDocument());
  });

  it('live chat console', async () => {
    mount(<LiveChatPage />);
    await expectTitle('Live chat console');
    await waitFor(() => expect(screen.getByText(/Waiting \(/)).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('macros', async () => {
    mount(<MacrosPage />);
    await expectTitle('Macros');
    await waitFor(() => expect(screen.getByText('Refund processed')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('SLA policies & routing', async () => {
    mount(<SlaPoliciesPage />);
    await expectTitle('SLA policies & routing');
    await waitFor(() => expect(screen.getByText('Routing rules')).toBeInTheDocument());
    await expectNoErrorState();
  });

  it('CSAT & quality', async () => {
    mount(<CsatPage />);
    await expectTitle('CSAT & quality');
    await waitFor(() => expect(screen.getByText('Low-score follow-up queue')).toBeInTheDocument());
    await expectNoErrorState();
  });
});

describe('Phase 6 reviews pages', SLOW, () => {
  it('reviews, defaulting to the pending-moderation tab', async () => {
    mount(<ReviewsPage />);
    await expectTitle('Reviews');
    await expectNoErrorState();
  });

  it('opening a review shows its moderation actions', async () => {
    mount(<ReviewsPage />);
    await expectTitle('Reviews');
    // Wait for real data, not just the table's own single empty-state row —
    // a premature click lands on a row that is not there yet.
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(3), { timeout: 8000 });
    fireEvent.click(screen.getAllByRole('row')[1]);
    await waitFor(() => expect(screen.getByText('Moderate review')).toBeInTheDocument());
  });

  it('questions and answers', async () => {
    mount(<QaPage />);
    await expectTitle('Questions & Answers');
    await expectNoErrorState();
  });

  it('abuse reports', async () => {
    mount(<AbuseReportsPage />);
    await expectTitle('Abuse reports');
    await expectNoErrorState();
  });
});
