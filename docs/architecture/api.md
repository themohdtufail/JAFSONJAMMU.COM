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
- Payments: Razorpay (UPI, cards, refunds) with signed checkout verification and webhooks, idempotent and amount-checked. See `payments.md`.
  A development-only mock provider remains (`PAYMENTS_PROVIDER=mock`).
- Auth: mobile OTP (hashed, 5 min, 5 attempts, 5/hour), access + rotating refresh tokens, addresses, account deletion request.
- Returns/exchanges (7-day window, per-item), admin decisions.
- Bill OS: authenticated batch event endpoint, idempotent on `event_id`, quarantine for unknown SKU / schema / stock conflict,
  snapshot reconciliation, status + retry.

## Not done yet (be aware before launch)
- **SMS delivery**: no provider; OTP only echoed in dev (`OTP_DEV_ECHO=1`).
- **Admin auth** is a shared `x-admin-key`; staff accounts, RBAC and MFA are still to build.
- Partial refunds, invoices/credit notes, courier integration (AWB/labels), coupons, cart API (bag is client-side), cursor pagination.
- GST rate defaults to 5% per product and needs accountant review; COD/pincode rules are placeholders.
- Order/payment/OTP rate limiting beyond the OTP throttle; Sentry; deployment config.

## Back-office (apps/admin, port 3001)
Staff sign in with email and password (scrypt-hashed, throttled after 5 failures, 8-hour tokens in sessionStorage).
Roles: **STAFF** orders/returns/customers; **MANAGER** also stock, products, refunds, store operations, audit log; **OWNER** also staff accounts.
Role checks happen on the API (re-read from the database on every request, so deactivation is instant); the UI only hides what a role can't use.
Create the first owner with `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` then `pnpm db:seed`. `x-admin-key` still works for scripts and counts as OWNER.

Screens: dashboard (sales, AOV, 14-day chart, channels, men vs kids, bestsellers, low stock, things needing attention), orders (search, filters, detail,
advance/cancel, pickup-code collection, packing slip), inventory (adjust with audit, movement history), products (create with variants and opening stock,
publish/unpublish, edit price), returns (approve/reject), customers, store operations (POS sync status, quarantined events, retry), audit log, staff.

Not done: MFA for staff (spec requires it for admins), refunds through a provider (recorded manually), restocking on approved returns, courier/AWB labels,
promotions, editing images or descriptions of existing products, reports beyond the dashboard.

## Security (added in the upgrade pass)
- **Two-step login (TOTP)** for managers and owners (on by default in production, `REQUIRE_ADMIN_MFA`). Secrets are stored AES-256-GCM encrypted; each code works once;
  repeated wrong codes lock the account for 15 minutes; owners can reset a lost authenticator. Staff-role accounts aren't forced. The `x-admin-key` service key bypasses it,
  so **leave `ADMIN_API_KEY` unset in production** unless a script needs it.
- **Rate limits** per client IP (auth 20/min, orders and payments 40/min, everything else 600/min; webhooks and Bill OS exempt) and `Retry-After` on 429. In-memory per process: move to Redis before running more than one API instance.
- Security headers, CORS limited to listed origins, 256 KB body limit, malformed JSON answered with 400, access log with request ids.
- **Refunds**: partial or full, never more than was captured (row lock), and a refund that the provider accepted is never marked failed if our own bookkeeping errors.
- **Returns**: approve, then "received" with or without restocking (audited RETURN stock movement).
- Dependencies: production audit is clean (`pnpm audit --prod`), and CI fails on any high-severity finding. Zod 4, Next 15.5.29, NestJS 11.2, Prisma 6.19.
- CI runs typecheck, the API tests against real Postgres, both production builds and a browser smoke test (`pnpm e2e`).
