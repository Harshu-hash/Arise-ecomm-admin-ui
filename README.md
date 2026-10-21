# Arise Admin — platform admin panel

Internal admin panel for the Arise marketplace (a Flipkart-style multivendor
platform, India). Frontend only: there is no backend yet, so the app runs
against a mock API that behaves like the real one.

- **Plan:** [docs/ADMIN_PANEL_PLAN.md](docs/ADMIN_PANEL_PLAN.md)
- **Screen specifications:** [docs/MODULE_SPECS.md](docs/MODULE_SPECS.md)

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173, mock API
```

Sign in as `super@arise.test` with password `Arise@123456`.

Every seeded role shares that password. The accounts are deliberately varied so
the awkward states are reachable:

| Account | Role | Note |
|---|---|---|
| `super@arise.test` | Super Admin | Everything |
| `ops@arise.test` | Operations Manager | |
| `catalog@arise.test` | Catalog Manager | |
| `category@arise.test` | Category Manager | Scoped to 3 categories |
| `onboarding@arise.test` | Seller Onboarding Executive | |
| `sam@arise.test` | Seller Account Manager | Scoped to 12 sellers |
| `finance@arise.test` | Finance Executive | Refunds capped at ₹25,000 |
| `approver@arise.test` | Finance Approver | Has pending approvals waiting |
| `agent@arise.test` | Customer Support Agent | Scoped to 2 queues |
| `supportlead@arise.test` | Support Lead | |
| `marketing@arise.test` | Marketing Manager | |
| `warehouse@arise.test` | Warehouse Manager | **Forced password change** |
| `logistics@arise.test` | Logistics Manager | **Invited, not yet accepted** |
| `ads@arise.test` | Ads Manager | **No 2FA yet — enrolment flow** |
| `auditor@arise.test` | Auditor | **Locked out after failed attempts** |

Two-step verification is mandatory. There is no real authenticator in the mock,
so the sign-in screen shows the code the server expects.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server, mock API (`.env.mock`) |
| `npm run dev:live` | Dev server against a real backend (`.env.live`) |
| `npm run build` | Production build, live mode — excludes the mock layer |
| `npm run build:mock` | Production build with the mock API, for demos |
| `npm test` | Vitest suite |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run format` | Prettier |

## How it is put together

```
src/
├─ app/          providers, theme tokens, router + route guards
├─ core/         api client, auth/session, RBAC engine, utils, env
├─ layouts/      app shell (sidebar, header, search) and auth shell
├─ shared/       component library, hooks, status registry, navigation model
├─ features/     one folder per module (pages, components, api)
└─ mocks/        mock backend: store, seeds, handlers, engines
```

Conventions worth knowing before editing:

- **Money is integer paise** everywhere in state and over the wire; it is
  formatted only at render. Never store rupees as a float.
- **Dates are ISO-8601 UTC** over the wire and always rendered in IST.
- **Status labels and colours** live only in `shared/constants/statusMaps.js`.
- **List state lives in the URL** (`useUrlTableState`), which is what makes a
  filtered list shareable. Lists never filter or sort client-side.
- **Permissions** come from `core/rbac/permissions.data.js`. That one file
  drives the roles matrix, the route guards, `<Can>`, and the mock API's own
  403s — so a permission is never checked in the UI alone.
- **Sensitive actions are four-eyed.** The server answers `202` with
  `APPROVAL_REQUIRED` instead of applying the change; the UI treats that as a
  success path, not an error.
- One component per file, ≤ 250 lines (enforced by ESLint).

## The mock backend

`src/mocks` is dynamically imported and only in mock mode, so it is absent from
a live build entirely.

- Deterministic seed (`faker.seed(2026)`, `en_IN`): 15 roles, 15 admins, ~250
  categories, 120 sellers across every lifecycle state, 4 warehouses, 5
  couriers, 120 audit entries and 8 approval requests.
- State survives reloads via an IndexedDB snapshot.
- A dev toolbar (bottom-right, mock only) controls latency, random error rate,
  "fail the next request", role switching, time travel and a data reset.

## Status

**Phase 0 — foundation.** The shell, theming with dark mode, auth with 2FA,
RBAC with scoping and maker-checker, the audit trail, the approvals inbox, the
mock backend, the shared component library and a first dashboard.

**Phase 1 — sellers and catalog.** Seller onboarding with a KYC review
workbench, seller 360 with the full lifecycle, brand approvals, penalties,
claims and performance; plus the catalog: the taxonomy editor, attributes,
brands, size charts, HSN codes, products with per-seller offers and a buy box,
and the listing QC queue.

**Phase 2 — orders and customers.** The order list and Order 360 with
per-seller shipments, item cancellation with pro-rated refunds, holds, address
changes, the returns pipeline through QC, cancellation analytics, the stuck-order
exception queue; plus customers: the 360 view, blocking, COD control, fraud
flags with blocklists, and privacy requests.

**Phase 3 — fulfilment.** Logistics: shipments with courier tracking, the NDR
action queue, RTO with its pincode analysis, pickups and manifests, courier
partners with rate cards, pincode serviceability with a live checker, weight
disputes, and allocation rules with a simulator. Warehouses: sites, inbound
consignments with a GRN counting screen, inventory with a movement ledger,
stock adjustments and removal orders.

**Phase 4 — money.** Finance: payments with the COD gap called out separately,
the refund queue with retries and mode switching, seller payouts (settlement
lines, weekly batches, the two-person release, failed-transfer retries and
manual adjustments), the commission rate card with a live "what would a seller
receive" calculator, TCS/TDS summaries, tax invoices and credit notes, COD
remittance with shortfall disputes, and gateway reconciliation. Wallet: accounts
with a derived-from-ledger balance, the cross-wallet ledger, manual credits and
debits, freezing, gift card programmes and cashback rules.

Journeys 1, 2, 3 and 4 run end to end and are covered by tests: a seller applies,
their KYC is approved, their listing passes QC and goes live; an order is
placed against it, an item is returned, QC passes and the refund is released;
and a consignment arrives at a warehouse, is counted with a discrepancy, and
the good units go on sale. And the weekly payout cycle: eligible settlements are
batched by one person, released by a second and seconded by a third, a bank
transfer bounces, is retried, and the batch closes with every seller either paid
or explicitly carried forward.

**Phase 5 — growth & content.** Marketing: coupons (with a "test against a
cart" tool that calls the exact evaluator a checkout would), customer
segments with a live-count RuleBuilder, deals and a Deal-of-the-Day calendar,
flash sales (nominate → curate → publish → go live → end, with a live
monitor and an emergency pull), sale events tying coupons/flash sales/deals
together with a readiness checklist, the referral program, campaigns across
five channels with quiet-hours enforcement, and bank-offer display controls.
Content: the home layout builder (the one screen whose publish action
produces the literal JSON the app consumes), banners, onboarding slides,
static pages with version history, the help centre, reason masters (one place
for every cancel/return/ticket/NDR reason list), and search configuration
with a live test tool. Notifications: transactional templates per event per
channel, and delivery logs.

Journeys 1 through 5 run end to end and are covered by tests — Journey 5 is a
coupon created, shown as applicable to a seeded cart through the same
evaluator a checkout would use, and its usage reflected in the performance
report.

**Phase 6 — trust & care.** Reviews: auto-moderation (clean + certified buyer
+ no media publishes itself; everything else, including every media review,
queues for a human), publish/reject/hide-media/flag-incentivised, bulk
actions, and "other reviews by this author" for spotting review rings.
Questions & Answers: moderation, answering as Arise, and an unanswered-age
flag. Abuse reports: dismiss or remove, with removal also rejecting the
underlying review. Support: the full ticket state machine with SLA
deadlines and named views (My open / Unassigned / Breaching), the
three-pane agent workspace (thread, composer with macros and
status-on-send, Customer 360), assign/escalate/merge/resolve, live chat
with a waiting queue and convert-to-ticket, macros, SLA policies &
routing, and CSAT & QA.

Journeys 1 through 6 run end to end and are covered by tests — Journey 6 is
a ticket raised, an agent replying with a macro, an escalation to
seller-ops, a resolve with a mandatory resolution code, and CSAT recorded.

**Phase 7 — sponsored ads.** Campaigns (sellers are the advertiser
throughout; the admin creates and manages one on their behalf, scoped to
that seller's own live, in-stock products), the automated ad review queue
(products LIVE + in stock, keywords against blocked terms), placements &
pricing with per-category floor CPCs and a second-price auction with a
quality-score weight, advertiser billing (prepaid wallets with recharge and
a derived ledger, or deduct-from-payout advertisers settled through the
Phase 4 payout cycle instead), monthly invoices with GST, invalid-traffic
credits, and platform-wide ads reports.

Journeys 1 through 7 run end to end and are covered by tests — Journey 7 is
a campaign created, submitted, passing automated policy review, going
active, accruing spend until its budget is exhausted, auto-pausing, and its
advertiser invoice generating with the correct GST math.

**Phase 8 — insight & hardening.** The dashboard's final widgets: top
categories/sellers/products (computed live from real order items) and a
system alerts feed. Reports & Analytics: nine live analytics dashboards
(sales, customers, catalog, sellers, fulfilment, returns, finance,
marketing, support) aggregated straight from the collections every other
module already edits, a report library whose "Run" creates a job through
the same export infrastructure every list's own "Export" button uses,
scheduled reports, and an Export Center listing every export regardless of
source. Administration: Platform Settings (ten sections, three of them
maker-checker), App Config (per-platform versions, a guarded
maintenance-mode toggle, languages, and full feature-flag CRUD with a live
preview that resolves a flag the same way the app itself would), and
Integrations (ten provider cards, guarded credential changes, a webhook
log). Alongside this phase's own scope, two Phase 1 screens that had been
deferred also landed: Buy-box & Badge Rules (configurable, maker-checker
ranking weights and the Arise Assured thresholds, replacing Phase 1's
hardcoded rule) and Bulk Uploads (a real `ImportWizard` — CSV template,
client-side parsing, column mapping, row validation — for price & stock
updates and offer deactivation).

Journeys 1 through 8 run end to end and are covered by tests — Journey 8
proves two of this project's own RBAC guarantees hold together: a Category
Manager's product list never shows a listing outside their assigned
categories, and a Finance Executive's refund above their own limit is sent
for approval rather than applied unilaterally.

Navigation lists every planned screen. Anything not built yet opens a
placeholder naming the phase that delivers it, so nothing in the sidebar
leads to a 404. The placeholder generator keys off what is actually
implemented rather than the phase number, which is what let two Phase 1
screens (Bulk Uploads, Buy-box & Badge Rules) sit behind a placeholder for
seven phases without ever 404ing, then land cleanly in Phase 8 once built —
a test pins this behaviour. Phase order and scope are in the plan.

### Worth knowing before changing this code

- **A product is a shared catalog page**, not a seller's listing. Several
  sellers hold offers on the same product and one wins the buy box; that is the
  offer customers see. Changing price, stock or status recomputes it.
- **Editing a live listing does not change what customers see.** It creates a
  pending revision that goes back through QC, so the live copy stays intact.
- **A failing automated check blocks QC approval.** Overriding is allowed but
  must be explicit, and is recorded against the reviewer's name.
- **Suspending a seller hides their listings rather than deleting them**, so
  reinstating restores exactly what was hidden.
- **Approval routing is permission-based.** A request goes to admins holding
  both `admin.approval.decide` and that action's own permission — payout
  releases reach Finance Approver, seller suspensions reach Operations Manager.
- **An order's status is derived from its items**, never stored separately. It
  reports the least-progressed open item, so a partly cancelled order can never
  contradict itself.
- **Refunds are pro-rated.** Cancelling part of an order claws back that item's
  share of any coupon; cancelling all of it also returns the delivery and
  platform fees.
- **A refund above an agent's limit does not block the customer.** The
  cancellation goes through immediately and only the refund waits for approval.
- **A delivered item has been paid for either way.** COD returns still create a
  refund — parked in `PENDING_DETAILS` awaiting bank details, never skipped.
- **Posting a GRN is what makes stock sellable.** Counting more than was
  declared is refused rather than absorbed; a shortfall raises a discrepancy
  report to the seller automatically.
- **Inventory is bucketed.** `sellable` is what is on hand, `available` is
  `sellable − reserved`, and only `available` can be sold. Every movement is
  written to a ledger so a physical count can be reconciled.
- **Pausing a courier or a warehouse only stops new work.** Parcels already
  with a courier keep moving; consignments already booked still arrive.
- **Accepting a weight dispute should correct the SKU master.** Otherwise the
  same charge recurs on every future shipment of that SKU.
- **Settlement arithmetic lives in one pure function** (`src/mocks/engine/settlement.js`,
  tested separately). The payout batch, the settlement list and the fee preview
  all call it, so they cannot disagree about what a seller is owed.
- **Nobody releases their own payout batch.** The maker builds it, a second
  person requests the release and a third seconds it in the approvals inbox.
  The API enforces all three, not just the UI.
- **A negative payout is carried forward, not collected.** Fees can exceed a
  cheap item's price; the balance waits for the seller's next settlement.
- **Money is held, not paid, while anything is open.** An unexpired return
  window, an open return, an open claim or a payout hold each block a
  settlement line, and the reason is shown next to the money.
- **Releasing a payout hold re-evaluates each line** rather than marking them
  all payable, so lines held for another reason stay held.
- **A wallet balance is derived from its ledger.** Nothing writes
  `balancePaise` directly, and store credit can never go negative.
- **Gift card codes are never returned by the API** — only the last four
  digits. Whoever can read a code can spend it.
- **A tax invoice is superseded, never edited.** The original stays on record
  with a reason; a new number is issued.
- **A coupon's applicability is one function**, reused by the wizard's "test
  against a cart" tool and the usage report. They can never disagree about
  whether a coupon applies, because neither has its own copy of the logic.
- **A segment's rule tree is also one function**, shared by the segment's own
  live count, a coupon's `SEGMENT` audience and a campaign's reach estimate.
- **Publishing the home layout strips the admin's internal version record
  down to exactly the JSON the app consumes** — no scheduling or audit
  fields leak into what `HomeScreen` reads.
- **Reordering (flash-sale curation, onboarding slides, tabs, home
  sections) is up/down buttons, not drag.** The server-side reorder call
  already takes an ordered id list either way, so drag can replace the
  buttons later as a pure UI swap.
- **A deal references a product, not a specific offer.** The server resolves
  it to that product's current buy-box winner, because that is the price a
  customer actually sees.
- **Return reasons carry a fault attribution** that decides who pays the
  reverse shipping fee, and the server refuses to save one without it. The
  Phase 2/3 return handlers do not yet read this list — see the module specs
  for why that retrofit was left for later rather than done partially.
- **A ticket cannot resolve straight out of Pending Internal.** It has to
  pass back through Open first — the state machine follows the spec's own
  diagram literally, which is also why an agent cannot close a ticket while
  another team privately owns it.
- **Inline order actions on a ticket link out to the order detail page**
  rather than being re-implemented in the ticket handler. Those flows move
  real money and stock and are already tested; a second copy of "issue a
  refund" living inside tickets is exactly the kind of divergent duplicate
  this project avoids everywhere else.
- **CSAT submission is the one deliberately unauthenticated admin-API
  endpoint.** It is the customer, not an admin, submitting it from the app
  after a resolve.
- **A review's auto-moderation is one pure classifier**, reused by the seed,
  the list and (eventually) a freshly submitted review, so a "clean" review
  can never disagree with itself depending on which code path produced it.
- **Changing a placement's floor CPC is maker-checker**, with `ads_manager`
  as the maker and `super_admin` as the universal second approver — the same
  lone-specialist-role precedent Phase 4 set for commission edits. Every
  other placement field applies immediately.
- **Recording ad spend is what debits the advertiser's wallet.** The same
  `record-spend` call that logs a campaign's daily impressions/clicks also
  writes the wallet ledger row that billing and invoices are built from, so
  the two can never drift apart. A prepaid wallet that hits zero auto-pauses
  its campaign; a deduct-from-payout advertiser is never touched here at all.
- **Ad ranking is a second-price auction blended with a quality score**
  (relevance × CTR), not highest-bid-wins — a lower bid can outrank a higher
  one on quality, and the winner is charged the runner-up's price, never
  their own full bid.
- **There are two Super Admin accounts**, not one. Platform settings,
  maintenance-mode and integration-credential changes are each maker-checker
  with `admin.*` as both the maker's and the approver's permission, and
  nobody else holds those keys — a single Super Admin could never approve
  their own request. The second account exists purely to be that other
  approver.
- **A feature flag resolves through one pure function**
  (`resolveFlag` in `engine/featureFlags.js`), the same one its own "preview"
  button calls — platform, minimum app version, segment and rollout
  percentage are all ANDed together, and a rollout percentage uses a stable
  per-device bucket rather than re-rolling the dice on every check.
- **Analytics dashboards read real collections, not an invented series.**
  The Phase 0 dashboard's own daily series stayed synthetic because no real
  orders existed yet to aggregate; by Phase 8 every module's real data does,
  so Reports & Analytics aggregates `orders`, `settlementLines`, `tickets`
  and the rest directly — the same "one home for a number" principle as
  everywhere else in this project.
- **The Export Center and the Report Library's "Run" action are not a new
  export pipeline.** Both create a job through the same job simulator every
  list's own "Export" button already used since Phase 0.
- **Buy-box ranking and the Arise Assured badge are one scored, pure
  function** (`engine/buyBox.js`), replacing Phase 1's hardcoded "cheapest
  price minus an Arise credit" rule. The catalog handler, the seed, and the
  rules page's own "simulate on product" tool all call it, so a listing's
  actual winner can never disagree with what the rules page says it should
  be. Publishing new weights is maker-checker and recomputes every
  variant's winner and every offer's badge immediately.
- **Bulk Uploads bulk-edits offers, never product content.** Price & stock
  updates and offer deactivation apply directly, because price and stock
  live on the per-seller offer, which has never gone through this panel's
  revision/QC flow — only product content has. Bulk image-URL and
  attribute edits would be content, so building them in bulk isn't done
  here; doing so would mean either bypassing that flow or building bulk
  revision review, neither of which this phase took on.
