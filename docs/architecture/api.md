# JAFSON API (NestJS + PostgreSQL + Prisma)

Run locally (needs Postgres; `DATABASE_URL` in `apps/api/.env`, see `.env.example`):

    pnpm --filter @jafson/api db:setup   # schema + CHECK constraints + append-only trigger + sequences
    pnpm --filter @jafson/api db:seed    # 16 products, 135 variants, showroom stock, Jammu pincodes
    pnpm --filter @jafson/api dev        # http://localhost:4000/v1
    pnpm --filter @jafson/api test       # e2e against a real jafson_test database

## What is real
- Catalogue with live availability; checkout quote/serviceability; orders with server-side pricing + GST split.
- Stock: guarded `UPDATE ... WHERE on_hand - reserved - safety >= qty` (no oversell; tested with 10 concurrent buyers of 1 unit).
  Reserve at order, release on cancel/expiry, deduct at dispatch/collection. Movements are append-only (DB trigger).
- Order state machines (courier/local vs pickup), pickup codes, idempotent order creation, reservation expiry job.
- Payments: signed-webhook confirmation, idempotent, amount-checked. Provider is a **mock** (`PAYMENTS_MOCK=1`);
  a real UPI/card provider (e.g. Razorpay) plugs into `OrdersService.handlePaymentEvent`.
- Auth: mobile OTP (hashed, 5 min, 5 attempts, 5/hour), access + rotating refresh tokens, addresses, account deletion request.
- Returns/exchanges (7-day window, per-item), admin decisions.
- Bill OS: authenticated batch event endpoint, idempotent on `event_id`, quarantine for unknown SKU / schema / stock conflict,
  snapshot reconciliation, status + retry.

## Not done yet (be aware before launch)
- **SMS delivery**: no provider; OTP only echoed in dev (`OTP_DEV_ECHO=1`).
- **Admin auth** is a shared `x-admin-key`; staff accounts, RBAC and MFA are still to build.
- Refunds, invoices/credit notes, courier integration (AWB/labels), coupons, cart API (bag is client-side), cursor pagination.
- GST rate defaults to 5% per product and needs accountant review; COD/pincode rules are placeholders.
- Order/payment/OTP rate limiting beyond the OTP throttle; Sentry; deployment config.
