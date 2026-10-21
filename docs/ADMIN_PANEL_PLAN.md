# Arise Admin Panel — Master Plan

> Platform: **Arise**, a Flipkart-style multivendor marketplace (India).
> Deliverable: a complete, end-to-end **admin panel web UI**, built with Vite + React and running on a mock API until the real backend exists.
> Companion doc: [MODULE_SPECS.md](./MODULE_SPECS.md) specifies every screen, field, action and state machine for each module.

---

## 0. Table of contents

1. [Locked decisions](#1-locked-decisions)
2. [What the codebase analysis found](#2-what-the-codebase-analysis-found)
3. [Customer-app → admin coverage map](#3-customer-app--admin-coverage-map)
4. [Tech stack](#4-tech-stack)
5. [Project structure](#5-project-structure)
6. [Mock API layer (MSW)](#6-mock-api-layer-msw)
7. [API conventions (contract for the future backend)](#7-api-conventions-contract-for-the-future-backend)
8. [Design system & theming](#8-design-system--theming)
9. [App shell & navigation](#9-app-shell--navigation)
10. [Shared component library](#10-shared-component-library)
11. [Authentication & session](#11-authentication--session)
12. [RBAC, data scoping & maker-checker](#12-rbac-data-scoping--maker-checker)
13. [Cross-cutting UX standards (Definition of Done)](#13-cross-cutting-ux-standards-definition-of-done)
14. [Security, performance, accessibility](#14-security-performance-accessibility)
15. [Testing strategy](#15-testing-strategy)
16. [Phased roadmap](#16-phased-roadmap)
17. [Out of scope / future phases](#17-out-of-scope--future-phases)
18. [Open items & mobile-app inconsistencies to resolve](#18-open-items--mobile-app-inconsistencies-to-resolve)

---

## 1. Locked decisions

Confirmed with the product owner. Changing any of these changes the plan.

| Topic | Decision |
|---|---|
| Scope | **Platform admin panel only.** The seller panel is a separate future project. The admin panel manages sellers fully (onboarding, KYC, listings, payouts, performance). |
| Location | `d:\AppzetoQC\Ecommerce_admin_UI` (frontend only) |
| Language | **JavaScript** (no TypeScript), matching the mobile app's convention. Types are documented with JSDoc on the API layer. |
| UI library | **Ant Design v5** |
| Data source | **Mock API layer (MSW)** with realistic seeded, persisted data. Swapping to the real backend means changing an env flag, not the UI. |
| Admin access | **Granular RBAC**: custom roles × per-module permissions, data scoping, maker-checker for sensitive actions. |
| Market | **India only**: INR, GST (GSTIN, HSN, TCS u/s 52, TDS u/s 194-O), PAN/bank KYC, pincodes, COD. |
| Delivery model | **Standard e-commerce**: 1–7 day delivery through courier partners, platform-managed (AWB, pickups, manifests, NDR, RTO). No quick commerce. |
| Fulfillment | **Seller location + Arise warehouses**: sellers either ship from their own pickup address ("Seller Fulfilled") or stock inventory in Arise warehouses ("Fulfilled by Arise", the equivalent of FBF/FBA). |
| Wallet | **Store credit only**: refunds, cashback, referral bonus and gift cards. Spendable only on Arise. No P2P send, no Scan & Pay, no add-money KYC. |
| Optional programs in scope | **Sponsored Ads** only. SuperCoins, Plus membership and Play are future phases. |
| Bank offers / EMI | **Sourced from the payment gateway's offer engine.** Admin only toggles visibility and placement. |
| Look & feel | **Arise app colors**, **dark mode**, **fully responsive** (desktop-first; works on tablets and phones). English-only UI. |

---

## 2. What the codebase analysis found

- `d:\AppzetoQC\Ecommerce` is the only existing project: a **React Native CLI 0.76 customer app**, written in JavaScript with a feature-sliced architecture, Redux Toolkit + RTK Query (scaffolded, empty), axios, react-hook-form + zod.
- **There is no backend, no API, no database and no role system.** All app data is hardcoded mock data (`features/*/data/*.js`, `features/orders/constants/ordersData.js`, `features/support/constants/helpData.js`).
- The app has 32 feature folders. Every customer-facing surface needs a matching admin surface (see §3).
- Brand tokens come from `Ecommerce/src/constants/colors.js` (Flipkart-derived palette, primary `#2874F0`). The app uses the system font with a 12/14/16/20 type scale (`constants/typography.js`).
- Data shapes the admin must stay compatible with:
  - **Order**: `id, placedOn, status, paymentMethod, deliveryCode, address{label,name,line,cityLine,phone}, items[]{id,name,variant,qty,price,mrp,image}, priceDetails{itemTotal,deliveryFee,platformFee,discount,grandTotal}`
  - **Product (PDP)**: `id, brand, name, price, mrp, rating, ratingCount, reviewCount, color, sizes[], images[], description, fit, modelInfo, care, productCode, manufacturer, countryOfOrigin`, plus colour variants, size chart rows, an `ad: true` sponsored flag and an `assured` badge
  - **Reasons masters**: `CANCEL_REASONS`, `RETURN_REASONS`, `TICKET_SUBJECTS`; help categories/articles in `helpData.js`
  - **Home layout**: hero banners, ad sheet banners, recently viewed rail, flash sale banner, ad tiles, suggested-for-you, brands spotlight, top value deals, product feed, category tabs (`For You / Fashion / Mobiles / Electronics / Beauty / Home` with icon + gradient), top brand tabs (`Arise / Deals`)
  - **Notifications**: `type (order|offer|…), icon, title, message, timestamp, read`
  - **Wallet transactions**: `type credit|debit, title, subtitle, date, amount`
- Engineering conventions to mirror: feature-based vertical slices, `index.js` public API per feature, **max 250 lines per file**, path aliases, ESLint + Prettier + Husky + lint-staged.

---

## 3. Customer-app → admin coverage map

Every app feature is covered by an admin module. Module numbers refer to [MODULE_SPECS.md](./MODULE_SPECS.md).

| App feature (`Ecommerce/src/features/…`) | Admin coverage |
|---|---|
| `auth`, `profile`, `address`, `settings` (DeleteAccount, DownloadData, AdPreferences, Privacy) | M5 Customers (profile, addresses, devices, block), M5.5 Privacy requests (account deletion, data export) |
| `home`, `onboarding`, `brands` | M12 CMS: Home layout builder, banners, category tabs, brand spotlight, onboarding slides |
| `category`, `product`, `search`, `recentlyViewed` | M3 Catalog (categories, attributes, products, variants, size charts), M12.6 Search config |
| `seller` (SellOnFlipkart, SellerRegistration) | M4 Sellers: onboarding application queue → KYC → activation |
| `cart`, `checkout`, `payment` | M2 Orders, M8 Finance (payments, gateway transactions, bank-offer visibility), M17 Settings (fees, COD rules) |
| `orders`, `tracking` | M2 Orders, M7 Logistics (shipments, AWB tracking) |
| `support` (Cancel, Return/Replace, OrderIssue, Tickets, LiveChat, HelpCenter) | M2.3 Cancellations, M2.4 Returns, M14 Support desk + live chat console, M12.5 Help center CMS, reason masters |
| `reviews` (Reviews, Q&A) | M13 Reviews & Q&A moderation |
| `coupons`, `offers`, `flashSale` | M10 Marketing: coupons, deals, flash sales, sale events |
| `wallet` | M9 Wallet & Gift cards (store-credit ledger, gift card batches, cashback rules) |
| `referral` | M10.5 Referral program |
| `notifications` | M10.6 Campaigns (push/SMS/email/in-app), M16 Transactional templates |
| `language` | M17 Settings → enabled app languages |
| `appUpdate`, `maintenance` | M17 Settings → app config (maintenance mode, force/soft update per platform) |
| `play` | Future phase (shoppable video) |
| Product `ad: true` flag | M11 Sponsored Ads |
| Product `assured` badge | M6 Warehouses (Fulfilled-by-Arise) + M3 badge rules |

---

## 4. Tech stack

Pin exact versions at scaffold time (latest stable that has been out ≥ 2 weeks).

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite** + `@vitejs/plugin-react` | Fast HMR, native ESM, simple per-route code splitting |
| UI runtime | **React 18.3** | Same React major as the mobile app; Ant Design v5 is fully supported |
| Language | JavaScript + JSDoc, `jsconfig.json` path aliases | Locked decision |
| Components | **Ant Design v5** + `@ant-design/icons` | Enterprise-grade tables, forms, trees, upload, date ranges, built-in dark algorithm and design tokens |
| Routing | **React Router** (data router: `createBrowserRouter`, lazy routes, loaders for permission guards) | Route-level code splitting, nested layouts, breadcrumbs from route metadata |
| Server state | **TanStack Query v5** | Cache, background refetch, pagination, optimistic updates and invalidation. Fits CRUD-heavy admin work better than Redux. |
| Client/UI state | **Zustand** (auth session, theme, sidebar, saved table views) | Tiny, no boilerplate |
| HTTP | **axios** instance with interceptors (auth, refresh, error normalisation, request ID) | Same library as the mobile app |
| Forms | **Ant Design Form** (incl. `Form.List` for variants and rule builders) + **zod** schemas for payload validation (shared with mock handlers) | AntD Form integrates natively with AntD inputs; zod keeps mock and UI validation identical |
| Mock API | **MSW v2** + a plain in-memory collection store + **@faker-js/faker** (seeded, `en_IN` locale) + IndexedDB persistence | Realistic, persistent, swappable (see §6) |
| Charts | **Recharts** | Lightweight, composable, easy to theme for dark mode |
| Rich text | **TipTap** + **DOMPurify** on render | Product descriptions, CMS pages, help articles, ticket replies |
| Drag & drop | **@dnd-kit** | Home layout builder, category ordering, image ordering, banner ordering |
| Dates | **dayjs** (already AntD's date library), IST (`Asia/Kolkata`) | |
| Spreadsheets | **papaparse** (CSV in/out) + **xlsx (SheetJS CE)** for .xlsx import/export | Bulk uploads (catalog, pincodes, prices/stock), exports |
| Images | **react-easy-crop** | Banner and product image cropping to required aspect ratios |
| Barcodes / print | **JsBarcode** + print-friendly routes | Shipping labels, invoices, manifests, GRN sheets |
| Virtualisation | AntD Table `virtual` mode | 10k+ row tables without jank |
| Quality | ESLint (react, react-hooks, import), Prettier, Husky, lint-staged | Same tooling as the mobile app |
| Testing | **Vitest** + **React Testing Library**, **Playwright** E2E against MSW | §15 |

---

## 5. Project structure

```
Ecommerce_admin_UI/
├─ docs/                         # this plan, MODULE_SPECS.md, API_CONTRACT.md (grows per module)
├─ public/                       # favicon, mockServiceWorker.js
├─ src/
│  ├─ main.jsx                   # bootstraps MSW (mock mode) → renders <App/>
│  ├─ app/
│  │  ├─ App.jsx                 # providers: ConfigProvider(theme), QueryClient, Router
│  │  ├─ router/                 # route tree, route meta (title, permission, breadcrumb), guards
│  │  ├─ providers/
│  │  └─ theme/                  # tokens.js (from Arise colors), light.js, dark.js, componentTokens.js
│  ├─ core/
│  │  ├─ api/                    # axiosInstance.js, interceptors.js, queryClient.js, errors.js
│  │  ├─ auth/                   # session store, token refresh, idle timer
│  │  ├─ rbac/                   # permission catalog, can(), usePermission(), <Can/>, scope helpers
│  │  ├─ config/                 # env.js (VITE_API_MODE, VITE_API_BASE_URL)
│  │  └─ utils/                  # money (INR), date (IST), masking, download, url-state
│  ├─ layouts/                   # AppLayout (sidebar/header), AuthLayout, PrintLayout
│  ├─ shared/
│  │  ├─ components/             # §10 library (DataTable, FilterBar, StatusTag, …)
│  │  ├─ hooks/                  # useTableQuery, useUrlFilters, useDebounce, useBreakpoint
│  │  └─ constants/              # status maps (label + color per status), enums, reasons
│  ├─ features/                  # one folder per module (M1…M17)
│  │  └─ orders/
│  │     ├─ api/                 # orders.api.js (endpoint fns), orders.queries.js (query keys + hooks)
│  │     ├─ components/
│  │     ├─ pages/               # OrdersListPage.jsx, OrderDetailPage.jsx, …
│  │     ├─ constants/
│  │     ├─ utils/
│  │     ├─ routes.jsx           # module routes + meta, consumed by app/router
│  │     └─ index.js             # public API
│  └─ mocks/
│     ├─ browser.js              # setupWorker
│     ├─ db/                     # @mswjs/data models + relations
│     ├─ seed/                   # deterministic seeders per entity (faker seed)
│     ├─ handlers/               # one file per module; mirrors features/*/api exactly
│     ├─ engine/                 # state machines, async job simulator, latency/error injection
│     └─ persistence.js          # IndexedDB snapshot/restore, "reset demo data"
├─ tests/e2e/                    # Playwright specs
├─ .env.mock / .env.live
├─ jsconfig.json  vite.config.js  eslint/prettier/husky configs
```

Rules (mirroring the mobile app's `CodingGuidelines.md`):
- ≤ 250 lines per file, one component per file.
- Cross-feature imports only through a feature's `index.js`.
- Path aliases: `@app`, `@core`, `@shared`, `@features`, `@layouts`, `@mocks`.
- Status labels and colors live **only** in `shared/constants/statusMaps.js`, never inline.
- Money is always integer **paise** in data and formatted only at render (`formatINR`).

---

## 6. Mock API layer (MSW)

Goal: every flow works end to end now (approve a seller, QC a listing, cancel an item and see the refund, release a payout), and data survives a page reload.

- **Mode switch:** `VITE_API_MODE=mock|live`, selected by Vite mode (`npm run dev` uses `.env.mock`, `npm run build` uses `.env.live`). `main.jsx` tests the raw env literal so the entire mock layer — handlers, seeds, faker — is dropped from a live build by dead-code elimination, not merely left unused. The UI code is identical in both modes.
- **In-memory collection store** (`src/mocks/db/store.js`): plain arrays per collection with `insert`/`update`/`find` helpers, relations resolved explicitly by the handlers. Chosen over a schema-bound ORM because admin lists filter on computed values — SLA breaches, rolling rates, scope intersections — which are far easier to express as predicates than as ORM queries, and because resolving joins in the handler keeps the response shapes honest about what the real backend has to do. IDs come from one shared counter per prefix, so a record created at runtime can never collide with a seeded one.
- **Deterministic seed** (`faker.seed(2026)`, `en_IN` locale, real Indian city/state/pincode formats, valid-format GSTIN/PAN/IFSC):

  | Entity | Seed volume |
  |---|---|
  | Admin users (one per role template) | 14 |
  | Sellers (all lifecycle states represented) | 120 |
  | Categories (3-level tree) | ~250 |
  | Brands | 150 |
  | Products / SKUs (variants) | 1,500 / ~5,000 |
  | Customers | 3,000 |
  | Orders / items | 8,000 / ~12,000 (90 days of history) |
  | Arise warehouses | 4 (e.g. Bhiwandi, Bengaluru, Gurugram, Kolkata) |
  | Courier partners | 5 (placeholder names) |
  | Serviceable pincodes | ~2,000 sample |
  | Tickets, reviews, Q&A, coupons, campaigns, payouts | proportional |

  Product names, brands and images reuse the mobile app's mock data where possible, so both apps tell the same story.
- **Persistence:** DB snapshot to IndexedDB after every mutation (debounced). A **Dev toolbar** (mock mode only) offers: reset demo data, latency (0/300/1500 ms), error injection (%), "fail next request", switch logged-in role, and time travel (advance clock to trigger SLA breaches and payout cycles).
- **Server-side behaviour is simulated faithfully:** pagination, sorting, filtering and search happen in the handlers, never in the UI. State transitions are validated by the same state machines documented in MODULE_SPECS (illegal transition → `409`). The handlers also enforce permissions (`403`) and optimistic concurrency (`version` mismatch → `409 CONFLICT`).
- **Async jobs** (bulk upload, exports, payout batch processing, pincode import) are simulated with a job record whose progress advances over time; the UI polls `/jobs/:id`.
- **Realtime** (new tickets, chat messages, admin alerts) is simulated by polling every 15–30 s. A WebSocket can replace polling in live mode later without UI changes (the hook interface stays the same).
- **Generated contract:** each handler file has a JSDoc header describing request/response, and `docs/API_CONTRACT.md` is updated per module. This becomes the backend team's spec.

---

## 7. API conventions (contract for the future backend)

- Base path: `/api/admin/v1`
- **List endpoints:** `GET /orders?page=1&pageSize=25&sort=-placedAt&q=…&status=SHIPPED,DELIVERED&placedAt[gte]=…&placedAt[lte]=…`
  Response: `{ data: [...], meta: { page, pageSize, total, facets?: { status: { SHIPPED: 120, … } } } }`. The status facet counts drive the tab badges on list pages.
- **Detail:** `GET /orders/:id` returns `{ data: {...}, meta: { allowedActions: ['CANCEL_ITEM','ISSUE_REFUND', …] } }`.
  **The UI renders action buttons from `allowedActions`** (server truth: state machine × permission), not from client-side guesses.
- **Commands** are explicit verbs, not generic PATCHes, for anything state-changing: `POST /sellers/:id/approve`, `POST /order-items/:id/cancel`, `POST /payout-batches/:id/approve`.
  Every command body includes `reason` where applicable, plus an `Idempotency-Key` header for any money movement.
- **Errors:** `{ error: { code: 'VALIDATION_FAILED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'RATE_LIMITED' | …, message, fieldErrors?: { field: msg } } }`. Field errors map automatically onto AntD Form fields.
- **Concurrency:** mutable entities carry `version`. A stale update returns `409` and the UI shows a "This record was changed by X at T. Reload / Compare" dialog.
- **Money:** integer paise plus `currency: 'INR'`. **Time:** ISO-8601 UTC, rendered in IST.
- **Exports:** `POST /exports {entity, filters, columns, format}` returns a job; the file is downloaded from the Export Center.
- **Auth:** in live mode, access token in memory plus refresh token in an httpOnly cookie. `401` triggers a single-flight refresh, then a retry.

---

## 8. Design system & theming

### 8.1 Tokens (derived from `Ecommerce/src/constants/colors.js`)

| Token | Light | Dark | Source |
|---|---|---|---|
| `colorPrimary` | `#2874F0` | `#4C8DF6` (lifted for contrast) | app `primary` |
| `colorPrimaryHover/Active` | `#1B5FC7` | `#6FA3F8` | app `primaryDark` |
| `colorSuccess` | `#26A541` | `#3DBE5A` | app `success` / `ratingGreen` |
| `colorWarning` | `#FFA41C` | `#FFB547` | app `warning` |
| `colorError` | `#FF6161` (UI accents) / `#CC0C39` (destructive buttons, text, AA-safe) | `#FF7A7A` | app `error` / `offerRed` |
| `colorText` | `#212121` | `#E8EAED` | app `textPrimary` |
| `colorTextSecondary` | `#878787` → darkened to `#6B6B6B` for AA on white | `#A0A4AB` | app `textSecondary` |
| `colorBgLayout` | `#F1F3F6` | `#0F1115` | app `mutedBg` |
| `colorBgContainer` | `#FFFFFF` | `#181B21` | app `surface` |
| `colorBorder` | `#E0E0E0` | `#2A2E36` | app `border` |
| Accent (highlights, "Assured", CTA chips) | `#FFC200` | `#FFC200` | app `ctaYellow` |
| Campaign gradient (login hero, empty states) | `#F5443A → #FF8A3D` | same, at 85% opacity | app campaign gradient |

- Font: the app uses the system font. The admin panel uses the same **system font stack** (`-apple-system, Segoe UI, Roboto, …`) with **tabular numbers** for tables and money. If Arise has a brand font, it's a one-token swap.
- Type scale mirrors the app: 12 (caption), 14 (body, table), 16 (section), 20 (page title), 24/30 (KPI numbers).
- Spacing 4-pt grid; border radius 6 (inputs/buttons), 8 (cards); table density default `middle`, user-switchable.
- Dark mode: AntD `theme.darkAlgorithm` plus the overrides above. Preference = `system | light | dark`, persisted per admin user. Charts, status tags, images (dimmed borders) and print views (always light) are all theme-aware.
- **Status color semantics** (single source in `statusMaps.js`): blue = in progress, gold = needs action/waiting, green = success/terminal good, red = failed/blocked/terminal bad, grey = draft/inactive, purple = under review/escalated.

### 8.2 Responsive rules (desktop-first)

| Breakpoint | Layout behaviour |
|---|---|
| ≥ 1600 (xxl) | Detail pages use 3 columns (main + side panels); tables show all default columns |
| 1200–1599 (xl) | Default design target |
| 992–1199 (lg) | Sidebar collapses to icons; detail side panels move below main content |
| 768–991 (md, tablet) | Sidebar becomes an overlay drawer; filters move into a "Filters" drawer; low-priority columns hide (each column declares `priority`) |
| < 768 (sm/xs, phone) | **DataTable renders as a card list** (each module defines a `mobileCard` renderer); sticky bottom action bar on detail pages; multi-step forms become full-screen steps; charts become swipeable |

All flows must be usable on a phone (e.g. approving a refund or replying to a ticket on the go). Heavy authoring flows (home layout builder, bulk upload mapping) are fully functional on tablets and up; on phones they open read-only with a "Use a larger screen to edit" notice.

---

## 9. App shell & navigation

**Header:** logo + env badge (`MOCK` / `STAGING`), **global search** (`Ctrl/⌘ K`), quick-create menu (permission-aware), approvals inbox badge (maker-checker), alerts bell, theme toggle, help, and profile menu (my profile, sessions, change password, logout).

**Global search (command palette):** typed prefixes and auto-detection:
- `ORD-…` → order · `AWB` pattern → shipment · 10-digit mobile / email → customer · `GSTIN` / seller name → seller · SKU / product name → product · `TKT-…` → ticket · `PAY-…` → payout · `CPN code` → coupon
- Also: navigate to any page ("go to payouts") and recent items.

**Sidebar** (groups, order and items filtered by permissions; collapsible; remembers state):

| Group | Items |
|---|---|
| — | Dashboard |
| Orders | All Orders · Cancellations · Returns & Replacements · Order Exceptions |
| Catalog | Products · Listing QC Queue · Categories · Attributes · Brands · Size Charts · Bulk Uploads · HSN & Tax Codes |
| Sellers | All Sellers · Onboarding Applications · Brand Approvals · Performance & SLA · Penalties · Seller Claims |
| Customers | All Customers · Privacy Requests · Fraud & Risk |
| Inventory & Warehouses | Warehouses · Inbound Shipments · Inventory · Stock Adjustments · Removal Orders |
| Logistics | Shipments · Pickups & Manifests · NDR · RTO · Courier Partners · Pincode Serviceability · Weight Disputes · Shipping Rules |
| Finance | Payments · Refunds · Seller Payouts · Commission & Fees · Tax (TCS/TDS) · Invoices · COD Remittance · Reconciliation |
| Wallet & Gift Cards | Wallet Accounts · Wallet Ledger · Gift Cards · Cashback Rules |
| Marketing | Coupons · Deals · Flash Sales · Sale Events · Referral Program · Campaigns · Customer Segments · Bank Offer Display |
| Sponsored Ads | Campaigns · Ad Review Queue · Placements & Pricing · Advertiser Billing · Ads Reports |
| Content (CMS) | Home Layout · Banners · Category Tabs & Brand Tabs · Brand Spotlight · Onboarding Slides · Help Center · Static Pages · Reason Masters · Search Config |
| Reviews & Q&A | Reviews · Questions & Answers · Abuse Reports |
| Support | Ticket Queues · Live Chat Console · Macros · SLA Policies · CSAT |
| Reports | Analytics Dashboards · Report Library · Scheduled Reports · Export Center |
| Notifications | Transactional Templates · Delivery Logs |
| Administration | Admin Users · Roles & Permissions · Approvals (Maker-Checker) · Audit Log · Platform Settings · App Config · Integrations |

**Page anatomy:** breadcrumbs → page header (title, status tag, key meta, primary/secondary actions, overflow menu) → optional tabs → content. Detail pages use the **"entity 360" layout**: main column (tabs) + right rail (summary cards, linked entities, timeline).

**Entity quick-view drawers:** clicking any linked entity (customer name in an order, seller in a product, etc.) opens a drawer preview with "Open full page", so users don't lose list context.

**Error pages:** 403 (shows which permission is missing and "Request access"), 404, 500 (with request ID), offline banner, maintenance.

---

## 10. Shared component library

Built in Phase 0, used everywhere. Each component has stories and examples in a `/dev/components` route (mock mode only).

| Component | Responsibility |
|---|---|
| `DataTable` | Server-side pagination/sort/filter; URL-synced state (shareable links); column chooser, reorder and pin; density; **saved views** (per user, optionally shared with role); row selection + **bulk action bar** (with permission and "select all N matching"); export (current filters); sticky header; virtual mode; skeleton loading; empty/error states; mobile card mode; status tab bar fed by API facets |
| `FilterBar` | Declarative filter schema: text, select, multi-select, async entity select, date-range with presets (Today, Yesterday, Last 7/30 days, This month, Custom), number range, boolean. Chips summarise active filters; "Clear all". |
| `PageHeader`, `Breadcrumbs` | From route meta |
| `StatusTag` | `status` + `domain` → label/color from `statusMaps` |
| `MoneyText`, `MoneyInput` | Indian grouping (`₹1,23,456.00`), paise-based, negative/credit styling |
| `DateText` | IST, relative ("2h ago") with exact time on hover |
| `StatCard`, `KpiRow`, `ChartCard` | KPI with delta vs previous period, sparkline, drill-through link |
| `Timeline` / `ActivityFeed` | Entity event history with actor (admin/seller/customer/system), timestamp and payload diff |
| `AuditDrawer` | "History" for any entity: field-level before → after |
| `ConfirmActionModal` | Reason select (from Reason Masters) + note; impact summary ("This refunds ₹1,304 to UPI"); typed confirmation for destructive/high-value actions; maker-checker hand-off when required |
| `ApprovalBanner` | Shows a pending maker-checker request on an entity |
| `DocumentViewer` | KYC/invoice viewer: zoom, rotate, page through PDFs/images, side-by-side compare, approve/reject per document |
| `ImageUploader` | Multi-image, drag-reorder, crop to required aspect, min resolution/size checks, alt text, primary image |
| `RichTextEditor` | TipTap with a constrained toolbar; output sanitised |
| `ImportWizard` | Template download → upload → column mapping → validation preview (row-level errors) → commit → job progress → result report download |
| `ExportCenter` | List of export jobs with status, expiry and download |
| `EntitySelect` | Async searchable select for sellers/products/categories/customers/brands |
| `CategoryTreeSelect` | Lazy-loading 3-level category tree |
| `RuleBuilder` | AND/OR condition builder (segments, coupon applicability, commission rules) |
| `ScheduleField` | Start/end (IST), recurrence for campaigns |
| `MaskedValue` | PII masking (`98•••••210`); "Reveal" requires `pii.view`, is logged to the audit log and auto-hides after 30 s |
| `CopyableId` | Monospace ID with copy |
| `Can` / `PermissionGate` | Hides or disables UI by permission; disabled buttons explain why in a tooltip |
| `EmptyState`, `ErrorState`, `NoAccess` | Consistent placeholders with next-step CTA |
| `PrintLayout` components | Invoice, shipping label (barcode), manifest, GRN, payout statement |

---

## 11. Authentication & session

Flows (all in `AuthLayout`, responsive, light/dark):

1. **Login:** email + password → generic error message (no user enumeration) → after 5 failures the account locks for 15 minutes (message shown) and Super Admin can unlock.
2. **Two-factor (mandatory for all admins):**
   - First login → enrol TOTP (QR + manual key) → verify → show 10 backup codes (download/copy, must acknowledge).
   - Subsequent logins → 6-digit TOTP or a backup code. "Trust this device for 7 days" option.
3. **First-login password change** for invited users; password policy (12+ chars, complexity, not in the last 5).
4. **Forgot password:** email → reset link (mock shows the link in the dev toolbar) → set new password → all sessions revoked.
5. **Invite acceptance:** link → set name and password → 2FA enrolment → land on a role-appropriate dashboard.
6. **Session management:**
   - Access token refresh is invisible to the user.
   - Idle timeout after 30 minutes (configurable): a warning modal at 28 minutes with a countdown and "Stay signed in".
   - Absolute session lifetime 12 hours.
   - The "My sessions" page lists device, IP, location and last active, with a revoke option.
   - Super Admin can force-logout any user.
7. **Post-login landing:** last visited page (deep links survive login) or the role's default dashboard.

---

## 12. RBAC, data scoping & maker-checker

### 12.1 Permission model
- **Permission key:** `<module>.<resource>.<action>`, e.g. `orders.order.view`, `orders.item.cancel`, `finance.refund.issue`, `finance.payout.approve`, `catalog.product.approve`, `customers.pii.view`.
- **Standard actions:** `view`, `create`, `edit`, `delete`, `export`, plus **domain actions** (`approve`, `reject`, `cancel`, `issue`, `release`, `hold`, `impersonate_view`, `bulk_*`).
- The full permission catalog lives in `core/rbac/permissionCatalog.js` (single source for the UI matrix, route guards and mock enforcement).

### 12.2 Roles screen (Administration → Roles & Permissions)
- **Roles list:** name, description, user count, system/custom, last modified.
- **Role editor:**
  - Permission matrix: rows grouped by module → resource; columns = actions; tri-state module checkbox; search permissions; "Compare with role…"; dependency auto-select (e.g. `edit` implies `view`).
  - **Data scope** section (§12.3).
  - **Diff preview** before save, then audit.
- System roles are immutable; you clone them to customise.
- **Role templates seeded:** Super Admin · Operations Manager · Catalog Manager · Category Manager (scoped) · Seller Onboarding Executive · Seller Account Manager (scoped) · Finance Executive · Finance Approver · Customer Support Agent · Support Lead · Marketing Manager · Warehouse Manager (scoped) · Logistics Manager · Ads Manager · Auditor (read-only, no PII).

### 12.3 Data scoping
Scope dimensions attached to a user's role assignment:
- **Categories:** Category Manager sees and approves only listings in assigned categories.
- **Sellers:** Account Manager sees only assigned sellers.
- **Warehouses:** Warehouse Manager.
- **Ticket queues:** Support Agent/Lead.
- **Monetary limits:** e.g. refund up to ₹5,000 without approval; manual wallet credit up to ₹1,000.

Scopes are enforced by mock handlers (filtered lists, `403` on direct access) and reflected in the UI (filters pre-applied and locked).

### 12.4 Maker-checker (four-eyes) approvals
Actions that create an **approval request** instead of executing immediately (thresholds configurable in Settings):

| Action | Default rule |
|---|---|
| Refund above user's limit / goodwill refund | Always for goodwill; above limit for others |
| Manual wallet credit/debit | Above ₹1,000 |
| Payout batch release | Always |
| Payout hold/release for a single seller | Always |
| Commission/fee rule change | Always |
| Seller suspension/blacklist | Always |
| Bulk price/stock override across sellers | Always |
| Role permission changes | Always (Super Admin approver) |
| Gift card batch generation | Above ₹1,00,000 total value |

Approvals inbox:
- **Tabs:** Pending my approval · Raised by me · All (permission-gated).
- Each request shows the requester, action, entity link, a **before/after diff or monetary impact**, reason, and attachments.
- Approve or reject (rejection needs a reason). The requester cannot approve their own request.
- Requests expire after 72 hours. Requester and approver are notified.

### 12.5 Audit log
- Every mutation and every PII reveal is logged.
- Filters: actor, module, entity, action, date range, IP.
- Each entry is immutable and shows a field-level diff. Exportable (permission).
- Each entity page has a "History" drawer showing its own slice of the log.

---

## 13. Cross-cutting UX standards (Definition of Done)

A screen or flow is **done** only when it meets every item below.

1. **Every state handled:** initial skeleton, empty (with CTA), no results for filters ("Clear filters"), error (retry + request ID), partial failure in bulk actions (per-row result list), no permission, and record not found.
2. **Lists:** server-side pagination/sort/filter, URL-synced, status tabs with counts, saved views, column chooser, export, bulk actions where meaningful, mobile card layout.
3. **Mutations:**
   - Confirmation for consequential actions; a reason is captured where the domain requires one.
   - Optimistic UI only for safe toggles; money and state transitions wait for the server.
   - Success toast with "View"/"Undo" where reversible.
   - Audit entry written; related queries invalidated; `409` conflicts handled.
4. **Forms:**
   - Inline validation (zod/AntD rules); server field errors mapped onto fields.
   - Dirty-state guard on navigation ("Discard changes?").
   - Long forms are sectioned with an anchor nav; multi-step wizards have draft autosave.
   - Keyboard submit; disabled-while-submitting.
5. **Actions come from `allowedActions` + permissions.** Unavailable actions are hidden, or disabled with an explanatory tooltip when users need to know they exist.
6. **Formatting:** money in INR with Indian grouping; dates in IST; phone/email masked unless `pii.view`; IDs copyable.
7. **Responsive** at every breakpoint in §8.2. **Dark mode** verified. **Keyboard navigable**, with focus visible.
8. **Deep-linkable:** every detail page, tab and filtered list has a stable URL.
9. **Tests:** unit tests for utilities/state maps, component tests for complex widgets, an E2E test for the module's golden flow.

---

## 14. Security, performance, accessibility

**Security (frontend responsibilities):**
- No tokens in localStorage in live mode.
- CSRF protection via SameSite cookies and a header token.
- All rich text is sanitised (DOMPurify).
- No `dangerouslySetInnerHTML` except through the sanitiser.
- PII masking with audited reveal; clipboard copy of PII is also audited.
- Downloads use short-lived signed URLs.
- Session idle timeout.
- Content-Security-Policy compatible build (no inline scripts).
- Watermark overlay (admin email + timestamp) on the KYC document viewer and PII export previews to deter screenshots leaking.
- Rate-limit feedback (`429` handling).
- Dependency audit in CI.

**Performance budgets** (measured at the end of Phase 0, live build):
- **Initial JS ≤ 280 KB gzip** for the shell. Measured: 266 KB. Ant Design's own
  baseline — its cssinjs theme engine plus the components the shell itself uses
  (Layout, Menu, Dropdown, Modal, Table) — accounts for most of it, so the
  original 250 KB target was not reachable without dropping the component
  library. Revisit only if the shell gets heavier, by moving more of it behind
  routes rather than by swapping libraries.
- Each module chunk < 150 KB gzip. Measured: largest page chunk is 12 KB.
- Charts (394 KB raw / 108 KB gzip) are a separate chunk, loaded only with the
  dashboard and the analytics pages.
- The mock backend (≈ 844 KB raw) must not appear in a live build at all —
  asserted by inspecting `dist/` after `npm run build`.
- LCP < 2.5 s on mid-range laptop / 4G.
- Lists of 25–100 rows render < 100 ms; virtual mode above 200 rows.
- Techniques:
  - Route-level `lazy()` and AntD tree-shaking.
  - Prefetch detail data on row hover.
  - Debounced search (300 ms).
  - `keepPreviousData` for pagination.
  - Images via thumbnails.
  - Charts lazy-loaded below the fold.

**Accessibility:**
- WCAG 2.1 AA contrast in both themes; tokens are adjusted where the app palette fails AA, as noted in §8.1.
- Full keyboard operation; ARIA labels on icon buttons.
- Status is never conveyed by color alone (always label + icon).
- Reduced-motion respected.

---

## 15. Testing strategy

| Layer | Tooling | Coverage target |
|---|---|---|
| Utils, state maps, permission logic, money/date formatting | Vitest | 90%+ |
| Shared components (DataTable, FilterBar, ImportWizard, RuleBuilder, ConfirmActionModal) | Vitest + RTL | Behavioural tests per prop/state |
| Mock state machines | Vitest | Every legal/illegal transition |
| E2E golden flows | Playwright (MSW mode, seeded DB reset per test) | One per module, plus cross-module journeys |

**Cross-module E2E journeys** (the "end to end" proof):
1. Seller applies → KYC approved → lists product → QC approved → product live.
2. Order placed (seeded) → seller ships → NDR → reattempt → delivered → return → QC pass → refund to wallet → wallet ledger updated → payout statement reflects the reversal.
3. Fulfilled-by-Arise: inbound consignment → GRN with discrepancy → stock live → order → warehouse ships.
4. Payout cycle: eligible settlements → batch created (maker) → approved (checker) → partial failure → retry → paid.
5. Coupon created → appears as applicable to a seeded cart → usage reflected in coupon report.
6. Ticket raised → agent replies with macro → escalated to seller-ops → resolved → CSAT recorded.
7. Ads: campaign submitted → policy review → active → budget exhausted → auto-paused → advertiser invoice generated.
8. RBAC: a Category Manager cannot see out-of-scope listings; a Finance Executive's refund above limit creates an approval request.

---

## 16. Phased roadmap

Each phase ends with a demo of its golden flows passing E2E. Phases 1+ can be parallelised across developers once Phase 0 is done.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Foundation** | Scaffold, tooling, theme tokens (light/dark), AppLayout + responsive sidebar, router with route meta & guards, auth + 2FA + session (mock), RBAC core + Roles/Admin Users screens, Audit log, Approvals inbox shell, MSW infra (DB, seed, persistence, dev toolbar, job simulator), full shared component library (§10), global search shell, error pages | Login as any of 14 role users; nav reflects permissions; DataTable demo with 10k mocked rows is smooth; dark mode + mobile pass |
| **1 — Supply side** ✅ | M4 Sellers (onboarding → KYC → active, seller 360, brand approvals, penalties, claims, performance), M3 Catalog (categories, attributes, brands, size charts, HSN, products with per-seller offers and buy box, QC queue) | Journey 1 green. **Bulk upload (M3.10) and buy-box & badge rules (M3.9) deferred to Phase 8** — the former needs the ImportWizard component, the latter nothing Journey 1 depends on; both delivered in Phase 8's catch-up work alongside that phase's own scope. |
| **2 — Demand side** ✅ | M2 Orders (list, 360 detail, cancellations, returns/replacements, exceptions), M5 Customers (360, block, fraud flags, privacy requests) | Order lifecycle actions complete from admin. **Seeded at 1,500 orders rather than 8,000** — the whole database is snapshotted to IndexedDB after every mutation, and 8,000 made that write slow enough to feel. 1,500 still exercises pagination, facets and every filter. |
| **3 — Fulfilment** ✅ | M7 Logistics (couriers, pincodes, shipments, pickups/manifests, NDR, RTO, weight disputes, shipping rules), M6 Warehouses (warehouses, inbound/GRN, inventory, adjustments, removal orders) | Journeys 2 and 3 green. Pincode serviceability seeded at ~720 rows across 18 representative prefixes rather than the full ~2,000, for the same snapshot-size reason as the order volume. |
| **4 — Money** ✅ | M8 Finance (payments, refunds, commission & fees, payouts, TCS/TDS, invoices, COD remittance, reconciliation), M9 Wallet & Gift cards | Journeys 2 (full) and 4 green. Settlement arithmetic is a pure, separately tested module (`src/mocks/engine/settlement.js`) so the payout screens, the fee preview and the batch builder can never disagree about what a seller is owed. Rate cards are seeded with plausible Indian marketplace figures — **the real ones are still open item 5** below. |
| **5 — Growth & content** ✅ | M10 Marketing (coupons, deals, flash sales, sale events, referral, campaigns, segments, bank-offer display), M12 CMS (home builder, banners, tabs, onboarding, help center, static pages, reasons, search config), M16 Templates | Journey 5 green; home layout publishes a JSON the app can consume. Segment matching, coupon applicability and the home layout's app-consumable JSON are each a pure, separately tested function, the same pattern Phase 4 used for settlement — so the coupon wizard's "test against a cart" tool can never disagree with what the usage report later shows. |
| **6 — Trust & care** ✅ | M13 Reviews & Q&A, M14 Support desk + live chat console + macros + SLA + CSAT | Journey 6 green: a ticket raised → agent replies with a macro → escalated to seller-ops → resolved → CSAT recorded. Review auto-moderation and the ticket state machine are each pure, separately tested functions, the same pattern every earlier phase has used for its own correctness-critical logic. |
| **7 — Ads** ✅ | M11 Sponsored Ads (campaigns, ad review queue, placements & pricing, advertiser billing & invoices, invalid traffic, reports) | Journey 7 green: a campaign is created → submitted → passes policy review → active → spend accrues until the budget is exhausted → auto-paused → the advertiser's invoice is generated with GST. The second-price auction and the campaign review checks are each a pure, separately tested function (`src/mocks/engine/ads.js`), the same pattern every earlier phase has used. |
| **8 — Insight & hardening** ✅ | M1 Dashboard (top categories/sellers/products, system alerts feed), M15 Reports (nine live analytics domains, report library, scheduled reports, Export Center), M17 Settings (platform settings, app config + feature flags, integrations), plus catch-up work deferred from Phase 1: M3.9 Buy-box & badge rules and M3.10 Bulk Uploads | Journey 8 green: a Category Manager's product list never shows an out-of-scope listing, and a Finance Executive's refund above their limit is sent for approval rather than applied unilaterally — both already-built RBAC guarantees, now proven together as this phase's journey. **Per-user widget hiding/reordering and a finalised `docs/API_CONTRACT.md` are deliberately cut** — see the decisions below. |

The Dashboard ships a minimal version in Phase 0 and gains widgets as each module lands.

---

### 16.1 Phase 4 decisions worth recording

| Decision | Why |
|---|---|
| Releasing a payout batch is **two separate people plus an approval**: the maker builds it, a second person requests the release (needs `finance.payout.release`), and a third seconds it in the approvals inbox (needs `finance.payout.approve`). | A batch moves lakhs of rupees irreversibly. Both permissions existed in the catalog but nothing consulted `approve`; splitting request from decision gives each one a job and makes the inbox the record of who agreed. |
| A **negative payout is carried forward**, never collected. | Our fees can exceed a cheap item's sale price. Debiting a seller's bank account is not something a marketplace can do, so the balance waits for their next settlement — and the UI says so rather than showing a confusing minus sign. |
| Settlement eligibility is **recomputed**, never toggled. | Releasing a payout hold previously risked releasing lines held for an entirely different reason (an open return, an unexpired return window). Eligibility is derived from the item every time it is asked. |
| Wallet balances are **derived from the ledger**, with a totally ordered ledger (timestamp, then id). | A balance that disagrees with its own entries is unauditable. The ordering matters because two entries in the same second would otherwise make "latest balance" depend on sort stability. |
| Gift card codes are **never returned by the API** — only the last four digits. | A gift card is a bearer instrument: whoever can read the code can spend it, including anyone with access to a log or a screenshot. |
| Unbuilt nav items get a placeholder based on **what is implemented**, not on the phase number. | Two Phase 1 screens were deferred. The generator only covered *future* phases, so once the marker moved past Phase 1 their sidebar links 404ed. They are now marked `deferred` in the nav model and a test pins both halves. |
| Tax invoices are **superseded, never edited**. | A GST invoice is a statutory document. The original stays on record with a supersede reason and a new number is issued, so the return for the period still reconciles. |

### 16.2 Phase 5 decisions worth recording

| Decision | Why |
|---|---|
| Reordering (flash-sale curation, onboarding slides, category tabs, home layout sections) is **up/down buttons, not drag-and-drop**. | dnd-kit is an installed dependency but pointer-drag interactions cannot be driven or verified without a real browser in this environment. Up/down buttons give the identical end state and are fully covered by the render-test suite; drag can replace them later as a pure UI swap, since the server-side reorder calls already take an ordered id list. |
| A home layout section's `config` is edited as **raw JSON**, not a bespoke form per section type. | Ten section shapes (carousel, tile row, product feed, sponsored rail, …) each getting a dedicated visual editor is a large amount of UI for an audience (the marketing team editing their own home page) that can read JSON. Visibility, scheduling, reordering and show/hide — the fields every section shares — do have real controls. |
| Banner and onboarding-slide images are a **URL field, not an upload**. | There is no real asset store behind this mock; every other image in the catalog (product photos, seller logos) is already just a string for the same reason. A production build wires `ImageUploader` to real storage and swaps the field. |
| Static page bodies are a **plain textarea, not rich text**. | TipTap was never wired into this panel (deferred since Phase 0 planning), and these pages are policy prose rather than laid-out marketing copy — a textarea loses nothing a customer would notice. |
| A deal references a **product**, and resolves to its current buy-box (or first live) offer, rather than picking one seller's offer directly. | One product can carry several sellers' offers; the buy-box winner is the price a customer actually sees, so that is what a "deal" should discount from. There is no dedicated offer picker in this phase. |
| The RuleBuilder is **one flat AND/OR group**, not nested groups. | The segment-matching engine (`mocks/engine/segments.js`) supports nesting for the future, but every segment the spec actually describes — "high value," "inactive 30 days," "Mumbai shoppers" — is a flat list, and a flat builder reads back without parsing parentheses. |
| Sale-event readiness (seller participation %, inventory coverage %) is **seeded, not derived** from live order and stock data. | Wiring a true rollup needs the event to know which sellers and SKUs it is supposed to cover, which the spec leaves to a seller-nomination flow this phase does not build. The checklist and its four flags are real and computed from what the event does store. |
| Referral fraud review (`FRAUD_REVIEW`) is a **seeded starting state**, not a live same-device/same-payment-instrument detector. | The decide action (approve/reject with a reason) is real and tested; what triggers the hold in production is a fraud-signals pipeline outside this phase's scope. |

### 16.3 Phase 6 decisions worth recording

| Decision | Why |
|---|---|
| Resolving a ticket directly from `PENDING_INTERNAL` is **refused** (409) — it has to pass back through `OPEN` first. | Matches the spec's own transition diagram literally: `PENDING_INTERNAL ─▶ OPEN` only. It also means an agent cannot mark a ticket resolved while seller-ops still privately owns it. |
| Inline order actions on the ticket workspace (cancel, refund, reschedule, resend invoice) are **links out to the order detail page**, not re-implemented in the ticket handler. | Those flows already exist, are tested, and move real money or stock. A second copy of "issue a refund" living in the tickets handler is exactly the kind of divergent duplicate this project has avoided everywhere else (coupons, segments, settlement). |
| The live chat "typing indicator" and real-time updates are **polling**, not a websocket. | There is no realtime transport in a mock backend. Polling at a few seconds is the honest substitute and is what the waiting-queue and active-chat screens actually use. |
| CSAT submission (`POST /tickets/:id/csat`) is the **one deliberately unauthenticated admin-API endpoint** in the whole project. | It is submitted by the customer from the app after a resolve, not by an admin — there is no separate customer-facing mock API in this project, so borrowing an admin session for a submission admins never make would be the more dishonest choice. |
| Reason masters (built in Phase 5) are still **not** consulted by the ticket subject list or the cancel/return reason pickers. | Carried over from the Phase 5 note: retrofitting Phase 2/3/6 code to read from `reasonLists` is a real, larger change left for deliberate follow-up rather than done partially under this phase's scope. |

### 16.4 Phase 7 decisions worth recording

| Decision | Why |
|---|---|
| Changing a placement's **floor CPC** is maker-checker; `ads_manager` is the maker and `super_admin` is the universal approver. | Only one specialist role exists for Sponsored Ads, and self-approval is blocked everywhere in this project. This is the exact precedent Phase 4 set for `finance_approver`/`super_admin` on commission edits — a lone specialist role still needs a second, independent approver. |
| **`record-spend` is what drives the advertiser wallet**, not a separate billing job. | Every call that logs impressions/clicks/spend against a campaign also debits the advertiser's wallet and writes a ledger `SPEND` row in the same handler. A prepaid wallet that hits zero auto-pauses the campaign with `WALLET_EMPTY`; invoice generation simply sums that same ledger. Splitting spend-recording from billing would let the two drift, which is exactly the "divergent duplicate" this project avoids everywhere else. |
| Campaign ad ranking is a **second-price auction with a quality-score blend** (relevance × CTR), not highest-bid-wins. | Matches how real sponsored-listing marketplaces rank and charge: a lower bid can outrank a higher one on quality, and the winner is charged the runner-up's clearing price, never their own full bid. Both properties are directly unit-tested in `ads.js`. |
| A campaign promotes only the **advertiser's own live, in-stock products** — enforced by a seller-scoped product picker (`GET /ads/sellers/:sellerId/products`), not the general product search. | An ad for a delisted or out-of-stock product is exactly what the automated review queue (`reviewCampaign`) flags; scoping the picker at creation time stops most of those findings before they ever reach the queue. |
| **`DEDUCT_FROM_PAYOUT`** advertisers have no wallet balance, no recharge, and no invoice — their ad spend settles through the seller payout cycle from Phase 4 instead. | Two billing rails for the same spend would need constant reconciliation. An advertiser already settled through payouts is simply billed there; only `PREPAID` advertisers get a wallet, a recharge action and a monthly invoice. |

### 16.5 Phase 8 decisions worth recording

| Decision | Why |
|---|---|
| A **second Super Admin account** now exists (`super2@arise.test`). | Platform settings, app-config maintenance mode and integration credential changes are each maker-checker with `admin.*` as both the maker's and the approver's permission — nobody else in the 15-role catalog holds those keys at all. With a single seeded Super Admin, those requests could never be decided by anyone (self-approval is blocked by user id). This is the same gap Phase 7 found for `ads_manager`, except here there was no specialist maker role to pair Super Admin against, so the fix is a second holder of the same role instead — the realistic equivalent of a break-glass second admin. |
| **Analytics dashboards aggregate live from the collections every other module already edits**, not a second invented series. | Phase 0's dashboard series was deliberately synthetic because, at the time, no real orders/finance/tickets existed yet to aggregate (`seedDashboard`'s own comment said so). By Phase 8 they all do, so Reports & Analytics (M15.1) reads real `orders`, `settlementLines`, `tickets`, `campaigns`, and so on — the same principle this project applies everywhere else: one home for a number, never two copies that can disagree. The Dashboard's own KPI row still reads the Phase 0 synthetic series, since changing its data source was a larger, separate refactor outside this phase's "final widgets" scope. |
| **Hourly order heatmaps, a customer cohort-retention grid, and a catalog content-score/QC-TAT metric are cut** from the Analytics Dashboards. | The seed data that would make them meaningful doesn't exist yet: `listingSubmissions` holds only the open QC queue, with no `decidedAt` to compute turnaround from, and a cohort grid needs month-by-month retention tracking this project's customer seed doesn't carry. Every other bullet in M15.1's spec per domain is built and aggregated from real records. |
| **Export Center and the Report Library's "Run" action reuse the Phase 0 job simulator** (`src/mocks/engine/jobs.js`), rather than a new export pipeline. | That infrastructure already existed, explicitly built "for ImportWizard and ExportCenter" per its own Phase 0 comment, and every list's existing "Export" button already creates a `type: 'EXPORT'` job through it. Report Library's "Run" does the same thing a list's export does — there was no reason to build a second job runner. |
| **Platform settings sections are edited through one generic, type-driven field renderer**, not a bespoke form per section. | Ten sections with wildly different shapes (a GSTIN list, a tier-threshold map, a holiday calendar) each getting a hand-built form is a large amount of UI for configuration values that rarely change. The renderer picks the right control from the field's actual type (boolean, number, money-suffixed number, string, string array, flat numeric map); only deeply nested structures (the GSTIN list) fall back to a read-only view, the same kind of scope cut Phase 5 made for the home layout's section `config`. |
| **Approval-threshold settings are informational**, not wired back into the maker-checker engine's own thresholds. | `GUARDED_ACTIONS` in `engine/approvals.js` hardcodes its limits and threshold keys; making the Platform Settings screen actually drive them is a real, larger change — the same kind of deliberate partial cut Phase 5 and 6 each left as a follow-up rather than doing halfway. |
| **`docs/API_CONTRACT.md` is not produced.** | It is a from-scratch specification of every endpoint across 17 modules — a documentation exercise distinct from building working UI against the mock backend, which is what every phase so far has actually delivered. The mock handlers themselves (`src/mocks/handlers/*.js`) are the closest thing to a contract that exists, and remain the source of truth for a future real backend. |
| **Per-user dashboard widget hiding/reordering is not built.** | It is a preferences feature orthogonal to this phase's actual content (top performers, the alerts feed); every widget already respects its own permission gate, which is the access-control half of "role-aware" the spec actually required. |
| **Buy-box ranking and the Arise Assured badge are each one pure, scored function** (`src/mocks/engine/buyBox.js`), replacing the hardcoded "cheapest price minus an Arise credit" rule Phase 1 shipped with. | Phase 1's placeholder rule was never configurable, which is exactly what M3.9 asks for. The new engine scores price, delivery speed, seller rating, fulfilment type and cancellation rate against configurable weights, and is the one function the catalog handler, the seed, and the rules page's own "simulate on product" tool all call — a listing's actual winner can never disagree with what the rules page says it should be. |
| **Bulk Uploads supports price & stock update and offer deactivation, not new-product creation or bulk image/attribute edits.** | Price and stock live on the per-seller `offer`, which this panel has never routed through the revision/QC flow — only product *content* (`PATCH /products/:id`) goes through that. Bulk image-URL and attribute edits are content, so building them in bulk would mean either bypassing that flow (which this project will not do) or building bulk revision review (a larger, separate feature). New-product creation needs a category-driven template and a full creation pipeline that doesn't exist here, since admin-side product creation was never built — sellers list their own products, consistent with the plan's own locked scope that a seller panel is a separate future project. |
| **The `ImportWizard` does real client-side work**: a real CSV template, real parsing of the uploaded file (the `xlsx` library, already an installed dependency since Phase 0), and real row validation before anything reaches the server. | Plan §10 specified this component from the start and it was never built. Faking the upload step (e.g. a button that just pretends a file was read) would make Bulk Uploads a demo rather than a tool, and the library to do it for real was already sitting in `package.json` unused. |

---

## 17. Out of scope / future phases

- **Seller panel** (separate app; can reuse this repo's shared components and theme if later moved to a pnpm workspace).
- **SuperCoins / loyalty**, **Plus membership**, **Play (shoppable video)**.
- Quick commerce (dark stores, riders).
- Full payments wallet (add money / P2P / Scan & Pay).
- Admin-configured bank offers/EMI schemes (they come from the gateway; admin only controls visibility).
- Multi-language admin UI and multi-country support.
- The real backend (this plan produces its API contract).

---

## 18. Open items & mobile-app inconsistencies to resolve

These are **not assumed**. Each needs an owner decision before or during the relevant phase. Until then the admin panel treats them as **configurable values with placeholder seeds**.

| # | Item | Needed by |
|---|---|---|
| 1 | The mobile app's `ORDER_JOURNEY_STEPS` are quick-commerce flavoured ("Shop preparing", "Finding delivery partner", "Delivery partner assigned") and `ORDER_STATUS` has only 6 states. Standard e-commerce needs Ordered → Packed → Shipped → Out for delivery → Delivered, plus return/RTO states. The admin panel uses the full lifecycle in MODULE_SPECS §M2 with a **customer-facing status mapping table** the app should adopt. | Phase 2 |
| 2 | The mobile wallet shows Add Money / Send / Scan & Pay, which conflicts with the "store credit only" decision. The app should remove these. **Phase 4 built the admin side on store credit only**: there is no top-up, no transfer and no cash-out anywhere in the panel, and a wallet can only be funded by a refund, cashback, a gift card or an admin credit. The app's three buttons now have nothing behind them. | Needs an app change |
| 3 | The app's help center references **Plus** and **SuperCoins**, which are future phases. Hide those help topics until launched. | Phase 5 |
| 4 | "Sell on Flipkart" screen naming and a "Myntra Customer" review author in app mock data should be rebranded to Arise. | Any time |
| 5 | Actual commission rate card, fee structure, payout cycle (e.g. T+7 after delivery vs after return window), return windows per category, COD limits, platform fee (app shows ₹5) and free-delivery threshold. These are all configurable screens; real values are needed for realistic seeds. | Phase 4 |
| 6 | Payment gateway and courier partner names (UI is provider-agnostic; seeds use placeholders). | Phase 3/4 |
| 7 | KYC verification providers (GSTIN/PAN/bank penny-drop APIs). The UI shows verification results generically. | Phase 1 |
| 8 | Brand font (currently system font). | Phase 0 (one token) |
| 9 | Customer support channels: email-to-ticket and WhatsApp intake, or app/web only? | Phase 6 |
| 10 | Whether sellers can self-fund coupons and nominate into flash sales from the future seller panel. The admin side supports both; confirm the business intent. | Phase 5 |
