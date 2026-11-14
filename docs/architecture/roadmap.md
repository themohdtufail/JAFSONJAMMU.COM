# Roadmap and status

Source of truth for scope is `spec.md` (priorities in section 15, acceptance in section 13). This file tracks what is done, what is being fixed and what is open.
Status values: **done** (tested), **partial**, **open**, **blocked** (needs a decision or access).

## Defects found in the audit (before this pass)
| # | Problem | Why it matters | Phase |
|---|---|---|---|
| D1 | A returned (RECEIVED) item can be returned again; each receive restocks again | Phantom stock, oversell | 1 |
| D2 | Two simultaneous return requests for the same item both pass the "already open" check | Duplicate returns | 1 |
| D3 | OTP attempt limit is check-then-increment, so parallel guesses can exceed 5 | Account takeover odds | 1 |
| D4 | Guest order lookup (number + phone) has no per-target throttle; numbers are sequential | Address and name leak for anyone whose phone is known | 1 |
| D5 | Behind a proxy the limiter trusts `X-Forwarded-For` blindly, or sees only the proxy's IP | Limits can be bypassed or shared by everyone | 1 |
| D6 | Access tokens of deleted or suspended customers keep working until expiry | Stale access | 1 |
| D7 | Mock payment webhook route exists even when the real provider is configured | Needless attack surface | 1 |
| D8 | AuditLog rows and order items can be edited or deleted in SQL | Spec 3.10 #5, audit integrity | 1 |
| D9 | No stored record of pickup confirmation | Spec 3.10 #10 | 1 |
| D10 | Audit actor is a display name, not an account id | Cannot attribute actions reliably | 1 |
| D11 | Order totals are not constrained to add up | Corrupt money data | 1 |
| D12 | Schema is applied with `prisma db push`, no migration history | Unsafe for production changes and data | 2 |
| D13 | Passwords hashed with scrypt; spec says Argon2id | Spec deviation | 2 |
| D14 | No backup or restore procedure tested | Acceptance #17 | 2 |
| D15 | Bill OS: no outbound/offline adapter, no STOCK_TRANSFERRED or STOCK_SNAPSHOT_SUBMITTED events | Acceptance #5, #6 | 3 |

## Phases
1. **Security and data integrity** (D1 to D11). Test first; each fix has a regression test that failed before.
2. **Production data safety**: migration baseline, Argon2id with rehash on login, backup/restore script and test, CI migration check.
3. **Bill OS integration**: remaining event types, reference adapter with durable outbox and backoff, acceptance tests from spec 4.6.
4. **Commerce completeness**: server-side cart and wishlist, order notes, shipments and courier abstraction, promotions.
5. **Notifications and observability**: SMS and email provider abstraction, error monitoring, reports.
6. **UI improvements** across shop and back-office.
7. **Release readiness**: staging, monitoring, restore drill, sign-off checklist. Mobile apps (spec epic 13) are a separate project and are not started.

## Status log
Updated at the end of each phase (see bottom of this file).

### Phase 1: security and data integrity. DONE (103 API tests, typecheck clean)
Regression tests: `apps/api/test/phase1.e2e.test.ts`, `apps/api/src/common/security.test.ts`. Ten of the twelve new tests failed on the audited code.
D2 (parallel returns) and D3 (parallel OTP guesses) did **not** fail before the fix, because the race could not be provoked in the test setup. Both were
check-then-act by inspection and are now structurally safe (order row lock; atomic attempt claim), so their tests are guards, not proof of a past failure.

| # | Fix |
|---|---|
| D1 | Items with a REQUESTED, APPROVED or RECEIVED return cannot be returned again. Restock movement key is per order item (`return-item:<id>`), so stock cannot be added twice even if a second return row exists (`ALREADY_RESTOCKED`). |
| D2 | Return creation locks the order row and re-checks inside the transaction. |
| D3 | Each OTP guess first claims one of 5 attempts atomically. |
| D4 | Failed order lookups are counted per phone (10 per 15 min) and per client IP (40 per 15 min) in Postgres (`RateCounter`), shared by order tracking, documents, cancel, payments and returns. 429 carries `Retry-After`. Set `LOOKUP_FAIL_LIMIT_PHONE`/`_IP` to tune. |
| D5 | `TRUST_PROXY` is a hop count (0 = none). The shop and back-office middleware forward the visitor IP in `x-real-client-ip` with `x-internal-auth` (`INTERNAL_PROXY_SECRET`); the API ignores the header without the secret. Verified through the real web proxy: separate limits per visitor, spoofing ignored. Behind Cloudflare set `TRUST_CF_HEADER=1` on web and admin. **Caveat:** the `onrender.com` URLs bypass Cloudflare, so a visitor reaching them directly could choose their own `CF-Connecting-IP`; keep the Render URLs private or add Authenticated Origin Pulls. |
| D6 | The request pipeline checks the customer is ACTIVE (15 s cache, cleared at once on account deletion in the same process). |
| D7 | `/webhooks/payments/mock` answers 404 unless the mock provider is configured. |
| D8 | Triggers: AuditLog is append-only; order lines cannot be updated or deleted once the order leaves PENDING_PAYMENT. |
| D9 | `PickupConfirmation` table; a trigger refuses COLLECTED without one; the collect step writes it. |
| D10 | Audit actors are `Name#accountId`. Older rows keep the old format. |
| D11 | `order_total_adds_up` CHECK (added NOT VALID so existing rows are never rewritten or rejected; new and changed rows are enforced). |

Remaining risks after phase 1: rate limiter for the general buckets is still per process; the 15 s user-status cache means a suspension takes up to 15 s to bite on other instances.

### Phase 2: production data safety. DONE (113 API tests)
- **D12 migrations:** `prisma/migrations` holds a baseline and the integrity rules (triggers, CHECKs, sequences). `prisma/setup.ts` runs `migrate deploy` and baselines an old `db push` database without touching data. The API tests now build their database from the migrations. `pnpm db:migration <name>` creates the next one on a shadow database. `test/migrations.test.ts` proves: no drift between schema and migrations; empty database fully built; legacy database baselined with data intact. `constraints.sql` was folded into migration 2 and removed.
- **D13 Argon2id:** `@node-rs/argon2` (19 MiB, 2 passes). New passwords use it; scrypt hashes verify and are upgraded at the next successful login; unknown emails now take the same time as wrong passwords.
- **D14 backup and restore:** `deploy/backup.sh` (AES-256 encrypted, checksum) and `deploy/restore.sh` (empty targets only). `test/backup.test.ts` restores a real backup and checks data, triggers and constraints survive; wrong passphrase, damaged file and non-empty target are refused.
- Not done: no scheduled backup job (needs the host's cron or Render cron job, which costs money), no off-site storage (needs an account), and **no restore drill against production data** (there is none yet). These are launch gates.

### Phase 3: Bill OS integration. DONE on this side (127 API tests, 11 ledger tests, 4 contract tests)
- **Contract:** added `STOCK_TRANSFERRED` (atomic between two locations, quarantined if source would drop below reserved, destination unknown or same) and `STOCK_SNAPSHOT_SUBMITTED` (compared with the ledger; differences stored in `StockReconciliation` and shown in the back-office, **never applied automatically**). The reference ledger in `packages/inventory-core` models both.
- **Reference adapter:** `integrations/bill-os-adapter`: durable SQLite outbox (written before any network call, same event id on every retry, exponential backoff with jitter, `rejected` events stay visible and can be requeued), HTTP client, flush loop, README describing what Bill OS must do.
- **Silent POS (spec 4.5):** `IntegrationHeartbeat`; after `POS_STALE_AFTER_MINUTES` (30) without contact, `POS_STALE_EXTRA_BUFFER` (1) extra unit per variant is withheld from online availability and from reservations, lifted when the POS reports again. The back-office shows a warning banner.
- **Acceptance (spec 4.6)** is automated in `test/billos-adapter.e2e.test.ts`: sale emitted; duplicates do not double-deduct; offline sales survive and sync with backoff; a lost response does not double-deduct; unknown SKUs are quarantined and visible on both sides; reconciliation reports without overwriting; transfers; silent-POS hold; no DB coupling.
- **Migrations:** legacy `db push` databases are now matched against each migration prefix and baselined at the right point (re-runnable SQL migrations are marked with an `IDEMPOTENT` file and re-run so triggers exist); a database matching no known state is refused untouched.
- **Not done / needs Bill OS owners:** the adapter must be embedded in the actual Bill OS Windows application and tested against its real sales flow. That is spec item 1 ("feasibility and contract") and cannot be validated from this repository. Until then the commerce side is ready and the contract is frozen at schema_version 1.
