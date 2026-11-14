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
Next.js 15 app router, reading the catalogue and stock from the API. Bag and wishlist live in the browser and, for signed-in customers, on the server (merged at sign-in). Checkout recalculates every price on the server. Photos are Unsplash placeholders until JAFSON's own shoot. Browser security headers and a Content-Security-Policy are set in `next.config.mjs` and checked by `tests/e2e/csp.mjs`.

## Other documents
`roadmap.md` (phases, audited defects, what is verified), `release-checklist.md` (launch gates), `gst.md`, `payments.md`, `brand.md`, `spec.md` (approved requirements), and `deploy/README.md` (hosting, backups, migrations).

## Running the full stack locally
    pnpm install
    pnpm db:setup && pnpm db:seed      # needs Postgres and apps/api/.env (see apps/api/.env.example)
    pnpm dev                           # API :4000, storefront :3000, back-office :3001 (browsers call /api/* which Next proxies to the API)
See `docs/architecture/api.md` for what is real and what is not done.
