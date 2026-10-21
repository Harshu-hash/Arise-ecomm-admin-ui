# Arise Admin Panel — Module Specifications

> Companion to [ADMIN_PANEL_PLAN.md](./ADMIN_PANEL_PLAN.md). Every screen below must meet the Definition of Done (plan §13): all states, responsive, dark mode, URL-synced lists, server-driven `allowedActions`, audit on every mutation.
>
> **Notation**
> - **Route** is the URL.
> - **Perm** is the permission key(s) required.
> - **List**: columns marked `*` are visible by default; the rest are available in the column chooser. Columns marked `(m)` appear on the mobile card.
> - **⚑ MC** marks an action subject to maker-checker (plan §12.4).
> - State machines use `UPPER_SNAKE` codes. These are the API values; labels and colors live in `statusMaps.js`.

## Contents

- [Core domain model](#core-domain-model)
- [M1 Dashboard](#m1-dashboard)
- [M2 Orders](#m2-orders)
- [M3 Catalog](#m3-catalog)
- [M4 Sellers](#m4-sellers)
- [M5 Customers](#m5-customers)
- [M6 Inventory & Warehouses](#m6-inventory--warehouses)
- [M7 Logistics](#m7-logistics)
- [M8 Finance](#m8-finance)
- [M9 Wallet & Gift Cards](#m9-wallet--gift-cards)
- [M10 Marketing & Promotions](#m10-marketing--promotions)
- [M11 Sponsored Ads](#m11-sponsored-ads)
- [M12 Content (CMS)](#m12-content-cms)
- [M13 Reviews & Q&A](#m13-reviews--qa)
- [M14 Customer Support](#m14-customer-support)
- [M15 Reports & Analytics](#m15-reports--analytics)
- [M16 Notification Templates](#m16-notification-templates)
- [M17 Administration & Settings](#m17-administration--settings)
- [Appendix A — Customer-facing status mapping](#appendix-a--customer-facing-status-mapping)
- [Appendix B — Screen inventory](#appendix-b--screen-inventory)

---

## Core domain model

The mock DB and the future backend share this model. Arrows mean "has many".

```
Category (3-level tree) ─ AttributeSet ─ Attribute ─ AttributeValue
Brand ─ BrandAuthorization (seller ↔ brand)
Product (shared catalog page, e.g. "boAt Airdopes 141")
  └─ Variant / SKU (size × colour, own images, EAN/UPC optional)
       └─ Offer / Listing (seller-specific: price, MRP, stock, SLA, fulfillment type)
            └─ Inventory (per warehouse for Fulfilled-by-Arise; per pickup address for seller-fulfilled)
       Buy-box winner = one Offer per Variant chosen by buy-box rules (M3.9)
Seller ─ PickupAddress ─ BankAccount ─ KycDocument ─ SellerTier ─ Penalty ─ Claim
Customer ─ Address ─ Device ─ WalletAccount ─ Referral
Order (checkout; ORD-)
  └─ Shipment (one per seller × fulfillment node; SHP-, has AWB)
       └─ OrderItem (unit-level line; ITM-)  ← cancellations, returns and refunds act on items
  └─ Payment (PAY-TXN-) ─ Refund (RFD-)
ReturnRequest (RET-) ─ ReturnShipment ─ QcResult ─ Replacement (new Shipment)
Settlement line (per item) → PayoutBatch (PYB-) → SellerPayout (PYO-)
Warehouse ─ InboundConsignment (INB-) ─ GRN ─ StockAdjustment ─ RemovalOrder
Courier ─ PincodeServiceability ─ RateCard ─ NDR ─ WeightDispute
Coupon / Deal / FlashSale / SaleEvent / Campaign / Segment
AdCampaign ─ AdGroup ─ AdPlacement ─ AdvertiserBilling
Ticket (TKT-) ─ Message ─ SLA ─ CSAT; ChatSession
Review / Question / Answer / AbuseReport
CmsPage / HomeLayout / Banner / HelpArticle / ReasonMaster
AdminUser ─ Role ─ Permission ─ Scope ; ApprovalRequest ; AuditEvent ; ExportJob ; ImportJob
```

ID prefixes are human-readable and searchable globally (plan §9).

---

## M1 Dashboard

**Route** `/` · **Perm** `dashboard.view` (widgets individually permission-gated)

**Layout:** date-range selector (Today default; presets; compare to previous period / same day last week) · city/state filter · category filter · fulfillment type filter.

**Widgets:**
1. **KPI row:** each shows the value, Δ% vs the comparison period, and a sparkline. Clicking a KPI drills into a pre-filtered list or report.
   - GMV
   - Net revenue (commission + fees + ads)
   - Orders
   - Units
   - AOV
   - New customers
   - Cancellation % (customer/seller/system split)
   - Return %
   - Active sellers
   - Live listings
2. **GMV & orders trend:** line chart (hourly for Today, daily otherwise), comparison overlay.
3. **Order funnel by status:** Placed → Accepted → Packed → Shipped → Delivered, with SLA-breached counts.
4. **Top categories / top sellers / top products:** tabs, with GMV and units.
5. **Geography:** top states/cities by orders (table; heat-map list on mobile).
6. **Payment mix:** UPI / cards / netbanking / wallet / COD, with success rate per method.
7. **Action Center** (the most important widget). Counts with a link to the pre-filtered queue; red when SLA-breached:
   - Seller applications pending review
   - Listings in QC
   - Brand approvals pending
   - Orders not accepted past SLA
   - Not dispatched past SLA
   - NDRs awaiting action
   - Returns awaiting QC
   - Failed refunds
   - Payout batches awaiting approval
   - Approvals pending me
   - Tickets breaching SLA
   - Ad campaigns pending review
   - Low-stock FBA SKUs
   - Weight disputes open
   - Privacy requests due
8. **Alerts feed:** system alerts such as a payment gateway success-rate drop, a courier pickup failure spike, or a seller cancellation spike.

**Role-aware defaults:**
- Finance: GMV, refunds, payouts and reconciliation widgets.
- Support: ticket and SLA widgets.
- Catalog: QC and listing widgets.
- Users can hide or reorder widgets (saved per user).

**States:** a per-widget skeleton and a per-widget error with retry (one failing widget never blanks the page).

**As built (Phase 8).** The KPI row, trend chart, order funnel, action
center, payment mix and top-states widgets shipped from Phase 0 onward as
each module landed. Phase 8 added the top categories/sellers/products
widget (a Segmented-toggled table, computed live from real order items for
the selected date range) and the alerts feed (unread badge, mark-as-read,
links into the pre-filtered list the alert concerns). Role-aware
permission gating on every widget is built. **Not built:** per-user
widget hiding/reordering — see the plan's Phase 8 decisions.

---

## M2 Orders

Permissions: `orders.order.view|export`, `orders.item.cancel`, `orders.item.return_initiate`, `orders.address.edit`, `orders.order.hold|release`, `orders.note.create`, plus finance perms for refunds.

### Order item state machine

```
PAYMENT_PENDING ──pay ok / COD confirmed──▶ PLACED ──risk rule──▶ ON_HOLD ──release──▶ PLACED
      │ timeout 30m                          │                       └──reject──▶ CANCELLED
      ▼                                      ▼
PAYMENT_FAILED (auto-closed)          ACCEPTED (seller accepts; auto for Fulfilled-by-Arise)
                                             ▼
                                       PACKED (invoice + label generated, RTD)
                                             ▼
                                       MANIFESTED (pickup scheduled, AWB assigned)
                                             ▼
                                       SHIPPED (picked up) ─▶ IN_TRANSIT ─▶ OUT_FOR_DELIVERY ─▶ DELIVERED
                                                                       │                    │
                                                                       │            UNDELIVERED (NDR) ─reattempt─▶ OUT_FOR_DELIVERY
                                                                       │                    └─RTO decision─▶ RTO_INITIATED ─▶ RTO_IN_TRANSIT ─▶ RTO_DELIVERED
                                                                       └──lost──▶ LOST_IN_TRANSIT (courier claim)
Cancellable from: PLACED, ON_HOLD, ACCEPTED, PACKED, MANIFESTED (before pickup) → CANCELLED
After SHIPPED: a "cancel" becomes an RTO request (customer-refused flow).
DELIVERED → (within return window) RETURN flow (M2.4)
```

**Cancellation actors:** `CUSTOMER`, `SELLER` (penalised), `ADMIN`, `SYSTEM` (payment failed, SLA breach auto-cancel, fraud). The actor and reason are stored on every cancellation.

### M2.1 All Orders — list

**Route** `/orders`

**Status tabs (with counts):** All · Payment Pending · On Hold · To Accept · To Pack · To Ship · In Transit · Delivered · Cancelled · RTO · Returns.

**Columns:**

| Column | Notes |
|---|---|
| Order ID* (m) | Copyable; quick-view drawer on click |
| Placed at* (m) | IST, relative |
| Customer* (m) | Name + masked phone |
| Items* | Count + first item thumbnail/name, "+N more" |
| Sellers* | Single name, or "N sellers" |
| Amount* (m) | Grand total |
| Payment* | Method + status tag (UPI · CAPTURED) |
| Order status* (m) | Aggregate: worst/most-actionable item state |
| Fulfillment* | Seller-fulfilled / Fulfilled-by-Arise / Mixed |
| Ship to | City, State, Pincode |
| Promised delivery | Date; red if breached |
| SLA | Accept/dispatch SLA countdown |
| Channel | Android / iOS / Web |
| Coupon | Code |
| Risk | Score badge + flags |
| Tags | e.g. High value, First order, Gift |

**Filters:**
- Order/AWB/phone/email search
- Date range
- Status (multi)
- Payment method, payment status
- Seller, category, brand
- Fulfillment type, warehouse, courier
- State/city/pincode
- Amount range
- Coupon
- Risk level
- SLA breached (bool)
- Has return, has ticket
- Channel

**Bulk actions:**
- Export
- Put on hold / release ⚑ (with reason)
- Assign to queue/agent (for exception handling)
- Print invoices (eligible only)
- Add tag

Bulk results show a per-row success/failure list.

### M2.2 Order detail (Order 360)

**Route** `/orders/:orderId` · tabs are deep-linkable `?tab=`

**Header:**
- Order ID, placed at, aggregate status, payment status, channel, risk badge, tags.
- Primary actions are driven by `allowedActions`: Cancel items · Initiate return · Issue refund · Put on hold/Release · Change address · Resend invoice · Add note · Create ticket.
- Overflow: Print invoice, Print label, View audit history.

**Main column tabs:**
1. **Items & Shipments** (default): grouped by Shipment card.
   - Shipment card header: seller (link), fulfillment node (warehouse or seller pickup address), courier + AWB (link to M7 shipment), shipment status, promised date, SLA chips.
   - Item rows: image, name, variant, SKU, qty, price, MRP, discount, item status tag, return eligibility ("Return until 24 Oct"), per-item actions (Cancel, Initiate return, Refund, View return).
2. **Payment:**
   - Price breakdown exactly matching the app's `priceDetails` (Item total, Delivery fee, Platform fee, Discount, Coupon, Bank offer, Wallet used, Gift card, Grand total).
   - Payment attempts table (gateway, method, txn ID, status, amount, timestamp, failure reason).
   - Refunds table (RFD ID, items, amount, mode, status, ETA, ARN/UTR).
   - COD: collection status and remittance batch link.
3. **Timeline:** every state change across items/shipments/payments with actor (customer/seller/admin/courier/system) and source (app/API/courier webhook). Filterable by item.
4. **Communications:** SMS/email/push sent for this order (template, channel, delivered/failed), linked to M16 delivery logs.
5. **Tickets & Notes:** linked support tickets; internal notes (rich text, @mention admins, pinned notes).
6. **Invoices:** customer GST invoice per shipment (seller as supplier), credit notes for returns; download PDF.

**Right rail:**
- Customer card: name, masked phone/email (reveal ⚑ audit), customer since, lifetime orders/GMV, RTO rate, flags.
- Shipping & billing address (with "address verified" or "pincode serviceable" badges).
- Delivery code (OTP) status: never shown in plain text; only "Generated / Used at delivery".
- Risk panel: score, triggered rules.
- Related: other recent orders by this customer or device.

#### Flow — Cancel items (admin-initiated)
1. Click Cancel. Modal lists cancellable items (checkboxes; quantity split if qty > 1).
2. Choose actor-on-behalf (Customer request / Seller unable to fulfil / Fraud / Other) and a reason from the Reason Master (`CANCEL_REASONS` superset), plus a note.
3. Impact summary:
   - Refund amount (pro-rated discounts and coupons), refund mode (original source; wallet option if customer consents), coupon restoration rule.
   - Seller penalty, if seller-attributed.
   - If any item is MANIFESTED, a warning: "Pickup will be cancelled with the courier".
4. Confirm. Items move to CANCELLED, refund records are created (M8.2), shipment is updated or cancelled, inventory is released, and the customer is notified (template preview link).
5. Edge cases:
   - Partially shipped orders.
   - Item already SHIPPED (offer "Request RTO" instead).
   - Refund above the user's limit → ⚑ MC request created, while the cancellation still proceeds.

#### Flow — Change delivery address
Allowed before MANIFESTED.
- New address form (pincode lookup auto-fills city/state; serviceability re-checked for each shipment's courier and COD availability).
- If unserviceable: block with explanation.
- Delivery promise is recalculated and shown before confirming. The customer is notified.

#### Flow — Hold / Release
- Hold (reason: fraud review, payment verification, address verification, customer request) stops seller processing.
- An SLA pause indicator is shown.
- Release resumes; reject cancels with the SYSTEM actor and triggers a refund.

### M2.3 Cancellations

**Route** `/orders/cancellations`

- **List** of cancelled items: item, order, actor*, reason*, stage at cancellation* (pre-accept/pre-ship/post-ship RTO), cancelled at*, refund status*, seller*, penalty applied.
- **Filters:** actor, reason, stage, seller, category, date.
- **Analytics strip:** cancellation rate by actor, top reasons, top sellers by seller-cancellations (links to M4 penalties).
- **Actions:** View order · Reverse seller penalty (if wrongly attributed; reason required).

### M2.4 Returns & Replacements

**Route** `/returns` · `/returns/:returnId`

**Return state machine:**
```
RETURN_REQUESTED ─auto-approve rule / admin─▶ RETURN_APPROVED ─▶ PICKUP_SCHEDULED ─▶ PICKED_UP
        │                                        │                    │ (doorstep QC fail) ─▶ PICKUP_CANCELLED_QC_FAIL
        └─reject─▶ RETURN_REJECTED              └─cancel by customer─▶ RETURN_CANCELLED
PICKED_UP ─▶ IN_TRANSIT_TO_ORIGIN ─▶ RECEIVED (seller or Arise warehouse) ─▶ QC_PASSED ─▶ CLOSED
                                                                          └─▶ QC_FAILED ─▶ (seller claim, M4.7) ─▶ CLOSED
Refund timing (configurable per category/customer trust tier): AT_PICKUP (instant) | AT_RECEIPT | AT_QC_PASS
Replacement: on PICKED_UP (or AT_REQUEST for trusted), create a linked new Shipment ─▶ normal item lifecycle
```

**List:**
- **Tabs:** Requested · Approved/Pickup pending · In transit · Received/QC pending · QC failed · Closed · Rejected.
- **Columns:** Return ID*, order/item*, customer*, type* (Refund / Replacement / Exchange), reason* (from `RETURN_REASONS`), requested at*, status*, refund status*, pickup AWB, origin (seller/warehouse), age/SLA*, images (count).

**Detail:**
- Customer-submitted reason, comments and photos/videos (DocumentViewer).
- Item info and return window; return policy applied (category rule).
- Pickup shipment tracking; QC checklist results (doorstep and at origin) with photos.
- Refund panel; replacement shipment link; seller response/dispute; timeline.

**Actions:**
- Approve (choose type if the customer chose "either")
- Reject (reason + customer message template)
- Reschedule pickup
- Convert replacement → refund (when out of stock)
- Mark received
- Record QC (pass/fail per checklist item with photos)
- Issue refund (if timing is manual)
- Raise seller claim (link M4.7)

**Bulk:** approve (only for low-risk rule matches), export.

**Auto-approve rules** are configured in Settings → Return Policies (M17.4).

### M2.5 Order Exceptions

**Route** `/orders/exceptions`. A work queue for anything stuck.

**Exception types (each with a playbook link):**
- Payment captured but order not created
- Order placed but payment failed
- Seller not accepted beyond SLA
- Not dispatched beyond SLA
- Stuck in transit > N days (no courier scan)
- Lost in transit
- Delivered but customer disputes ("not received")
- Refund failed
- Duplicate payment

**Columns:** type*, entity*, age*, owner*, priority*, status* (Open/In progress/Resolved).

**Actions:** assign to me/agent, add note, resolve (resolution code), open linked entity.

---

## M3 Catalog

Permissions: `catalog.category.*`, `catalog.attribute.*`, `catalog.brand.*`, `catalog.product.view|edit|approve|reject|block|export`, `catalog.import.*`, `catalog.hsn.*`. Category-scoped users only see their categories.

### M3.1 Categories

**Route** `/catalog/categories`

**Layout:** split view. Left is a draggable tree (3 levels: e.g. Electronics › Audio › True Wireless Earbuds) with search, a live-listing count per node and an inactive badge. Right is the node editor.

**Node editor tabs:**
1. **General:**
   - Name, slug (auto, editable, uniqueness check), parent (move with impact warning), icon, image, banner.
   - Status (Active/Hidden), sort order.
   - SEO title/description.
2. **Attributes:** assign an attribute set; per attribute mark required / filterable (shows in app search filters) / variant-defining (e.g. Size, Colour) / display order. Inherits from parent, with override indicators.
3. **Policies:**
   - Return window (days) and allowed return types (Refund/Replacement/None)
   - Refund timing default
   - Gated category (requires brand approval / license upload, e.g. FSSAI, drug license)
   - Max listing quantity per order
   - COD allowed
   - Default HSN code + GST rate
   - Assured eligible
4. **Commission & fees:** read-only summary of the matching rules in M8.4, with a link to edit (finance perms).
5. **Size chart:** default size chart template (M3.4).

**Actions:** Add child · Duplicate · Hide (blocked if it has live listings unless "Hide listings too" is confirmed) · Delete (only if empty) · Reorder (drag; saved with an audit entry).

### M3.2 Attributes & Attribute Sets

**Route** `/catalog/attributes`

- **Attribute list:** name*, code*, type*, unit, used in N categories*, filterable*, variant-defining*.
- **Types:** text, long text, number (+unit list), single-select, multi-select, boolean, colour (name + hex + family), size (with size system: IN/UK/US/EU/Alpha), date, URL.
- **Value lists:** managed inline (add, merge duplicates, deactivate, synonyms for search).
- **Attribute sets:** named groups reused across categories.
- **Edge cases:** changing type is blocked when values are in use; merging values rewrites listings in an async job with progress.

### M3.3 Brands

**Route** `/catalog/brands` · `/catalog/brands/:id`

- **List:** logo*, name*, status* (Pending verification / Verified / Rejected / Blocked), owner type (Brand owner / Reseller-authorised), listings count*, authorised sellers*, gated (bool), created at.
- **Detail:**
  - Logo, name, aliases, website, trademark number + certificate (DocumentViewer), country.
  - Gated flag (only authorised sellers can list).
  - Authorised sellers table (seller, document, valid till, status).
  - Brand store page link (M12).
- **Brand approvals queue** at `/sellers/brand-approvals`, specified in M4.5.
- **Actions:** Verify, Reject (reason), Block (delists all, ⚑ MC), Merge duplicate brands (async job).

### M3.4 Size Charts

**Route** `/catalog/size-charts`

- Templates per category/brand (rows = sizes, columns = measurements, unit in/cm); matches the app's `SIZE_CHART_ROWS` structure.
- Image/how-to-measure guide.
- Preview of how it renders in the app.

### M3.5 HSN & Tax Codes

**Route** `/catalog/hsn`

- **Master:** HSN code*, description*, GST rate* (0/5/12/18/28 + cess), effective from*, mapped categories.
- Bulk import. Rate changes are effective-dated (never retroactive) and require ⚑ MC.

### M3.6 Products — list

**Route** `/catalog/products`

**Tabs:** All · Live · QC Pending · Needs Changes · Inactive · Blocked · Out of Stock · Archived.

**Columns:**

| Column | Notes |
|---|---|
| Image* (m) | |
| Product name* (m) | Brand + title |
| Product ID / FSN* | Catalog ID (Flipkart "FSN"-style) |
| Category* | Breadcrumb |
| Variants* | Count |
| Sellers* | Count of active offers |
| Buy-box seller* | |
| Price range* (m) | Min–max selling price across offers |
| Stock* | Total sellable |
| Rating* | ★ + count |
| Status* (m) | |
| Assured | Badge |
| Sponsored | Ads running? |
| Created / Updated | |
| Content score | Completeness % |

**Filters:** search (title, ID, SKU, EAN), category tree, brand, seller, status, fulfillment type, price range, stock (in/low/out), rating range, content score range, has active ads, created date.

**Bulk actions:**
- Activate/deactivate
- Block (reason, ⚑ MC if > 50 products)
- Change category (async job with validation)
- Export
- Add to deal/flash sale (opens M10 picker)

### M3.7 Product detail / editor

**Route** `/catalog/products/:id`

**Header:** title, ID, status tag, content score, Assured badge, "View in app" preview. Actions: Approve, Reject, Block/Unblock, Deactivate, Archive, History.

**Tabs:**
1. **Overview:**
   - Title, brand, category (change with attribute re-mapping wizard).
   - Key highlights (bullets), description (rich text).
   - App-PDP fields: fit, model info, care, manufacturer, packer/importer, country of origin (mandatory under Legal Metrology rules), product code.
   - Search keywords, HSN + GST rate (from category default, overridable).
2. **Attributes:** dynamic form from the category's attribute set (required marked; validation per type).
3. **Variants:**
   - Matrix builder from variant-defining attributes (e.g. Colour × Size → SKU grid).
   - Per variant: SKU code, EAN/GTIN, images (ImageUploader: min 1000×1000, white background check advisory, max 8, primary first), package dimensions and weight (drives shipping fee), status.
   - Colour variants map to the app's colour swatches (`COLOUR_OPTIONS`).
4. **Offers (sellers):**
   - One row per seller offer: seller, SKU, fulfillment type, selling price, MRP, discount %, stock, dispatch SLA, seller rating, buy-box winner ★, offer status.
   - Admin actions per offer: deactivate offer (reason), view seller, view price history.
   - Price-sanity alerts: price > MRP (blocked) or a deviation of more than X% from the 30-day median is flagged.
5. **Media & Content QC:** image checks, duplicate detection (similar products list with a "merge into" action), prohibited-keyword hits.
6. **Size chart:** attached template or custom.
7. **Reviews & Q&A:** summary and links to M13 filtered by product.
8. **Performance:** views, add-to-cart, conversion, units, GMV, return rate, top return reasons (chart).
9. **History:** field-level audit with "Revert to this version" (permission-gated).

**Live-listing edits:** changes to live content create a **pending revision**. The live version stays unchanged until QC approves, and a revision diff view is shown.

### M3.8 Listing QC Queue

**Route** `/catalog/qc`

The workbench where catalog teams spend their day.

**Queue list:**
- Columns: product*, seller*, category*, submitted at*, type* (New / Revision / Re-submission), priority* (seller tier, sale event deadline), auto-check score*, assigned to*, age/SLA*.
- **"Start reviewing"** opens a focused review mode:
  - Left: product content and images (large, zoomable).
  - Right: an auto-check panel. Each check shows pass/warn/fail: missing mandatory attributes, image resolution/background, price vs MRP, prohibited words, possible duplicate, brand authorisation valid, gated category license, HSN–category mismatch.
  - Bottom bar: **Approve** · **Request changes** (choose issue codes per field; message to seller is auto-composed and editable) · **Reject** (reason; e.g. counterfeit risk, prohibited item) · **Skip**.
  - Keyboard shortcuts: `A` approve, `C` changes, `R` reject, `J/K` next/previous.

**Listing state machine:**
```
DRAFT ─submit─▶ QC_PENDING ─approve─▶ LIVE ─seller/admin deactivate─▶ INACTIVE ─reactivate─▶ LIVE
                  │                    │ └─out of stock (auto)─▶ OUT_OF_STOCK ─restock─▶ LIVE
                  ├─request changes─▶ NEEDS_CHANGES ─resubmit─▶ QC_PENDING
                  └─reject─▶ REJECTED (terminal for this submission)
LIVE ─policy violation─▶ BLOCKED ─unblock (⚑ MC)─▶ LIVE ;  any ─archive─▶ ARCHIVED
LIVE + revision submitted: LIVE stays; revision goes QC_PENDING → merges on approve
```

**Assignment:** auto round-robin per category scope; leads can reassign; my-queue vs team-queue toggle.

### M3.9 Buy-box & badge rules

**Route** `/catalog/rules`

- **Buy-box rule weights** (configurable sliders that sum to 100%): landed price, delivery speed, seller rating, fulfillment type (FBA bonus), cancellation rate.
- **"Simulate on product"** tool: pick a product to see the ranked offers under the current vs edited weights. Publishing a change requires ⚑ MC.
- **Arise Assured rule:** Fulfilled-by-Arise AND seller rating ≥ X AND return rate ≤ Y. Preview the number of products that would gain or lose the badge.

### M3.10 Bulk Uploads (catalog import jobs)

**Route** `/catalog/imports`

- **Job types:** new products (category-specific template), price & stock update, image URL update, attribute update, offer deactivation.
- **New import:** the ImportWizard (plan §10).
  - Pick category → download template (columns generated from the attribute set) → upload .xlsx/.csv → map columns → validation preview (row errors inline: missing required, invalid value, duplicate SKU, image URL unreachable).
  - Option "import valid rows only" → commit.
- **Job list:** ID*, type*, uploaded by* (admin or on behalf of a seller), rows*, success/failed*, status* (Validating / Ready / Processing / Completed / Completed with errors / Failed), created at*.
- **Actions:** download error report, retry failed rows.

**As built (Phase 8 — M3.9 and M3.10, both deferred out of Phase 1).**
Buy-box weights (landed price, delivery speed, seller rating, FBA bonus,
cancellation rate) are five sliders that must sum to 100%, each one a pure
function (`src/mocks/engine/buyBox.js`) the catalog handler, the seed, and
the rules page's own "simulate on product" tool all call — so a listing's
buy-box winner can never disagree with what the rules page says it should
be. The Arise Assured badge (fulfilled by Arise + a seller rating floor +
a return-rate ceiling) is computed by the same engine. Publishing either is
maker-checker (`catalog_manager` as maker, `super_admin` as approver) and
recomputes every variant's winner and every offer's badge immediately on
approval.

The `ImportWizard` (shared component, built this phase) does real work:
template download is a real CSV, upload is parsed client-side with the
`xlsx` library, columns are mapped with a best-effort auto-match, and every
row is validated before commit. Bulk Uploads supports **price & stock
update** and **offer deactivation**, both matched by SKU + seller and
applied directly — a price/stock change has never gone through this
panel's revision/QC flow, since that protects product *content*
(`PATCH /products/:id`), not the per-seller offer a price or stock
figure lives on. **Not built:** new-product creation (needs a
category-driven template and a full creation pipeline that doesn't exist
in this admin-only panel — product creation is a seller-panel concern per
the plan's locked scope), and bulk image-URL/attribute updates (those
*are* product content, so building them bulk would mean either bypassing
the revision/QC flow — which this project will not do — or building bulk
revision review, which is a larger, separate feature). A job list,
download-error-report and retry-failed-rows are all built.

---

## M4 Sellers

Permissions: `sellers.seller.view|edit|export`, `sellers.application.review|approve|reject`, `sellers.kyc.verify`, `sellers.seller.suspend|reactivate|blacklist` (⚑ MC), `sellers.penalty.*`, `sellers.claim.*`, `sellers.bank.view_full`. Account-manager scope limits users to their assigned sellers.

### Seller lifecycle

```
APPLIED (from app "Sell on Arise" form: business name, GSTIN, mobile, pickup address)
   ▼
DOCUMENTS_PENDING (seller must upload KYC; reminder schedule)
   ▼
UNDER_REVIEW ─▶ NEEDS_INFO ─(seller resubmits)─▶ UNDER_REVIEW
   │  └─▶ REJECTED (reason; may reapply after N days)
   ▼
APPROVED (KYC done) ─▶ ONBOARDING (training/first listing/first pickup checklist) ─▶ ACTIVE
ACTIVE ─▶ ON_HOLD (payout/listing hold, temporary) ─▶ ACTIVE
ACTIVE ─▶ SUSPENDED (⚑ MC; listings hidden, payouts held, can be reinstated)
ACTIVE/SUSPENDED ─▶ DEACTIVATED (seller request / inactivity) ; ─▶ BLACKLISTED (⚑ MC, terminal, GSTIN/PAN/bank blocklisted)
```

### M4.1 Onboarding Applications

**Route** `/sellers/applications`

- **Tabs:** New · Documents pending · Under review · Needs info · Approved (onboarding) · Rejected.
- **Columns:** application ID*, business name*, GSTIN*, contact (masked)*, state/city*, categories intended*, applied at*, age/SLA*, verification summary* (✓ GSTIN ✓ PAN ✗ Bank), assigned to*.
- **Bulk:** assign, export, send reminder.

### M4.2 Application review (KYC workbench)

**Route** `/sellers/applications/:id`. Stepper with a section-level status for each step:

1. **Business details:**
   - Legal name, display/store name (uniqueness check), business type (Proprietorship/Partnership/LLP/Pvt Ltd), GSTIN.
   - **GSTIN verification result panel:** legal name match %, status (Active/Cancelled), registration date, principal place of business.
   - PAN (business or proprietor), PAN–name match, CIN/LLPIN where applicable, MSME/Udyam (optional).
2. **Contact & signatory:** primary contact, email/mobile verified flags, authorised signatory name + signature image.
3. **Bank account:** account holder, masked number (full reveal ⚑ audit), IFSC → bank/branch auto-fill, cancelled cheque (DocumentViewer), **penny-drop result** (name match %).
4. **Pickup address(es):** address, pincode serviceability per courier, geo-verified flag, contact. Mark the primary address.
5. **Documents:** list with per-document Approve/Reject (reason) in DocumentViewer, with a watermark.
   - GST certificate, PAN card, cheque, address proof
   - Brand authorisation (if any)
   - Category licenses (FSSAI, drug license, BIS, etc.) with expiry dates
6. **Categories & brands:** requested categories (gated ones flagged), requested brands (routes to M4.5).
7. **Commercials:** seller tier (default Bronze), assigned commission plan (M8.4), payout cycle, fulfillment options enabled (Seller-fulfilled / Fulfilled-by-Arise eligibility).
8. **Decision:**
   - **Approve:** all mandatory sections green; otherwise disabled, with a list of blockers.
   - **Request info:** pick deficient items; the seller message is auto-composed.
   - **Reject:** reason code + message.
   - Internal notes, duplicate-check panel (same PAN/GSTIN/bank/phone across sellers, including blacklisted ones; a hard block if a blacklisted match is found).

### M4.3 All Sellers — list

**Route** `/sellers`

- **Tabs:** Active · Onboarding · On hold · Suspended · Deactivated · Blacklisted.
- **Columns:** seller ID*, store name* (m), legal name, GSTIN*, tier* (Bronze/Silver/Gold/Platinum), rating* (m), live listings*, GMV (30d)*, orders (30d), cancellation %*, late dispatch %*, return %, fulfillment mix, account manager, payout status (Normal/On hold)*, status* (m), joined at.
- **Filters:** status, tier, state/city, category, rating range, metric thresholds ("cancellation % > 2"), account manager, fulfillment type, has open penalties, has payout hold.
- **Bulk:** assign account manager, change tier ⚑ MC, export, send announcement (opens M10.6 with the seller audience).

### M4.4 Seller detail (Seller 360)

**Route** `/sellers/:id`

**Header:** store name, ID, status, tier, rating, account manager, quick metrics. Actions: Edit · Put on hold · Suspend ⚑ · Reactivate ⚑ · Deactivate · Blacklist ⚑ · Hold payouts ⚑ · Release payouts ⚑ · Change commission plan ⚑ · Add note · View as seller (read-only preview of what the seller sees; perm `sellers.seller.impersonate_view`, fully audited, no mutations).

**Tabs:**
1. **Overview:** profile, KYC summary with document expiry warnings, pickup addresses, bank (masked), categories/brands approved, commercials.
2. **Performance:**
   - Metrics with targets and trend: order defect rate, cancellation rate (seller-attributed), late dispatch rate, return rate (quality-attributed), rating, ticket rate, response time.
   - Tier eligibility progress; violations timeline.
3. **Listings:** M3.6 table pre-filtered by seller.
4. **Orders:** M2.1 table pre-filtered.
5. **Returns & Claims:** returns for this seller, claims (M4.7).
6. **Finance:** settlement summary, upcoming payout, payout history (M8.5), statements download, ads spend, penalties deducted, holds.
7. **Inventory:** FBA stock per warehouse (M6), inbound consignments, removal orders.
8. **Penalties:** list (M4.6).
9. **Tickets:** seller-raised support tickets (M14).
10. **Documents:** all documents with versions and expiry; request re-upload.
11. **Notes & History:** internal notes and audit.

#### Flow — Suspend seller (⚑ MC)
1. Choose reason (policy violation, counterfeit, high ODR, KYC expired, legal), duration (until resolved / date), and effects:
   - Hide listings (default on)
   - Hold payouts (default on)
   - Allow fulfilment of open orders (default on; otherwise open orders auto-cancel with SELLER attribution)
2. Review the impact summary (live listings count, open orders, pending payout amount).
3. Submit to create an approval request; once approved, the effects apply and the seller is notified.

### M4.5 Brand Approvals

**Route** `/sellers/brand-approvals`

- A seller requests to sell a gated or new brand → **Queue:** seller*, brand*, request type* (Brand owner / Authorised reseller / New brand creation), documents*, submitted at*, status*.
- **Review:** trademark certificate or authorisation letter (validity dates), invoices from the brand/distributor (last 6 months).
- **Actions:** approve (with validity end date), reject (reason), request more documents.
- **Expiry handling:** a reminder fires 30 days before expiry; on expiry, the seller's listings for that brand auto-deactivate.

### M4.6 Penalties & Policy Violations

**Route** `/sellers/penalties`

- **Penalty rules config** (M17-linked): per violation type (seller cancellation, late dispatch, wrong product, counterfeit, fake tracking), amount (fixed or % of item value), escalations (warning → fee → listing block → suspension).
- **List:** penalty ID*, seller*, violation*, order/item*, amount*, status* (Applied / Disputed / Waived / Recovered), applied at*.
- **Seller dispute flow:** seller disputes (future seller panel; admin can log on behalf) → reviewer sees evidence → uphold or waive (reason). A waiver above the threshold needs ⚑ MC.
- **Manual penalty:** create with evidence attachments.

### M4.7 Seller Claims (seller protection)

**Route** `/sellers/claims`

- **Claim types:** return received damaged/used, wrong item returned, lost in transit (courier), lost/damaged in Arise warehouse, weight dispute (cross-link M7.7).
- **State machine:** `SUBMITTED → UNDER_REVIEW → (INFO_REQUESTED → UNDER_REVIEW) → APPROVED (amount) | PARTIALLY_APPROVED | REJECTED → (if approved) REIMBURSED (via payout adjustment)`
- **Detail:** claim evidence, return QC photos side by side with original listing images, item value, courier liability amount.
- **Decision:** reimbursement amount (cap = item settlement value), recovery from courier toggle (M7).

---

## M5 Customers

Permissions: `customers.customer.view|edit|export`, `customers.customer.block`, `customers.pii.view`, `customers.privacy.*`, `customers.risk.*`.

### M5.1 All Customers — list

**Route** `/customers`

- **Columns:** customer ID*, name* (m), phone (masked)* (m), email (masked), joined at*, orders*, GMV*, last order at*, wallet balance*, RTO %, return %, tier/segment tags, status* (Active/Blocked/Deleted), risk*.
- **Filters:** search (name/phone/email/ID), joined date, orders range, GMV range, last order date, city/state, segment, status, risk level, has open ticket, referral source, platform.
- **Bulk:** add to segment, export (PII columns only with `customers.pii.view`; export audited).

### M5.2 Customer detail (Customer 360)

**Route** `/customers/:id`

**Header:** name, ID, status, risk badge, customer since, tags. Actions: Block/Unblock (reason) · Disable COD for this customer · Reset/force logout all devices · Add wallet credit (M9, ⚑ MC above limit) · Create ticket · Add note.

**Tabs:**
1. **Overview:** profile (name, gender, DOB if provided, language preference), verified phone/email, saved addresses (matches the app's address model: label, name, line, city line, phone), default address, preferences (ad preferences, notification opt-ins).
2. **Orders:** M2.1 pre-filtered.
3. **Returns & Refunds.**
4. **Wallet:** balance and ledger (M9.2 pre-filtered); gift cards redeemed.
5. **Reviews & Q&A** by this customer.
6. **Tickets & Chats.**
7. **Referrals:** their code, referees, rewards earned, fraud flags.
8. **Devices & Sessions:** device model, OS, app version, last seen, IP/city; "logout device".
9. **Risk:** score history, triggered rules (multiple accounts on same device, high RTO, refund abuse, coupon abuse), linked accounts graph (list view: accounts sharing device/phone/address/payment instrument).
10. **Notes & History.**

### M5.3 Privacy Requests

**Route** `/customers/privacy`. These come from the app's Delete Account and Download Data screens.

- **Types:** `ACCOUNT_DELETION`, `DATA_EXPORT`, `CORRECTION`, `CONSENT_WITHDRAWAL`.
- **State machine:** `RECEIVED → VERIFYING (identity) → IN_PROGRESS → COMPLETED | REJECTED (reason, e.g. open orders/refunds pending) ; ON_HOLD (legal retention)`
- **List:** request ID*, customer*, type*, received at*, due by* (statutory SLA countdown; configurable for DPDP Act timelines), status*, assignee*.
- **Deletion flow:**
  1. Pre-checks shown as a checklist: open orders, pending refunds, wallet balance (must be refunded or forfeited per policy with consent record), open tickets.
  2. Execute → PII anonymised; order records retained for tax law with a pseudonymised reference.
  3. Confirmation sent.
- **Export flow:** generate data package (async job) → secure link to the customer (expires).

### M5.4 Fraud & Risk

**Route** `/customers/risk`

- **Risk rules** (list + editor using RuleBuilder):
  - Conditions on order value, first order, COD, pincode RTO rate, device accounts count, velocity, coupon usage.
  - Action: flag / hold order / disable COD / block.
  - Simulate against the last 7 days (how many orders would match).
- **Flagged entities queue:** customer/order/device, rule hit, score, status (Open/Cleared/Confirmed fraud), reviewer.
- **Blocklists:** phone, email, device ID, pincode (COD only), payment instrument fingerprint. Each entry has a reason, expiry and audit trail.

---

## M6 Inventory & Warehouses (Fulfilled by Arise)

Permissions: `warehouse.warehouse.*`, `warehouse.inbound.*`, `warehouse.inventory.view|adjust` (⚑ MC above threshold), `warehouse.removal.*`. Scoped by warehouse.

### M6.1 Warehouses

**Route** `/warehouses` · `/warehouses/:id`

- **List:** code*, name*, city/state*, type* (Fulfilment centre / Returns centre / Sortation), status* (Active/Paused/Inactive), capacity utilisation %*, SKUs*, units*, today's outbound / inbound*.
- **Detail tabs:**
  - Profile: address, GSTIN (state registration; drives invoice place of supply), contact, operating hours, dock slots per day, cut-off times for same-day dispatch.
  - Serviceable couriers: linked to M7.
  - Zones/bins: optional simple list.
  - Performance: dispatch SLA %, GRN TAT, inventory accuracy.
  - Staff: admin users scoped here.
- **Actions:** Pause inbound (reason; blocks new appointments), Pause outbound (orders re-routed to other warehouses holding stock; impact preview shown).

### M6.2 Inbound Shipments (consignments)

**Route** `/warehouses/inbound` · `/warehouses/inbound/:id`

**State machine:**
```
DRAFT ─submit─▶ SUBMITTED ─slot booked─▶ APPOINTMENT_BOOKED ─▶ ARRIVED (gate-in) ─▶ RECEIVING ─▶ RECEIVED (GRN posted) ─▶ CLOSED
   └─cancel─▶ CANCELLED          └─no-show─▶ MISSED (rebook)
```

- **List columns:** INB ID*, seller*, warehouse*, SKUs*, units declared*, units received*, discrepancy* (badge), appointment*, status*.
- **Detail:**
  - Declared lines (SKU, qty, box count).
  - Appointment (date/slot, vehicle no.).
  - Documents (seller invoice / delivery challan, e-way bill no.).
  - **GRN screen** (receiving): per line enter received sellable, damaged and missing; flag excess, wrong SKU or unlabelled; barcode scan input field (works with USB scanners as keyboard input).
  - Post GRN with confirmation; discrepancy report is auto-sent to the seller.
- **Admin can create on behalf of a seller** (sellers will do it in the future seller panel).

### M6.3 Inventory

**Route** `/warehouses/inventory`

- **Grid per SKU × warehouse:**
  - Product/SKU* (m), seller*, warehouse*
  - Sellable*, reserved* (allocated to orders), in-transit inbound*, customer returns pending QC*, unsellable (damaged/expired)*
  - Days of cover* (sales velocity), age (oldest unit days) for long-term storage fee
  - Status: In stock / Low / Out
- **Filters:** warehouse, seller, category, stock status, ageing bucket (0–90/91–180/181–365/>365 days).
- **SKU drawer:** inventory ledger (every movement: GRN, order allocation, dispatch, return restock, adjustment, removal) with running balance.
- **Low-stock alerts config:** threshold per SKU or by days of cover; notify seller and catalog team.

### M6.4 Stock Adjustments

**Route** `/warehouses/adjustments`

- **Create adjustment:** warehouse, SKU, from bucket → to bucket (e.g. Sellable → Unsellable), qty, reason (cycle count variance, damaged in warehouse, found, expired), evidence. Above the threshold ⚑ MC.
- Warehouse-caused losses auto-create a seller reimbursement claim (M4.7 type "lost/damaged in Arise warehouse").
- **List** of adjustments with filters and audit.

### M6.5 Removal Orders

**Route** `/warehouses/removals`

- **Types:** return to seller (to a pickup address), dispose/liquidate.
- **States:** `REQUESTED → APPROVED → PICKING → SHIPPED (AWB) → DELIVERED_TO_SELLER | DISPOSED → CLOSED`
- Fee preview (removal fee per unit). **Auto-removal rule** for long-term aged stock (configurable; seller notified N days before).

---

## M7 Logistics

Permissions: `logistics.courier.*`, `logistics.pincode.*`, `logistics.shipment.view|edit`, `logistics.ndr.action`, `logistics.rto.*`, `logistics.weight.*`, `logistics.rules.*`.

### Shipment state machine

The forward path matches the M2 item states from MANIFESTED onwards. The courier scan status is shown alongside the normalised status: raw courier codes are mapped to normalised statuses in Courier settings.

### M7.1 Courier Partners

**Route** `/logistics/couriers` · `/logistics/couriers/:id`

- **List:** name*, logo, type* (Forward / Reverse / Both), modes* (Surface/Air), status* (Active/Paused), serviceable pincodes*, COD enabled*, allocation priority*, on-time %*, RTO %*, damage %, pickup success %.
- **Detail tabs:**
  - Profile & integration status: API health (green/amber/red, last webhook received). Credentials are never shown; only "configured", and they live in M17 Integrations.
  - **Rate card:** weight slabs × zones (Local / Within State / Metro-to-Metro / Rest of India / Special: NE & J&K); COD charges (fixed or %, whichever higher); RTO charge %; effective-dated versions.
  - **Status code mapping:** courier raw code → normalised status.
  - Performance trends.
  - Allocation share.
- **Actions:** Pause courier (impact preview: open shipments are unaffected; new allocations re-routed). Adjust allocation priority.

### M7.2 Pincode Serviceability

**Route** `/logistics/pincodes`

- **Grid:** pincode*, city*, state*, zone*, couriers serviceable* (chips), forward/reverse/COD flags per courier, promised TAT (days) by origin zone*, ODA (out of delivery area) flag, platform override* (Blocked / COD disabled / Prepaid only).
- **Bulk import/export** via ImportWizard (courier-wise serviceability files).
- **"Check pincode" tool:** origin (warehouse/seller pickup) + destination pincode + weight + payment mode → eligible couriers, ranked, with TAT and cost. This is the same logic as the app's delivery date on the product page (`deliveryDate`).
- **Override actions:** block a pincode (e.g. flood, strike) with an expiry; disable COD for a pincode (high RTO).

### M7.3 Shipment Allocation Rules

**Route** `/logistics/rules`

- **Rule list** (priority ordered, drag to reorder). Each rule: conditions (origin zone, destination zone, weight range, payment mode, category, order value, fulfillment type) → courier preference order + allocation split %.
- **Simulator:** sample shipment → which rule matched → which courier.
- **Customer shipping fee rules** (what the app shows as `deliveryFee`):
  - Free above ₹X order value, otherwise ₹Y.
  - Exceptions for heavy/bulky categories.
  - Membership-agnostic for now.
- **Platform fee config** (the app shows `platformFee` ₹5): fixed per order or slab, with effective dates. ⚑ MC.

### M7.4 Shipments

**Route** `/logistics/shipments` · `/logistics/shipments/:id`

- **Tabs:** To be manifested · Pickup pending · In transit · Out for delivery · Delivered · NDR · RTO · Lost.
- **Columns:** shipment ID*, AWB* (m), order*, seller / warehouse origin*, courier*, destination pincode/city*, payment (Prepaid / COD amount)*, weight (dead/volumetric/charged)*, status* (m), last scan + location*, promised date*, age since pickup, attempts count.
- **Detail:**
  - Tracking timeline (all scans with location, time, raw code, normalised status).
  - Package details and dimensions, label/invoice print.
  - POD (proof of delivery: OTP verified / signature / photo).
  - Charges (forward, COD, RTO).
  - Linked NDRs and weight disputes.
- **Actions:**
  - Re-allocate courier (before pickup).
  - Cancel shipment (before pickup).
  - Mark lost (after N days with no scan; triggers courier claim and seller claim).
  - Escalate to courier (creates a courier ticket ref).
- **Bulk:** print labels, re-allocate, export.

### M7.5 Pickups & Manifests

**Route** `/logistics/pickups`

- **Per origin** (seller pickup address or warehouse) × courier × date: manifest ID*, shipments count*, pickup status* (Scheduled / Picked up / Partially picked / Missed), pickup slot, attempts.
- **Missed-pickup flow:** reschedule, re-allocate courier, or escalate. Repeated misses are flagged to courier performance.
- **Manifest print view:** barcode list, signature block.

### M7.6 NDR (Non-Delivery Reports)

**Route** `/logistics/ndr`. A high-volume daily action queue.

- **Columns:** AWB*, order*, customer (masked) + city*, courier*, NDR reason* (Customer unavailable / Address incomplete / Customer refused / COD amount not ready / Rescheduled by customer / Out of delivery area / Phone unreachable), attempt #*, COD amount, customer response (from IVR/WhatsApp/app "Reschedule" prompt), age*, action due by*.
- **Actions per row:**
  - **Reattempt** (date picker, optional updated address/phone after customer verification, delivery instructions).
  - **RTO** (reason).
  - **Call customer** (shows masked number with a click-to-call integration placeholder; logs call outcome).
- **Bulk:** reattempt for selected, RTO for selected.
- **Auto-rule:** after 3 failed attempts or "refused", auto-RTO (configurable). The rule is shown as an inline notice on affected rows.
- **Analytics strip:** NDR % by courier and reason, NDR→delivered conversion rate.

### M7.7 RTO

**Route** `/logistics/rto`

- **List:** RTO shipments in transit/delivered to origin, age, origin type.
- **On RTO delivered:** seller confirms receipt or the warehouse restocks after QC. Missing or damaged on RTO receipt → claim (M4.7).
- **Analytics:** RTO % by pincode/city/courier/payment mode/category. A "Disable COD for top RTO pincodes" shortcut links to M7.2.

### M7.8 Weight Disputes

**Route** `/logistics/weight-disputes`

- A courier reports a charged weight greater than the declared weight → a discrepancy is created.
- **States:** `RAISED_BY_COURIER → SELLER_NOTIFIED → DISPUTED_BY_SELLER (images: package on scale, dimensions) → UNDER_REVIEW → ACCEPTED (seller pays difference) | REJECTED (courier claim reversed) | AUTO_ACCEPTED (no seller response in N days)`
- **Detail:** declared vs courier weight/dimensions, courier images, seller evidence, catalog dimensions for the SKU, history of disputes for this SKU.
- **Decision** updates the shipping fee charged to the seller (M8.4 settlement adjustment). "Update SKU master dimensions" is an option.

---

## M8 Finance

Permissions: `finance.payment.view`, `finance.refund.view|issue|retry` (limits via scope), `finance.payout.view|create|approve|release|hold` (⚑ MC), `finance.commission.view|edit` (⚑ MC), `finance.tax.*`, `finance.invoice.*`, `finance.cod.*`, `finance.recon.*`.

### M8.1 Payments (gateway transactions)

**Route** `/finance/payments`

- **Columns:** txn ID*, order*, customer*, gateway*, method* (UPI/Card/NetBanking/Wallet/EMI/Gift card/Store credit), amount*, status* (`CREATED → AUTHORIZED → CAPTURED | FAILED`; `REFUNDED / PARTIALLY_REFUNDED`), gateway ref*, bank offer applied, EMI tenure, created at*, failure reason.
- **Filters:** status, method, gateway, amount, date, failure reason, has bank offer.
- **Detail drawer:** full gateway event log, linked refunds, settlement (gateway → Arise) reference.
- **Success-rate panel:** by method and bank, last 24h, with an alert threshold.

### M8.2 Refunds

**Route** `/finance/refunds` · `/finance/refunds/:id`

- **Refund state machine:** `PENDING_APPROVAL (⚑ MC when above limit/goodwill) → INITIATED → PROCESSING (at gateway/bank) → COMPLETED (ARN/UTR captured) | FAILED → (retry) INITIATED | (switch mode) INITIATED`
- **Refund modes:**
  - Original payment source
  - Arise wallet (store credit; instant)
  - Bank transfer/UPI for COD orders (customer-provided details; verified via penny-drop)
- **Refund types:** cancellation, return, partial (price adjustment), goodwill/compensation (no item), delivery-fee refund, duplicate payment.
- **Columns:** refund ID*, order/item*, customer*, type*, amount*, mode*, status*, initiated by* (system/admin), initiated at*, completed at, ARN/UTR, TAT*.
- **Tabs:** Pending approval · Processing · Failed · Completed.
- **Failed refund flow:** see the failure reason → Retry, or Switch mode (e.g. to wallet with customer consent noted, or to bank with details) → audit.
- **Issue goodwill refund** (from Order 360 or here): amount (≤ order value), reason, cost bearer (Arise / Seller (creates seller debit) / Courier). ⚑ MC always.

### M8.3 Reconciliation

**Route** `/finance/reconciliation`

- **Gateway reconciliation:** upload/auto-import the gateway settlement report → match against captured payments → buckets: Matched · Amount mismatch · Missing in gateway · Missing in Arise · Duplicate. Resolve each with a note.
- **COD reconciliation:** see M8.7.
- **Courier invoice reconciliation:** courier invoice lines vs expected charges from rate card → disputes list.

### M8.4 Commission & Fees

**Route** `/finance/commission`

**Fee components** (each configurable, effective-dated, versioned, ⚑ MC on publish):
- **Commission %:** by category (leaf) × selling-price band, optional brand or seller-tier override.
- **Fixed (closing) fee:** slab by item price.
- **Collection (payment) fee:** % by payment mode (prepaid vs COD).
- **Shipping fee to seller:** weight slab × zone (local/zonal/national), FBA vs self-ship variants.
- **Fulfilment fees** (Fulfilled-by-Arise): pick-pack per unit, storage per cubic-ft/month, long-term storage fee, removal fee.
- **Reverse shipping fee** for returns (by return reason attribution: customer remorse vs seller fault).
- **GST on fees** (18%, configurable).

**Rule editor:** table + RuleBuilder; overlapping-rule detector; "Preview settlement" calculator (pick a category, price, weight, zone, payment mode → full fee breakdown and net payout).

**Commission plans:** named bundles (Standard, New Seller 0% for 30 days, Strategic Brand) assignable to sellers.

### M8.5 Seller Payouts

**Route** `/finance/payouts` · `/finance/payouts/batches/:id` · `/finance/payouts/sellers/:sellerId`

**Settlement logic** (shown transparently in UI): an item becomes **eligible** when DELIVERED + return window closed (or return closed) and no open claim/hold.

**Per-item settlement line:**
```
Sale amount (incl. GST, after seller-funded discounts)
− Commission − Fixed fee − Collection fee − Shipping fee − Fulfilment fees (FBA)
− GST on fees
− TCS (GST, configurable %; seed per current statutory rate)
− TDS u/s 194-O (configurable %; seed per current statutory rate)
± Adjustments (penalties, claims reimbursed, weight-dispute charges, ads spend, manual credit/debit)
= Net payable
```

**Payout batch state machine:**
```
DRAFT (system creates per cycle, e.g. weekly) ─submit─▶ PENDING_APPROVAL (⚑ MC) ─approve─▶ APPROVED ─release─▶ PROCESSING
   PROCESSING ─▶ PAID | PARTIALLY_FAILED ─retry failed─▶ PROCESSING ; any pre-release state ─reject─▶ DRAFT (with comments)
Per seller payout: INCLUDED → PAID (UTR) | FAILED (reason: invalid account, account frozen) | HELD (excluded; seller hold)
```

**Screens:**
1. **Payouts overview:** next cycle date, eligible amount, sellers count, held amount, failed last cycle; trend chart.
2. **Batches list:** batch ID*, cycle period*, sellers*, gross*, deductions*, net*, status*, created/approved/released by*.
3. **Batch detail:**
   - Per-seller table (seller, items, gross, fees, tax, adjustments, net, bank masked, payout status).
   - Exclude seller (reason).
   - Approve/Reject (checker).
   - Release (generates a bank file; mock-simulated).
   - Download bank file/statement; retry failed.
4. **Seller statement:**
   - Period selector; line-level settlement table (exportable).
   - Summary waterfall chart (Gross → fees → tax → adjustments → net).
   - PDF statement.
5. **Manual adjustments:** credit/debit to a seller's next payout (reason, evidence). ⚑ MC.
6. **Holds:** list of sellers with payouts on hold (reason, since, held amount, release ⚑ MC).

**As built (Phase 4).** The deviations from the spec above, and why:

- **Routes** are `/finance/payouts` (batches, settlement lines and adjustments
  as three views of one workspace) and `/finance/payouts/:id` for a batch.
  There is no separate `/batches/:id` or `/sellers/:sellerId` route; the
  per-seller figures live in the batch detail, and `GET /payouts/:payoutId`
  returns a seller's lines for the statement screen when it is built.
- **No separate APPROVED state.** `DRAFT → PENDING_APPROVAL → PROCESSING →
  PAID | PARTIALLY_FAILED` — releasing is itself the maker-checker gate, so an
  `APPROVED` state between the two would be a step with nothing to do. The
  request to release needs `finance.payout.release`; seconding it in the
  approvals inbox needs `finance.payout.approve`.
- **`CARRIED_FORWARD` replaces `HELD` on a per-seller payout.** Holds apply to
  settlement *lines* (with the reason shown against the money), so a payout is
  never created in a held state. `CARRIED_FORWARD` is the case the spec did not
  anticipate: a net of zero or less, which is not sent to a bank and waits for
  the seller's next settlement.
- **Not yet built:** the trend chart on the overview, the per-seller statement
  page with its waterfall and PDF, the bank file download, excluding a single
  seller from a batch, and the standalone holds list. Holding and releasing a
  seller's payouts *is* built, as an action in the adjustments view. These are
  reporting and convenience surfaces; the money movement they describe is
  complete and tested.

### M8.6 Tax (TCS / TDS)

**Route** `/finance/tax`

- **TCS:** monthly summary per seller GSTIN (taxable value, TCS collected CGST/SGST/IGST split); GSTR-8 export file; filing status tracker (Not filed / Filed with ARN).
- **TDS 194-O:** quarterly summary per seller PAN; Form 26Q data export; certificate (Form 16A) generation status and seller download log.
- **Rates config** (effective-dated, ⚑ MC). Seeds use placeholder rates labelled "verify with tax advisor".

### M8.7 COD Remittance

**Route** `/finance/cod`

- **Courier COD remittances:** courier*, remittance ID*, period*, shipments*, expected amount*, received amount*, difference*, UTR*, status* (Expected / Received / Short-paid / Disputed / Reconciled).
- **Detail:** per-AWB lines; mismatches flagged; dispute with courier.
- **Ageing:** COD collected by courier but not remitted beyond the contractual days (alert).

### M8.8 Invoices

**Route** `/finance/invoices`

- **Customer tax invoices** (issued in the seller's name per shipment, or Arise's for platform fee): invoice no.*, order*, seller*, GSTIN*, place of supply*, taxable*, tax*, total*, date*. View/print, re-generate (versioned, with reason).
- **Credit notes** for returns/cancellations after invoicing.
- **Commission (fee) invoices** issued by Arise to sellers monthly.
- **Invoice series config** in M17 (prefix per GSTIN/financial year).

---

## M9 Wallet & Gift Cards (store credit only)

Permissions: `wallet.account.view`, `wallet.ledger.view|export`, `wallet.adjust` (⚑ MC above limit), `wallet.giftcard.*`, `wallet.cashback.*`.

### M9.1 Wallet Accounts

**Route** `/wallet/accounts`

- **Columns:** customer*, balance*, of which promotional (expiring) credit*, of which refund credit (non-expiring), lifetime credited/debited, last activity*, status* (Active/Frozen).
- **Actions:** Freeze/Unfreeze (fraud; reason), Credit/Debit manually (reason: goodwill, compensation, correction; expiry for promotional credit). ⚑ MC above limit.

### M9.2 Wallet Ledger

**Route** `/wallet/ledger`

- Immutable entries: entry ID*, customer*, type* (credit/debit), category* (Refund / Cashback / Referral bonus / Gift card load / Order payment / Expiry / Manual adjustment / Reversal), amount*, balance after*, reference* (order/refund/gift card/referral), expires at, created at*, actor*.
- These match the app's wallet transaction list (`title`, `subtitle`, `amount`, `type`). The admin defines the customer-facing title per category.
- Entries are never edited. Corrections are made by reversal entries.

**As built (Phase 4).** The wallet list shows balance, lifetime credited and
spent, and status. The **promotional vs refund split by column is not built**;
instead the account drawer computes "expiring within 30 days" from the ledger's
own expiry dates, which is the question support is actually asked. Each entry
carries its own `expiresAt`, so the split can be added as a column without a
data change. A debit can never exceed the balance — store credit cannot go
negative — and the balance is always derived from the ledger, never stored
independently.

### M9.3 Gift Cards

**Route** `/wallet/gift-cards`

- **Programs:** name, design image (shown in the app's AddGiftCard flow), denominations (fixed list or custom range), validity (months), max per customer, purchasable in app (yes/no), corporate/bulk only.
- **Batches** (corporate/promotional): program, quantity, denomination, total value, purpose, recipient (company). ⚑ MC above threshold. Generation is an async job; codes are only downloadable once as an encrypted file (audited).
- **Card lookup:** by code/last 4 → status (`INACTIVE → ACTIVE → PARTIALLY_REDEEMED → REDEEMED | EXPIRED | BLOCKED`), balance, redemption history. Actions: Block (reason), Extend expiry (⚑ MC).

**As built (Phase 4).** Generation is synchronous in the mock (the batch cap is
500 cards) and the codes are **never returned at all** rather than downloadable
once — a bearer code that passes through a response, a log or a screenshot is
already compromised. The real implementation should write the encrypted file
server-side and hand back a one-time, audited download link. Programme design
images, max-per-customer, in-app purchase and "extend expiry" are not built;
blocking and the status machine are.

### M9.4 Cashback Rules

**Route** `/wallet/cashback`

- **Rule:** name, conditions (category/brand/seller, min order, payment method, first order, user segment), cashback (flat / % with cap), credit timing (after delivery + return window), credit expiry, budget cap (total), per-user limit, schedule.
- **Status:** Draft / Scheduled / Active / Paused / Ended / Budget exhausted. A budget burn-down chart is shown.

**As built (Phase 4).** Statuses are Scheduled / Active / Paused / Ended;
"budget exhausted" is shown as the budget bar turning red at 90% rather than as
its own state, because a rule whose budget runs out is still the same rule and
can be topped up. The per-order cap and the total budget are both **required** —
the server rejects a rule without them. Segment and brand conditions arrive with
M10; the triggers built are first order, payment method, category and channel.
Pausing stops future accrual and explicitly does not claw back credit already
given.

---

## M10 Marketing & Promotions

Permissions: `marketing.coupon.*`, `marketing.deal.*`, `marketing.flashsale.*`, `marketing.event.*`, `marketing.referral.*`, `marketing.campaign.*`, `marketing.segment.*`, `marketing.bankoffer.display`.

### M10.1 Coupons

**Route** `/marketing/coupons` · `/marketing/coupons/new` · `/marketing/coupons/:id`

- **List:** code*, name*, type*, value*, funded by* (Arise / Seller / Co-funded %), applicability summary, validity*, usage (used/limit)*, budget burn*, status* (Draft / Scheduled / Active / Paused / Expired / Exhausted).
- **Create wizard:**
  1. **Basics:** code (or auto-generate unique codes in bulk for one-per-user campaigns), name, description shown in the app's Coupons screen, terms (rich text).
  2. **Discount:** flat ₹ / % with max cap / free delivery / buy X get Y (same SKU or set); min cart value; applies to (cart total vs eligible items only).
  3. **Applicability:** include/exclude categories, brands, sellers, products; fulfillment type; payment methods; platforms (Android/iOS/Web).
  4. **Audience:** all / new users (first order) / segment (M10.7) / specific customers (upload).
  5. **Limits:** total redemptions, per-user redemptions, budget cap (₹), stacking with bank offers/other coupons (yes/no), visibility (public in coupon list vs hidden code).
  6. **Schedule:** start/end IST.
  7. **Funding:** Arise / seller (select seller; requires seller consent record) / co-funded split.
  8. **Review:** summary card plus "Test against a cart" (choose customer + products → shows whether the coupon applies and the discount).
- **Detail:** performance (redemptions, discount given, GMV influenced, new customers acquired, ROI), redemptions list, pause/resume, end early, clone.

**As built (Phase 5).** Code-level bulk generation, auto-generated
one-per-user codes and the "Test against a cart" tool are all built — the
latter calls the exact same `evaluateCoupon` function the usage report and
(eventually) checkout would use, so the three can never disagree. Not built:
per-seller funding **consent records** (funding type is recorded, but nothing
captures the seller's sign-off), and a dedicated customer upload for a custom
audience (the audience picker supports `CUSTOM` with an explicit id list, but
there is no CSV import for it — ids are added one at a time via search).

### M10.2 Deals

**Route** `/marketing/deals`

These feed the app's Offers / Top Value Deals / Deal Detail screens.

- **Deal:** title, label (e.g. "Min. 30% Off", "Under ₹399"), tag (BESTSELLER / TRENDING / SUPER SAVER / HOT DEAL, as in the app's `TOP_VALUE_DEALS`), image, landing (product set by rule or manual pick), deal price per offer (seller-agreed), schedule, placement (Top value deals rail / Offers page category).
- **Deal of the Day:** a calendar view; one slot per day per placement; drag to reschedule.

**As built (Phase 5).** A deal references a product rather than a specific
offer; the server resolves it to that product's current buy-box winner (or
else its cheapest live offer), since that is the price a customer actually
sees. The calendar reschedules via a date picker per card rather than drag —
the server call it makes (`reschedule`, which swaps whatever already holds
the target day) is exactly what a drag interaction would call too.

### M10.3 Flash Sales

**Route** `/marketing/flash-sales` · `/marketing/flash-sales/:id`

**State machine:**
```
DRAFT ─open nominations─▶ NOMINATIONS_OPEN ─close─▶ CURATION ─publish─▶ SCHEDULED ─start time─▶ LIVE ─end/sold out─▶ ENDED
any pre-LIVE ─cancel─▶ CANCELLED
```

- **Setup:** name, banner (app `FlashSaleBanner`), start/end (the app shows a countdown timer), categories, minimum discount % (e.g. 50%), max units per customer, stock reservation per product.
- **Nominations:** sellers nominate offers (from the future seller panel; the admin can nominate on behalf). Columns: product, seller, current price, flash price, discount %, committed stock, rating, past sales. Accept/reject per row (reason); auto-reject if below the minimum discount or price-history manipulation is detected (price raised in the last 30 days).
- **Curation:** order products (drag), hero products.
- **Live monitor:** live units sold vs committed stock per product (polling), sold-out flags, GMV ticker, "Pull product" emergency action (reason).
- **Post-sale report.**

**As built (Phase 5).** The full state machine, auto-rejection below the
minimum discount, accept/reject with a reason, the live monitor (polled every
15s) and the emergency pull (reason required, typed confirmation) are all
built. Curation order uses up/down buttons rather than drag — functionally
identical, since the server takes an ordered id list either way. Not built:
nominating *on behalf of* a seller from a seller-panel-side flow (there is no
seller panel yet, per the locked decision that it is a separate future
project) — nominations are seeded as already submitted.

### M10.4 Sale Events (Big Billion Days-style)

**Route** `/marketing/events`

- **Event:** name, dates (early access window optional), theme assets, participating categories, seller participation rules (min discount, stock commitment), linked coupons, flash sales, deals and banners.
- An **event calendar** view across all marketing objects.
- **Readiness checklist:** banners scheduled, deals curated, seller participation %, inventory coverage, courier capacity heads-up.

**As built (Phase 5).** The readiness checklist (banners scheduled, deals
curated, seller participation, inventory coverage) is real and computed on
every read. Seller participation % and inventory coverage % are themselves
seeded numbers rather than rolled up from live orders and stock, because
that rollup depends on an event knowing which sellers and SKUs it is
supposed to cover — a seller-commitment flow this phase does not build. The
calendar view across all marketing objects is not built as its own screen;
an event's detail page lists its linked coupons, flash sales and deals
instead.

### M10.5 Referral Program

**Route** `/marketing/referral`

- **Config:** referrer reward (app shows "₹100 per friend") and referee reward (wallet credit / coupon), trigger (referee's first order delivered and return window closed), caps (per referrer per month), validity, terms text shown on the app Referral screen.
- **Referrals list:** referrer*, referee*, code*, status* (Signed up / First order placed / Qualified / Rewarded / Rejected-fraud), reward amount, dates.
- **Fraud:** same device/address/payment instrument → auto-hold for review (approve/reject).

**As built (Phase 5).** Config, the referral list, and approve/reject are
built. `FRAUD_REVIEW` (the spec's "auto-hold for review") is a seeded
starting state — the actual same-device/same-address/same-payment-instrument
detector that would set it is a fraud-signals pipeline outside this phase.

### M10.6 Campaigns (push / SMS / email / in-app / WhatsApp)

**Route** `/marketing/campaigns` · `/marketing/campaigns/new`

- **Create wizard:**
  1. Audience: segment, or upload; estimated reach per channel (opt-in aware).
  2. Channel(s).
  3. Content per channel. Push: title, message, image, deep link (pick app screen + params: product, category, deal, coupon, flash sale). In-app notifications match the app's notification model (`type`, `icon`, `title`, `message`). Personalisation tokens. Live device preview (Android/iOS).
  4. Schedule: now / later / recurring; quiet hours respected (no push 10 PM–8 AM); frequency cap.
  5. A/B variants (optional, split %).
  6. Review & send (test send to my device/email first).
- **Statuses:** Draft / Scheduled / Sending / Sent / Paused / Cancelled / Failed.
- **Report:** sent, delivered, opened/clicked, conversions, GMV attributed, unsubscribes.

**As built (Phase 5).** Audience targeting (everyone / new / segment /
custom list), channel selection, quiet-hours enforcement (with an explicit
override) and a one-click test send are built. Not built: per-channel content
divergence in the creation form (one title and message is used for every
selected channel, rather than a per-channel editor), device preview,
A/B variants, and the full delivered/opened/clicked/conversion report beyond
the summary numbers already shown in the list.

### M10.7 Customer Segments

**Route** `/marketing/segments`

- **RuleBuilder:**
  - Profile: city, state, joined date, platform
  - Behaviour: orders count, GMV, last order date, categories purchased, cart abandoned in last N days, wishlist contains, app inactive N days
  - Value: wallet balance, coupon usage
- **Live count estimate.**
- **Static (snapshot) vs dynamic segments.** Used by coupons, campaigns and cashback.

**As built (Phase 5).** The RuleBuilder is one flat AND/OR group rather than
nested groups — every segment the spec describes ("high value," "inactive 30
days," "Mumbai shoppers") is a flat list, and the matching engine
(`mocks/engine/segments.js`) already supports nesting if a future segment
needs it. Static vs dynamic segments are both built, including the
point-in-time member snapshot a static segment freezes at creation.

### M10.8 Bank Offer Display

**Route** `/marketing/bank-offers`

- Offers are synced from the payment gateway's offer engine (read-only: bank, card type, discount, cap, min spend, validity, EMI schemes).
- **Admin controls:**
  - Visibility toggle per offer.
  - Display placements: PDP offers list (as in the app's `BANK_OFFERS`), checkout, offers page.
  - Display order and short display copy override (title/text).
  - Hide expired automatically.
- A "Last synced at" indicator and a manual "Sync now" action.

---

## M11 Sponsored Ads

Permissions: `ads.campaign.view|review|pause`, `ads.placement.*`, `ads.billing.*`, `ads.policy.*`.

### Model

Sellers (advertisers) create campaigns in the future seller panel; the admin can create on behalf. A **Sponsored Product** campaign has a daily budget, total budget, schedule, bidding (CPC) and targeting (automatic, or keywords/categories/products). Ad groups hold promoted products; served ads render in the app with the `ad: true` "Ad" tag (e.g. similar products on the PDP, search results, home rails).

**Campaign state machine:**
```
DRAFT ─submit─▶ PENDING_REVIEW ─approve─▶ ACTIVE ─▶ PAUSED (by advertiser | admin policy | BUDGET_EXHAUSTED daily auto-resume next day | WALLET_EMPTY)
                     └─reject─▶ REJECTED (reason)        ACTIVE ─end date / total budget─▶ ENDED ; any ─archive─▶ ARCHIVED
```

### Screens

1. **Campaigns** `/ads/campaigns`:
   - Columns: campaign*, advertiser (seller)*, type*, status*, daily budget*, spend today*, total spend*, impressions*, clicks*, CTR*, avg CPC*, ad orders*, ad GMV*, ROAS*, schedule.
   - Detail: settings, ad groups/products, keywords/targets with bids, performance charts, search term report, placement breakdown, audit.
   - Admin actions: pause for policy (reason, advertiser notified), resume, end.
2. **Ad Review Queue** `/ads/review`:
   - Check promoted products are LIVE and in stock; keywords against blocked terms (competitor brands, prohibited); custom creatives (banner ads, if enabled) against policy.
   - Approve / reject per item.
3. **Placements & Pricing** `/ads/placements`:
   - Placement inventory: search top, search in-grid positions, PDP similar products, home sponsored rail, category page.
   - Per placement: enabled, max ads per page, positions, floor CPC by category, ad-label style.
   - Auction settings: second-price + quality score weight (relevance × CTR).
   - ⚑ MC on floor price changes.
4. **Advertiser Billing** `/ads/billing`:
   - Advertiser ad wallets (prepaid recharge, or deduct from payouts, toggle per seller): balance, recharges, spend ledger, invalid-click credits.
   - Monthly ad invoices (with GST).
   - Low-balance alerts.
5. **Invalid traffic:** flagged clicks (bot/repeat), credits issued (list + manual credit with reason).
6. **Ads reports** `/ads/reports`: platform ad revenue, fill rate per placement, top advertisers, category CPC trends.

**As built (Phase 7).** Campaigns, the ad review queue, placements &
pricing, advertiser billing (wallets + invoices), invalid traffic and
reports are all built against the full spec above, with these deviations:

- Campaign **search term reports** and **custom creative/banner ads** are
  out of scope — every campaign promotes products only (Sponsored Products),
  which is what Journey 7 and every seeded campaign exercises.
- The **ad review queue** checks are automated and deterministic
  (`reviewCampaign` in `src/mocks/engine/ads.js`): every promoted product
  must be `LIVE` with positive stock on its live offer, and every keyword is
  checked against a blocked-terms list (competitor brand names, prohibited
  words). There is no creative/banner-ad review, since custom creatives were
  cut above.
- **Invalid traffic** is folded into the Advertiser Billing screen as a
  third tab rather than a separate route — the spec lists it directly under
  Billing, and crediting a flagged click is really a billing action (it
  writes the same wallet ledger a recharge or a spend does).
- **Placement reach** per positions (search top / in-grid / PDP similar /
  home rail / category page) is seeded as five fixed placements with their
  own floor-CPC-by-category table; there is no placement *creation* UI,
  since the spec's five slots are the complete inventory the app actually
  renders ad units into.
- Changing a placement's floor CPC is the one maker-checker action in this
  module (`ads.placement.edit`, guarded, `ads_manager` as maker and
  `super_admin` as approver — see §16.4 of the plan for why). Every other
  placement field (enabled, max ads per page, quality-score weight, ad-label
  style) applies immediately.
- The second-price auction (`rankAuction` in `ads.js`) and the daily
  spend/CTR/ROAS summarisation (`summariseCampaignStats`) are pure,
  separately unit-tested functions — the same engine-function pattern every
  earlier phase has used for its own correctness-critical logic.
- `record-spend` is the one endpoint that both logs daily stats **and**
  debits the advertiser's wallet (writing an `advertiserLedger` row), so
  billing can never drift from what the reporting tables show. A
  `PREPAID` wallet that reaches zero auto-pauses its campaign with
  `WALLET_EMPTY`; a `DEDUCT_FROM_PAYOUT` advertiser is never debited here at
  all — their spend settles through the Phase 4 seller payout cycle instead,
  and they have no wallet balance, recharge action, or invoice.

---

## M12 Content (CMS)

Permissions: `cms.home.*` (publish needs `cms.home.publish`), `cms.banner.*`, `cms.page.*`, `cms.help.*`, `cms.reasons.*`, `cms.search.*`.

### M12.1 Home Layout Builder

**Route** `/cms/home`

Drives the app's `HomeScreen` section order and content.

- **Layout:** left is the section library; centre is a **live phone preview** (rendered with the app's spacing/colors approximations); right is the selected section's config.
- **Sections** (mirroring the app's home components exactly):

  | Section | Config |
  |---|---|
  | Hero Banner Carousel | Banners (from M12.2), autoplay interval |
  | Ad Sheet Card | Banners list |
  | Recently Viewed Rail | Toggle only (personalised) |
  | Flash Sale Banner | Linked flash sale (M10.3), auto-hide when none is live |
  | Ad Tile Row | Tiles: image, bannerText ("Min. 35% Off"), label, deep link |
  | Suggested For You | Algorithm source (personalised / trending / manual list), count |
  | Brands Spotlight | Brands with image, discount text, subtitle (app `BRANDS_SPOTLIGHT`) |
  | Top Value Deals | Linked deals (M10.2) |
  | Product Feed | Source (personalised / category / manual), infinite scroll |
  | Sponsored rail | From M11 placements |

- **Per section:** visibility (all / segment / city / platform / app version ≥), schedule (start/end).
- **Versioning:** Draft → Scheduled → Published. Each publish is versioned (rollback to any previous version with one click, ⚑ MC). A preview link is available for internal testers.
- **Category tabs** (app `CATEGORY_TABS`): label, icon, gradient colors (color pickers with live preview), order, each tab can have its own layout variant (For You, Fashion, Mobiles, …).
- **Top brand tabs** (app `TopBrandTabs`: Arise / Deals): label, logo, target.

**As built (Phase 5).** Sections, visibility rules, Draft → Published
versioning with rollback (maker-checker on the rollback only, per the
permission catalog), category tabs and top brand tabs are all built and
exactly match the mobile app's own `CATEGORY_TABS` / `BRAND_TABS` /
`BRANDS_SPOTLIGHT` / `TOP_VALUE_DEALS` constants, so the first published
layout is the layout the app already renders. Publishing strips the admin's
internal version record down to exactly the JSON `HomeScreen` consumes — the
Phase 5 exit criterion. Two scope cuts: a section's own `config` is edited as
raw JSON rather than ten bespoke per-type visual editors, and section/tab
reordering is up/down buttons rather than drag (dnd-kit is installed but
pointer-drag cannot be driven or verified without a real browser here). Not
built: the live phone-rendered preview panel, the schedule window on an
individual section (visibility by segment/city/platform/app-version is
built; a start/end date on top of it is not), and a preview link for internal
testers.

### M12.2 Banners

**Route** `/cms/banners`

- **Banner:** name, images per platform/aspect (hero 16:9 mobile; tile 1:1; web sizes) with crop guides, alt text, deep link (screen picker + params), placement(s), targeting (segment/city/platform), schedule, priority.
- **Status:** Draft / Scheduled / Live / Expired / Paused.
- **Performance:** impressions and CTR per banner.
- **Calendar view** for placement conflicts.

**As built (Phase 5).** Placement, targeting, scheduling and a derived
status (a banner computes LIVE/SCHEDULED/EXPIRED from its own dates rather
than being set by hand) are built, along with impressions and CTR. Images
are a URL field rather than an upload — there is no real asset store behind
this mock. The calendar view for placement conflicts is not built as its own
screen.

### M12.3 Onboarding Slides

**Route** `/cms/onboarding`. Slides for the app's `OnboardingScreen`: image/Lottie, title, subtitle, order, active; preview.

**As built (Phase 5).** Reordering is up/down buttons, not drag.

### M12.4 Static Pages

**Route** `/cms/pages`

- About, Privacy Policy, Terms & Conditions (app Settings screens), Return policy, Shipping policy, Seller policies.
- Rich text editor with version history.
- "Material change" flag forces in-app re-acceptance (consent tracked).

**As built (Phase 5).** Version history, material-change flagging and the
re-acceptance flag are built. The rich-text editor called for is a plain
textarea — TipTap was never wired into this panel, and policy prose does not
lose anything a customer would notice without it. "Material change forces
in-app re-acceptance, consent tracked" sets the flag and the requirement on
this side; actually capturing a customer's re-acceptance happens in the app,
outside this admin panel's scope.

### M12.5 Help Center

**Route** `/cms/help`. Drives the app's HelpCenter/HelpCategory/HelpArticle screens and `helpData.js`.

- **Categories:** e.g. Orders & Shipping, Payments & Refunds, Returns Exchange & Refund, Account & Profile, Product & Seller Issues. Each has an icon, title, subtitle and order.
- **Articles/FAQs:** question, answer (rich text), category, related actions (deep link buttons like "Track order"), helpful votes, status.
- **Search analytics:** top searched terms with no result.

**As built (Phase 5).** Categories, articles, votes and a search-analytics
panel are built — the latter as a seeded static sample, since there is no
real search index logging queries behind this mock yet.

### M12.6 Search Configuration

**Route** `/cms/search`

- **Synonyms:** bidirectional/one-way (e.g. "tv ↔ television", "earbuds → tws").
- **Redirects:** keyword → category/brand/landing page.
- **Boost/bury rules:** by product, brand, seller, Assured, in stock.
- **Trending searches & autocomplete suggestions** (app `searchData.js` recent/trending) with manual pins.
- **Blocked search terms.**
- **"Test search" tool:** shows ranked results with applied rules explained.

**As built (Phase 5).** Synonyms (both-way and one-way), redirects,
boost/bury rules, trending searches (with manual pins) and blocked terms are
all built, plus a "test search" tool that runs a real query against the live
catalog and shows which rule touched the result — so a change can be checked
before it reaches customers. The boost/bury scoring in that test tool is a
simplified heuristic (seller tier and join-date proxies for "Assured" and
"new seller" flags) rather than the full relevance × CTR auction a real
search index would run.

### M12.7 Reason Masters

**Route** `/cms/reasons`

A single place for every reason list the app and admin use:
- Customer cancel reasons (app `CANCEL_REASONS`)
- Return reasons (app `RETURN_REASONS`) with **fault attribution** (customer remorse vs seller fault vs courier), which drives reverse-shipping fee and penalties
- Ticket subjects (app `TICKET_SUBJECTS`)
- Admin action reasons (hold, block, suspend, refund)
- NDR reasons

Each reason has customer-visible text, internal code, active flag and order. "Other" requires free text.

---

**As built (Phase 5).** All five lists (cancel, return, ticket subject, admin
action, NDR) are built in one screen, each with order, active flag and a
protected free-text "Other" entry that cannot be deleted. Return reasons
require a fault attribution before they can be saved, since it decides who
pays the reverse shipping fee. **Not wired up**: the Phase 2/3 order and
return handlers still read their reason lists from a hardcoded
`FAULT_BY_REASON` map rather than this collection — retrofitting them was
judged a larger, riskier change than this phase's scope justified, and is
left as explicit follow-up work rather than silently left inconsistent.

## M13 Reviews & Q&A

Permissions: `reviews.review.view|moderate`, `reviews.qa.moderate`, `reviews.abuse.*`.

### M13.1 Reviews

**Route** `/reviews`

- **Tabs:** Pending moderation · Published · Rejected · Flagged by users.
- **Columns:** product*, rating* (stars), title/text excerpt*, media count*, author*, certified buyer* (purchased + delivered), variant/size (as in app reviews: `size`), helpful votes, submitted at*, auto-moderation result* (clean / profanity / PII / spam / incentivised / off-topic), status*.
- **Moderation view:** full text + media, the customer's order context, other reviews by the same author (detect review rings).
- **Actions:**
  - Publish
  - Reject (reason, customer notified)
  - Hide media only
  - Mark as seller-incentivised (penalty link)
- **Bulk:** publish clean ones, reject.
- **Rules:** auto-publish if clean + certified buyer; manual for media reviews (configurable).

**As built (Phase 6).** Auto-moderation classifies every review (clean /
profanity / PII / spam / incentivised / off-topic) and auto-publishes a
clean, certified-buyer review with no media — through the same pure
classifier the handler uses, so the seed, the list and a freshly submitted
review can never disagree about what "clean" means. Publish, reject (with a
reason, customer notified), hide-media-only, flag-as-incentivised and bulk
publish/reject are all built. "Other reviews by the same author" surfaces
on the moderation drawer for spotting review rings. Not built: a configurable
auto-publish rule (clean + certified buyer is currently the one fixed rule,
not an admin-editable setting).

### M13.2 Questions & Answers

**Route** `/reviews/qa`

- **Questions:** product, question, asker, answers count, status; moderate the question and answers (seller, certified buyers, admin "Arise answer").
- **Unanswered questions older than N days:** nudge the seller.
- Matches the app's QuestionsAnswers/QuestionDetail (answers have author, text, date, helpful).

**As built (Phase 6).** Moderating a question, answering as Arise, and
flagging unanswered questions with their age in days are built. The "nudge
the seller" action itself is not — there is no seller panel yet (a locked,
separate future project), so there is nowhere for that nudge to be delivered.

### M13.3 Abuse Reports

**Route** `/reviews/abuse`. User-reported reviews/answers: reason, reporter count, actions (dismiss, remove content, warn/block author).

---

**As built (Phase 6).** Dismiss and remove are both built; removing a
reported review also rejects it, in one action, rather than requiring a
second trip to the Reviews screen. Warn/block the author is not built — it
would act on the customer record (Phase 2), and this phase stopped at the
report-and-content decision.

## M14 Customer Support

Permissions: `support.ticket.view|reply|assign|close`, `support.queue.manage`, `support.macro.*`, `support.sla.*`, `support.chat.handle`, `support.csat.view`. Agents are scoped to queues.

### Ticket model

**Ticket state machine:**
```
NEW ─assign─▶ OPEN ─reply & wait─▶ PENDING_CUSTOMER ─customer replies─▶ OPEN
OPEN ─▶ PENDING_INTERNAL (escalated to seller-ops/finance/logistics/catalog) ─▶ OPEN
OPEN ─▶ RESOLVED ─(no reply 72h)─▶ CLOSED ; RESOLVED ─customer reopens─▶ OPEN
```

**Sources:** app Raise Ticket, Order Issue, Return issue, Live chat escalation (and the future seller panel).

**Fields:** subject (from `TICKET_SUBJECTS`), category, priority (auto from rules: e.g. high order value or repeated contact), linked order/item, requester (customer or seller), queue, assignee, SLA (first response, resolution), tags, CSAT.

### M14.1 Ticket Queues & Inbox

**Route** `/support/tickets` · `/support/tickets/:id`

- **Views:** My open · Unassigned · Queue (Orders, Payments & Refunds, Returns, Account, Seller issues) · Breaching SLA · All.
- **Columns:** ticket ID*, subject*, requester*, linked order*, priority*, status*, assignee*, SLA countdown* (green/amber/red), last update*, channel*, CSAT.

**Ticket workspace (agent console)**, three panes:
1. **Left:** conversation thread (customer messages, agent replies, internal notes in a distinct style, system events). Composer with macros (insert canned reply with variables), attachments, reply vs internal note toggle, status-on-send dropdown.
2. **Right:** **Customer 360 mini:** profile, recent orders with statuses, open returns/refunds, wallet balance, previous tickets, risk flags.
3. **Inline order actions without leaving the ticket** (permission-checked): cancel item, initiate return, issue refund/goodwill (⚑ MC), reschedule delivery, resend invoice. Each action auto-logs a note on the ticket.

**Ticket actions:** assign/reassign, change priority/queue, merge duplicate tickets, escalate (to queue with SLA), link to order, split ticket, resolve (resolution code mandatory).

**As built (Phase 6).** The queue-scoping, SLA countdowns, named views
(My open / Unassigned / Breaching), the full state machine
(`NEW → OPEN → PENDING_CUSTOMER/PENDING_INTERNAL → RESOLVED → CLOSED`, with
auto-close left as a documented constant rather than a running timer — see
below), the three-pane workspace, macros rendered with the ticket's own
variables, assign/reassign, escalate, merge and resolve-with-mandatory-code
are all built and tested, including Journey 6 end to end. **Inline order
actions are deliberately not re-implemented here** — see §16.3: the
workspace links out to the order detail page, which already owns cancel,
refund, reschedule and resend-invoice. Split (the reverse of merge) is not
built. The 72-hour auto-close of a resolved ticket with no reply is a
constant (`AUTO_CLOSE_HOURS`) the engine exports but nothing currently
sweeps on a timer — there is no background job runner in this mock for a
process that is supposed to fire with no admin action at all.

### M14.2 Live Chat Console

**Route** `/support/chat`

The app's LiveChatScreen escalates "talk to a human agent".

- **Agent status:** Online/Away/Offline; max concurrent chats.
- **Incoming queue** with wait time (the app tells customers the "average wait time"; this value is computed here).
- **Multi-chat tabs:** chat thread (typing indicator via polling in mock), bot transcript shown before handover, same Customer 360 side panel and inline order actions, quick replies, transfer to another agent/queue, convert to ticket, end chat (disposition code).
- **Supervisor view:** live chats, waiting customers, agent load, ability to whisper (internal note) or take over.

**As built (Phase 6).** Agent status, the waiting queue with a real computed
average wait time, claiming a chat, multi-active-chat handling, transfer,
convert-to-ticket (carrying the full transcript across) and end-with-disposition
are all built. The bot transcript shown before handover is seeded as the
first two messages of every session rather than driven by an actual bot
flow — there is no conversational bot in this mock. The supervisor view
(live chats, waiting customers, agent load, whisper/take-over) is not built;
`support.chat.supervise` exists in the permission catalog and the transfer
endpoint checks it, but the dedicated supervisor screen itself is deferred.

### M14.3 Macros

**Route** `/support/macros`. Name, category, body with variables (`{{customer.name}}`, `{{order.id}}`, `{{refund.eta}}`), optional actions (set status, add tag), shared/personal, usage stats.

**As built (Phase 6).** Variables, shared/personal, usage stats and
rendering (substitution happens client-side, with the server storing
exactly what was sent) are built. Macro actions (`setStatus`, `addTag`) are
stored on the macro but applied through the composer's own status-on-send
control rather than automatically — an agent still confirms the status
change that goes with a macro, rather than a macro silently resolving a
ticket on insert.

### M14.4 SLA Policies & Routing

**Route** `/support/sla`

- **SLA policy per priority/queue:** first response and resolution targets, business hours (IST, holidays calendar), escalation steps (notify lead at 80%, reassign at breach).
- **Routing rules:** conditions → queue/priority/tags; auto-assignment (round-robin / load-based / skill-based).

**As built (Phase 6).** Per-priority targets with a queue-specific override
(the specific one always wins — pinned by its own test), and routing by
first-matching-rule, are both built and editable. Business-hours-aware SLA
(the spec's "business hours (IST, holidays calendar)") is a stored flag
(`businessHoursOnly`) that nothing yet acts on — every deadline in this
mock counts wall-clock time, 24×7, which is the simpler and more legible
behaviour for a seed dataset.

### M14.5 CSAT & Quality

**Route** `/support/csat`

- CSAT survey config (sent on resolve; 1–5 + comment).
- Dashboards: CSAT by agent/queue/category.
- Low-CSAT follow-up queue.
- QA review sampling (lead scores tickets against a rubric).

---

**As built (Phase 6).** CSAT config, the dashboard (overall average,
response rate, by-agent and by-queue breakdowns, all computed from real
ticket scores) and the low-score follow-up queue are built. QA review
sampling (a lead scores a resolved ticket against a rubric, averaged into
one overall score) is built as a straightforward record-and-list; it does
not yet enforce a sampling *rate* (e.g. "score 10% of resolved tickets") —
a lead picks which tickets to review rather than the system assigning a
sample.

## M15 Reports & Analytics

Permissions: `reports.<domain>.view`, `reports.export`, `reports.schedule`.

### M15.1 Analytics Dashboards

**Route** `/reports/analytics`

Each dashboard has a date range + compare, filters (category, seller, city, channel), charts and a drill-down table.

| Dashboard | Content |
|---|---|
| Sales | GMV, net sales, AOV, units, by category/brand/seller/city/channel, hourly heatmap |
| Customers | New vs returning, cohort retention grid (monthly), CLV distribution, top cities |
| Catalog | Live listings trend, QC throughput/TAT, content score, out-of-stock rate |
| Sellers | Active sellers, onboarding funnel (applied → approved → first listing → first order), performance distribution |
| Fulfilment | Dispatch SLA, delivery TAT by zone/courier, NDR %, RTO %, FBA vs self-ship |
| Returns | Return rate by category/reason/seller, refund TAT |
| Finance | Revenue (commission/fees/ads), refunds, payouts, COD outstanding |
| Marketing | Coupon ROI, campaign performance, referral funnel, flash sale results |
| Support | Ticket volume, FRT/resolution time, CSAT, contact rate per order |

### M15.2 Report Library & Scheduled Reports

**Route** `/reports/library`

- Predefined tabular reports (e.g. Order item report, Settlement report, GST sales register, Inventory ageing, NDR report), each with filters and column selection.
- **Schedule:** daily/weekly/monthly, format (CSV/XLSX), recipients (admin users only), delivery via email link.

### M15.3 Export Center

**Route** `/reports/exports`. All export jobs (from any list or report): name, requested by, filters snapshot, status, rows, created at, expires at, download. PII exports are flagged and audited.

**As built (Phase 8).** All nine Analytics Dashboards (sales, customers,
catalog, sellers, fulfilment, returns, finance, marketing, support) are
built, aggregated live from the real collections every other module
already edits (`src/mocks/handlers/reports.js`) rather than a second,
invented series — orders, settlement lines, tickets, campaigns and
referrals are read directly. Date range + compare is built as a days
selector (7/30/90); per-domain category/seller/city/channel filters are
not — each dashboard instead already breaks its own totals down by the
dimensions in the spec table (e.g. Sales shows top categories, cities and
channels together, rather than one filterable chart). **Not built:** the
hourly order heatmap, the customer cohort-retention grid, and catalog's
QC throughput/TAT and content score — the seed data to make them
meaningful doesn't exist yet (see the plan's Phase 8 decisions).

The Report Library lists seven predefined reports (including every one
the spec names) with their columns and filters shown, and "Run" creates
an export job through the same job simulator every list's own "Export"
button already uses — there is no separate export pipeline. Scheduled
Reports supports daily/weekly/monthly, CSV/XLSX, and admin-only
recipients, each independently enabled/disabled. The Export Center lists
every export job regardless of source, with a PII flag and a progress bar
while a job is still processing; "Download" is a toast in this mock,
since there is no real file behind `resultUrl`.

---

## M16 Notification Templates

**Route** `/notifications/templates` · `/notifications/logs` · **Perm** `notifications.template.*`, `notifications.log.view`

- **Transactional events:** Order placed, Packed, Shipped, Out for delivery (with delivery code/OTP), Delivered, Cancelled, Return requested/approved/picked/refunded, Refund completed, Payment failed, Wallet credited, Gift card received, Ticket updated, Seller application status, Payout paid, KYC expiry, etc.
- **Per event × channel** (Push / SMS (DLT template ID field for India TRAI compliance) / Email / WhatsApp (template approval status) / In-app):
  - Content with variables, preview with sample data, enabled toggle, version history.
  - Test send.
- **Delivery logs:** recipient (masked), event, channel, provider, status (Queued / Sent / Delivered / Failed / Bounced), failure reason, timestamp. Resend action.

---

**As built (Phase 5).** All 17 transactional events, each carrying all five
channels with its own content, enabled toggle, version history and test
send, are built. SMS requires a DLT template ID and WhatsApp carries a
provider-approval status, both enforced. Delivery logs list every
notification with a masked recipient and a resend for failed/bounced ones.
Not built: a live preview with sample data substituted for `{{variables}}`
(the editor shows the raw template) and WhatsApp template approval as a
workflow (the status is shown but not actioned from here).

## M17 Administration & Settings

### M17.1 Admin Users

**Route** `/admin/users` · **Perm** `admin.user.*`

- **List:** name*, email*, role(s)*, scopes*, status* (Invited / Active / Locked / Deactivated), 2FA* (enrolled), last login*, created by.
- **Invite flow:** email, name, role, scopes (categories/sellers/warehouses/queues/limits) → invite email (mock: link shown in the dev toolbar) → status Invited (resend/revoke).
- **User detail:** profile, roles & scopes (edit = ⚑ MC for privilege escalation), login history (time, IP, device, success/fail), active sessions (revoke), reset 2FA (⚑ MC), unlock, deactivate (reassigns their open tickets/QC items to a chosen user).

### M17.2 Roles & Permissions — see plan §12.2

### M17.3 Approvals (Maker-Checker) and M17.4 Audit Log — see plan §12.4 and §12.5

### M17.5 Platform Settings

**Route** `/admin/settings` (sectioned page with anchor nav; each section saved independently, versioned, audited; sensitive sections ⚑ MC)

| Section | Settings |
|---|---|
| General | Platform name (Arise), support email/phone, business address, legal entity, GSTINs (per state) |
| Order settings | Payment-pending timeout, seller accept SLA, dispatch SLA by fulfillment type, auto-cancel on SLA breach (yes/no), max qty per order, order value limits for COD (min/max), OTP-on-delivery for orders above ₹X / all |
| Return policies | Category-wise windows (summary; edited in M3.1), auto-approve rules, refund timing per customer trust tier, doorstep QC checklist templates per category |
| Fees | Platform fee (customer), delivery fee thresholds (links M7.3), convenience fee for COD (optional) |
| Payments | Enabled methods, COD availability rules, gateway priority/routing (if multiple), wallet usage cap per order |
| Tax | Invoice number series per GSTIN/FY, HSN defaults, TCS/TDS rates (links M8.6) |
| Seller policies | Tier thresholds (Bronze/Silver/Gold/Platinum metrics), penalty rules (links M4.6), payout cycle (weekly day / T+N), reserve/rolling hold % for new sellers |
| Approval thresholds | All maker-checker thresholds (plan §12.4) |
| Security | Session idle timeout, password policy, IP allowlist for admin panel (optional), PII reveal auto-hide seconds |
| Support | Business hours, holidays calendar, auto-close days |

### M17.6 App Config

**Route** `/admin/app-config`

Drives the app's `appUpdate` and `maintenance` features.

- **Maintenance mode:** on/off per platform (Android/iOS/Web), message, ETA, allowlisted test users. Preview of the app's MaintenanceScreen. ⚑ MC.
- **App versions:** per platform: latest version, **minimum supported version** (below → the app's UpdateRequiredScreen, force update), soft-update prompt version range, release notes, store URLs.
- **Languages:** enabled app languages (from the app's LanguageScreen list, e.g. English, Hindi…), default language.
- **Feature flags:** key, description, on/off, rollout % / segment / platform / min app version (e.g. hide Play tab until launched).

### M17.7 Integrations

**Route** `/admin/integrations`

- Cards per integration: Payment gateway, Couriers (each), SMS (DLT), Email, WhatsApp, Push (FCM/APNs), KYC verification (GSTIN/PAN/penny-drop), Maps/pincode data.
- Each card shows status (Connected / Error / Not configured), last successful call, error rate, and webhook log (last 100 events with payload preview, redacted).
- Credentials fields are write-only (never displayed after save) and changing them needs ⚑ MC.

### M17.8 My Account

**Route** `/me`. Profile, change password, 2FA devices/backup codes regenerate, sessions, notification preferences (which admin alerts I receive in-panel/email), theme preference, table density default.

**As built (Phase 8 — M17.5–M17.7).** Platform Settings has all ten
sections (General, Order settings, Return policies, Fees, Payments, Tax,
Seller policies, Approval thresholds, Security, Support), each saved and
versioned independently; Fees, Approval thresholds and Security are the
three routed through maker-checker (`SENSITIVE_SETTINGS_SECTIONS`), the
rest save immediately. Every field renders through one generic,
type-driven editor rather than a bespoke form per section — see the
plan's Phase 8 decisions for why, and for why Approval thresholds is
informational rather than wired into the maker-checker engine's own
limits.

App Config has per-platform (Android/iOS/Web) version fields, a guarded
maintenance-mode toggle per platform, an enabled-languages/default-language
editor, and full feature-flag CRUD with a live preview that resolves a
flag through the exact rule (`resolveFlag` in `engine/featureFlags.js`)
the app itself would use — platform, minimum version, segment and
rollout % are all ANDed together, with a stable per-device bucket so a
rollout percentage never re-randomises who it reaches.

Integrations has ten seeded cards (payment gateway, three couriers, SMS,
email, WhatsApp, push, KYC, maps) each with status/last-success/error-rate
and a webhook log; credentials are write-only and the change is
maker-checker, same as the plan requires. A second Super Admin account
exists specifically so these three maker-checker actions — and Platform
Settings' sensitive sections, and app config's maintenance toggle — are
not approval requests nobody can ever decide; see the plan's Phase 8
decisions for the full reasoning.

---

## Appendix A — Customer-facing status mapping

The mobile app's `ORDER_STATUS` should adopt this mapping (see plan §18 item 1).

| Admin item state(s) | App label | App journey step |
|---|---|---|
| PAYMENT_PENDING | Pending | — |
| PLACED, ON_HOLD, ACCEPTED | Confirmed | Order placed |
| PACKED, MANIFESTED | Packed | Packed |
| SHIPPED, IN_TRANSIT | Shipped | Shipped |
| OUT_FOR_DELIVERY, UNDELIVERED (reattempt pending) | Out for Delivery | Out for delivery |
| DELIVERED | Delivered | Delivered |
| CANCELLED, PAYMENT_FAILED, RTO_* | Cancelled | — (RTO shows "Returned to seller") |
| RETURN_REQUESTED … CLOSED | Return requested / Returned | Return journey |
| LOST_IN_TRANSIT | Delayed (until resolved → Cancelled + refund) | — |

`canCancel` in the app = item in a cancellable state per M2. `canReturn` = DELIVERED and within the category return window.

---

## Appendix B — Screen inventory

Approximate count of distinct routed screens (excluding drawers and modals):

| Module | Screens |
|---|---|
| Auth & account (login, 2FA, enrol, forgot/reset, invite, me, sessions) | 8 |
| M1 Dashboard | 1 |
| M2 Orders | 6 |
| M3 Catalog | 12 |
| M4 Sellers | 10 |
| M5 Customers | 6 |
| M6 Warehouses | 8 |
| M7 Logistics | 11 |
| M8 Finance | 15 |
| M9 Wallet & Gift cards | 6 |
| M10 Marketing | 16 |
| M11 Sponsored Ads | 7 |
| M12 CMS | 10 |
| M13 Reviews & Q&A | 4 |
| M14 Support | 8 |
| M15 Reports | 5 |
| M16 Notifications | 3 |
| M17 Administration | 12 |
| System (403/404/500, print views, dev component gallery) | 8 |
| **Total** | **≈ 157** |
