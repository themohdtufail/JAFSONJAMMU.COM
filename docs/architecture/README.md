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
