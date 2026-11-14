# Test Strategy & Engineering Quality Gates

The audit snapshot contained 103 Vitest test definitions across nine files. The audit did not execute them; pass status is unknown. Tests must prove business invariants, security and operational safety, not just code paths.

## Test pyramid

**Unit:** money arithmetic/rounding, discounts/GST allocation, inventory rules, order/payment/refund/return state machines, auth policy, COD/serviceability policy, Bill OS mapping/dedupe. No network/real DB.

**PostgreSQL integration:** migrations from empty and supported prior schema; transaction rollback; constraints/indexes; concurrent reservation; duplicate return receipt; refund locking/idempotency; outbox claim/lease; inbox dedupe. SQLite mocks do not prove PostgreSQL locking.

**API integration:** actual NestJS routes, guards, validation, DB and provider fakes. Cover guest/customer ownership, staff roles/MFA, checkout, payment webhooks, refund reconciliation, partial returns, Bill OS inbound/outbound, courier/COD, OTP limits, deletion workflow.

**Contract:** exact Bill OS/provider schemas, signature behavior and idempotency. Use sanitized fixtures and sandbox where available.

**E2E:** Playwright browse/search/cart/checkout; guest/authenticated tracking; login/OTP/MFA; staff fulfilment; return/receipt/refund; inventory/Bill OS ops; responsive mobile, keyboard/focus/accessibility. Use test accounts and stubs, never production PII/payments.

## Mandatory regressions

### Guest order authorization
- Guessed sequential order number plus phone cannot read order.
- Wrong capability cannot read/cancel/return or expose pickup code.
- Capability is high entropy, scoped, hashed, expires/revokes and is not logged.
- Changing order ID cannot access another user's order.
- Rate limits and generic errors prevent enumeration.
- Staff support access is permissioned and audited.

### Return quantity and stock
- Return 1 of 3; only 1 can be received/restocked.
- Later return of remaining 2 is allowed; cumulative cannot exceed 3.
- Repeated receive does not create another movement.
- Concurrent receipt cannot over-return.
- Partial, damaged, rejected, cancelled and exchange cases have correct stock/refund effects.
- Legacy records migrate without invented quantities.

### Refund unknown outcome
- Provider timeout after acceptance creates UNKNOWN/PENDING, not FAILED.
- Unknown amount remains reserved.
- Reconciliation success/failure resolves exactly once.
- Worker replay/webhook replay does not duplicate.
- Concurrent refunds never exceed captured refundable balance.

### Bill OS outbound
- Reservation and outbox commit atomically.
- Crash after provider acceptance does not duplicate.
- Rejection/timeout policy is deterministic and visible.
- Cancellation is idempotent and ordered.
- Duplicate, delayed, out-of-order, quarantined events handled.
- POS race cannot oversell under approved stock protocol.
- Reconciliation never silently overwrites ledger.

### Courier/COD
- Valid unsupported pincode is not serviceable.
- Missing/stale provider data is unknown/unavailable, not true.
- COD false unless explicitly supported and policy-approved.
- Provider outage does not promise delivery.
- Booking timeout reconciles before retry.

### Payment session, startup, OTP, sessions
- Concurrent payment-session requests create one active intent.
- Fresh DB and supported migration upgrade pass.
- Production startup does not mutate schema or seed demo products.
- Production refuses OTP without provider; OTP never logged/stored plaintext.
- Distributed limits work across two API instances.
- Browser tokens inaccessible to JS in selected cookie/BFF model; CSRF and refresh reuse tests pass.

## Financial/inventory properties

Property tests should prove:
- line totals + charges - discounts = payable;
- tax components reconcile under documented rounding;
- invoice/credit note reconcile to source;
- successful + pending/unknown refund reservations never exceed capture;
- available stock never negative;
- ledger replay is deterministic;
- returned quantity never exceeds fulfilled quantity;
- idempotent replay leaves balances unchanged.

## Test isolation

Use explicit factories, unique test namespaces, isolated DB per suite or safe transactions, frozen time for expiry/retry, deterministic random seeds, provider fakes and sanitized logs. Do not include real PII/secrets.

## CI gates

Frozen install; lint/format; typecheck; unit/API tests; PostgreSQL migration tests; web/admin builds; Playwright critical flows; dependency/secret/image checks; integration contract tests. Do not disable flaky tests without an issue, owner and replacement coverage.

## Completion evidence

Report exact branch/commit, changed paths, commands and actual pass/fail/skip counts, DB version/migration results, provider sandbox checks, manual verification and production actions not performed. Test files existing is not evidence tests pass.
