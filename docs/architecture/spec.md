# JAFSON JAMMU
## Technical Implementation & Engineering Specification

**Document version:** 1.0  
**Status:** Approved requirements baseline  
**Parent company:** Chameron Industries Pvt. Ltd.  
**Consumer brand:** JAFSON JAMMU  
**Product:** Men's and Kids' Fashion E-commerce  
**Market:** India  
**Platforms:** Web, Android, iOS, Admin  
**POS:** Chameron Bill OS  
**Primary fulfilment location:** JAFSON Jammu Showroom  
**Delivery:** Local delivery, nationwide courier and showroom pickup  
**Inventory:** Unified inventory system  
**Brand direction:** Complete original identity redesign

---

# 1. PRODUCT REQUIREMENTS AND SCOPE

## 1.1 Business objective

Develop a complete, independently owned fashion commerce platform for JAFSON JAMMU.

The platform must allow customers throughout India to browse and purchase men's and kids' clothing while maintaining real-time inventory coordination with the Jammu physical showroom through Chameron Bill OS.

The platform consists of:

1. Public e-commerce website.
2. Installable Progressive Web App.
3. Android application.
4. iOS application.
5. Commerce administration dashboard.
6. Central commerce backend.
7. Unified inventory engine.
8. Bill OS POS integration.
9. Payment and shipping integrations.
10. Analytics and reporting system.

## 1.2 Scope

### Included in version 1

- Complete JAFSON brand redesign.
- Responsive e-commerce website.
- Android and iOS applications.
- Men's and Kids' collections.
- Product and variant management.
- SKU and barcode management.
- Size and colour management.
- Search and filters.
- Shopping cart and wishlist.
- Customer registration and login.
- Checkout and payments.
- COD support.
- Order management.
- Invoice generation.
- Returns and exchanges.
- Unified stock management.
- Bill OS integration.
- Local delivery.
- India-wide courier shipping.
- Store pickup.
- Coupon and discount management.
- Customer notifications.
- Admin analytics.
- Role-based permissions.
- Audit logging.

### Excluded from initial release

- Marketplace for third-party sellers.
- Multi-vendor commissions.
- International sales.
- Subscription commerce.
- AI-based virtual try-on.
- Complex ERP procurement automation.
- Franchise management.

These can be added through subsequent releases.

# 2. TECHNICAL ARCHITECTURE

## 2.1 Architectural pattern

Use an API-first modular monolith with event-driven internal processing.

Do not begin with microservices.

The system must have clear module boundaries so that inventory, payments, orders and customer management can later be extracted into independent services without redesigning the entire product.

## 2.2 Technology decisions

| Component | Technology |
|---|---|
| Monorepo | pnpm |
| Language | TypeScript |
| Website | Next.js |
| Mobile | React + Capacitor |
| Admin | Next.js |
| Backend | NestJS |
| API | REST + OpenAPI |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Background jobs | BullMQ |
| Validation | Zod / class-validator |
| Search | Meilisearch |
| Image storage | Cloudflare R2 |
| CDN and WAF | Cloudflare |
| Cloud infrastructure | AWS |
| Containerization | Docker |
| CI/CD | GitHub Actions |
| Error monitoring | Sentry |
| Testing | Vitest / Jest / Playwright |

Technology versions must be pinned in the repository lockfile and updated through controlled dependency reviews.

## 2.3 System architecture

```text
                  CUSTOMERS
                      |
        +-------------+-------------+
        |             |             |
      WEBSITE       ANDROID        iOS
        |             |             |
        +-------------+-------------+
                      |
                 API GATEWAY
                      |
              NESTJS APPLICATION
                      |
     +----------------+----------------+
     |                |                |
  CATALOGUE        INVENTORY          ORDERS
     |                |                |
  PRODUCTS          STOCK           CHECKOUT
  VARIANTS        RESERVATIONS       PAYMENTS
  CATEGORIES      STOCK LEDGER       RETURNS
     |                |                |
     +----------------+----------------+
                      |
              POSTGRESQL DATABASE
                      |
        +-------------+--------------+
        |             |              |
      REDIS       BACKGROUND       STORAGE
                   WORKERS
                      |
        +-------------+--------------+
        |             |              |
     PAYMENT       SHIPPING        BILL OS
     PROVIDER      PROVIDER       CONNECTOR
```

## 2.4 Application boundaries

### Storefront
Customer-facing shopping experience.

### Mobile
Shared commerce functionality with native mobile integrations.

### Admin
Staff and business operations.

### API
Authentication, commerce logic, inventory, transactions and integrations.

### POS connector
A separate integration module responsible for exchanging validated business events between Bill OS and JAFSON Commerce.

## 2.5 Monorepo structure

```text
jafson-commerce/
│
├── apps/
│   ├── web/
│   ├── mobile/
│   ├── admin/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── design-tokens/
│   ├── shared-types/
│   ├── validation/
│   ├── api-client/
│   ├── commerce-core/
│   ├── inventory-core/
│   ├── analytics/
│   └── configuration/
│
├── infrastructure/
│   ├── docker/
│   ├── aws/
│   ├── cloudflare/
│   └── monitoring/
│
├── integrations/
│   ├── bill-os/
│   ├── payments/
│   ├── shipping/
│   ├── whatsapp/
│   └── notifications/
│
├── docs/
│   ├── architecture/
│   ├── database/
│   ├── api/
│   ├── ux/
│   ├── testing/
│   └── deployment/
│
├── scripts/
├── tests/
├── pnpm-workspace.yaml
└── package.json
```

# 3. DATABASE DESIGN

## 3.1 Database principles

PostgreSQL is the authoritative commerce database.

Requirements:

- UUID primary keys.
- Foreign key constraints.
- Explicit database indexes.
- UTC timestamps.
- Integer paise for monetary values.
- Decimal quantities only where required.
- Immutable transaction records.
- Database transactions for inventory operations.
- Soft deletion only for appropriate business entities.
- Explicit audit history.
- Idempotency for external integrations.
- Optimistic concurrency where appropriate.

Never store money as floating-point values.

## 3.2 Identity and access tables

### users

| Column | Type | Constraint |
|---|---|---|
| id | UUID | Primary key |
| phone | VARCHAR(20) | Unique, nullable |
| email | VARCHAR(255) | Unique, nullable |
| password_hash | TEXT | Nullable |
| status | VARCHAR(20) | Active/blocked |
| phone_verified_at | TIMESTAMPTZ | Nullable |
| email_verified_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | Required |
| updated_at | TIMESTAMPTZ | Required |

### user_addresses

- id UUID PRIMARY KEY
- user_id UUID REFERENCES users
- full_name
- phone
- address_line_1
- address_line_2
- landmark
- city
- district
- state
- postal_code
- country_code
- address_type
- is_default
- created_at
- updated_at

### roles

- id
- name
- description

### permissions

- id
- resource
- action

### role_permissions

- role_id
- permission_id

### user_roles

- user_id
- role_id

Additional tables:

- user_sessions
- otp_challenges
- refresh_tokens
- login_attempts
- audit_logs

## 3.3 Catalogue tables

### categories

- id UUID PRIMARY KEY
- parent_id UUID REFERENCES categories
- name
- slug UNIQUE
- description
- image_url
- collection_type
- sort_order
- is_active
- seo_title
- seo_description
- created_at
- updated_at

Initial top-level collections:

- MEN
- KIDS

Subcategories must be managed dynamically.

### products

- id UUID PRIMARY KEY
- name
- slug UNIQUE
- description
- brand
- product_type
- category_id
- collection_type
- gender_target
- age_group
- fabric
- fit
- care_instructions
- status
- is_featured
- is_new_arrival
- seo_title
- seo_description
- created_at
- updated_at

### product_variants

- id UUID PRIMARY KEY
- product_id REFERENCES products
- sku UNIQUE
- barcode UNIQUE
- colour
- size
- size_system
- age_label
- cost_price_paise
- selling_price_paise
- compare_at_price_paise
- weight_grams
- is_active
- created_at
- updated_at

### product_images

- id
- product_id
- variant_id NULLABLE
- storage_key
- image_url
- alt_text
- sort_order
- is_primary

### product_attributes

- id
- product_id
- attribute_name
- attribute_value

### size_charts

- id
- collection_type
- size_system
- chart_name
- measurement_unit
- configuration_json

Support age guidance and body measurements for Kids' clothing.

### product_categories

- product_id
- category_id

Use this junction table if products can appear in multiple categories.

## 3.4 Inventory tables

### inventory_locations

- id
- name
- location_type
- address_id
- is_active
- created_at

Initial location:

`JAFSON_JAMMU_SHOWROOM`

### inventory_balances

- id
- location_id
- variant_id
- on_hand_quantity
- reserved_quantity
- safety_stock_quantity
- version
- updated_at

Unique constraint:

`UNIQUE(location_id, variant_id)`

### inventory_movements

- id UUID PRIMARY KEY
- location_id
- variant_id
- movement_type
- quantity_delta
- reference_type
- reference_id
- idempotency_key
- source_system
- actor_id
- reason
- created_at

### inventory_reservations

- id
- order_id
- variant_id
- location_id
- quantity
- status
- expires_at
- created_at

### inventory_adjustments

- id
- variant_id
- location_id
- previous_quantity
- adjusted_quantity
- reason
- created_by
- created_at

### inventory_transfers

- id
- source_location_id
- destination_location_id
- status
- created_by
- created_at
- completed_at

### inventory_transfer_items

- transfer_id
- variant_id
- quantity

All inventory changes must create corresponding movement records.

## 3.5 Commerce tables

### carts

- id
- user_id NULLABLE
- session_id
- status
- currency
- created_at
- updated_at

### cart_items

- id
- cart_id
- variant_id
- quantity
- unit_price_snapshot_paise
- created_at
- updated_at

### wishlists

- id
- user_id
- created_at

### wishlist_items

- wishlist_id
- variant_id
- created_at

### orders

- id UUID PRIMARY KEY
- order_number UNIQUE
- user_id
- channel
- status
- payment_status
- fulfilment_status
- currency
- subtotal_paise
- discount_paise
- shipping_paise
- tax_paise
- total_paise
- billing_address_snapshot JSONB
- shipping_address_snapshot JSONB
- idempotency_key UNIQUE
- created_at
- updated_at

### order_items

- id
- order_id
- product_id
- variant_id
- sku_snapshot
- product_name_snapshot
- variant_description_snapshot
- quantity
- unit_price_paise
- discount_paise
- tax_paise
- line_total_paise

### order_status_history

- id
- order_id
- old_status
- new_status
- actor_id
- reason
- created_at

### order_notes

- id
- order_id
- note
- is_internal
- created_by
- created_at

## 3.6 Payments and financial tables

### payment_attempts

- id
- order_id
- provider
- provider_order_id
- provider_payment_id
- amount_paise
- currency
- status
- idempotency_key
- created_at
- updated_at

### payment_transactions

- id
- order_id
- payment_attempt_id
- transaction_type
- amount_paise
- provider_reference
- status
- created_at

### refunds

- id
- order_id
- payment_transaction_id
- provider_refund_id
- amount_paise
- reason
- status
- created_at
- completed_at

### invoices

- id
- order_id
- invoice_number UNIQUE
- invoice_date
- seller_legal_name
- seller_gstin
- buyer_snapshot JSONB
- tax_breakdown JSONB
- total_paise
- document_url
- created_at

Invoice and tax configuration must be validated against the company's GST registration and applicable place-of-supply rules.

## 3.7 Shipping and fulfilment tables

### fulfilments

- id
- order_id
- fulfilment_location_id
- fulfilment_type
- status
- assigned_staff_id
- created_at
- completed_at

### shipments

- id
- fulfilment_id
- courier_provider
- awb_number
- shipping_label_url
- tracking_url
- status
- dispatched_at
- delivered_at

### shipment_events

- id
- shipment_id
- event_code
- event_description
- event_timestamp
- raw_payload JSONB

### delivery_zones

- id
- name
- delivery_type
- is_active

### serviceable_pincodes

- id
- pincode
- zone_id
- delivery_type
- shipping_fee_paise
- minimum_order_paise
- is_active

### store_pickups

- id
- order_id
- location_id
- pickup_code
- status
- collected_by
- collected_at

## 3.8 Returns and promotions

Create:

- return_requests
- return_items
- exchange_requests
- return_inspections
- coupons
- coupon_redemptions
- promotions
- promotion_products
- promotion_categories
- loyalty_accounts
- loyalty_transactions

All return decisions must preserve the original order and payment history.

## 3.9 Integration and operational tables

Create:

- integration_accounts
- integration_sync_runs
- integration_event_inbox
- integration_event_outbox
- idempotency_records
- webhook_events
- background_jobs
- notification_templates
- notification_deliveries
- system_settings
- audit_logs

The inbox and outbox tables must include unique event identifiers and retry metadata.

## 3.10 Critical database constraints

1. SKU must be unique.
2. Barcode must be unique when provided.
3. Quantity cannot be negative for reservations or movements where positive quantities are required.
4. Inventory balances must never become negative.
5. Order items cannot be modified after financial completion without an audited adjustment workflow.
6. Payment webhook processing must be idempotent.
7. Refund totals cannot exceed refundable captured amounts.
8. Completed stock movements cannot be edited.
9. Each product variant must belong to one product.
10. A completed store pickup must have a valid pickup confirmation record.

# 4. INVENTORY AND BILL OS INTEGRATION

## 4.1 System of record

JAFSON Commerce PostgreSQL is the central inventory ledger.

Bill OS is the showroom billing and sales interface.

The Bill OS connector synchronizes:

- Product/SKU mapping.
- Showroom sales.
- Sale returns.
- Stock receipts where supported.
- Inventory adjustments where authorized.
- Stock snapshots and reconciliation.

The connector must not access Bill OS internal SQLite tables directly from the commerce backend.

Implement a supported integration interface inside Bill OS.

## 4.2 Synchronization design

```text
BILL OS WINDOWS APPLICATION
          |
          v
BILL OS INTEGRATION ADAPTER
          |
     LOCAL OUTBOX
          |
          v
AUTHENTICATED SYNC API
          |
          v
JAFSON INTEGRATION SERVICE
          |
     EVENT VALIDATION
          |
          v
CENTRAL INVENTORY LEDGER
          |
          v
UPDATED STOCK AVAILABILITY
```

The adapter must be capable of operating offline.

## 4.3 Event types

- SALE_COMPLETED
- SALE_CANCELLED
- SALE_RETURNED
- STOCK_RECEIVED
- STOCK_ADJUSTED
- STOCK_TRANSFERRED
- STOCK_SNAPSHOT_SUBMITTED

Each event must contain:

- event_id
- event_type
- source_system
- source_transaction_id
- location_id
- occurred_at
- schema_version
- event_payload

Every event must be idempotent.

## 4.4 Stock reservation example

Initial stock: 10 units.

Online order reserves 2.

Available stock: 8.

Showroom sells 3 through Bill OS.

Physical stock after sale: 7.

Reserved online stock: 2.

Available stock: 5.

When online order is dispatched:

Physical stock: 5.

Reserved stock: 0.

Available stock: 5.

The implementation must use serializable transactions or equivalent row-level locking and guarded updates to prevent overselling.

## 4.5 Offline handling

If Bill OS loses connectivity:

1. Record the completed sale locally.
2. Write the sale event into a durable local outbox.
3. Retry transmission with exponential backoff.
4. Use the original event ID for every retry.
5. Confirm server acceptance.
6. Mark the local event as synchronized.
7. Reconcile stock snapshots after reconnection.

For online orders during showroom disconnection, apply a configurable safety-stock buffer. Do not promise real-time availability when the physical POS has been disconnected and unreported sales may exist.

## 4.6 Mandatory integration acceptance

- Bill OS can emit a sale event.
- Duplicate events do not deduct stock twice.
- Offline sales synchronize after reconnecting.
- Failed synchronization is visible to authorized staff.
- Unknown SKUs are quarantined for resolution.
- Stock reconciliation identifies discrepancies.
- No direct database coupling exists.
- No inventory movement disappears silently.

# 5. REST API CONTRACTS

## 5.1 API standards

Base URL:

`https://api.<approved-domain>/v1`

All APIs must:

- Use JSON.
- Use HTTPS.
- Return consistent error formats.
- Validate request schemas.
- Use cursor pagination for large lists.
- Support idempotency for transactional operations.
- Use role-based authorization.
- Include request correlation IDs.
- Publish OpenAPI documentation.

Standard success response:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Standard error response:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Selected quantity is unavailable",
    "details": {}
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

## 5.2 Authentication APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /auth/otp/request | Request OTP |
| POST | /auth/otp/verify | Verify OTP |
| POST | /auth/login | Login |
| POST | /auth/logout | Logout |
| POST | /auth/refresh | Refresh session |
| GET | /auth/me | Current user |
| DELETE | /auth/account | Account deletion request |

## 5.3 Catalogue APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /categories | List categories |
| GET | /collections | Men's and Kids' collections |
| GET | /products | Product listing |
| GET | /products/{slug} | Product details |
| GET | /products/{id}/variants | Variants |
| GET | /search | Search |
| GET | /size-guides | Size guides |
| GET | /products/{id}/related | Related products |

Example:

```http
GET /v1/products?collection=men&category=jackets&sort=newest&page_size=24
```

## 5.4 Cart APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /cart | Retrieve cart |
| POST | /cart/items | Add item |
| PATCH | /cart/items/{id} | Update quantity |
| DELETE | /cart/items/{id} | Remove item |
| POST | /cart/coupon | Apply coupon |
| DELETE | /cart/coupon | Remove coupon |

The cart does not guarantee inventory availability. Stock must be checked again at checkout.

## 5.5 Checkout APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /checkout/quote | Calculate totals |
| POST | /checkout/serviceability | Check delivery |
| POST | /checkout/reservations | Reserve stock |
| POST | /checkout/orders | Create order |
| POST | /checkout/payment-session | Initiate payment |

Example order request:

```json
{
  "cart_id": "uuid",
  "shipping_address_id": "uuid",
  "fulfilment_type": "COURIER",
  "payment_method": "UPI",
  "idempotency_key": "unique-request-key"
}
```

The server must recalculate prices, discounts, taxes, shipping and stock. Never trust totals submitted by a client.

## 5.6 Order APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /orders | Customer orders |
| GET | /orders/{id} | Order detail |
| POST | /orders/{id}/cancel | Cancellation request |
| GET | /orders/{id}/tracking | Tracking |
| GET | /orders/{id}/invoice | Invoice |

## 5.7 Payment APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /payments/create | Create payment |
| GET | /payments/{id} | Payment status |
| POST | /webhooks/payments/{provider} | Provider webhook |
| POST | /admin/refunds | Initiate refund |

Payment confirmation must come from a verified provider response or webhook, not from a browser redirect.

## 5.8 Inventory APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /admin/inventory | Inventory listing |
| GET | /admin/inventory/{sku} | SKU stock |
| POST | /admin/inventory/adjustments | Adjust stock |
| POST | /admin/inventory/transfers | Create transfer |
| GET | /admin/inventory/movements | Movement history |
| GET | /admin/inventory/reconciliation | Reconciliation report |

## 5.9 Bill OS integration APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /integrations/bill-os/events | Submit events |
| POST | /integrations/bill-os/snapshots | Submit stock snapshot |
| GET | /integrations/bill-os/events/status | Event status |
| GET | /integrations/bill-os/catalogue | SKU mapping data |
| GET | /integrations/bill-os/stock | Approved stock feed |
| POST | /integrations/bill-os/acknowledgements | Sync acknowledgement |

Authentication must use dedicated integration credentials with scoped permissions and credential rotation.

## 5.10 Shipping APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /shipping/quote | Shipping estimate |
| GET | /shipping/serviceability | Pincode check |
| POST | /admin/shipments | Create shipment |
| POST | /webhooks/shipping/{provider} | Tracking webhook |
| POST | /admin/shipments/{id}/cancel | Cancel shipment |

## 5.11 Returns APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /returns | Create return request |
| GET | /returns | Customer return history |
| GET | /returns/{id} | Return details |
| POST | /admin/returns/{id}/approve | Approve |
| POST | /admin/returns/{id}/reject | Reject |
| POST | /admin/returns/{id}/inspect | Inspection |
| POST | /admin/returns/{id}/refund | Refund |

## 5.12 Admin APIs

Admin API groups must cover:

- Products.
- Categories.
- Collections.
- Inventory.
- Orders.
- Customers.
- Promotions.
- Returns.
- Payments.
- Shipping.
- Store operations.
- Staff and permissions.
- Reports.
- Settings.
- Audit logs.

All write operations require explicit permission checks.

# 6. SCREEN-BY-SCREEN UX SPECIFICATION

## 6.1 Brand identity

Develop a completely original JAFSON identity.

Design direction: editorial fashion, contemporary retail and distinctive typography.

Initial design tokens:

| Element | Direction |
|---|---|
| Primary background | Warm ivory |
| Primary text | Deep charcoal |
| Accent | Burnt orange |
| Secondary accent | Muted olive |
| Display typography | Editorial serif |
| Interface typography | Modern sans-serif |
| Photography | Premium fashion editorial |
| Layout | Spacious and structured |
| Motion | Subtle and purposeful |

The final logo, typography, colour tokens, iconography and motion specifications must be approved before production UI implementation.

## 6.2 Website screens

### W01 — Homepage

- Announcement bar.
- Main navigation.
- Editorial hero.
- Men's collection.
- Kids' collection.
- New arrivals.
- Bestsellers.
- Featured categories.
- Seasonal campaigns.
- Brand story.
- Newsletter.
- Footer.

### W02 — Men's collection

- Collection banner.
- Category navigation.
- Product count.
- Sorting.
- Filter drawer.
- Product grid.
- Pagination or infinite loading.

### W03 — Kids' collection

- Kids' campaign.
- Boys and girls filters where applicable.
- Age and size filters.
- Category grid.
- Product recommendations.

### W04 — Category listing

- Breadcrumbs.
- Category title.
- Filter chips.
- Sort controls.
- Responsive product grid.
- Active filter removal.

### W05 — Search

- Search input.
- Suggestions.
- Popular searches.
- Recent searches.
- Matching products.
- No-results recommendations.

### W06 — Product detail

- Product gallery.
- Product name.
- Price.
- Discount.
- Colour selection.
- Size selection.
- Size guide.
- Stock availability.
- Delivery estimate.
- Add to bag.
- Wishlist.
- Description.
- Fabric and care.
- Returns policy.
- Related products.

### W07 — Size guide

- Men's size charts.
- Kids' age and measurement guidance.
- Unit selection.
- Measurement instructions.

### W08 — Wishlist

- Saved products.
- Availability.
- Variant selection.
- Add to bag.
- Remove.

### W09 — Shopping bag

- Product image.
- Selected size and colour.
- Quantity.
- Price.
- Discount.
- Coupon.
- Estimated total.
- Checkout CTA.

### W10 — Checkout

- Login or guest checkout.
- Address selection.
- New address.
- Fulfilment selection.
- Delivery serviceability.
- Shipping cost.
- Payment selection.
- Final amount.
- Order confirmation.

### W11 — Order confirmation

- Order number.
- Payment status.
- Delivery/pickup details.
- Purchased products.
- Invoice access.
- Continue shopping.

### W12 — Account

- Profile.
- Addresses.
- Orders.
- Wishlist.
- Loyalty.
- Return requests.
- Communication preferences.
- Account deletion.

### W13 — Order tracking

- Order status.
- Courier tracking.
- Estimated delivery.
- Order details.
- Support link.

### W14 — Returns and exchanges

- Eligible orders.
- Product selection.
- Return reason.
- Evidence upload where applicable.
- Exchange size.
- Refund method.
- Request status.

### W15 — Static information

- About JAFSON.
- Contact.
- FAQs.
- Privacy.
- Terms.
- Shipping.
- Returns.
- Exchange policy.

## 6.3 Mobile application screens

The mobile apps share the commerce backend and shopping logic.

Screens:

1. Splash.
2. Welcome and onboarding.
3. Optional login.
4. Home.
5. Men's collection.
6. Kids' collection.
7. Categories.
8. Search.
9. Search suggestions.
10. Product listing.
11. Product details.
12. Size guide.
13. Wishlist.
14. Cart.
15. Address selection.
16. Checkout.
17. Payment.
18. Order success.
19. My orders.
20. Order details.
21. Tracking.
22. Returns.
23. Profile.
24. Notifications.
25. Settings.
26. Customer support.

Mobile-specific requirements:

- Deep links.
- Push notifications.
- Secure token storage.
- Native share.
- Keyboard and safe-area handling.
- Network error recovery.
- Offline-friendly cached browsing.
- App update handling.
- Android and iOS accessibility.
- Reduced-motion support.

Offline browsing must never imply that stale stock is guaranteed available.

## 6.4 Admin dashboard screens

### A01 — Dashboard

- Sales today.
- Total orders.
- Net revenue.
- Average order value.
- Channel breakdown.
- Men's versus Kids' sales.
- Bestsellers.
- Low stock.
- Pending fulfilment.
- Returns.
- Sales chart.

### A02 — Product management

- Product table.
- Search.
- Create product.
- Edit product.
- Image upload.
- Variant editor.
- SKU generation.
- Bulk import.
- Bulk export.
- Publish and unpublish.

### A03 — Category management

- Hierarchy.
- Drag-and-drop sorting.
- Banners.
- Visibility.
- SEO fields.

### A04 — Inventory

- Location selector.
- SKU search.
- Size-wise stock.
- Available stock.
- Reserved stock.
- Physical stock.
- Stock adjustments.
- Movement history.
- Low-stock alerts.

### A05 — Orders

- Order listing.
- Filters.
- Payment status.
- Order details.
- Packing slip.
- Invoice.
- Dispatch.
- Cancellation.
- Refund.

### A06 — Store operations

- POS connection status.
- Last synchronization.
- Failed events.
- Unknown SKU mapping.
- Reconciliation.
- Manual recovery.
- Sync logs.

### A07 — Shipping

- Shipment creation.
- Courier selection.
- AWB.
- Labels.
- Tracking.
- Failed deliveries.
- NDR management.

### A08 — Customers

- Customer profiles.
- Order history.
- Contact details.
- Support history.
- Loyalty history.

### A09 — Promotions

- Coupons.
- Discount rules.
- Campaign scheduling.
- Product eligibility.
- Usage limits.

### A10 — Returns

- Return queue.
- Eligibility.
- Inspection.
- Approval.
- Exchange.
- Refund.

### A11 — Reports

- Revenue.
- Gross margin.
- Net sales.
- Product performance.
- Category performance.
- Inventory valuation.
- Returns.
- Sales by channel.
- Sales by location.

### A12 — Settings

- Store information.
- Legal company information.
- GST configuration.
- Payment providers.
- Shipping providers.
- Notification providers.
- Staff roles.
- Security.
- Audit logs.

# 7. FULFILMENT AND DELIVERY RULES

The Jammu showroom is the initial fulfilment centre.

## 7.1 Fulfilment options

### Local delivery

- Configurable Jammu delivery zones.
- Pincode and locality validation.
- Delivery fee.
- Delivery estimate.
- Staff assignment.
- Delivery completion confirmation.

### Nationwide courier

- Pincode serviceability.
- Courier selection.
- Rate calculation.
- Label creation.
- AWB.
- Tracking.
- COD support.
- Return pickup.

### Showroom pickup

- Customer selects showroom pickup.
- Stock reservation.
- Order preparation.
- Pickup code generation.
- Staff verification.
- Collection confirmation.

## 7.2 Fulfilment states

PENDING → CONFIRMED → PICKING → PACKED → DISPATCHED → DELIVERED

Pickup uses a separate state machine:

PENDING → READY_FOR_PICKUP → COLLECTED

Failed, cancelled and returned states must be handled separately.

# 8. BUSINESS RULES

## 8.1 Pricing

- Store prices in paise.
- Support regular and sale prices.
- Support category and product discounts.
- Validate coupon stacking.
- Recalculate totals on the server.
- Preserve purchase-time price snapshots.

## 8.2 GST and invoicing

- Configurable HSN codes.
- Configurable GST rates.
- Intra-state and inter-state tax treatment.
- Place-of-supply determination.
- Tax-inclusive and tax-exclusive price handling.
- GST invoice numbering.
- Credit notes and refunds.
- Company GSTIN configuration.
- Accountant-reviewed tax rules.

## 8.3 Returns

- Configurable return window.
- Product/category-specific eligibility.
- Condition inspection.
- Exchange workflow.
- Refund tracking.
- Return stock quarantine.
- Approved resale stock restoration.

## 8.4 COD

- Configurable COD eligibility.
- Pincode restrictions.
- Order-value restrictions.
- Risk controls.
- COD confirmation.
- Delivery failure management.

# 9. SECURITY REQUIREMENTS

- HTTPS and HSTS.
- Secure session management.
- Argon2id for passwords.
- OTP throttling.
- MFA for administrators.
- RBAC.
- CSRF protection where applicable.
- XSS prevention.
- SQL injection protection.
- Webhook signature validation.
- Idempotent payment processing.
- Encrypted secrets.
- Secure integration credentials.
- Audit logging.
- Backup encryption.
- Rate limiting.
- Dependency scanning.
- Security headers.
- Data retention controls.
- Privacy and consent workflows.
- Secure account deletion.

Never store card credentials or CVV in JAFSON databases.

# 10. INFRASTRUCTURE AND DEPLOYMENT

## 10.1 Environments

Maintain three independent environments:

1. Development.
2. Staging.
3. Production.

Never use production customer data in development.

## 10.2 Production infrastructure

- Next.js storefront hosting.
- Next.js admin hosting.
- Containerized NestJS backend.
- Managed PostgreSQL.
- Redis.
- Object storage.
- Cloudflare CDN and WAF.
- Background job workers.
- Sentry.
- Automated database backups.
- Centralized logs.

## 10.3 Deployment pipeline

```text
DEVELOPER COMMIT
       |
       v
GITHUB PULL REQUEST
       |
       v
LINT + TYPE CHECK
       |
       v
UNIT + INTEGRATION TESTS
       |
       v
SECURITY SCANNING
       |
       v
BUILD
       |
       v
STAGING DEPLOYMENT
       |
       v
E2E + ACCEPTANCE TESTS
       |
       v
APPROVAL GATE
       |
       v
PRODUCTION DEPLOYMENT
```

Production database migrations must have rollback or recovery plans and must never rely on destructive automatic schema changes.

# 11. TESTING SPECIFICATION

## 11.1 Unit testing

Test:

- Pricing calculations.
- Coupon rules.
- Tax calculations.
- Stock availability.
- Reservations.
- Order state transitions.
- Refund calculations.
- Return eligibility.
- Permission enforcement.

## 11.2 Integration testing

Test:

- PostgreSQL transactions.
- Redis operations.
- Payment provider.
- Shipping provider.
- Bill OS connector.
- Notification delivery.
- Webhook processing.

## 11.3 End-to-end testing

Critical journeys:

1. Browse and purchase a men's jacket.
2. Browse and purchase a kids' product.
3. Register using mobile OTP.
4. Guest checkout.
5. UPI payment.
6. COD order.
7. Cancel an eligible order.
8. Request a return.
9. Exchange a size.
10. Book showroom pickup.
11. Complete local delivery.
12. Complete courier shipment.
13. Complete a showroom sale and synchronize stock.
14. Process an offline POS sale and synchronize after reconnection.

## 11.4 Performance and reliability

Target:

- LCP ≤ 2.5 seconds.
- INP ≤ 200 ms.
- CLS ≤ 0.1.
- Standard read API p95 ≤ 300 ms under the defined load profile.
- Transactional checkout API p95 ≤ 500 ms excluding external providers.
- Monthly availability objective of 99.9%.

Run load tests with concurrent purchases of the last available SKU.

# 12. DEVELOPMENT TASK BREAKDOWN

Use the following engineering epics and task IDs in GitHub Issues or a project management board.

## EPIC 01 — Foundation

- JAF-001: Create pnpm monorepo.
- JAF-002: Configure TypeScript.
- JAF-003: Configure linting and formatting.
- JAF-004: Establish shared packages.
- JAF-005: Set up Docker development environment.
- JAF-006: Configure GitHub Actions.
- JAF-007: Set up development/staging environments.
- JAF-008: Establish architecture documentation.

## EPIC 02 — Brand and Design System

- JAF-020: Brand discovery.
- JAF-021: Create logo system.
- JAF-022: Define typography.
- JAF-023: Define design tokens.
- JAF-024: Build shared UI components.
- JAF-025: Create responsive navigation.
- JAF-026: Define motion system.
- JAF-027: Approve brand guidelines.

## EPIC 03 — Database and Backend Foundation

- JAF-040: Initialize NestJS.
- JAF-041: Configure PostgreSQL.
- JAF-042: Implement Prisma schema.
- JAF-043: Create migration system.
- JAF-044: Implement Redis.
- JAF-045: Implement logging.
- JAF-046: Implement exception handling.
- JAF-047: Implement API versioning.
- JAF-048: Generate OpenAPI specification.

## EPIC 04 — Identity and Access

- JAF-060: Implement user registration.
- JAF-061: Implement OTP verification.
- JAF-062: Implement session management.
- JAF-063: Implement refresh tokens.
- JAF-064: Implement customer profiles.
- JAF-065: Implement addresses.
- JAF-066: Implement staff accounts.
- JAF-067: Implement RBAC.
- JAF-068: Implement admin MFA.

## EPIC 05 — Product Catalogue

- JAF-080: Implement categories.
- JAF-081: Implement collections.
- JAF-082: Implement products.
- JAF-083: Implement variants.
- JAF-084: Implement SKUs.
- JAF-085: Implement barcodes.
- JAF-086: Implement size charts.
- JAF-087: Implement product images.
- JAF-088: Implement product publishing.
- JAF-089: Implement CSV import/export.

## EPIC 06 — Inventory Engine

- JAF-100: Implement inventory locations.
- JAF-101: Implement inventory balances.
- JAF-102: Implement stock movements.
- JAF-103: Implement stock reservations.
- JAF-104: Implement reservation expiry.
- JAF-105: Implement stock adjustments.
- JAF-106: Implement stock transfers.
- JAF-107: Implement reconciliation.
- JAF-108: Implement low-stock alerts.
- JAF-109: Implement concurrent checkout protection.

## EPIC 07 — Bill OS Integration

- JAF-120: Audit existing Bill OS architecture.
- JAF-121: Define Bill OS integration contract.
- JAF-122: Implement Bill OS integration adapter.
- JAF-123: Implement durable local outbox.
- JAF-124: Implement authenticated event API.
- JAF-125: Implement sale event synchronization.
- JAF-126: Implement cancellation and return events.
- JAF-127: Implement offline retry mechanism.
- JAF-128: Implement SKU mapping.
- JAF-129: Implement stock reconciliation.
- JAF-130: Implement sync monitoring.
- JAF-131: Validate duplicate event handling.
- JAF-132: Test offline recovery.

## EPIC 08 — Storefront

- JAF-150: Implement homepage.
- JAF-151: Implement men's collection.
- JAF-152: Implement kids' collection.
- JAF-153: Implement category pages.
- JAF-154: Implement product listing.
- JAF-155: Implement search.
- JAF-156: Implement filters.
- JAF-157: Implement product details.
- JAF-158: Implement size guides.
- JAF-159: Implement wishlist.
- JAF-160: Implement cart.
- JAF-161: Implement SEO.

## EPIC 09 — Checkout and Orders

- JAF-180: Implement cart validation.
- JAF-181: Implement price calculation.
- JAF-182: Implement tax calculation.
- JAF-183: Implement shipping quotes.
- JAF-184: Implement stock reservation.
- JAF-185: Implement order creation.
- JAF-186: Implement order state machine.
- JAF-187: Implement order history.
- JAF-188: Implement invoice generation.
- JAF-189: Implement cancellation workflow.

## EPIC 10 — Payments

- JAF-200: Integrate payment provider.
- JAF-201: Implement UPI.
- JAF-202: Implement card payments.
- JAF-203: Implement COD.
- JAF-204: Implement webhook validation.
- JAF-205: Implement payment reconciliation.
- JAF-206: Implement refunds.
- JAF-207: Implement failed payment recovery.

## EPIC 11 — Shipping and Returns

- JAF-220: Implement delivery zones.
- JAF-221: Implement local delivery.
- JAF-222: Implement courier integration.
- JAF-223: Implement pincode serviceability.
- JAF-224: Implement shipment labels.
- JAF-225: Implement tracking.
- JAF-226: Implement showroom pickup.
- JAF-227: Implement returns.
- JAF-228: Implement exchanges.
- JAF-229: Implement return inspection.

## EPIC 12 — Admin Dashboard

- JAF-250: Implement admin layout.
- JAF-251: Implement dashboard.
- JAF-252: Implement product management.
- JAF-253: Implement category management.
- JAF-254: Implement inventory management.
- JAF-255: Implement order management.
- JAF-256: Implement customer management.
- JAF-257: Implement promotions.
- JAF-258: Implement shipping management.
- JAF-259: Implement returns management.
- JAF-260: Implement reports.
- JAF-261: Implement staff management.
- JAF-262: Implement audit viewer.
- JAF-263: Implement Bill OS monitoring.

## EPIC 13 — Mobile Applications

- JAF-280: Initialize Capacitor application.
- JAF-281: Configure Android project.
- JAF-282: Configure iOS project.
- JAF-283: Implement mobile navigation.
- JAF-284: Integrate authentication.
- JAF-285: Integrate storefront.
- JAF-286: Implement push notifications.
- JAF-287: Implement deep links.
- JAF-288: Implement secure storage.
- JAF-289: Implement native share.
- JAF-290: Complete Android QA.
- JAF-291: Complete iOS QA.

## EPIC 14 — Notifications and Analytics

- JAF-310: Implement email notifications.
- JAF-311: Implement SMS.
- JAF-312: Implement WhatsApp integration.
- JAF-313: Implement push notifications.
- JAF-314: Implement analytics events.
- JAF-315: Implement sales reports.
- JAF-316: Implement product analytics.
- JAF-317: Implement marketing attribution.

## EPIC 15 — Quality and Production

- JAF-340: Unit test coverage.
- JAF-341: Integration tests.
- JAF-342: E2E testing.
- JAF-343: Security testing.
- JAF-344: Load testing.
- JAF-345: Backup restoration test.
- JAF-346: Production monitoring.
- JAF-347: Operational documentation.
- JAF-348: Staging acceptance.
- JAF-349: Production readiness review.

# 13. ACCEPTANCE CRITERIA

The platform is not complete merely because the UI and APIs exist.

It is complete when:

1. Customers can successfully purchase men's clothing.
2. Customers can successfully purchase kids' clothing.
3. All product variants have independent inventory.
4. Online orders reserve stock correctly.
5. Showroom Bill OS sales synchronize correctly.
6. Offline Bill OS sales recover without duplicate deductions.
7. No overselling occurs under concurrent purchases.
8. UPI and other approved payment methods work.
9. COD orders work.
10. Local delivery works.
11. Nationwide courier fulfilment works.
12. Showroom pickup works.
13. Returns and refunds work.
14. Admin permissions are enforced.
15. Android and iOS shopping journeys work.
16. Customer and financial information is protected.
17. Backups can be restored.
18. Monitoring and incident recovery are operational.
19. Required business policies and legal configurations are approved.
20. Production deployment has been explicitly approved.

# 14. RELEASE MANAGEMENT

Use separate releases for backend, website and mobile applications, while maintaining compatibility between their API contracts.

Required release gates:

- All critical automated tests pass.
- No unresolved critical or high-severity security vulnerabilities.
- Inventory reconciliation passes.
- Payment reconciliation passes.
- Bill OS integration acceptance passes.
- Backup restoration passes.
- Production monitoring is active.
- Business owner signs off on staging.
- Mobile store submissions are reviewed and approved.

No production release should be performed without an explicit release approval.

# 15. FINAL ENGINEERING PRIORITIES

Implementation priority:

1. Bill OS integration feasibility and contract.
2. Central database and catalogue.
3. Unified inventory ledger.
4. Backend and authentication.
5. Website and original design system.
6. Cart, checkout and orders.
7. Payments and fulfilment.
8. Admin dashboard.
9. Android and iOS.
10. Security, QA and production readiness.

The Bill OS integration and inventory model must be validated early. They are the highest-risk architectural dependencies.

**Final architectural principle:** JAFSON Commerce owns the central product, order and inventory records. Bill OS operates the showroom sales interface through a controlled, auditable synchronization contract. Neither system should silently overwrite the other's transactions.

---

**Document owner:** Chameron Industries Pvt. Ltd.  
**Product:** JAFSON JAMMU  
**Specification status:** Approved requirements baseline; detailed implementation and integration validation required before production acceptance.