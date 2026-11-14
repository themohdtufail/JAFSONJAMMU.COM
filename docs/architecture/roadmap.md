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
