# JAFSON Commerce – architecture notes

Modular monolith (NestJS) over PostgreSQL; this repo currently holds **slice 1**:

| Path | Purpose |
|---|---|
| `packages/validation` | Zod contract for Bill OS events (schema_version 1) |
| `packages/inventory-core` | Reference ledger semantics: availability, reservations, idempotent event processing, quarantine, reconciliation |
| `apps/api/prisma/schema.prisma` | Catalogue core, inventory ledger, inbox/outbox tables |

## Ledger rules (executable in `inventory-core` tests)
- available = on_hand − reserved − safety_stock, floored at 0.
- Reservation is all-or-nothing; the last unit can be reserved once.
- Bill OS events are idempotent on `event_id`; replays are no-ops.
- Unknown SKU / unknown location / invalid schema / would-go-negative → **quarantined**, never silently dropped, balance untouched.
- Postgres implementation must run each event in one transaction with guarded updates and CHECK constraints; `inventory_movements` is append-only (trigger).

## Next (spec §15 order)
1. Bill OS adapter + durable outbox (needs audit of Bill OS, JAF-120).
2. NestJS API + Postgres implementation of the ledger, incl. concurrent-checkout test against a real DB.
3. Auth, catalogue, then storefront/checkout.

## Storefront (`apps/web`)
Next.js 15 app router. Run: `pnpm --filter @jafson/web dev`. Catalogue is mock data in `apps/web/lib/data.ts`
(replace with the API client when the NestJS API exists); bag and wishlist persist in localStorage.
Photos are Unsplash placeholders (swap for JAFSON's own shoot). Checkout is a demo: no payment, server must recalculate totals.

## Running the full stack locally
    pnpm install
    pnpm db:setup && pnpm db:seed      # needs Postgres and apps/api/.env (see apps/api/.env.example)
    pnpm dev                           # API :4000, storefront :3000 (browser calls /api/* which Next proxies to the API)
See `docs/architecture/api.md` for what is real versus still mocked (payments provider, SMS, admin auth).
